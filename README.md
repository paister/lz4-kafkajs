# lz4-kafkajs

**Fast LZ4 compression for KafkaJS. Smaller messages, lower bandwidth, no build tools.**

[![npm version](https://img.shields.io/npm/v/lz4-kafkajs.svg)](https://www.npmjs.com/package/lz4-kafkajs)
[![CI](https://github.com/paister/lz4-kafkajs/actions/workflows/ci.yml/badge.svg)](https://github.com/paister/lz4-kafkajs/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/lz4-kafkajs.svg)](LICENSE)

[KafkaJS](https://kafka.js.org) can only compress with GZIP out of the box. GZIP saves space, but it costs a lot of CPU. [LZ4](https://lz4.org) is the usual choice for Kafka when throughput and latency matter: it shrinks typical JSON events to about a third of their size and is built for speed instead of the highest compression.

`lz4-kafkajs` adds LZ4 to KafkaJS with three lines of code.

```typescript
import { CompressionTypes, CompressionCodecs } from "kafkajs";
import LZ4 from "lz4-kafkajs";

CompressionCodecs[CompressionTypes.LZ4] = new LZ4().codec;
```

## Why this package

- **Fast.** Decompression is about 6 times faster than the previous `lz4` based version (see [Performance](#performance)). Consumers, which decompress every batch, benefit most.
- **Keeps your event loop free.** Work runs on a thread pool, not on the main thread. Large batches no longer cause latency spikes in the rest of your service.
- **Nothing to compile.** Prebuilt binaries for all common platforms and Node versions, so no `node-gyp`, no Python, no compiler in your Docker image or CI.
- **Accepted by Kafka.** Kafka rejects LZ4 frames with dependent blocks ("Dependent block stream is unsupported"). Some LZ4 libraries write them anyway. This one always writes independent blocks, and a test against a real broker checks it.
- **TypeScript included.** Typed options and declarations, plus CommonJS and ESM usage.
- **Tested widely.** Unit tests on Node 18 to 26 on Linux, plus macOS and Windows, and a round trip through a real Kafka broker in CI.

## Install

```bash
npm install lz4-kafkajs      # or: pnpm add lz4-kafkajs / yarn add lz4-kafkajs
```

Requires Node 18 or above and `kafkajs` 2.x.

## Quick start

Register the codec once at startup, then set KafkaJS producer to compress with LZ4 when you send.

```typescript
import { Kafka, CompressionTypes, CompressionCodecs } from "kafkajs";
import LZ4 from "lz4-kafkajs";

CompressionCodecs[CompressionTypes.LZ4] = new LZ4().codec;

const kafka = new Kafka({ brokers: ["localhost:9092"] });
const producer = kafka.producer();

await producer.connect();
await producer.send({
  topic: "events",
  compression: CompressionTypes.LZ4,
  messages: [{ value: JSON.stringify({ hello: "world" }) }],
});
```

Consumers need nothing but the registration. KafkaJS reads the compression type from each batch and calls the codec to decompress it. Register it in every service that may read LZ4 batches, even if it never produces any.

## Options

The codec writes LZ4 frames with independent blocks, which is the only kind Kafka accepts. Two options are available:

| Option | Default | Effect |
| --- | --- | --- |
| `contentChecksum` | `false` | Adds a checksum over the whole uncompressed content, so corrupted data is detected when decompressing. |
| `blockChecksums` | `false` | Adds a checksum to every compressed block, so a damaged block is detected before it is decompressed. |

You normally need neither. Kafka already protects every record batch with its own CRC. The checksums are a second line of defense against corruption outside of that, for example faulty memory or a bug in a proxy between producer and consumer. They cost a little CPU and some bytes, so they are off by default.

Decompression has no options and reads frames with or without checksums.

```typescript
import { CompressionTypes, CompressionCodecs } from "kafkajs";
import LZ4, { type LZ4Options } from "lz4-kafkajs";

const options: LZ4Options = {
  compressOptions: { contentChecksum: true },
};

CompressionCodecs[CompressionTypes.LZ4] = new LZ4(options).codec;
```

## Performance

The [`benchmark/`](benchmark) folder compares LZ4 libraries as KafkaJS codecs on real KafkaJS record batches. Only libraries that write frames Kafka accepts are measured.

Throughput in MB/s for a typical batch (100 records, 102 KB), Node 20, Apple Silicon. `x8` means eight operations in flight at once.

| Library | compress | decompress | compress x8 | decompress x8 |
| --- | ---: | ---: | ---: | ---: |
| `lz4` (`lz4-kafkajs` 1.x) | 942 | 413 | 962 | 599 |
| `lz4-napi` (`lz4-kafkajs` 2.x) | 1168 | 2684 | 4760 | 8819 |

What this means:

- **Decompression is about 6 times faster** than in version 1.
- **It scales under load.** With eight batches at once, version 2 reaches about 5 times the throughput of version 1 when compressing and about 15 times when decompressing.
- **The event loop stays free.** For 1 MB batches the p99 event loop delay is about 1.5 ms, against 9 to 14 ms for libraries that work on the main thread.

These numbers come from one machine (an Apple MacBook with an M5 Pro processor) and a synthetic JSON workload, and measure the codec only, without network or broker. The full results, the other libraries and the limits of the measurement are in [benchmark/FINDINGS.md](benchmark/FINDINGS.md). Run it yourself with `pnpm start` in `benchmark/`.

## Upgrading from 1.x

Version 2 replaces the native `lz4` module, which no longer builds on Node 22 or newer, with `lz4-napi`. The usage stays the same, but the options changed:

- `decompressOptions` (`useJS`) is gone.
- `blockIndependence`, `blockMaxSize`, `dict`, `dictId`, `highCompression` and `streamSize` are gone. Blocks are always independent, which Kafka requires anyway.
- `blockChecksum` is now `blockChecksums`, and `streamChecksum` is now `contentChecksum`.
- Frames no longer carry a content checksum unless you set `contentChecksum: true`. 1.x wrote one by default.
- Node 18 or above is required.

## Contributing

Issues and pull requests are welcome.

```bash
nvm use
pnpm install
pnpm test                # builds, then runs the unit tests, no external service needed
pnpm kafka:up            # starts a single-node Kafka in Docker on localhost:19092
pnpm test:integration
pnpm kafka:down
pnpm lint                # Biome: lint and format check
pnpm format              # Biome: fix formatting and import order
pnpm typecheck
```

The code is TypeScript in `src/`. `pnpm build` compiles it with `tsc` into `dist/`, and only `dist/src` is published. The tests run against that compiled output.

- `test/lz4-compression.test.ts` (unit): checks that the codec produces a real LZ4 frame, that data survives a round trip (including empty, large and incompressible input), that corrupted frames are rejected, that the compress options end up in the frame header, and that the package loads with both `require` and `import`.
- `integration/kafka-roundtrip.integration.ts` (integration): sends messages with LZ4 compression through a real Kafka broker and checks that they arrive unchanged. Set `KAFKA_BROKERS` (comma separated) to use another broker.

## License

[MIT](LICENSE)
