# lz4-kafkajs

TypeScript-ready [lz4](https://www.npmjs.com/package/lz4) compression codec for [KafkaJS](https://www.npmjs.com/package/kafkajs).

ℹ️ Requires Node v10 or above to work.

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

All options are passed on to the [lz4 library](https://www.npmjs.com/package/lz4).

### Example

To configure the decompression and compression:

```typescript
import LZ4, {
  CompressOptions,
  DecompressOptions,
  LZ4Options,
} from "lz4-kafkajs";

const decompressOptions: DecompressOptions = {
  useJS: false,
};

const compressOptions: CompressOptions = {
  blockChecksum: false,
  blockIndependence: true,
  blockMaxSize: 4 << 20,
  dict: false,
  dictId: 0,
  highCompression: false,
  streamChecksum: true,
  streamSize: false,
};

const options: LZ4Options = {
  decompressOptions,
  compressOptions,
};

CompressionCodecs[CompressionTypes.LZ4] = new LZ4(options).codec;
```

## Performance

The `benchmark/` folder compares LZ4 libraries as KafkaJS codecs on real KafkaJS record batches. Only libraries that write frames Kafka accepts are measured.

Throughput in MB/s for a typical batch (100 records, 102 KB), Node 20, Apple Silicon. `x8` means eight operations in flight at once.

| Library | compress | decompress | compress x8 | decompress x8 |
| --- | ---: | ---: | ---: | ---: |
| `lz4` (used by `lz4-kafkajs` 1.x) | 942 | 413 | 962 | 599 |
| `lz4-napi` (Rust, thread pool) | 1168 | 2684 | 4760 | 8819 |

Decompression is the weak spot of the `lz4` library used here, and it works on the main thread. The full results, the other libraries and the limits of the measurement are in [benchmark/FINDINGS.md](benchmark/FINDINGS.md). Run it yourself with `pnpm start` in `benchmark/`.

## Development

The `lz4` dependency is a native module that does not build on Node 22 or newer, so development uses Node 20 (see `.nvmrc`).

```bash
nvm use
pnpm install
pnpm test                # unit tests, no external service needed
pnpm kafka:up            # starts a single-node Kafka in Docker on localhost:19092
pnpm test:integration
pnpm kafka:down
```

pnpm does not run dependency build scripts by default. `pnpm-workspace.yaml` allows it for `lz4`, which needs its native build.

On macOS, `pnpm install` can fail while linking if your Command Line Tools are older than the default SDK. Point the build at an older SDK in that case:

```bash
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk pnpm install
```

- `test/lz4-compression.test.js` (unit): checks that the codec produces a real LZ4 frame, that it shrinks repetitive data, and that decompressing restores it.
- `integration/kafka-roundtrip.integration.js` (integration): sends messages with LZ4 compression through a real Kafka broker and checks that they arrive unchanged. Set `KAFKA_BROKERS` (comma separated) to use another broker.

Kafka only supports independent LZ4 blocks. Compressing with `blockIndependence: false` is rejected by the broker with "Dependent block stream is unsupported".
