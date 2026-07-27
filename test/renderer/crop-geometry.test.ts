import { describe, expect, it } from "vitest";

import {
  centeredCropBox,
  clampCropBox,
  cropHandleCursor,
  resizeCropBox,
} from "../../src/renderer/controllers/crop-geometry.js";

describe("crop geometry", () => {
  it("centers a fixed-ratio crop box inside the stage", () => {
    expect(centeredCropBox(1000, 600, 2)).toEqual({
      left: 12,
      top: 62,
      width: 976,
      height: 476,
    });
  });

  it("keeps an oversized crop box within the stage", () => {
    expect(
      clampCropBox(
        { left: -50, top: 800, width: 1200, height: 900 },
        1000,
        600,
      ),
    ).toEqual({
      left: 0,
      top: 0,
      width: 1000,
      height: 600,
    });
  });

  it("resizes a fixed-ratio box from its northwest handle", () => {
    expect(
      resizeCropBox({
        start: { left: 100, top: 100, width: 400, height: 200 },
        handle: "nw",
        deltaX: 50,
        deltaY: 10,
        ratioMode: "fixed",
        ratio: 2,
      }),
    ).toEqual({
      left: 150,
      top: 125,
      width: 350,
      height: 175,
    });
  });

  it("maps resize handles to platform cursor names", () => {
    expect(cropHandleCursor("nw")).toBe("nwse-resize");
    expect(cropHandleCursor("e")).toBe("ew-resize");
    expect(cropHandleCursor("move")).toBe("move");
  });
});
