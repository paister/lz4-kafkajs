import { compressFrame, decompressFrame } from "lz4-napi";

export interface CompressOptions {
  /**
   * Add a checksum over the whole uncompressed content
   * @default false
   */
  contentChecksum?: boolean;
  /**
   * Add a checksum to every compressed block
   * @default false
   */
  blockChecksums?: boolean;
}

export interface LZ4Options {
  compressOptions?: CompressOptions | undefined;
}

/**
 * LZ4 Compression codec for the [KafkaJS](https://github.com/tulios/kafkajs) library.
 */
export default class LZ4Codec {
  private readonly compressOptions: CompressOptions | undefined;

  constructor(options?: LZ4Options | undefined) {
    this.compressOptions = options?.compressOptions;
  }

  /**
   * KafkaJS CompressionType-compatible LZ4 codec.
   *
   * An arrow function, so that `new LZ4().codec` can be handed to KafkaJS
   * without losing `this`.
   */
  codec = () => ({
    compress: this.compress.bind(this),
    decompress: this.decompress.bind(this),
  });

  private async compress(encoder: { buffer: Buffer }): Promise<Buffer> {
    return compressFrame(encoder.buffer, this.compressOptions);
  }

  private async decompress(buffer: Buffer): Promise<Buffer> {
    return decompressFrame(buffer);
  }
}

// TypeScript would expose the class only as `require(...).default`. Making the
// class itself the module keeps `const LZ4 = require("lz4-kafkajs")` working
// as it has since 1.x, and `.default` serves `import LZ4 from "lz4-kafkajs"`.
module.exports = Object.assign(LZ4Codec, { default: LZ4Codec });
