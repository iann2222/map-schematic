import { describe, expect, it, vi } from "vitest";

import { MapInitializationController } from "../../src/renderer/controllers/map-initialization-controller.js";

function createController(events: string[]) {
  return new MapInitializationController({
    reloadAssets: async () => {
      events.push("assets");
    },
    prepareFirstReadyState: () => {
      events.push("prepare");
    },
    renderWorkspace: () => {
      events.push("render");
    },
    syncViewport: () => {
      events.push("viewport");
    },
    bindInteractions: () => {
      events.push("interactions");
    },
    commitFirstReadyState: () => {
      events.push("commit");
    },
  });
}

describe("MapInitializationController", () => {
  it("uses the same refresh sequence without resetting first-ready state", async () => {
    const events: string[] = [];
    const controller = createController(events);

    await controller.initialize();
    expect(controller.initialized).toBe(true);
    expect(events).toEqual([
      "assets",
      "prepare",
      "render",
      "viewport",
      "interactions",
      "commit",
    ]);

    await controller.initialize();
    expect(events).toEqual([
      "assets",
      "prepare",
      "render",
      "viewport",
      "interactions",
      "commit",
      "assets",
      "render",
      "viewport",
      "interactions",
    ]);
  });

  it("performs full first-ready setup when initialization succeeds after a failure", async () => {
    const events: string[] = [];
    let shouldFail = true;
    const controller = new MapInitializationController({
      reloadAssets: async () => {
        events.push("assets");
        if (shouldFail) {
          throw new Error("assets unavailable");
        }
      },
      prepareFirstReadyState: () => events.push("prepare"),
      renderWorkspace: () => events.push("render"),
      syncViewport: () => events.push("viewport"),
      bindInteractions: () => events.push("interactions"),
      commitFirstReadyState: () => events.push("commit"),
    });

    await expect(controller.initialize()).rejects.toThrow("assets unavailable");
    expect(controller.initialized).toBe(false);
    expect(events).toEqual(["assets"]);

    shouldFail = false;
    await controller.initialize();
    expect(controller.initialized).toBe(true);
    expect(events).toEqual([
      "assets",
      "assets",
      "prepare",
      "render",
      "viewport",
      "interactions",
      "commit",
    ]);
  });

  it("coalesces simultaneous initialization requests", async () => {
    let releaseAssets = (): void => undefined;
    const assetsReady = new Promise<void>((resolve) => {
      releaseAssets = resolve;
    });
    const reloadAssets = vi.fn(async () => {
      await assetsReady;
    });
    const renderWorkspace = vi.fn();
    const controller = new MapInitializationController({
      reloadAssets,
      prepareFirstReadyState: vi.fn(),
      renderWorkspace,
      syncViewport: vi.fn(),
      bindInteractions: vi.fn(),
      commitFirstReadyState: vi.fn(),
    });

    const first = controller.initialize();
    const second = controller.initialize();

    expect(second).toBe(first);
    expect(reloadAssets).toHaveBeenCalledOnce();
    releaseAssets();
    await Promise.all([first, second]);
    expect(renderWorkspace).toHaveBeenCalledOnce();
  });
});
