"use strict";
const { compressFrame, decompressFrame } = require("lz4-napi");

/**
 * LZ4 Compression codec for the [KafkaJS](https://github.com/tulios/kafkajs) library.
 */
class LZ4Codec {
  constructor(options) {
    this.compressOptions = options?.compressOptions;

    /**
     * KafkaJS CompressionType-compatible LZ4 codec.
     * @memberof LZ4Codec
     */
    this.codec = () => {
      return {
        compress: this.compress.bind(this),
        decompress: this.decompress.bind(this),
      };
    };
  }

  async compress(encoder) {
    return compressFrame(encoder.buffer, this.compressOptions);
  }

  async decompress(buffer) {
    return decompressFrame(buffer);
  }
}

// `module.exports` is the class itself, so `require("lz4-kafkajs")` works.
// The `default` property keeps `import LZ4 from "lz4-kafkajs"` working too.
module.exports = LZ4Codec;
module.exports.default = LZ4Codec;
