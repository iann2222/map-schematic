import { describe, expect, it, vi } from "vitest";
import { FrameScheduler } from "../../src/renderer/overlay/frame-scheduler";

function setup() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 0;
  const render = vi.fn();
  const request = vi.fn((callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; });
  const cancel = vi.fn((id: number) => { callbacks.delete(id); });
  return { scheduler: new FrameScheduler(render, request, cancel), callbacks, render, request, cancel };
}

describe("overlay frame scheduling", () => {
  it("coalesces requests into one frame and can schedule again afterward", () => {
    const { scheduler, callbacks, render, request } = setup();
    scheduler.schedule(); scheduler.schedule(); scheduler.schedule();
    expect(request).toHaveBeenCalledTimes(1);
    const callback = callbacks.get(1)!;
    callbacks.delete(1); callback(16);
    expect(render).toHaveBeenCalledTimes(1);
    scheduler.schedule();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("flushes immediately and cancels queued work", () => {
    const { scheduler, callbacks, render, cancel } = setup();
    scheduler.schedule(); scheduler.flush();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(callbacks.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(1);
  });
  it("disposes without rendering and does not stay pending after a failed render", () => {
    const { scheduler, callbacks, render } = setup();
    scheduler.schedule(); scheduler.dispose();
    expect(render).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    render.mockImplementationOnce(() => { throw new Error("draw"); });
    scheduler.schedule();
    expect(() => callbacks.get(2)!(32)).toThrow("draw");
    scheduler.schedule();
    expect(callbacks.has(3)).toBe(true);
  });
});
