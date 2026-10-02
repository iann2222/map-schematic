import { describe, expect, it, vi } from "vitest";
import { CropController } from "../../src/renderer/controllers/crop-controller.js";

describe("CropController project notifications", () => {
  it("notifies only when persistent canvas, bounds or ratio settings change", () => {
    const onProjectChanged = vi.fn();
    const root = { getElementById: () => null, querySelector: () => null } as unknown as Document;
    const controller = new CropController({ root, view: { scale: 1, tx: 0, ty: 0 },
      getActiveStep: () => "1", resizeCanvasToStage: () => ({ width: 1200, height: 800, scaleFit: 1, offsetX: 0, offsetY: 0 }),
      applyViewTransform: vi.fn(), updateWrapTransforms: vi.fn(), requestBasemapDraw: vi.fn(), onWheel: vi.fn(),
      mapWidth: 1200, mapHeight: 800, minScale: 0.4, maxScale: 12, maxCropScale: 50, onProjectChanged });
    controller.setProjectCanvas({ ...controller.projectCanvas });
    expect(onProjectChanged).not.toHaveBeenCalled();
    controller.setProjectCanvas({ width: 1600, height: 800, unit: "px" });
    expect(onProjectChanged).toHaveBeenCalledTimes(1);
    controller.setBBox({ x: 10, y: 10, width: 100, height: 100 });
    controller.setBBox({ x: 10, y: 10, width: 100, height: 100 });
    expect(onProjectChanged).toHaveBeenCalledTimes(2);
    controller.applyRatio(1, "ratioSquare");
    controller.applyRatio(1, "ratioSquare");
    expect(onProjectChanged).toHaveBeenCalledTimes(3);
    controller.resetForLocationChange();
    expect(onProjectChanged).toHaveBeenCalledTimes(4);
  });
});
