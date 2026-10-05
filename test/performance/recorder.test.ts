import { describe, expect, it, vi } from "vitest";
import { PerformanceRecorder } from "../../src/renderer/performance/recorder";

describe("PerformanceRecorder", () => {
  it("does not read the clock or collect data when disabled", async () => {
    const now = vi.fn(() => 0);
    const recorder = new PerformanceRecorder(false, now);
    expect(recorder.measure("sync", () => 42)).toBe(42);
    expect(await recorder.measureAsync("async", async () => 7)).toBe(7);
    recorder.start("span")();
    recorder.record("frame", 16);
    expect(now).not.toHaveBeenCalled();
    expect(recorder.snapshot()).toEqual({});
  });

  it("preserves results and failures while recording timings", async () => {
    let time = 0;
    const recorder = new PerformanceRecorder(true, () => time);
    expect(recorder.measure("sync", () => { time += 3; return 42; })).toBe(42);
    const error = new Error("failure");
    expect(() => recorder.measure("sync", () => { time += 5; throw error; })).toThrow(error);
    await expect(recorder.measureAsync("async", async () => { time += 9; throw error; })).rejects.toBe(error);
    expect(recorder.snapshot().sync).toMatchObject({ count: 2, failures: 1, totalMs: 8, minMs: 3, maxMs: 5 });
    expect(recorder.snapshot().async.failures).toBe(1);
  });

  it("bounds percentile samples without losing cumulative totals", () => {
    const recorder = new PerformanceRecorder(true, () => 0, 4);
    for (let n = 1; n <= 10; n++) recorder.record("frame", n);
    expect(recorder.snapshot().frame).toEqual({
      count: 10, failures: 0, totalMs: 55, minMs: 1, maxMs: 10,
      sampleCount: 4, p50Ms: 8, p95Ms: 10,
    });
    recorder.record("frame", NaN);
    recorder.record("frame", -1);
    expect(recorder.snapshot().frame.count).toBe(10);
  });

  it("ends spans once and discards spans crossing a reset", () => {
    let time = 0;
    const recorder = new PerformanceRecorder(true, () => time);
    const end = recorder.start("span");
    time = 2;
    end(); end();
    expect(recorder.snapshot().span.count).toBe(1);
    const stale = recorder.start("stale");
    recorder.reset(); stale();
    expect(recorder.snapshot()).toEqual({});
  });

  it("returns independent snapshots and rejects invalid sample limits", () => {
    const recorder = new PerformanceRecorder(true);
    recorder.record("a", 1);
    recorder.snapshot().a.count = 99;
    expect(recorder.snapshot().a.count).toBe(1);
    expect(() => new PerformanceRecorder(true, undefined, 0)).toThrow(RangeError);
  });
});
