import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Every candidate exposes the interface KafkaJS calls on a codec:
 * `compress(buffer)` and `decompress(buffer)`, both returning a Promise<Buffer>.
 * Libraries with a synchronous API are wrapped in async functions, exactly as
 * a KafkaJS codec has to do.
 */

function asBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return Buffer.from(bytes);
}

export const CANDIDATES = [
  {
    name: "lz4",
    description: "current dependency, native via node-gyp",
    async create() {
      const lz4 = require("lz4");
      return {
        compress: async (buffer) => lz4.encode(buffer),
        decompress: async (buffer) => lz4.decode(buffer),
      };
    },
  },
  {
    name: "lz4-napi",
    description: "Rust (napi-rs), prebuilt binaries, async",
    async create() {
      const { compressFrame, decompressFrame } = await import("lz4-napi");
      return {
        compress: (buffer) => compressFrame(buffer),
        decompress: (buffer) => decompressFrame(buffer),
      };
    },
  },
  {
    name: "lz4-lite",
    description: "pure JavaScript, sync",
    async create() {
      const { compress, decompress } = await import("lz4-lite");
      return {
        compress: async (buffer) => asBuffer(compress(buffer)),
        decompress: async (buffer) => asBuffer(decompress(buffer)),
      };
    },
  },
  {
    name: "comprs (sync)",
    description: "Rust (lz4_flex), prebuilt binaries, sync",
    async create() {
      const { lz4Compress, lz4Decompress } = await import("@derodero24/comprs");
      return {
        compress: async (buffer) => asBuffer(lz4Compress(buffer)),
        decompress: async (buffer) => asBuffer(lz4Decompress(buffer)),
      };
    },
  },
  {
    name: "comprs (async)",
    description: "Rust (lz4_flex), prebuilt binaries, thread pool",
    async create() {
      const { lz4CompressAsync, lz4DecompressAsync } = await import("@derodero24/comprs");
      return {
        compress: async (buffer) => asBuffer(await lz4CompressAsync(buffer)),
        decompress: async (buffer) => asBuffer(await lz4DecompressAsync(buffer)),
      };
    },
  },
  {
    name: "compress-utils",
    description: "WebAssembly",
    async create() {
      const { compress, decompress } = await import("compress-utils/lz4");
      return {
        compress: async (buffer) => asBuffer(await compress(buffer)),
        decompress: async (buffer) => asBuffer(await decompress(buffer)),
      };
    },
  },
  {
    name: "lz4-hc-wasm",
    description: "WebAssembly, high compression",
    async create() {
      const { init } = await import("@warren-bank/lz4-hc-wasm");
      const lz4 = await init();
      return {
        compress: async (buffer) => asBuffer(await lz4.compressFrame(buffer)),
        decompress: async (buffer) => asBuffer(await lz4.uncompressFrame(buffer)),
      };
    },
  },
  {
    name: "lz4js",
    description: "pure JavaScript, kept as a reference for the Kafka check",
    async create() {
      const lz4js = require("lz4js");
      return {
        compress: async (buffer) => asBuffer(lz4js.compress(buffer)),
        decompress: async (buffer) => asBuffer(lz4js.decompress(buffer)),
      };
    },
  },
];

/**
 * Creates every candidate. Candidates that cannot be loaded on this machine
 * (for example a native build that fails) are reported instead of aborting.
 */
export async function loadCandidates(candidates = CANDIDATES) {
  const loaded = [];
  const unavailable = [];
  for (const candidate of candidates) {
    try {
      loaded.push({ ...candidate, codec: await candidate.create() });
    } catch (error) {
      unavailable.push({ name: candidate.name, reason: firstLine(error) });
    }
  }
  return { loaded, unavailable };
}

const MAX_REASON_LENGTH = 110;

function firstLine(error) {
  const line = String(error?.message ?? error).split("\n")[0];
  return line.length > MAX_REASON_LENGTH ? `${line.slice(0, MAX_REASON_LENGTH)}...` : line;
}
