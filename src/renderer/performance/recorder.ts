export type MetricSummary = {
  count: number;
  failures: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
};

type Metric = { count: number; failures: number; total: number; min: number; max: number; samples: number[]; cursor: number };
const NOOP = () => {};

/** Totals cover the entire session; percentiles use the latest bounded samples. */
export class PerformanceRecorder {
  private readonly metrics = new Map<string, Metric>();
  private generation = 0;

  constructor(
    readonly enabled: boolean,
    private readonly now: () => number = () => performance.now(),
    private readonly sampleLimit = 256,
  ) {
    if (!Number.isInteger(sampleLimit) || sampleLimit < 1) {
      throw new RangeError("sampleLimit must be a positive integer");
    }
  }

  start(name: string): (failed?: boolean) => void {
    if (!this.enabled) return NOOP;
    const start = this.now();
    const generation = this.generation;
    let ended = false;
    return (failed = false) => {
      if (ended || generation !== this.generation) return;
      ended = true;
      this.record(name, this.now() - start, failed);
    };
  }

  measure<T>(name: string, operation: () => T): T {
    if (!this.enabled) return operation();
    const end = this.start(name);
    try {
      const result = operation();
      end();
      return result;
    } catch (error) {
      end(true);
      throw error;
    }
  }

  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled) return operation();
    const end = this.start(name);
    try {
      const result = await operation();
      end();
      return result;
    } catch (error) {
      end(true);
      throw error;
    }
  }

  record(name: string, durationMs: number, failed = false): void {
    if (!this.enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
    const metric = this.metrics.get(name) ?? {
      count: 0, failures: 0, total: 0, min: Infinity, max: 0, samples: [], cursor: 0,
    };
    metric.count += 1;
    metric.failures += Number(failed);
    metric.total += durationMs;
    metric.min = Math.min(metric.min, durationMs);
    metric.max = Math.max(metric.max, durationMs);
    metric.samples[metric.cursor] = durationMs;
    metric.cursor = (metric.cursor + 1) % this.sampleLimit;
    this.metrics.set(name, metric);
  }

  reset(): void {
    this.generation += 1;
    this.metrics.clear();
  }

  snapshot(): Record<string, MetricSummary> {
    return Object.fromEntries([...this.metrics].map(([name, metric]) => {
      const samples = [...metric.samples].sort((a, b) => a - b);
      const percentile = (fraction: number) => samples[Math.ceil(samples.length * fraction) - 1];
      return [name, {
        count: metric.count, failures: metric.failures, totalMs: metric.total,
        minMs: metric.min, maxMs: metric.max, sampleCount: samples.length,
        p50Ms: percentile(0.5), p95Ms: percentile(0.95),
      }];
    }));
  }
}
