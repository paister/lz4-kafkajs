import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { CompressionCodecs, CompressionTypes, Kafka, logLevel } from "kafkajs";

import LZ4Codec from "../src/index.js";

const BROKERS = (process.env.KAFKA_BROKERS || "localhost:19092").split(",");
const MESSAGE_COUNT = 100;
const CONSUME_TIMEOUT_MS = 30_000;

interface TestMessage {
  key: string;
  value: string;
}

void test("messages sent with LZ4 compression arrive unchanged", async () => {
  CompressionCodecs[CompressionTypes.LZ4] = new LZ4Codec().codec;

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
});
