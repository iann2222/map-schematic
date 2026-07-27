import type { MapProject } from "../bridge.js";
import type { WorkflowStep } from "../app-state.js";
import {
  DEFAULT_PROJECT_CANVAS,
  fitCanvasToAspectRatio,
} from "../project/canvas.js";
import { ensureMapRoot } from "../map/rendering-utils.js";
import { bindFirstClickSelect } from "../ui/input-selection.js";
import {
  centeredCropBox,
  clampCropBox,
  cropHandleCursor,
  resizeCropBox,
} from "./crop-geometry.js";

export type ViewTransform = {
  scale: number;
  tx: number;
  ty: number;
};

export type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CropBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StageLayout = {
  width: number;
  height: number;
  scaleFit: number;
  offsetX: number;
  offsetY: number;
};

type CropDrag = {
  mode: "move" | "resize";
  handle?: string;
  startX: number;
  startY: number;
  startBox: CropBox;
};

type CropSnapshot = {
  box: CropBox | null;
  bbox: CropBBox | null;
  view: ViewTransform;
  stageRect: { width: number; height: number } | null;
};

export type CropControllerState = {
  ratio: number;
  projectCanvas: MapProject["canvas"];
  ratioMode: "free" | "fixed";
  activeRatioId?: string;
  bbox: CropBBox | null;
  box: CropBox | null;
};

export type CropControllerOptions = {
  view: ViewTransform;
  getActiveStep: () => WorkflowStep;
  resizeCanvasToStage: () => StageLayout;
  applyViewTransform: () => void;
  updateWrapTransforms: (forceRender?: boolean) => void;
  requestBasemapDraw: () => void;
  onWheel: (event: WheelEvent) => void;
  mapWidth: number;
  mapHeight: number;
  minScale: number;
  maxScale: number;
  maxCropScale: number;
  root?: Document;
};

type CropElements = {
  mapWrap: HTMLDivElement | null;
  mapStage: HTMLDivElement | null;
  mapSvg: SVGSVGElement | null;
  cropFrame: HTMLDivElement | null;
  cropOverlay: HTMLDivElement | null;
  cropMaskTop: HTMLDivElement | null;
  cropMaskLeft: HTMLDivElement | null;
  cropMaskRight: HTMLDivElement | null;
  cropMaskBottom: HTMLDivElement | null;
  ratioSwap: HTMLButtonElement | null;
  ratioInputA: HTMLInputElement | null;
  ratioInputB: HTMLInputElement | null;
  ratioButtons: HTMLButtonElement[];
};

function element<T extends Element>(
  root: Document,
  id: string,
): T | null {
  return root.getElementById(id) as T | null;
}

function collectElements(root: Document): CropElements {
  const ratioIds = [
    "ratioFree",
    "ratioOriginal",
    "ratioSquare",
    "ratio34",
    "ratio43",
    "ratio169",
    "ratio916",
    "ratioA4",
    "ratioCustom",
  ];
  return {
    mapWrap: root.querySelector(".map-wrap"),
    mapStage: root.querySelector(".map-stage"),
    mapSvg: element(root, "map"),
    cropFrame: element(root, "cropFrame"),
    cropOverlay: element(root, "cropOverlay"),
    cropMaskTop: element(root, "cropMaskTop"),
    cropMaskLeft: element(root, "cropMaskLeft"),
    cropMaskRight: element(root, "cropMaskRight"),
    cropMaskBottom: element(root, "cropMaskBottom"),
    ratioSwap: element(root, "ratioSwap"),
    ratioInputA: element(root, "ratioInputA"),
    ratioInputB: element(root, "ratioInputB"),
    ratioButtons: ratioIds
      .map((id) => element<HTMLButtonElement>(root, id))
      .filter((button): button is HTMLButtonElement => button !== null),
  };
}

export class CropController {
  readonly state: CropControllerState;
  private readonly options: CropControllerOptions;
  private readonly elements: CropElements;
  private readonly originalRatio: number;
  private drag: CropDrag | null = null;
  private snapshot: CropSnapshot | null = null;
  private lastStageRect: { width: number; height: number } | null = null;

