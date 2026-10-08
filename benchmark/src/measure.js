import { performance, monitorEventLoopDelay } from "node:perf_hooks";

const BYTES_PER_MEGABYTE = 1_000_000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const SLOW_OPERATION_PERCENTILE = 99;

/**
 * Runs `operation` one after the other, the way a producer sends batch after
 * batch. Reports throughput relative to `bytesPerOperation`.
 */
export async function measureSequential(operation, { bytesPerOperation, warmupMs, durationMs }) {
  await runForDuration(operation, warmupMs);

  const latenciesMs = [];
  const startedAt = performance.now();
  while (performance.now() - startedAt < durationMs) {
    const operationStartedAt = performance.now();
    await operation();
    latenciesMs.push(performance.now() - operationStartedAt);
  }
  const elapsedMs = performance.now() - startedAt;

  latenciesMs.sort((first, second) => first - second);
  return {
    megabytesPerSecond: throughput(bytesPerOperation * latenciesMs.length, elapsedMs),
    medianLatencyMs: percentile(latenciesMs, 50),
    slowLatencyMs: percentile(latenciesMs, SLOW_OPERATION_PERCENTILE),
  };
}

/**
 * Keeps `concurrency` operations in flight, like an application that sends to
 * several partitions at once. Every worker yields to the event loop between
 * operations, as real network I/O would, so the delay of the event loop can be
 * observed. A library that computes on the main thread shows up there.
 */
export async function measureConcurrent(
  operation,
  { bytesPerOperation, concurrency, warmupMs, durationMs }
) {
  await runForDuration(operation, warmupMs);

  const eventLoopDelay = monitorEventLoopDelay({ resolution: 1 });
  eventLoopDelay.enable();
  let completedOperations = 0;
  const startedAt = performance.now();
  const worker = async () => {
    while (performance.now() - startedAt < durationMs) {
      await operation();
      completedOperations += 1;
      await yieldToEventLoop();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedMs = performance.now() - startedAt;
  eventLoopDelay.disable();

  return {
    megabytesPerSecond: throughput(bytesPerOperation * completedOperations, elapsedMs),
    eventLoopDelayMs: eventLoopDelay.percentile(SLOW_OPERATION_PERCENTILE) / NANOSECONDS_PER_MILLISECOND,
  };
}

async function runForDuration(operation, durationMs) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < durationMs) {
    await operation();
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function throughput(bytes, elapsedMs) {
  return bytes / BYTES_PER_MEGABYTE / (elapsedMs / 1000);
}

function percentile(sortedValues, percent) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor((percent / 100) * sortedValues.length));
  return sortedValues[index];
}
