import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const COLUMNS = [
  "timestamp",
  "node",
  "platform",
  "arch",
  "os_release",
  "cpu",
  "cpu_cores",
  "memory_gb",
  "library",
  "workload",
  "workload_bytes",
  "ratio",
  "compress_mbps",
  "decompress_mbps",
  "compress_concurrent_mbps",
  "decompress_concurrent_mbps",
  "loop_delay_p99_ms",
  "concurrency",
  "duration_ms",
  "warmup_ms",
  "repetitions",
];
const BYTES_PER_GIGABYTE = 1024 ** 3;

/**
 * Appends one CSV row per library and workload. The file is only appended to,
 * so runs from different days, Node versions or machines end up in one file
 * that can be opened in a spreadsheet or loaded into pandas.
 */
export function appendResultsToCsv(filePath, resultsByWorkload, options) {
  const environment = describeEnvironment();
  const rows = resultsByWorkload.flatMap(({ workload, results }) =>
    results.map((result) => toRow(environment, workload, result, options))
  );

  mkdirSync(path.dirname(filePath), { recursive: true });
  const header = existsSync(filePath) ? "" : `${COLUMNS.join(",")}\n`;
  appendFileSync(filePath, header + rows.map(formatCsvLine).join(""));
  return rows.length;
}

export function defaultOutputPath(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return path.join("results", `${day}-node${process.versions.node.split(".")[0]}-${process.platform}-${process.arch}.csv`);
}

function describeEnvironment() {
  const [cpu] = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    os_release: os.release(),
    cpu: cpu?.model.trim() ?? "unknown",
    cpu_cores: os.cpus().length,
    memory_gb: Math.round(os.totalmem() / BYTES_PER_GIGABYTE),
  };
}

function toRow(environment, workload, result, options) {
  return {
    ...environment,
    library: result.name,
    workload: workload.name,
    workload_bytes: workload.buffer.length,
    ratio: result.ratio.toFixed(2),
    compress_mbps: result.compress.megabytesPerSecond.toFixed(1),
    decompress_mbps: result.decompress.megabytesPerSecond.toFixed(1),
    compress_concurrent_mbps: result.compressConcurrent.megabytesPerSecond.toFixed(1),
    decompress_concurrent_mbps: result.decompressConcurrent.megabytesPerSecond.toFixed(1),
    loop_delay_p99_ms: result.compressConcurrent.eventLoopDelayMs.toFixed(2),
    concurrency: options.concurrency,
    duration_ms: options.durationMs,
    warmup_ms: options.warmupMs,
    repetitions: options.repetitions,
  };
}

function formatCsvLine(row) {
  return `${COLUMNS.map((column) => escapeCsvCell(row[column])).join(",")}\n`;
}

function escapeCsvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
