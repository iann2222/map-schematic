import { describe, expect, it } from "vitest";
import { CropModel } from "../../src/renderer/crop/crop-model.js";
import { boundsToScreenBox, screenBoxToBounds, fitViewToCrop, clipScreenBox } from "../../src/renderer/crop/geometry.js";

const layout = { width: 800, height: 600, scaleFit: 0.5, offsetX: 20, offsetY: 30 };
const view = { scale: 2, tx: -200, ty: 60 };

describe("crop coordinate contracts", () => {
  it("round trips screen rectangles with map zoom, pan and stage offsets", () => {
    const box = { left: 50, top: 90, width: 320, height: 240 };
    const bounds = screenBoxToBounds(box, layout, view);
    expect(bounds).toEqual({ x: 130, y: 30, width: 320, height: 240 });
    expect(boundsToScreenBox(bounds, layout, view)).toEqual(box);
  });

  it("retains unwrapped world coordinates rather than clipping longitudes", () => {
    const bounds = { x: 2500, y: 80, width: 150, height: 100 };
    const box = boundsToScreenBox(bounds, layout, view);
    expect(screenBoxToBounds(box, layout, view)).toEqual(bounds);
  });

  it("centers a saved crop at the capped view scale", () => {
    const bbox = { x: 50, y: 30, width: 100, height: 80 };
    const fitted = fitViewToCrop(bbox, layout, layout, 0.4, 2);
    expect(fitted.scale).toBe(2);
    const rect = boundsToScreenBox(bbox, layout, fitted);
    expect(rect.left + rect.width / 2).toBe(400);
    expect(rect.top + rect.height / 2).toBe(300);
  });

  it("clips masks and export to the same screen intersection", () => {
    expect(clipScreenBox({ left: -10, top: 580, width: 50, height: 80 }, layout))
      .toEqual({ left: 0, top: 580, width: 40, height: 20 });
    expect(clipScreenBox({ left: 900, top: 700, width: 50, height: 80 }, layout))
      .toEqual({ left: 800, top: 600, width: 0, height: 0 });
  });
});

describe("crop data and screen state", () => {
  it("does not persist frame resizing until explicitly committed", () => {
    const model = new CropModel(1.5);
    model.prepareFrame(layout);
    model.commitFrame(layout, view);
    const fingerprint = model.fingerprint();
    model.prepareFrame({ width: 400, height: 300 });
    expect(model.fingerprint()).toBe(fingerprint);
    model.commitFrame(layout, view);
    expect(model.fingerprint()).not.toBe(fingerprint);
  });

  it("keeps size, ratio and canvas when Step 0 changes location", () => {
    const model = new CropModel(1.5);
    model.applyRatio(16 / 9, "ratio169");
    model.prepareFrame(layout);
    model.commitFrame(layout, view);
    const frame = structuredClone(model.frame);
    const canvas = structuredClone(model.data.projectCanvas);
    model.captureRange(view);
    model.resetForLocationChange();
    expect(model.data.bbox).toBeNull();
    expect(model.restoreRange()).toBeNull();
    expect(model.frame).toEqual(frame);
    expect(model.data.projectCanvas).toEqual(canvas);
    expect(model.projectUiState()).toMatchObject({ cropRatio: 16 / 9, activeRatioId: "ratio169" });
    model.commitFrame(layout, { ...view, tx: view.tx + 100 });
    expect(model.data.bbox).not.toBeNull();
  });

  it("captures range state by value and restores a fresh copy", () => {
    const model = new CropModel(1.5);
    model.prepareFrame(layout);
    model.commitFrame(layout, view);
    const frame = structuredClone(model.frame);
    const bbox = structuredClone(model.data.bbox);
    const mutableView = { ...view };
    model.captureRange(mutableView);
    mutableView.tx = 999;
    model.frame.box!.left = 999;
    model.data.bbox!.x = 999;
    expect(model.restoreRange()).toEqual(view);
    expect(model.frame).toEqual(frame);
    expect(model.data.bbox).toEqual(bbox);
    model.frame.box!.left = 222;
    model.restoreRange();
    expect(model.frame).toEqual(frame);
  });

  it("drops old range snapshots when a different project sets its bounds", () => {
    const model = new CropModel(1.5);
    model.prepareFrame(layout);
    model.captureRange(view);
    model.setBounds({ x: 5, y: 10, width: 20, height: 30 });
    expect(model.restoreRange()).toBeNull();
    expect(model.frame).toEqual({ box: null, stageSize: null });
  });

  it("keeps incomplete custom ratio editing from applying invalid geometry", () => {
    const model = new CropModel(1.5);
    model.applyRatio(2, "ratioCustom");
    expect(model.setCustomRatio(10, NaN)).toBe(false);
    expect(model.data.ratio).toBe(2);
    expect(model.projectUiState().customRatioB).toBeUndefined();
    expect(model.applyRatio(Infinity)).toBe(false);
    expect(model.applyRatio(0)).toBe(false);
    expect(model.setCustomRatio(3, 2)).toBe(true);
    expect(model.data.ratio).toBe(1.5);
  });

  it("updates free-ratio canvas dimensions only from committed frame edits", () => {
    const model = new CropModel(1.5);
    model.data.ratioMode = "free";
    model.frame.box = { left: 0, top: 0, width: 300, height: 100 };
    model.commitFrame(layout, view);
    expect(model.data.ratio).toBe(3);
    expect(model.data.projectCanvas.width / model.data.projectCanvas.height).toBe(3);
  });
});
