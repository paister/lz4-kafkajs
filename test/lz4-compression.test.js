"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const LZ4Codec = require("../src/index.js");

// Every LZ4 frame starts with this number, stored as little endian.
// https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md
const LZ4_FRAME_MAGIC_NUMBER = 0x184d2204;
const REPETITIVE_PAYLOAD = Buffer.from("kafka ".repeat(1000));

// The frame descriptor's flag byte follows the 4 byte magic number.
const FRAME_FLAGS_OFFSET = 4;
const BLOCK_INDEPENDENCE_FLAG = 0b00100000;
const STREAM_CHECKSUM_FLAG = 0b00000100;

async function compressWithOptions(compressOptions) {
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
  it("writes a stream checksum by default", async () => {
    const frameFlags = await compressWithOptions(undefined);

    assert.ok(frameFlags & STREAM_CHECKSUM_FLAG);
  });

  it("leaves out the stream checksum when streamChecksum is false", async () => {
    const frameFlags = await compressWithOptions({ streamChecksum: false });

    assert.equal(frameFlags & STREAM_CHECKSUM_FLAG, 0);
  });

  it("uses independent blocks by default", async () => {
    const frameFlags = await compressWithOptions(undefined);

    assert.ok(frameFlags & BLOCK_INDEPENDENCE_FLAG);
  });

  it("uses dependent blocks when blockIndependence is false", async () => {
    const frameFlags = await compressWithOptions({ blockIndependence: false });

    assert.equal(frameFlags & BLOCK_INDEPENDENCE_FLAG, 0);
  });
});
