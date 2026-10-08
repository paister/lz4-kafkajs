import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// The exact code KafkaJS uses to build the buffer that is handed to a codec.
const Encoder = require("kafkajs/src/protocol/encoder");
const Record = require("kafkajs/src/protocol/recordBatch/record/v0");

const RANDOM_SEED = 20260101;
const FIRST_EVENT_TIMESTAMP = Date.UTC(2026, 0, 1);
const MAX_USER_ID = 50_000;
const KEY_COUNT = 1_000;

const EVENT_TYPES = ["page_view", "click", "purchase", "login", "logout", "search"];
const STATUS_CODES = [200, 200, 200, 200, 304, 404, 500];
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
];
const WORDS = [
  "order", "customer", "basket", "payment", "shipping", "invoice", "catalog", "review",
  "session", "profile", "coupon", "address", "refund", "warehouse", "delivery", "account",
  "search", "filter", "price", "stock", "category", "wishlist", "checkout", "promotion",
];

/**
 * Describes the batches a codec receives. Sizes are the number of records and
 * the approximate size of one record's value in bytes.
 */
export const WORKLOAD_DEFINITIONS = [
  { name: "small batch", recordCount: 10, valueSize: 300, kind: "events" },
  { name: "typical batch", recordCount: 100, valueSize: 1_000, kind: "events" },
  { name: "large batch", recordCount: 1_000, valueSize: 1_000, kind: "events" },
  { name: "incompressible", recordCount: 100, valueSize: 1_000, kind: "random" },
];

export function createWorkloads(definitions = WORKLOAD_DEFINITIONS) {
  return definitions.map((definition) => {
    const random = createRandom(RANDOM_SEED);
    const values = Array.from({ length: definition.recordCount }, (_, index) =>
      definition.kind === "random"
        ? createRandomValue(random, definition.valueSize)
        : createEventValue(random, index, definition.valueSize)
    );
    return { name: definition.name, buffer: encodeRecords(values) };
  });
}

function encodeRecords(values) {
  const records = values.map((value, index) =>
    Record({
      offsetDelta: index,
      key: Buffer.from(`key-${index % KEY_COUNT}`),
      value,
      headers: {},
    })
  );
  return new Encoder().writeEncoderArray(records).buffer;
}

function createEventValue(random, index, targetSize) {
  const event = {
    eventId: randomHex(random, 32),
    timestamp: FIRST_EVENT_TIMESTAMP + index * 37 + Math.floor(random() * 30),
    userId: `user-${Math.floor(random() * MAX_USER_ID)}`,
    type: pick(random, EVENT_TYPES),
    url: `/shop/${pick(random, WORDS)}/${Math.floor(random() * 10_000)}`,
    status: pick(random, STATUS_CODES),
    durationMs: Math.floor(random() * 2_000),
    userAgent: pick(random, USER_AGENTS),
    message: "",
  };
  while (JSON.stringify(event).length < targetSize) {
    event.message += `${pick(random, WORDS)} ${pick(random, WORDS)} `;
  }
  return Buffer.from(JSON.stringify(event));
}

function createRandomValue(random, size) {
  return Buffer.from(Array.from({ length: size }, () => Math.floor(random() * 256)));
}

function randomHex(random, length) {
  let hex = "";
  while (hex.length < length) hex += Math.floor(random() * 16).toString(16);
  return hex;
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

// Small seeded generator (mulberry32), so every run compresses the same bytes.
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