  constructor(options: CropControllerOptions) {
    this.options = options;
    this.elements = collectElements(options.root ?? document);
    this.originalRatio = options.mapWidth / options.mapHeight;
    this.state = {
      ratio: this.originalRatio,
      projectCanvas: { ...DEFAULT_PROJECT_CANVAS },
      ratioMode: "fixed",
      activeRatioId: undefined,
      bbox: null,
      box: null,
    };
  }

  bind(): void {
    this.bindRatioControls();
    this.bindCropInteractions();
  }

  get projectCanvas(): MapProject["canvas"] {
    return this.state.projectCanvas;
  }

  get bbox(): CropBBox | null {
    return this.state.bbox;
  }

  get box(): CropBox | null {
    return this.state.box;
  }

  setProjectCanvas(canvas: MapProject["canvas"]): void {
    this.state.projectCanvas = { ...canvas };
  }

  setBBox(bbox: CropBBox | null): void {
    this.state.bbox = bbox ? { ...bbox } : null;
    this.state.box = null;
  }

  resetBox(): void {
    this.state.box = null;
  }

  resetForLocationChange(): void {
    this.state.bbox = null;
    this.snapshot = null;
  }

  saveSnapshot(): void {
    const stage = this.elements.mapStage;
    if (!stage) {
      return;
    }
    if (this.state.box) {
      this.updateBBox();
    }
    const rect = stage.getBoundingClientRect();
    this.snapshot = {
      box: this.state.box ? { ...this.state.box } : null,
      bbox: this.state.bbox ? { ...this.state.bbox } : null,
      view: { ...this.options.view },
      stageRect: { width: rect.width, height: rect.height },
    };
  }

  restoreSnapshot(): boolean {
    if (!this.snapshot) {
      return false;
    }
    this.state.box = this.snapshot.box ? { ...this.snapshot.box } : null;
    this.state.bbox = this.snapshot.bbox ? { ...this.snapshot.bbox } : null;
    Object.assign(this.options.view, this.snapshot.view);
    this.lastStageRect = this.snapshot.stageRect
      ? { ...this.snapshot.stageRect }
      : null;
    this.options.applyViewTransform();
    this.options.updateWrapTransforms(true);
    return true;
  }

  hasSnapshot(): boolean {
    return this.snapshot !== null;
  }

  updateStepPresentation(step: WorkflowStep): void {
    const { cropFrame, mapWrap } = this.elements;
    cropFrame?.classList.toggle("hidden", step !== "1");
    cropFrame?.classList.toggle("interactive", step === "1");
    cropFrame?.classList.toggle(
      "fixed",
      step === "1" && this.state.ratioMode === "fixed",
    );
    mapWrap?.classList.toggle("step-range", step === "1");
    mapWrap?.classList.toggle("step-locked", step === "2" || step === "3");
    if (step === "1") {
      this.updateFrame();
      if (!this.state.activeRatioId) {
        this.setActiveRatio("ratioOriginal");
      }
    }
  }

  prepareLockedStep(previousStep: WorkflowStep, step: WorkflowStep): void {
    if (step !== "2" && step !== "3") {
      return;
    }
    if (!this.state.box && !this.state.bbox) {
      this.updateFrame();
    } else if (!this.state.bbox) {
      this.updateBBox();
    }
    if (previousStep !== step) {
      this.zoomToBounds();
    }
  }

  applyRatio(ratio: number, targetId?: string): void {
    this.state.ratioMode = "fixed";
    this.state.ratio = ratio;
    this.state.projectCanvas = fitCanvasToAspectRatio(
      this.state.projectCanvas,
      ratio,
    );
    this.state.box = null;
    this.setActiveRatio(targetId);
    this.updateFrame();
  }

