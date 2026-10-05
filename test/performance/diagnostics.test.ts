import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("diagnostic activation", () => {
  it("does not expose a diagnostic API in ordinary launches", async () => {
    vi.resetModules();
    const window = { location: { search: "" } };
    vi.stubGlobal("window", window);
    const { rendererPerformance } = await import("../../src/renderer/performance/diagnostics");
    expect(rendererPerformance.enabled).toBe(false);
    expect("mapSchematicPerformance" in window).toBe(false);
  });

  it("enables a frozen metrics-only API for explicit performance=1", async () => {
    vi.resetModules();
    const window: Record<string, any> = { location: { search: "?performance=1" } };
    vi.stubGlobal("window", window);
    const { rendererPerformance } = await import("../../src/renderer/performance/diagnostics");
    expect(rendererPerformance.enabled).toBe(true);
    const api = window.mapSchematicPerformance;
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual(["recordFrame", "reset", "snapshot"]);
    api.recordFrame(16);
    expect(api.snapshot()["interaction.frameInterval"].count).toBe(1);
    api.reset();
    expect(api.snapshot()).toEqual({});
    expect(Object.getOwnPropertyDescriptor(window, "mapSchematicPerformance")?.writable).toBe(false);
  });

  it("supports test hosts without a browser location", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});
    const { rendererPerformance } = await import("../../src/renderer/performance/diagnostics");
    expect(rendererPerformance.enabled).toBe(false);
  });
});
