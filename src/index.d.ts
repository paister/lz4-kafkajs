/// <reference types="node" />
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
  constructor(options?: LZ4Options | undefined);

  private compress;
  private decompress;
  /**
   * KafkaJS CompressionType-compatible LZ4 codec.
   * @memberof LZ4Codec
   */
  codec: () => {
    compress: (encoder: { buffer: Buffer }) => Promise<Buffer>;
    decompress: (buffer: Buffer) => Promise<Buffer>;
  };
}
