import assert from "node:assert/strict";
import { describe, it } from "node:test";

import LZ4Codec, { type CompressOptions } from "../src/index.js";

// Every LZ4 frame starts with this number, stored as little endian.
// https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md
const LZ4_FRAME_MAGIC_NUMBER = 0x184d2204;
const REPETITIVE_PAYLOAD = Buffer.from("kafka ".repeat(1000));

// The frame descriptor's flag byte follows the 4 byte magic number.
const FRAME_FLAGS_OFFSET = 4;
const BLOCK_INDEPENDENCE_FLAG = 0b00100000;
const BLOCK_CHECKSUM_FLAG = 0b00010000;
const CONTENT_CHECKSUM_FLAG = 0b00000100;

async function compressWithOptions(
  compressOptions: CompressOptions | undefined,
): Promise<number> {
  const kafkaJsCodec = new LZ4Codec({ compressOptions }).codec();
  const compressed = await kafkaJsCodec.compress({
    buffer: REPETITIVE_PAYLOAD,
  });
  return compressed.readUInt8(FRAME_FLAGS_OFFSET);
}

describe("LZ4Codec compression", () => {
  const kafkaJsCodec = new LZ4Codec().codec();

  it("produces an LZ4 frame", async () => {
    const compressed = await kafkaJsCodec.compress({
      buffer: REPETITIVE_PAYLOAD,
    });

    assert.equal(compressed.readUInt32LE(0), LZ4_FRAME_MAGIC_NUMBER);
  });

  it("makes repetitive data smaller", async () => {
    const compressed = await kafkaJsCodec.compress({
      buffer: REPETITIVE_PAYLOAD,
    });

    assert.ok(compressed.length < REPETITIVE_PAYLOAD.length);
  });

  it("restores the original data when decompressing", async () => {
    const compressed = await kafkaJsCodec.compress({
      buffer: REPETITIVE_PAYLOAD,
    });

    const restored = await kafkaJsCodec.decompress(compressed);

    assert.ok(restored.equals(REPETITIVE_PAYLOAD));
  });
});

describe("LZ4Codec compress options", () => {
  it("writes no checksums by default", async () => {
    const frameFlags = await compressWithOptions(undefined);

    assert.equal(frameFlags & CONTENT_CHECKSUM_FLAG, 0);
    assert.equal(frameFlags & BLOCK_CHECKSUM_FLAG, 0);
  });

  it("writes a content checksum when contentChecksum is true", async () => {
    const frameFlags = await compressWithOptions({ contentChecksum: true });

    assert.ok(frameFlags & CONTENT_CHECKSUM_FLAG);
  });

  it("writes block checksums when blockChecksums is true", async () => {
    const frameFlags = await compressWithOptions({ blockChecksums: true });

    assert.ok(frameFlags & BLOCK_CHECKSUM_FLAG);
  });

  // Kafka rejects dependent blocks, so the codec must never write them.
  it("always uses independent blocks", async () => {
    const frameFlags = await compressWithOptions({
      contentChecksum: true,
      blockChecksums: true,
    });

    assert.ok(frameFlags & BLOCK_INDEPENDENCE_FLAG);
  });

  it("restores the data when it was written with checksums", async () => {
    const kafkaJsCodec = new LZ4Codec({
      compressOptions: { contentChecksum: true, blockChecksums: true },
    }).codec();
    const compressed = await kafkaJsCodec.compress({
      buffer: REPETITIVE_PAYLOAD,
    });

    const restored = await kafkaJsCodec.decompress(compressed);

    assert.ok(restored.equals(REPETITIVE_PAYLOAD));
  });
});

// Plain JavaScript users and `import LZ4 from` users must get the same class.
describe("LZ4Codec module shape", () => {
  // `require` is deliberate: it is how a plain JavaScript user loads the package.
  const required = require("../src/index.js");

  it("is the class itself when loaded with require", () => {
    assert.equal(typeof required, "function");
    assert.ok(new required().codec().compress);
  });

  it("offers the same class as the default export", () => {
    assert.equal(required.default, required);
    assert.equal(LZ4Codec, required);
  });
});
