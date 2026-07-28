import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BasemapRenderer,
  normalizeReliefEffect
} from "../../src/renderer/map/basemap-renderer.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeReliefEffect", () => {
  it("keeps current relief effect values", () => {
    expect(normalizeReliefEffect("relief-soft")).toBe("relief-soft");
    expect(normalizeReliefEffect("relief-natural")).toBe("relief-natural");
    expect(normalizeReliefEffect("relief-strong")).toBe("relief-strong");
  });

  it("migrates legacy blend mode values", () => {
    expect(normalizeReliefEffect("soft-light")).toBe("relief-soft");
    expect(normalizeReliefEffect("multiply")).toBe("relief-strong");
    expect(normalizeReliefEffect("unknown")).toBe("relief-natural");
  });
});

describe("BasemapRenderer loading", () => {
  it("defers hillshade loading until relief is enabled", async () => {
    const getBasemapLayers = vi.fn(async () => []);
    const getRelief = vi.fn(async () => null);
    vi.stubGlobal("window", {
      mapSchematic: { getBasemapLayers, getRelief },
      setTimeout
    });
    const renderer = new BasemapRenderer({
      canvas: null,
      mapStage: null,
      view: { scale: 1, tx: 0, ty: 0 },
      getActiveStep: () => "0",
      getWrapShift: () => 0,
      resizeCanvasToStage: () => ({
        width: 1200,
        height: 800,
        scaleFit: 1,
        offsetX: 0,
        offsetY: 0
      }),
      mapWidth: 1200,
      mapHeight: 800,
      styleButtons: [],
      reliefToggle: null,
      reliefModeField: null,
      reliefEffectButtons: [],
      preview: null,
      previewCanvas: null
    });

    await renderer.reload();
    expect(getBasemapLayers).toHaveBeenCalledOnce();
    expect(getRelief).not.toHaveBeenCalled();

    renderer.setReliefMode(true);
    await vi.waitFor(() => expect(getRelief).toHaveBeenCalledOnce());
  });
});
