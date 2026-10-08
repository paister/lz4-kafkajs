import { randomUUID } from "node:crypto";
import kafkajs from "kafkajs";

const { Kafka, CompressionTypes, CompressionCodecs, logLevel } = kafkajs;

const LZ4_FRAME_MAGIC_NUMBER = 0x184d2204;
const FRAME_FLAGS_OFFSET = 4;
const BLOCK_INDEPENDENCE_FLAG = 0b00100000;

const BROKER_MESSAGE_COUNT = 100;
const BROKER_TIMEOUT_MS = 30_000;

/**
 * A codec is only usable for Kafka if it writes a standard LZ4 frame with
 * independent blocks (Kafka rejects dependent blocks) and restores the data.
 * Returns undefined when everything is fine, otherwise the reason.
 */
export async function findKafkaFrameProblem(codec, workloads) {
  for (const workload of workloads) {
    const frame = await codec.compress(workload.buffer);

    if (frame.readUInt32LE(0) !== LZ4_FRAME_MAGIC_NUMBER) {
      return "does not write an LZ4 frame";
    }
    if (!(frame[FRAME_FLAGS_OFFSET] & BLOCK_INDEPENDENCE_FLAG)) {
      return "writes dependent blocks, which Kafka rejects";
    }
    const restored = await codec.decompress(frame);
    if (!restored.equals(workload.buffer)) {
      return `round trip changed the data (${workload.name})`;
    }
  }
  return undefined;
}

/**
 * Every codec has to read the frames of every other codec. This catches
 * libraries that only understand their own output.
 */
export async function findInteropProblems(candidates, workload) {
  const problems = [];
  for (const producer of candidates) {
    const frame = await producer.codec.compress(workload.buffer);
    for (const consumer of candidates) {
      const reason = await describeDecodeFailure(consumer.codec, frame, workload.buffer);
      if (reason) problems.push({ producer: producer.name, consumer: consumer.name, reason });
    }
  }
  return problems;
}

async function describeDecodeFailure(codec, frame, expected) {
  try {
    const restored = await codec.decompress(frame);
    return restored.equals(expected) ? undefined : "decoded different data";
  } catch (error) {
    return String(error?.message ?? error).split("\n")[0];
  }
}

/**
 * Sends messages through a real broker with the codec registered in KafkaJS
 * and reads them back. Returns undefined on success, otherwise the reason.
 */
export async function findBrokerProblem(codec, brokers) {
  const originalCodec = CompressionCodecs[CompressionTypes.LZ4];
  CompressionCodecs[CompressionTypes.LZ4] = () => asKafkaJsCodec(codec);
  try {
    await roundTripThroughBroker(brokers);
    return undefined;
  } catch (error) {
    return String(error?.message ?? error).split("\n")[0];
  } finally {
    CompressionCodecs[CompressionTypes.LZ4] = originalCodec;
  }
}

// KafkaJS hands an Encoder to compress(), the benchmark codecs work on buffers.
function asKafkaJsCodec(codec) {
  return {
    compress: (encoder) => codec.compress(encoder.buffer),
    decompress: (buffer) => codec.decompress(buffer),
  };
}

async function roundTripThroughBroker(brokers) {
  const kafka = new Kafka({ brokers, logLevel: logLevel.NOTHING, retry: { retries: 1 } });
  const topic = `lz4-benchmark-${randomUUID()}`;
  const sent = Array.from({ length: BROKER_MESSAGE_COUNT }, (_, index) => ({
    key: `key-${index}`,
    value: `value-${index} ${"payload ".repeat(50)}`,
  }));

  const producer = kafka.producer();
  await producer.connect();
  try {
    await producer.send({ topic, compression: CompressionTypes.LZ4, messages: sent });
  } finally {
    await producer.disconnect();
  }

  const received = await consumeAll(kafka, topic, sent.length);
  if (JSON.stringify(received) !== JSON.stringify(sent)) {
    throw new Error("messages arrived changed");
  }
}

async function consumeAll(kafka, topic, expectedCount) {
  const consumer = kafka.consumer({ groupId: `group-${randomUUID()}` });
  const received = [];
  let timeout;
  await consumer.connect();
  try {
    await consumer.subscribe({ topic, fromBeginning: true });
    await new Promise((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`received ${received.length}/${expectedCount} messages`)),
        BROKER_TIMEOUT_MS
      );
      consumer
        .run({
          eachMessage: async ({ message }) => {
            received.push({ key: message.key.toString(), value: message.value.toString() });
            if (received.length === expectedCount) resolve();
          },
        })
        .catch(reject);
    });
  } finally {
    clearTimeout(timeout);
    await consumer.disconnect();
  }
  return received;
}
