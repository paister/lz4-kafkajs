/// <reference types="node" />
export interface CompressOptions {
  /**
   * @default true
   */
  blockIndependence?: boolean;
  /**
   * Add compressed blocks checksum
   * @default false
   */
  blockChecksum?: boolean;
  /**
   * Chunk size to use
   * @default 4194304 (4MB)
   */
  blockMaxSize?: number;
  /**
   * Add full LZ4 stream size
   * @default false
   */
  streamSize?: boolean;
  /**
   * Add full LZ4 stream checksum
   * @default true
   */
  streamChecksum?: boolean;
  /**
   * Use dictionary
   * @default false
   */
  dict?: boolean;
  /**
   * Dictionary id
   * @default 0
   */
  dictId?: number;
  /**
   * Use high compression
   * @default false
   */
  highCompression?: boolean;
}

export interface DecompressOptions {
  useJS: boolean;
}

export interface LZ4Options {
  compressOptions?: CompressOptions | undefined;
  decompressOptions?: DecompressOptions | undefined;
}
/**
 * LZ4 Compression codec for the [KafkaJS](https://github.com/tulios/kafkajs) library.
 */
export default class LZ4Codec {
  private options?;
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
