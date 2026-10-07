import { describe, expect, it, vi } from "vitest";
import { CropController } from "../../src/renderer/controllers/crop-controller.js";
import type { WorkflowStep } from "../../src/renderer/app-state.js";
import { CropInteraction } from "../../src/renderer/crop/crop-interaction.js";

class CropElement extends EventTarget {
  id = "";
  value = "";
  disabled = false;
  dataset: Record<string, string> = {};
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void } = {
    setProperty: (name, value) => { this.style[name] = value; },
  };
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, active: boolean) => active ? this.classes.add(name) : this.classes.delete(name),
  };
  width = 800;
  height = 600;
  capture: number | null = null;
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  setPointerCapture(id: number) { this.capture = id; }
  hasPointerCapture(id: number) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}

function createController() {
  const stage = new CropElement();
  const frame = new CropElement();
  const wrap = new CropElement();
  const ids = new Map<string, CropElement>([["cropFrame", frame]]);
  for (const id of ["ratioInputA", "ratioInputB", "ratioCustom", "ratioFree", "ratio169", "ratio43", "ratioSwap", "cropOverlay", "cropMaskTop", "cropMaskLeft", "cropMaskRight", "cropMaskBottom"]) {
    const element = new CropElement();
    element.id = id;
    ids.set(id, element);
  }
  const root = {
    getElementById: (id: string) => ids.get(id) ?? null,
    querySelector: (selector: string) => selector === ".map-stage" ? stage : selector === ".map-wrap" ? wrap : null,
  } as unknown as Document;
  let step: WorkflowStep = "0";
  const view = { scale: 1, tx: 0, ty: 0 };
  const onProjectChanged = vi.fn();
  const controller = new CropController({ root, view, getActiveStep: () => step,
    resizeCanvasToStage: () => {
      const scaleFit = Math.min(stage.width / 1200, stage.height / 800);
      return { width: stage.width, height: stage.height, scaleFit, offsetX: (stage.width - 1200 * scaleFit) / 2, offsetY: (stage.height - 800 * scaleFit) / 2 };
    },
    applyViewTransform: vi.fn(), updateWrapTransforms: vi.fn(), requestBasemapDraw: vi.fn(), onWheel: vi.fn(),
    mapWidth: 1200, mapHeight: 800, minScale: 0.4, maxScale: 12, maxCropScale: 50, onProjectChanged,
  });
  controller.bind();
  const transition = (next: WorkflowStep) => {
    const previous = step;
    controller.beforeStepChange(previous, next);
    step = next;
    controller.afterStepChange(previous, next);
  };
  const pointer = (type: string, x: number, y: number, pointerId = 1, button = 0) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId, button });
    frame.dispatchEvent(event);
  };
  return { controller, view, stage, frame, ids, onProjectChanged, transition, pointer };
}

