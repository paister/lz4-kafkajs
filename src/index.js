"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lz4 = require("lz4");
/**
 * LZ4 Compression codec for the [KafkaJS](https://github.com/tulios/kafkajs) library.
 */
class LZ4Codec {
  constructor(options) {
    if (options) {
      this.compressOptions = options.compressOptions;
      this.decompressOptions = options.decompressOptions;
    }
    /**
     * KafkaJS CompressionType-compatible LZ4 codec.
     * @memberof LZ4Codec
     */
    this.codec = () => {
      return {
        compress: this.compress,
        decompress: this.decompress,
      };
    };
  }

  async compress(encoder) {
    return lz4.encode(encoder.buffer, this.compressOptions);
  }

  async decompress(buffer) {
    return lz4.decode(buffer, this.decompressOptions);
  }
}
exports.default = LZ4Codec;
module.exports = LZ4Codec;
