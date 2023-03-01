# lz4-kafkajs

TypeScript-ready [lz4](https://www.npmjs.com/package/lz4) compression codec for [KafkaJS](https://www.npmjs.com/package/kafkajs).

ℹ️ Requires Node v10 or above to work.

## Install

With yarn

```bash
$ yarn add lz4-kafkajs
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
