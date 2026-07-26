import { describe, expect, it } from "vitest";

import {
  canvasAspectRatio,
  canvasPixelDimensions,
  fitCanvasToAspectRatio
} from "../../src/renderer/project/canvas.js";

describe("project canvas", () => {
  it("fits a new ratio while preserving the logical long edge", () => {
    expect(
      fitCanvasToAspectRatio({ width: 1200, height: 800, unit: "px" }, 16 / 9)
    ).toEqual({ width: 1200, height: 675, unit: "px" });
    expect(
      fitCanvasToAspectRatio({ width: 1200, height: 800, unit: "px" }, 9 / 16)
    ).toEqual({ width: 675, height: 1200, unit: "px" });
  });

  it("keeps millimeter dimensions precise to two decimal places", () => {
    const canvas = fitCanvasToAspectRatio(
      { width: 210, height: 297, unit: "mm" },
      16 / 9
    );

    expect(canvas).toEqual({ width: 297, height: 167.06, unit: "mm" });
    expect(canvasAspectRatio(canvas)).toBeCloseTo(16 / 9, 3);
  });

  it("converts millimeters at 96 DPI and applies export scaling", () => {
    const canvas = { width: 210, height: 297, unit: "mm" } as const;

    expect(canvasPixelDimensions(canvas)).toEqual({
      width: 794,
      height: 1123
    });
    expect(canvasPixelDimensions(canvas, 2)).toEqual({
      width: 1587,
      height: 2245
    });
  });

  it("ignores invalid ratios without mutating the source canvas", () => {
    const canvas = { width: 1200, height: 800, unit: "px" } as const;

    expect(fitCanvasToAspectRatio(canvas, 0)).toEqual(canvas);
    expect(fitCanvasToAspectRatio(canvas, Number.NaN)).toEqual(canvas);
  });
});
