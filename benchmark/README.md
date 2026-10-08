# LZ4 library benchmark

Compares LZ4 libraries as KafkaJS codecs. It is a separate project, so the candidates do not end up in the dependencies of `lz4-kafkajs`.

```bash
nvm use 20
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk pnpm install   # SDKROOT only on macOS, for the native lz4 build
pnpm start
pnpm start --broker localhost:19092   # also round-trips through a real broker (run `pnpm kafka:up` in the repo root first)
```

Options: `--duration <ms>`, `--warmup <ms>`, `--repetitions <n>`, `--concurrency <n>`, `--only <name,name>`.

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

Run it on Node 20 and on Node 22.

- `lz4` (the current dependency) does not build on Node 22.
- The platform package of `@derodero24/comprs` 2.x declares `node >= 22`, so pnpm skips it on Node 20. To get it, run `pnpm install --force --ignore-scripts` once under Node 22 and rebuild `lz4` under Node 20 with `pnpm rebuild lz4`.

Libraries that cannot be loaded are reported and skipped.

## Limits

The numbers come from one machine and synthetic data. They show the order of magnitude and the relative differences, not guarantees. Run it on the platform you deploy to (for example Linux in Docker) before deciding.
