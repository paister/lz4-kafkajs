# Findings: LZ4 libraries as KafkaJS codecs

Measured on 2026-10-08 with the benchmark in this folder, on an Apple Silicon Mac (darwin/arm64), Node 20.20 and Node 22.23. Both Node versions give the same ranking.

## Libraries considered

| Library | Version | Kind | Result |
| --- | --- | --- | --- |
| `lz4` | 0.6.5 | native (node-gyp) | Works on Node 20. Does not build on Node 22 or newer. No release since 2021. **Slow at decompressing.** `blockChecksum: true` and `streamSize: true` crash on current Node. This is what `lz4-kafkajs` 1.x uses. |
| `lz4-napi` | 2.10.0 | Rust (napi-rs), prebuilt binaries for 17 targets, runs on a thread pool | **Fast and scales.** Node >= 18. Options: `contentChecksum` and `blockChecksums` only. No content checksum by default. |
| `@derodero24/comprs` | 2.0.2 | Rust (`lz4_flex`), sync and async API, one package for several codecs | Fastest on a single thread. The platform package declares `node >= 22`, so pnpm skips it on Node 20 and the library then fails with "Cannot find native binding". |
| `lz4-lite` | 1.1.2 | pure JavaScript | Good for a library without binaries. Computes on the main thread. |
| `@warren-bank/lz4-hc-wasm` | 3.0.0 | WebAssembly, high compression | 10 to 50 times slower than the others. The compression ratio is not better. |
| `compress-utils` | 0.8.0 | WebAssembly | **Rejected by the Kafka check.** Writes dependent blocks for the 102 KB and the 1 MB batch and independent blocks only for the 3 KB batch. Every typical batch is affected. |
| `lz4js` | 0.2.0 | pure JavaScript | **Rejected by the Kafka check.** Always writes dependent blocks. The broker answers with "Dependent block stream is unsupported". |

## Results

Throughput in MB/s, median of 3 runs, Node 20. `x8` means eight operations in flight at once.

### Typical batch (100 records, 102 KB)

| Library | compress | decompress | compress x8 | decompress x8 |
| --- | ---: | ---: | ---: | ---: |
| `comprs` (sync) | 1348 | 2449 | 1397 | 3422 |
| `comprs` (async) | 1214 | 2531 | 5076 | 8387 |
| `lz4-napi` | 1168 | 2684 | 4760 | 8819 |
| `lz4` | 942 | 413 | 962 | 599 |
| `lz4-lite` | 762 | 866 | 757 | 719 |
| `lz4-hc-wasm` | 26 | 126 | 21 | 125 |

### Ranking over all four workloads (geometric mean, one operation at a time)

| # | Library | compress | decompress | combined (Node 20) | combined (Node 22) |
| --: | --- | ---: | ---: | ---: | ---: |
| 1 | `comprs` (sync) | 1712 | 2392 | 2024 | 2019 |
| 2 | `lz4-napi` | 1135 | 2195 | 1579 | 1681 |
| 3 | `comprs` (async) | 1133 | 1969 | 1494 | 1513 |
| 4 | `lz4-lite` | 757 | 2310 | 1322 | 1374 |
| 5 | `lz4` | 907 | 187 | 411 | not loadable |
| 6 | `lz4-hc-wasm` | 28 | 116 | 57 | 58 |

The four workloads are a small batch (3 KB), a typical batch (102 KB), a large batch (1 MB) and incompressible data (102 KB). The full tables come from `pnpm start`.

## What we learned

1. **Kafka needs independent LZ4 blocks.** Two libraries failed this check, one of them only for larger inputs. A library that passes a small round trip can still be rejected by the broker, so the benchmark checks frames and, with `--broker`, a real broker.
2. **Decompression is the weak spot of `lz4`.** About 400 MB/s on a typical batch and 5 MB/s on a small one, against 800 to 2700 MB/s for the others. For consumers this matters most.
3. **Thread-pool libraries scale, the others do not.** With eight operations in flight `lz4-napi` and `comprs` (async) reach about 4800 to 5100 MB/s compressing a typical batch. Every library that works on the main thread stays where it was with one operation (700 to 1400 MB/s).
4. **Main-thread libraries block the event loop on large batches.** For 1 MB batches the p99 delay of the event loop is about 14 ms for `lz4-lite`, 9 ms for `lz4` and 1.5 ms for `lz4-napi`.
5. **A thread pool costs time on tiny inputs.** For a 3 KB batch `comprs` (sync) is four times faster than `lz4-napi` when operations run one after the other. The difference disappears for batches of 100 KB and more.
6. **The compression ratio is the same everywhere** (2.3x, 2.9x and 3.0x depending on the batch). Speed is the only difference, and high compression gives nothing for these payloads.
7. **`comprs` 2.x ties the install to Node 22.** A library that supports Node 18 or 20 cannot rely on it.
## Where this leaves `lz4-kafkajs`

`lz4-napi` is the best fit for this package: second in speed, the only one that stays fast under concurrency and keeps the event loop free, prebuilt binaries for all common platforms, and no Node 22 requirement. Switching changes the options (`contentChecksum` and `blockChecksums` instead of the `lz4` options), so it needs a major version. This is a recommendation and has not been done yet.

## Limits

- One machine, synthetic JSON events, codec only (no network, no broker latency).
- Differences below about 10 percent should not be read as a ranking. Small batches are the noisiest.
- Not yet checked on Linux, Alpine (musl) or x64. Run the benchmark there before deciding.
- Codec only. There is no end-to-end measurement of a full KafkaJS consumer or producer.
