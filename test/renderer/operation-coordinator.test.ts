import { describe, expect, it } from "vitest";

import { ProjectOperationCoordinator } from "../../src/renderer/project/operation-coordinator.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("ProjectOperationCoordinator", () => {
  it("runs project operations one at a time in request order", async () => {
    const coordinator = new ProjectOperationCoordinator();
    const firstGate = deferred<void>();
    const events: string[] = [];

    const first = coordinator.enqueue("save", async () => {
      events.push("save:start");
      await firstGate.promise;
      events.push("save:end");
      return "saved";
    });
    const second = coordinator.enqueue("load", async () => {
      events.push("load:start");
      events.push("load:end");
      return "loaded";
    });

    await Promise.resolve();
    expect(events).toEqual(["save:start"]);
    expect(coordinator.activeOperation).toBe("save");
    expect(coordinator.pendingOperationCount).toBe(2);

    firstGate.resolve();

    await expect(first).resolves.toBe("saved");
    await expect(second).resolves.toBe("loaded");
    expect(events).toEqual([
      "save:start",
      "save:end",
      "load:start",
      "load:end",
    ]);
    expect(coordinator.activeOperation).toBeNull();
    expect(coordinator.pendingOperationCount).toBe(0);
  });

  it("continues with the next operation after a failure", async () => {
    const coordinator = new ProjectOperationCoordinator();
    const failed = coordinator.enqueue("load", async () => {
      throw new Error("load failed");
    });
    const saved = coordinator.enqueue("saveAs", async () => "saved");

    await expect(failed).rejects.toThrow("load failed");
    await expect(saved).resolves.toBe("saved");
    expect(coordinator.activeOperation).toBeNull();
    expect(coordinator.pendingOperationCount).toBe(0);
  });
});
