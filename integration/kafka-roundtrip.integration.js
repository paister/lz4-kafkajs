"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  Kafka,
  CompressionTypes,
  CompressionCodecs,
  logLevel,
} = require("kafkajs");

const LZ4Codec = require("../src/index.js");

const BROKERS = (process.env.KAFKA_BROKERS || "localhost:19092").split(",");
const MESSAGE_COUNT = 100;
const CONSUME_TIMEOUT_MS = 30_000;

test("messages sent with LZ4 compression arrive unchanged", async () => {
  CompressionCodecs[CompressionTypes.LZ4] = new LZ4Codec().codec;

  const kafka = new Kafka({
    brokers: BROKERS,
    logLevel: logLevel.NOTHING,
  });
  const topic = `lz4-test-${crypto.randomUUID()}`;
  const sentMessages = Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
    key: `key-${index}`,
    value: `value-${index} ${"payload ".repeat(50)}`,
  }));

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
  const receivedMessages = [];
  await consumer.connect();
  try {
    await consumer.subscribe({ topic, fromBeginning: true });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Only received ${receivedMessages.length}/${MESSAGE_COUNT} messages`)),
        CONSUME_TIMEOUT_MS
      );
      consumer
        .run({
          eachMessage: async ({ message }) => {
            receivedMessages.push({
              key: message.key.toString(),
              value: message.value.toString(),
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
