import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { CompressionCodecs, CompressionTypes, Kafka, logLevel } from "kafkajs";

import LZ4Codec from "../src/index.js";

const BROKERS = (process.env.KAFKA_BROKERS || "localhost:19092").split(",");
const MESSAGE_COUNT = 100;
const CONSUME_TIMEOUT_MS = 30_000;

// Every LZ4 frame starts with the magic number 0x184D2204 (little endian).
const LZ4_FRAME_MAGIC_NUMBER = Buffer.from([0x04, 0x22, 0x4d, 0x18]);

interface TestMessage {
  key: string;
  value: string;
}

/**
 * Wraps the real codec and records the bytes that go over the wire, so the
 * test can prove that the payload really is LZ4 and not just plain messages.
 */
function createRecordingCodec() {
  const realCodec = new LZ4Codec().codec();
  const compressedPayloads: Buffer[] = [];
  const payloadsToDecompress: Buffer[] = [];

  return {
    compressedPayloads,
    payloadsToDecompress,
    codec: () => ({
      compress: async (encoder: { buffer: Buffer }) => {
        const compressed = await realCodec.compress(encoder);
        compressedPayloads.push(compressed);
        return compressed;
      },
      decompress: async (buffer: Buffer) => {
        payloadsToDecompress.push(buffer);
        return realCodec.decompress(buffer);
      },
    }),
  };
}

function startsWithLz4FrameMagicNumber(payload: Buffer): boolean {
  return payload
    .subarray(0, LZ4_FRAME_MAGIC_NUMBER.length)
    .equals(LZ4_FRAME_MAGIC_NUMBER);
}

void test("messages sent with LZ4 compression arrive unchanged and are LZ4 encoded", async () => {
  const recordingCodec = createRecordingCodec();
  CompressionCodecs[CompressionTypes.LZ4] = recordingCodec.codec;

  const kafka = new Kafka({
    brokers: BROKERS,
    logLevel: logLevel.NOTHING,
  });
  const topic = `lz4-test-${crypto.randomUUID()}`;
  const sentMessages: TestMessage[] = Array.from(
    { length: MESSAGE_COUNT },
    (_, index) => ({
      key: `key-${index}`,
      value: `value-${index} ${"payload ".repeat(50)}`,
    }),
  );

  const producer = kafka.producer();
  await producer.connect();
  try {
    await producer.send({
      topic,
      compression: CompressionTypes.LZ4,
      messages: sentMessages,
    });
  } finally {
    await producer.disconnect();
  }

  const consumer = kafka.consumer({ groupId: `group-${crypto.randomUUID()}` });
  const receivedMessages: TestMessage[] = [];
  await consumer.connect();
  try {
    await consumer.subscribe({ topic, fromBeginning: true });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Only received ${receivedMessages.length}/${MESSAGE_COUNT} messages`,
            ),
          ),
        CONSUME_TIMEOUT_MS,
      );
      consumer
        .run({
          eachMessage: async ({ message }) => {
            receivedMessages.push({
              key: String(message.key),
              value: String(message.value),
            });
            if (receivedMessages.length === MESSAGE_COUNT) {
              clearTimeout(timeout);
              resolve();
            }
          },
        })
        .catch(reject);
    });
  } finally {
    await consumer.disconnect();
  }

  assert.deepEqual(receivedMessages, sentMessages);

  assert.ok(
    recordingCodec.compressedPayloads.length > 0,
    "producer never called the LZ4 codec",
  );
  assert.ok(
    recordingCodec.compressedPayloads.every(startsWithLz4FrameMagicNumber),
    "producer payload is not an LZ4 frame",
  );
  assert.ok(
    recordingCodec.payloadsToDecompress.length > 0,
    "consumer never called the LZ4 codec",
  );
  assert.ok(
    recordingCodec.payloadsToDecompress.every(startsWithLz4FrameMagicNumber),
    "payload read from the broker is not an LZ4 frame",
  );
});
