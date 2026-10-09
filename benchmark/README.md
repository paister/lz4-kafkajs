# LZ4 library benchmark

Compares LZ4 libraries as KafkaJS codecs. It is a separate project, so the candidates do not end up in the dependencies of `lz4-kafkajs`.

```bash
nvm use   # Node 24, the current LTS (see .nvmrc)
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk pnpm install   # SDKROOT only on macOS, for the native lz4 build
pnpm start
pnpm start --broker localhost:19092   # also round-trips through a real broker (run `pnpm kafka:up` in the repo root first)
```

Options: `--duration <ms>`, `--warmup <ms>`, `--repetitions <n>`, `--concurrency <n>`, `--only <name,name>`, `--output <file.csv>`, `--no-save`.

## Saving and comparing results

Every run appends one row per library and workload to `results/<date>-node<major>-<platform>-<arch>.csv` (git-ignored). Each row carries the Node version, OS, CPU, core count and memory, so files from different machines or Node versions can be concatenated and compared in a spreadsheet or with pandas. Use `--output <file>` to choose the file (rows are appended, the header is written once) or `--no-save` to skip saving.

```bash
pnpm start --output results/my-laptop.csv
```

Share a file by attaching it to an issue. Close other applications and plug in the power cable before you measure.

### Reading the CSV

One row is one library on one workload in one run. Compare rows only if they share the same `workload` and the same run settings (`concurrency`, `duration_ms`, `warmup_ms`, `repetitions`).

| Column | Meaning |
| --- | --- |
| `timestamp` | When the run was saved (UTC, ISO 8601). Rows of the same run share it. |
| `node`, `platform`, `arch`, `os_release` | Node version, operating system, CPU architecture and OS release. |
| `cpu`, `cpu_cores`, `memory_gb` | CPU model, number of logical cores and installed memory (rounded). Libraries with a thread pool scale with the core count. |
| `library` | The measured candidate, for example `lz4-napi` or `comprs (async)`. |
| `workload` | The input: a KafkaJS record batch (`small batch`, `typical batch`, `large batch`) or `incompressible` data. |
| `workload_bytes` | Uncompressed size of that input in bytes. |
| `ratio` | Uncompressed size divided by compressed size. Higher is better, `1.00` means no gain. It does not depend on the machine. |
| `compress_mbps`, `decompress_mbps` | Throughput in megabytes per second (1 MB = 1,000,000 bytes, measured on the uncompressed data) with one operation after the other. Higher is better. This is the single-thread view. |
| `compress_concurrent_mbps`, `decompress_concurrent_mbps` | The same, with `concurrency` operations in flight. A value far above the sequential one means the library uses a thread pool. A value close to it means it computes on the main thread. |
| `loop_delay_p99_ms` | The 99th percentile of the event loop delay while compressing concurrently, in milliseconds. Lower is better. High values mean the library blocks the main thread and delays everything else in your application. |
| `concurrency`, `duration_ms`, `warmup_ms`, `repetitions` | The settings of the run. Every throughput value is the median of `repetitions` runs of `duration_ms` after `warmup_ms` of warm-up. |

Absolute throughput depends on the machine, so compare the order and the relative differences between libraries within one file or one machine, not raw numbers across different machines. To rank libraries over all workloads, use the geometric mean per library, as the ranking printed at the end of a run does. Values of a single short run vary by a few percent; repeat the run before drawing conclusions from small differences.

The results and what we learned from them are in [FINDINGS.md](FINDINGS.md).

## What it does

1. **Correctness first.** A library is only measured if it writes a standard LZ4 frame with independent blocks (Kafka rejects dependent blocks), restores the data, and, with `--broker`, survives a round trip through a real Kafka broker.
2. **Realistic data.** The input is a KafkaJS record batch built with KafkaJS's own encoder from seeded JSON events, in four sizes plus incompressible data.
3. **Measured the way KafkaJS calls a codec:** `async compress(buffer)` and `async decompress(buffer)`.
   - `compress MB/s` and `decompress MB/s`: one operation after the other.
   - `x8` columns: eight operations in flight. Libraries that run on a thread pool scale here.
   - `loop delay p99 ms`: how long the event loop was blocked while compressing concurrently. Libraries that compute on the main thread show up here.
   - Every figure is the median of several runs.

## Node versions

The benchmark targets the current LTS release, Node 24 (`.nvmrc`), and needs Node 22 or newer because the platform package of `@derodero24/comprs` 2.x declares `node >= 22`.

`lz4` (the current dependency of 1.x) does not build on Node 22 or newer. It is an optional dependency here: the install reports the failed build, but everything else works, and the library is listed as excluded.

Libraries that cannot be loaded are reported and skipped.

## Limits

The numbers come from one machine and synthetic data. They show the order of magnitude and the relative differences, not guarantees. Run it on the platform you deploy to (for example Linux in Docker) before deciding.
