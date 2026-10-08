import { CANDIDATES, loadCandidates } from "./candidates.js";
import { findBrokerProblem, findInteropProblems, findKafkaFrameProblem } from "./correctness.js";
import { measureConcurrent, measureSequential } from "./measure.js";
import { createWorkloads } from "./workloads.js";

const DEFAULT_OPTIONS = {
  durationMs: 300,
  warmupMs: 100,
  repetitions: 3,
  concurrency: 8,
  only: undefined,
  broker: undefined,
};
const INTEROP_WORKLOAD_NAME = "typical batch";

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const workloads = createWorkloads();

  printEnvironment(options);
  const { loaded, unavailable } = await loadCandidates(selectCandidates(options.only));
  const { usable, excluded } = await screenCandidates(loaded, workloads, options);
  printScreening(usable, [...unavailable, ...excluded]);

  const resultsByWorkload = [];
  for (const workload of workloads) {
    const results = [];
    for (const candidate of usable) {
      results.push(await measureCandidate(candidate, workload, options));
    }
    resultsByWorkload.push({ workload, results });
    printWorkloadTable(workload, results, options);
  }
  printRanking(resultsByWorkload);
}

function parseArguments(args) {
  const options = { ...DEFAULT_OPTIONS };
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]];
    if (flag === "--duration") options.durationMs = Number(value);
    else if (flag === "--warmup") options.warmupMs = Number(value);
    else if (flag === "--repetitions") options.repetitions = Number(value);
    else if (flag === "--concurrency") options.concurrency = Number(value);
    else if (flag === "--only") options.only = value.split(",");
    else if (flag === "--broker") options.broker = value.split(",");
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

function selectCandidates(only) {
  if (!only) return CANDIDATES;
  return CANDIDATES.filter((candidate) => only.includes(candidate.name));
}

async function screenCandidates(loaded, workloads, options) {
  const usable = [];
  const excluded = [];
  for (const candidate of loaded) {
    const problem = await findProblem(candidate, workloads, options);
    if (problem) excluded.push({ name: candidate.name, reason: problem });
    else usable.push(candidate);
  }

  const interopWorkload = workloads.find((workload) => workload.name === INTEROP_WORKLOAD_NAME);
  const interopProblems = await findInteropProblems(usable, interopWorkload);
  for (const { producer, consumer, reason } of interopProblems) {
    console.log(`  note: ${consumer} cannot read frames of ${producer} (${reason})`);
  }
  return { usable, excluded };
}

async function findProblem(candidate, workloads, options) {
  const frameProblem = await safely(() => findKafkaFrameProblem(candidate.codec, workloads));
  if (frameProblem) return frameProblem;
  if (!options.broker) return undefined;
  const brokerProblem = await findBrokerProblem(candidate.codec, options.broker);
  return brokerProblem && `broker round trip failed: ${brokerProblem}`;
}

async function safely(check) {
  try {
    return await check();
  } catch (error) {
    return `threw ${String(error?.message ?? error).split("\n")[0]}`;
  }
}

async function measureCandidate(candidate, workload, options) {
  const { codec } = candidate;
  const frame = await codec.compress(workload.buffer);
  const sequentialSettings = {
    bytesPerOperation: workload.buffer.length,
    warmupMs: options.warmupMs,
    durationMs: options.durationMs,
  };
  const concurrentSettings = { ...sequentialSettings, concurrency: options.concurrency };

  const compress = () => codec.compress(workload.buffer);
  const decompress = () => codec.decompress(frame);
  const median = (measure) => medianRun(measure, options.repetitions);
  return {
    name: candidate.name,
    ratio: workload.buffer.length / frame.length,
    compress: await median(() => measureSequential(compress, sequentialSettings)),
    decompress: await median(() => measureSequential(decompress, sequentialSettings)),
    compressConcurrent: await median(() => measureConcurrent(compress, concurrentSettings)),
    decompressConcurrent: await median(() => measureConcurrent(decompress, concurrentSettings)),
  };
}

// One slow run (a garbage collection, another process) must not decide the
// result, so every measurement is repeated and the median run is reported.
async function medianRun(measure, repetitions) {
  const runs = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    runs.push(await measure());
  }
  runs.sort((first, second) => first.megabytesPerSecond - second.megabytesPerSecond);
  return runs[Math.floor(runs.length / 2)];
}

function printEnvironment(options) {
  console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(
    `Median of ${options.repetitions} runs of ${options.durationMs} ms after ${options.warmupMs} ms warm-up, ` +
      `${options.concurrency} operations in flight for the concurrent columns`
  );
  console.log(options.broker ? `Broker check: ${options.broker.join(",")}` : "Broker check: off (use --broker host:port)");
}

function printScreening(usable, rejected) {
  console.log(`\nMeasured: ${usable.map((candidate) => candidate.name).join(", ")}`);
  for (const { name, reason } of rejected) {
    console.log(`Excluded: ${name} - ${reason}`);
  }
}

function printWorkloadTable(workload, results, options) {
  console.log(`\n=== ${workload.name} (${workload.buffer.length.toLocaleString("en")} bytes) ===`);
  const concurrent = `x${options.concurrency}`;
  printTable(
    ["library", "ratio", "compress MB/s", "decompress MB/s", `compress ${concurrent}`, `decompress ${concurrent}`, "loop delay p99 ms"],
    [...results]
      .sort((first, second) => second.compress.megabytesPerSecond - first.compress.megabytesPerSecond)
      .map((result) => [
        result.name,
        `${result.ratio.toFixed(1)}x`,
        result.compress.megabytesPerSecond.toFixed(0),
        result.decompress.megabytesPerSecond.toFixed(0),
        result.compressConcurrent.megabytesPerSecond.toFixed(0),
        result.decompressConcurrent.megabytesPerSecond.toFixed(0),
        result.compressConcurrent.eventLoopDelayMs.toFixed(1),
      ])
  );
}

function printRanking(resultsByWorkload) {
  const names = resultsByWorkload[0].results.map((result) => result.name);
  const rows = names.map((name) => {
    const resultsOfLibrary = resultsByWorkload.map(({ results }) => results.find((result) => result.name === name));
    const compress = geometricMean(resultsOfLibrary.map((result) => result.compress.megabytesPerSecond));
    const decompress = geometricMean(resultsOfLibrary.map((result) => result.decompress.megabytesPerSecond));
    return { name, compress, decompress, combined: Math.sqrt(compress * decompress) };
  });

  console.log("\n=== ranking (geometric mean over all workloads, sequential) ===");
  printTable(
    ["#", "library", "compress MB/s", "decompress MB/s", "combined"],
    rows
      .sort((first, second) => second.combined - first.combined)
      .map((row, position) => [position + 1, row.name, row.compress.toFixed(0), row.decompress.toFixed(0), row.combined.toFixed(0)]),
    { textColumns: [1] }
  );
}

function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function printTable(header, rows, { textColumns = [0] } = {}) {
  const table = [header, ...rows].map((row) => row.map(String));
  const widths = header.map((_, column) => Math.max(...table.map((row) => row[column].length)));
  const alignCell = (cell, column) =>
    textColumns.includes(column) ? cell.padEnd(widths[column]) : cell.padStart(widths[column]);
  const format = (row) => row.map(alignCell).join("  ");
  console.log(format(table[0]));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  table.slice(1).forEach((row) => console.log(format(row)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
