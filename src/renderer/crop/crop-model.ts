import type { MapProject } from "../bridge.js";
import { DEFAULT_PROJECT_CANVAS, fitCanvasToAspectRatio } from "../project/canvas.js";
import { centeredCropBox, clampCropBox, screenBoxToBounds, boundsToScreenBox } from "./geometry.js";
import type { CropBBox, CropBox, CropData, CropFrameState, CropRangeSnapshot, StageLayout, StageSize, ViewTransform } from "./types.js";

export const RATIO_IDS = [
  "ratioFree", "ratioOriginal", "ratioSquare", "ratio34", "ratio43",
  "ratio169", "ratio916", "ratioA4", "ratioCustom",
] as const;

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

/** Persistent map bounds and transient screen coordinates have separate ownership. */
export class CropModel {
  readonly data: CropData;
  readonly frame: CropFrameState = { box: null, stageSize: null };
  private snapshot: CropRangeSnapshot | null = null;

  constructor(readonly originalRatio: number) {
    this.data = {
      ratio: originalRatio, ratioMode: "fixed", projectCanvas: { ...DEFAULT_PROJECT_CANVAS }, bbox: null,
    };
  }

  setBounds(bbox: CropBBox | null): void {
    this.data.bbox = bbox ? { ...bbox } : null;
    this.frame.box = null;
    this.frame.stageSize = null;
    this.snapshot = null;
  }

  resetForLocationChange(): void {
    this.data.bbox = null;
    this.snapshot = null;
    // Keep the last screen size and ratio while Step 0 changes the map location.
  }

  applyRatio(ratio: number, id?: string): boolean {
    if (!positive(ratio)) return false;
    this.data.ratioMode = "fixed";
    this.data.ratio = ratio;
    this.data.projectCanvas = fitCanvasToAspectRatio(this.data.projectCanvas, ratio);
    this.data.activeRatioId = id;
    this.frame.box = null;
    return true;
  }

  setCustomRatio(first: number, second: number): boolean {
    this.data.customRatioA = positive(first);
    this.data.customRatioB = positive(second);
    if (this.data.activeRatioId !== "ratioCustom" || !positive(first) || !positive(second)) return false;
    return this.applyRatio(first / second, "ratioCustom");
  }

  prepareFrame(stage: StageSize): CropBox {
    const previous = this.frame.stageSize;
    let box = this.frame.box;
    if (previous && box) {
      const scaleX = stage.width / Math.max(1, previous.width);
      const scaleY = stage.height / Math.max(1, previous.height);
      box = { left: box.left * scaleX, top: box.top * scaleY, width: box.width * scaleX, height: box.height * scaleY };
    }
    if (!box) {
      box = this.data.ratioMode === "free"
        ? { left: 0, top: 0, width: stage.width, height: stage.height }
        : centeredCropBox(stage.width, stage.height, this.data.ratio);
    }
    this.frame.box = clampCropBox(box, stage.width, stage.height);
    this.frame.stageSize = { ...stage };
    return this.frame.box;
  }

  commitFrame(layout: StageLayout, view: ViewTransform): void {
    this.data.bbox = this.frame.box ? screenBoxToBounds(this.frame.box, layout, view) : null;
    if (this.data.ratioMode === "free" && this.frame.box && this.frame.box.height > 0) {
      this.data.ratio = this.frame.box.width / this.frame.box.height;
      this.data.projectCanvas = fitCanvasToAspectRatio(this.data.projectCanvas, this.data.ratio);
    }
  }

  restoreEditableFrame(layout: StageLayout, view: ViewTransform): void {
    if (!this.data.bbox) return;
    this.frame.box = boundsToScreenBox(this.data.bbox, layout, view);
    this.frame.stageSize = { width: layout.width, height: layout.height };
  }

  screenRect(layout: StageLayout, view: ViewTransform): CropBox | null {
    return this.data.bbox
      ? boundsToScreenBox(this.data.bbox, layout, view)
      : this.frame.box ? { ...this.frame.box } : null;
  }

  captureRange(view: ViewTransform): void {
    this.snapshot = {
      frame: {
        box: this.frame.box ? { ...this.frame.box } : null,
        stageSize: this.frame.stageSize ? { ...this.frame.stageSize } : null,
      },
      bbox: this.data.bbox ? { ...this.data.bbox } : null,
      view: { ...view },
    };
  }

  restoreRange(): ViewTransform | null {
    if (!this.snapshot) return null;
    this.frame.box = this.snapshot.frame.box ? { ...this.snapshot.frame.box } : null;
    this.frame.stageSize = this.snapshot.frame.stageSize ? { ...this.snapshot.frame.stageSize } : null;
    this.data.bbox = this.snapshot.bbox ? { ...this.snapshot.bbox } : null;
    return { ...this.snapshot.view };
  }

  applyProjectUi(ui: MapProject["ui"]): void {
    if (ui?.ratioMode === "free" || ui?.ratioMode === "fixed") this.data.ratioMode = ui.ratioMode;
    const ratio = positive(ui?.cropRatio);
    if (ratio !== undefined) this.data.ratio = ratio;
    this.data.customRatioA = positive(ui?.customRatioA);
    this.data.customRatioB = positive(ui?.customRatioB);
    if (RATIO_IDS.some((id) => id === ui?.activeRatioId)) this.data.activeRatioId = ui?.activeRatioId;
  }

  projectUiState(): Pick<NonNullable<MapProject["ui"]>, "ratioMode" | "activeRatioId" | "cropRatio" | "customRatioA" | "customRatioB"> {
    const { ratioMode, activeRatioId, ratio, customRatioA, customRatioB } = this.data;
    return { ratioMode, activeRatioId, cropRatio: ratio, customRatioA, customRatioB };
  }

  fingerprint(): string {
    return JSON.stringify([this.data.bbox, this.data.projectCanvas, this.projectUiState()]);
  }
}