  updateFrame(): void {
    const { cropFrame, mapStage } = this.elements;
    if (!cropFrame || !mapStage) {
      return;
    }
    cropFrame.classList.toggle(
      "fixed",
      this.state.ratioMode === "fixed",
    );
    const rect = mapStage.getBoundingClientRect();
    if (this.lastStageRect && this.state.box) {
      const scaleX = rect.width / Math.max(1, this.lastStageRect.width);
      const scaleY = rect.height / Math.max(1, this.lastStageRect.height);
      this.state.box = {
        left: this.state.box.left * scaleX,
        top: this.state.box.top * scaleY,
        width: this.state.box.width * scaleX,
        height: this.state.box.height * scaleY,
      };
      this.clampBox(this.state.box);
    }
    this.lastStageRect = rect;
    const stageWidth = Math.max(1, mapStage.clientWidth);
    const stageHeight = Math.max(1, mapStage.clientHeight);
    if (!this.state.box) {
      this.state.box =
        this.state.ratioMode === "free"
          ? { left: 0, top: 0, width: stageWidth, height: stageHeight }
          : this.createCenteredBox(stageWidth, stageHeight);
    }
    this.clampBox(this.state.box);
    cropFrame.style.left = `${this.state.box.left}px`;
    cropFrame.style.top = `${this.state.box.top}px`;
    cropFrame.style.width = `${this.state.box.width}px`;
    cropFrame.style.height = `${this.state.box.height}px`;
    const minDim = Math.max(
      36,
      Math.min(this.state.box.width, this.state.box.height),
    );
    const stroke = Math.max(0.9, Math.min(1.35, minDim / 260));
    const handleSize = Math.max(6, Math.min(8, minDim / 70));
    cropFrame.style.setProperty("--crop-stroke", `${stroke.toFixed(2)}px`);
    cropFrame.style.setProperty(
      "--crop-handle-size",
      `${handleSize.toFixed(2)}px`,
    );
    this.updateBBox();
    this.options.requestBasemapDraw();
    this.applyMapClip();
    this.updateOverlay();
  }

  updateBBox(): void {
    const box = this.state.box;
    if (!box || !this.elements.mapStage) {
      this.state.bbox = null;
      return;
    }
    const { scaleFit, offsetX, offsetY } =
      this.options.resizeCanvasToStage();
    const view = this.options.view;
    this.state.bbox = {
      x: ((box.left - offsetX) / scaleFit - view.tx) / view.scale,
      y: ((box.top - offsetY) / scaleFit - view.ty) / view.scale,
      width: box.width / scaleFit / view.scale,
      height: box.height / scaleFit / view.scale,
    };
    if (this.state.ratioMode === "free" && box.height > 0) {
      this.state.ratio = box.width / box.height;
      this.state.projectCanvas = fitCanvasToAspectRatio(
        this.state.projectCanvas,
        this.state.ratio,
      );
    }
  }

