# lz4-kafkajs

TypeScript-ready [lz4](https://lz4.org) compression codec for [KafkaJS](https://www.npmjs.com/package/kafkajs), built on [lz4-napi](https://www.npmjs.com/package/lz4-napi).

ℹ️ Requires Node v18 or above. `lz4-napi` ships prebuilt binaries, so no compiler is needed to install.

## Install

With yarn

```bash
$ yarn add lz4-kafkajs
```

With pnpm

```bash
$ pnpm add lz4-kafkajs
```

With npm

```bash
$ npm install lz4-kafkajs
```

## Usage

```typescript
import { CompressionTypes, CompressionCodecs } from "kafkajs";
import LZ4 from "lz4-kafkajs";

CompressionCodecs[CompressionTypes.LZ4] = new LZ4().codec;
```

## Options

The codec writes LZ4 frames with independent blocks, which is the only kind Kafka accepts. These compress options are passed on to [lz4-napi](https://www.npmjs.com/package/lz4-napi):

| Option | Default | Effect |
| --- | --- | --- |
| `contentChecksum` | `false` | Adds a checksum over the whole uncompressed content. |
| `blockChecksums` | `false` | Adds a checksum to every compressed block. |

Decompression has no options and reads frames with or without checksums.

### Example

```typescript
import LZ4, { CompressOptions, LZ4Options } from "lz4-kafkajs";

const compressOptions: CompressOptions = {
  contentChecksum: true,
  blockChecksums: false,
};

const options: LZ4Options = { compressOptions };

CompressionCodecs[CompressionTypes.LZ4] = new LZ4(options).codec;
```

## Upgrading from 1.x

Version 2 replaces the native `lz4` module with `lz4-napi`. The usage stays the same, but the options changed:

- `decompressOptions` (`useJS`) is gone.
- `blockIndependence`, `blockMaxSize`, `dict`, `dictId`, `highCompression` and `streamSize` are gone. Blocks are always independent, which Kafka requires anyway.
- `blockChecksum` is now `blockChecksums`, and `streamChecksum` is now `contentChecksum`.
- Frames no longer carry a content checksum unless you set `contentChecksum: true`. 1.x wrote one by default.
- Node 18 or above is required.

## Performance

The `benchmark/` folder compares LZ4 libraries as KafkaJS codecs on real KafkaJS record batches. Only libraries that write frames Kafka accepts are measured.

Throughput in MB/s for a typical batch (100 records, 102 KB), Node 20, Apple Silicon. `x8` means eight operations in flight at once.

| Library | compress | decompress | compress x8 | decompress x8 |
| --- | ---: | ---: | ---: | ---: |
| `lz4` (`lz4-kafkajs` 1.x) | 942 | 413 | 962 | 599 |
| `lz4-napi` (`lz4-kafkajs` 2.x) | 1168 | 2684 | 4760 | 8819 |

Version 2 decompresses about 6 times faster than version 1 and does its work on a thread pool instead of the main thread. The full results, the other libraries and the limits of the measurement are in [benchmark/FINDINGS.md](benchmark/FINDINGS.md). Run it yourself with `pnpm start` in `benchmark/`.

## Development

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

The code is TypeScript in `src/`. `pnpm build` compiles it with `tsc` into `dist/`, and only `dist/src` is published: plain JavaScript plus type declarations generated from the source. The tests run against that compiled output.

- `test/lz4-compression.test.ts` (unit): checks that the codec produces a real LZ4 frame, that it shrinks repetitive data, that decompressing restores it, that the compress options end up in the frame header, and that the package loads with both `require` and `import`.
- `integration/kafka-roundtrip.integration.ts` (integration): sends messages with LZ4 compression through a real Kafka broker and checks that they arrive unchanged. Set `KAFKA_BROKERS` (comma separated) to use another broker.

Kafka only supports independent LZ4 blocks. A codec that writes dependent blocks is rejected by the broker with "Dependent block stream is unsupported".