describe("CropController workflow and frame ownership", () => {
  it.each([
    { x: 960, y: 90, width: 140, height: 200 },
    { x: 1160, y: 240, width: 100, height: 180 },
    { x: 70, y: 70, width: 300, height: 50 },
  ])("keeps off-center extent $x/$y complete during repeated panel resizing", (bbox) => {
    const f = createController();
    f.controller.setBBox(bbox);
    f.transition("3");
    const canvas = structuredClone(f.controller.projectCanvas);
    f.onProjectChanged.mockClear();
    for (const width of [600, 852, 600, 852, 400, 1000, 600]) {
      f.stage.width = width;
      f.view.tx += 123;
      f.view.ty -= 87;
      f.controller.zoomToBounds();
      f.controller.updateFrame();
      const rect = f.controller.currentExportRect()!;
      expect(rect.left + rect.width / 2).toBeCloseTo(width / 2);
      expect(rect.top + rect.height / 2).toBeCloseTo(f.stage.height / 2);
      expect(rect.width / rect.height).toBeCloseTo(bbox.width / bbox.height);
      expect(rect.width).toBeLessThanOrEqual(width + 0.001);
      expect(rect.height).toBeLessThanOrEqual(f.stage.height + 0.001);
      expect(Math.max(rect.width / width, rect.height / f.stage.height)).toBeCloseTo(1);
      expect(f.controller.bbox).toEqual(bbox);
      expect(f.controller.projectCanvas).toEqual(canvas);
    }
    expect(f.onProjectChanged).not.toHaveBeenCalled();
  });
  it("inherits the relocated Step 0 view without discarding the last frame or ratio", () => {
    const f = createController();
    f.transition("1");
    f.controller.applyRatio(16 / 9, "ratio169");
    const box = structuredClone(f.controller.box);
    const bbox = structuredClone(f.controller.bbox)!;
    const canvas = structuredClone(f.controller.projectCanvas);
    f.transition("0");
    f.view.tx += 180;
    f.transition("1");
    expect(f.controller.box).toEqual(box);
    expect(f.controller.projectCanvas).toEqual(canvas);
    expect(f.controller.projectUiState().activeRatioId).toBe("ratio169");
    expect(f.controller.bbox!.x).toBeCloseTo(bbox.x - 180);
  });

  it.each(["2", "3"] as const)("restores the editable frame and view after Step %s", (locked) => {
    const f = createController();
    f.transition("1");
    f.controller.applyRatio(4 / 3, "ratio43");
    f.pointer("pointerdown", 30, 30);
    f.pointer("pointermove", 40, 50);
    f.pointer("pointerup", 40, 50);
    const box = structuredClone(f.controller.box);
    const bbox = structuredClone(f.controller.bbox);
    const view = { ...f.view };
    f.transition(locked);
    f.view.scale *= 2;
    f.controller.updateFrame();
    f.transition("1");
    expect(f.controller.box).toEqual(box);
    expect(f.controller.bbox).toEqual(bbox);
    expect(f.view).toEqual(view);
  });

  it("does not mutate saved bounds or canvas while resizing locked steps", () => {
    const f = createController();
    f.transition("1");
    f.transition("2");
    const bbox = structuredClone(f.controller.bbox);
    const canvas = structuredClone(f.controller.projectCanvas);
    f.onProjectChanged.mockClear();
    f.stage.width = 640;
    f.stage.height = 480;
    f.controller.updateFrame();
    f.controller.updateBBox();
    f.transition("3");
    expect(f.controller.bbox).toEqual(bbox);
    expect(f.controller.projectCanvas).toEqual(canvas);
    expect(f.onProjectChanged).not.toHaveBeenCalled();
  });

  it("cannot restore a previous project's frame over newly loaded bounds", () => {
    const f = createController();
    f.transition("1");
    f.transition("3");
    f.controller.setBBox({ x: 100, y: 100, width: 200, height: 150 });
    const lockedView = { ...f.view };
    f.transition("1");
    expect(f.view).toEqual(lockedView);
    expect(f.controller.bbox!.x).toBeCloseTo(100);
    expect(f.controller.bbox!.y).toBeCloseTo(100);
    expect(f.controller.bbox!.width).toBeCloseTo(200);
    expect(f.controller.bbox!.height).toBeCloseTo(150);
  });

  it("only lets the captured primary pointer move or end a drag", () => {
    const f = createController();
    f.transition("1");
    f.controller.applyRatio(4 / 3, "ratio43");
    const original = structuredClone(f.controller.box);
    f.pointer("pointerdown", 30, 30, 1, 2);
    f.pointer("pointermove", 50, 50);
    expect(f.controller.box).toEqual(original);
    f.pointer("pointerdown", 30, 30);
    f.pointer("pointermove", 80, 80, 2);
    f.pointer("pointerup", 80, 80, 2);
    expect(f.controller.box).toEqual(original);
    expect(f.frame.capture).toBe(1);
    f.pointer("pointermove", 40, 40);
    expect(f.controller.box).not.toEqual(original);
    f.pointer("lostpointercapture", 40, 40);
    const stopped = structuredClone(f.controller.box);
    f.pointer("pointermove", 100, 100);
    expect(f.controller.box).toEqual(stopped);
  });

  it("finishes pointer capture when leaving Step 1", () => {
    const f = createController();
    f.transition("1");
    f.pointer("pointerdown", 30, 30);
    f.transition("2");
    expect(f.frame.capture).toBeNull();
    const bbox = structuredClone(f.controller.bbox);
    f.pointer("pointermove", 100, 100);
    expect(f.controller.bbox).toEqual(bbox);
  });

  it("reads custom ratios into model state and swaps width and height", () => {
    const f = createController();
    f.transition("1");
    f.ids.get("ratioInputA")!.value = "3";
    f.ids.get("ratioInputB")!.value = "2";
    f.ids.get("ratioCustom")!.dispatchEvent(new Event("click"));
    expect(f.controller.projectUiState()).toMatchObject({ cropRatio: 1.5, customRatioA: 3, customRatioB: 2 });
    f.ids.get("ratioSwap")!.dispatchEvent(new Event("click"));
    expect(f.controller.projectUiState()).toMatchObject({ cropRatio: 2 / 3, customRatioA: 2, customRatioB: 3 });
  });
});

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

describe("CropInteraction document session", () => {
  it("handles motion outside the frame and removes document listeners at the end", () => {
    const ownerDocument = new EventTarget();
    const frame = new CropElement();
    Object.assign(frame, { ownerDocument });
    const stage = new CropElement();
    let box = { left: 10, top: 10, width: 100, height: 80 };
    const updateBox = vi.fn((next: typeof box) => { box = next; });
    const interaction = new CropInteraction({
      frame: frame as unknown as HTMLDivElement,
      stage: stage as unknown as HTMLDivElement,
      getEditableBox: () => box, getRatio: () => ({ ratio: 1.25, ratioMode: "fixed" }),
      getStageSize: () => ({ width: 800, height: 600 }), updateBox, onWheel: vi.fn(),
    });
    interaction.bind();
    const pointer = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y });
      target.dispatchEvent(event);
    };
    pointer(frame, "pointerdown", 20, 20);
    pointer(ownerDocument, "pointermove", 500, 500);
    expect(box).toEqual({ left: 490, top: 490, width: 100, height: 80 });
    pointer(ownerDocument, "pointerup", 500, 500);
    expect(frame.capture).toBeNull();
    pointer(ownerDocument, "pointermove", 600, 600);
    expect(updateBox).toHaveBeenCalledTimes(1);
    pointer(frame, "pointerdown", 500, 500);
    pointer(ownerDocument, "pointercancel", 500, 500);
    pointer(ownerDocument, "pointermove", 600, 600);
    expect(updateBox).toHaveBeenCalledTimes(1);
  });
});