  zoomToBounds(): void {
    const bbox = this.state.bbox;
    const stage = this.elements.mapStage;
    if (!bbox || !stage || bbox.width <= 0 || bbox.height <= 0) {
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const stageWidth = Math.max(1, stageRect.width);
    const stageHeight = Math.max(1, stageRect.height);
    const { scaleFit, offsetX, offsetY } =
      this.options.resizeCanvasToStage();
    const view = this.options.view;
    const nextScale = Math.min(
      stageWidth / (bbox.width * scaleFit),
      stageHeight / (bbox.height * scaleFit),
    );
    const step = this.options.getActiveStep();
    const scaleCap =
      step === "2" || step === "3"
        ? this.options.maxCropScale
        : this.options.maxScale;
    view.scale = Math.max(
      this.options.minScale,
      Math.min(scaleCap, nextScale),
    );
    const cropWidth = bbox.width * view.scale * scaleFit;
    const cropHeight = bbox.height * view.scale * scaleFit;
    const desiredLeft = (stageWidth - cropWidth) / 2;
    const desiredTop = (stageHeight - cropHeight) / 2;
    view.tx = (desiredLeft - offsetX) / scaleFit - bbox.x * view.scale;
    view.ty = (desiredTop - offsetY) / scaleFit - bbox.y * view.scale;
    this.options.applyViewTransform();
    this.options.updateWrapTransforms(true);
  }

  applyMapClip(): void {
    const { mapSvg, mapStage } = this.elements;
    if (!mapSvg || !mapStage) {
      return;
    }
    const defsId = "map-clip";
    let defs = mapSvg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      mapSvg.appendChild(defs);
    }
    let clip = defs.querySelector(`#${defsId}`) as SVGClipPathElement | null;
    if (!clip) {
      clip = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "clipPath",
      );
      clip.setAttribute("id", defsId);
      defs.appendChild(clip);
    }
    clip.replaceChildren();
    const rect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    const stageRect = mapStage.getBoundingClientRect();
    const width = mapSvg.viewBox.baseVal.width || this.options.mapWidth;
    const height = mapSvg.viewBox.baseVal.height || this.options.mapHeight;
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", width.toFixed(2));
    rect.setAttribute("height", height.toFixed(2));
    clip.appendChild(rect);
    ensureMapRoot(mapSvg).setAttribute("clip-path", `url(#${defsId})`);
  }

  updateOverlay(): void {
    const {
      mapStage,
      cropOverlay,
      cropMaskTop,
      cropMaskLeft,
      cropMaskRight,
      cropMaskBottom,
    } = this.elements;
    if (!mapStage || !cropOverlay) {
      return;
    }
    const step = this.options.getActiveStep();
    if (
      (step !== "2" && step !== "3") ||
      (!this.state.box && !this.state.bbox)
    ) {
      cropOverlay.classList.add("hidden");
      return;
    }
    const stageRect = mapStage.getBoundingClientRect();
    const stageWidth = Math.max(1, stageRect.width);
    const stageHeight = Math.max(1, stageRect.height);
    const rect = this.currentScreenRect();
    if (
      !rect ||
      !cropMaskTop ||
      !cropMaskLeft ||
      !cropMaskRight ||
      !cropMaskBottom
    ) {
      return;
    }
    const left = Math.max(0, Math.min(rect.left, stageWidth));
    const top = Math.max(0, Math.min(rect.top, stageHeight));
    const right = Math.max(
      0,
      Math.min(rect.left + rect.width, stageWidth),
    );
    const bottom = Math.max(
      0,
      Math.min(rect.top + rect.height, stageHeight),
    );
    Object.assign(cropMaskTop.style, {
      left: "0px",
      top: "0px",
      width: `${stageWidth}px`,
      height: `${top}px`,
    });
    Object.assign(cropMaskLeft.style, {
      left: "0px",
      top: `${top}px`,
      width: `${left}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });
    Object.assign(cropMaskRight.style, {
      left: `${right}px`,
      top: `${top}px`,
      width: `${Math.max(0, stageWidth - right)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });
    Object.assign(cropMaskBottom.style, {
      left: "0px",
      top: `${bottom}px`,
      width: `${stageWidth}px`,
      height: `${Math.max(0, stageHeight - bottom)}px`,
    });
    cropOverlay.classList.remove("hidden");
  }

  currentExportRect(): CropBox | null {
    const stage = this.elements.mapStage;
    if (!stage) {
      return null;
    }
    const stageRect = stage.getBoundingClientRect();
    const screenRect = this.currentScreenRect();
    if (!screenRect) {
      return {
        left: 0,
        top: 0,
        width: Math.max(1, stageRect.width),
        height: Math.max(1, stageRect.height),
      };
    }
    const left = Math.max(0, Math.min(screenRect.left, stageRect.width));
    const top = Math.max(0, Math.min(screenRect.top, stageRect.height));
    const right = Math.max(
      0,
      Math.min(screenRect.left + screenRect.width, stageRect.width),
    );
    const bottom = Math.max(
      0,
      Math.min(screenRect.top + screenRect.height, stageRect.height),
    );
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  resolveFrameBox(): CropBox | undefined {
    const { cropFrame, mapStage } = this.elements;
    if (!cropFrame || !mapStage || cropFrame.classList.contains("hidden")) {
      return undefined;
    }
    const stageRect = mapStage.getBoundingClientRect();
    const cropRect = cropFrame.getBoundingClientRect();
    return {
      left: cropRect.left - stageRect.left,
      top: cropRect.top - stageRect.top,
      width: cropRect.width,
      height: cropRect.height,
    };
  }

  applyProjectUi(ui: MapProject["ui"]): void {
    if (ui?.ratioMode === "free" || ui?.ratioMode === "fixed") {
      this.state.ratioMode = ui.ratioMode;
    }
    if (typeof ui?.cropRatio === "number" && ui.cropRatio > 0) {
      this.state.ratio = ui.cropRatio;
    }
    if (
      this.elements.ratioInputA &&
      typeof ui?.customRatioA === "number"
    ) {
      this.elements.ratioInputA.value = String(ui.customRatioA);
    }
    if (
      this.elements.ratioInputB &&
      typeof ui?.customRatioB === "number"
    ) {
      this.elements.ratioInputB.value = String(ui.customRatioB);
    }
    if (
      typeof ui?.activeRatioId === "string" &&
      this.elements.ratioButtons.some(
        (button) => button.id === ui.activeRatioId,
      )
    ) {
      this.setActiveRatio(ui.activeRatioId);
    }
  }

  projectUiState(): Pick<
    NonNullable<MapProject["ui"]>,
    | "ratioMode"
    | "activeRatioId"
    | "cropRatio"
    | "customRatioA"
    | "customRatioB"
  > {
    return {
      ratioMode: this.state.ratioMode,
      activeRatioId: this.state.activeRatioId,
      cropRatio: this.state.ratio,
      customRatioA: this.elements.ratioInputA
        ? Number(this.elements.ratioInputA.value) || undefined
        : undefined,
      customRatioB: this.elements.ratioInputB
        ? Number(this.elements.ratioInputB.value) || undefined
        : undefined,
    };
  }

  private bindRatioControls(): void {
    bindFirstClickSelect(this.elements.ratioInputA, () => true);
    bindFirstClickSelect(this.elements.ratioInputB, () => true);
    const bind = (id: string, ratio: number) => {
      this.elements.ratioButtons
        .find((button) => button.id === id)
        ?.addEventListener("click", () => this.applyRatio(ratio, id));
    };
    this.elements.ratioButtons
      .find((button) => button.id === "ratioFree")
      ?.addEventListener("click", () => {
        this.state.ratioMode = "free";
        this.setActiveRatio("ratioFree");
        this.updateFrame();
      });
    bind("ratioOriginal", this.originalRatio);
    bind("ratioSquare", 1);
    bind("ratio34", 3 / 4);
    bind("ratio43", 4 / 3);
    bind("ratio169", 16 / 9);
    bind("ratio916", 9 / 16);
    bind("ratioA4", 210 / 297);
    this.elements.ratioButtons
      .find((button) => button.id === "ratioCustom")
      ?.addEventListener("click", () => {
        this.state.ratioMode = "fixed";
        this.setActiveRatio("ratioCustom");
        this.handleRatioInput();
      });
    this.elements.ratioInputA?.addEventListener("input", () =>
      this.handleRatioInput(),
    );
    this.elements.ratioInputB?.addEventListener("input", () =>
      this.handleRatioInput(),
    );
    this.elements.ratioInputA?.addEventListener("focus", () =>
      this.setActiveRatio("ratioCustom"),
    );
    this.elements.ratioInputB?.addEventListener("focus", () =>
      this.setActiveRatio("ratioCustom"),
    );
    this.elements.ratioSwap?.addEventListener("click", () =>
      this.swapRatio(),
    );
  }

  private setActiveRatio(targetId?: string): void {
    this.state.activeRatioId = targetId;
    this.elements.ratioButtons.forEach((button) => {
      button.classList.toggle("active", button.id === targetId);
    });
    if (this.elements.ratioSwap) {
      this.elements.ratioSwap.disabled = targetId === "ratioFree";
    }
  }

  private handleRatioInput(): void {
    if (
      this.state.activeRatioId !== "ratioCustom" ||
      !this.elements.ratioInputA ||
      !this.elements.ratioInputB
    ) {
      return;
    }
    const first = Number(this.elements.ratioInputA.value);
    const second = Number(this.elements.ratioInputB.value);
    if (
      Number.isFinite(first) &&
      Number.isFinite(second) &&
      first > 0 &&
      second > 0
    ) {
      this.applyRatio(first / second, "ratioCustom");
    }
  }

  private swapRatio(): void {
    if (this.state.activeRatioId === "ratioFree") {
      return;
    }
    if (
      this.state.activeRatioId === "ratioCustom" &&
      this.elements.ratioInputA &&
      this.elements.ratioInputB
    ) {
      const first = this.elements.ratioInputA.value;
      this.elements.ratioInputA.value = this.elements.ratioInputB.value;
      this.elements.ratioInputB.value = first;
      this.handleRatioInput();
      return;
    }
    const swapped: Record<string, string> = {
      ratio43: "ratio34",
      ratio34: "ratio43",
      ratio169: "ratio916",
      ratio916: "ratio169",
    };
    const nextRatio =
      this.state.ratio > 0
        ? 1 / this.state.ratio
        : 1 / this.originalRatio;
    const target = this.state.activeRatioId
      ? (swapped[this.state.activeRatioId] ?? this.state.activeRatioId)
      : undefined;
    this.applyRatio(nextRatio, target);
  }

  private bindCropInteractions(): void {
    const frame = this.elements.cropFrame;
    if (!frame) {
      return;
    }
    frame.addEventListener("wheel", this.options.onWheel, { passive: false });
    frame.addEventListener("pointerdown", (event) =>
      this.beginDrag(event),
    );
    frame.addEventListener("pointermove", (event) =>
      this.moveDrag(event),
    );
    const end = () => {
      this.drag = null;
      frame.classList.remove("resizing");
      frame.style.cursor = "move";
    };
    frame.addEventListener("pointerup", end);
    frame.addEventListener("pointercancel", end);
  }

  private beginDrag(event: PointerEvent): void {
    const frame = this.elements.cropFrame;
    if (
      !frame ||
      this.options.getActiveStep() !== "1" ||
      !this.state.box
    ) {
      return;
    }
    const point = this.pointFromEvent(event);
    if (!point) {
      return;
    }
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement)?.dataset?.handle;
    this.drag = {
      mode: handle ? "resize" : "move",
      handle,
      startX: point.x,
      startY: point.y,
      startBox: { ...this.state.box },
    };
    frame.classList.toggle("resizing", Boolean(handle));
    frame.style.cursor = handle ? this.handleCursor(handle) : "move";
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.drag || !this.state.box) {
      return;
    }
    const point = this.pointFromEvent(event);
    if (!point) {
      return;
    }
    const deltaX = point.x - this.drag.startX;
    const deltaY = point.y - this.drag.startY;
    const start = this.drag.startBox;
    if (this.drag.mode === "move") {
      this.state.box.left = start.left + deltaX;
      this.state.box.top = start.top + deltaY;
    } else {
      this.state.box = resizeCropBox({
        start,
        handle: this.drag.handle ?? "",
        deltaX,
        deltaY,
        ratioMode: this.state.ratioMode,
        ratio: this.state.ratio,
      });
    }
    this.clampBox(this.state.box);
    this.updateFrame();
  }

  private createCenteredBox(
    stageWidth: number,
    stageHeight: number,
  ): CropBox {
    return centeredCropBox(stageWidth, stageHeight, this.state.ratio);
  }

  private currentScreenRect(): CropBox | null {
    if (this.state.bbox) {
      const { scaleFit, offsetX, offsetY } =
        this.options.resizeCanvasToStage();
      const view = this.options.view;
      return {
        left:
          (this.state.bbox.x * view.scale + view.tx) * scaleFit + offsetX,
        top:
          (this.state.bbox.y * view.scale + view.ty) * scaleFit + offsetY,
        width: this.state.bbox.width * view.scale * scaleFit,
        height: this.state.bbox.height * view.scale * scaleFit,
      };
    }
    return this.state.box ? { ...this.state.box } : null;
  }

  private pointFromEvent(
    event: PointerEvent,
  ): { x: number; y: number } | null {
    const stage = this.elements.mapStage;
    if (!stage) {
      return null;
    }
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private clampBox(box: CropBox): void {
    const stage = this.elements.mapStage;
    if (!stage) {
      return;
    }
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    Object.assign(box, clampCropBox(box, width, height));
  }

  private handleCursor(handle: string): string {
    return cropHandleCursor(handle);
  }
}
