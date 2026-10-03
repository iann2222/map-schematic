import type { MapProject } from "../bridge.js";
import type { WorkflowStep } from "../app-state.js";
import { CropModel } from "../crop/crop-model.js";
import { CropView } from "../crop/crop-view.js";
import { CropInteraction } from "../crop/crop-interaction.js";
import { clipScreenBox, fitViewToCrop } from "../crop/geometry.js";
import type { CropBBox, CropBox, StageLayout, ViewTransform } from "../crop/types.js";

export type { CropBBox, CropBox, StageLayout, ViewTransform } from "../crop/types.js";

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
  onProjectChanged?: () => void;
};

/** Coordinates the crop model, DOM presentation and pointer session. */
export class CropController {
  private readonly model: CropModel;
  private readonly presentation: CropView;
  private readonly interaction: CropInteraction;
  private lastProjectState: string;
  private bound = false;

  constructor(private readonly options: CropControllerOptions) {
    this.model = new CropModel(options.mapWidth / options.mapHeight);
    this.presentation = new CropView(options.root ?? document, options.mapWidth, options.mapHeight);
    this.interaction = new CropInteraction({
      frame: this.presentation.elements.cropFrame,
      stage: this.presentation.elements.mapStage,
      getEditableBox: () => options.getActiveStep() === "1" ? this.model.frame.box : null,
      getRatio: () => this.model.data,
      getStageSize: () => this.presentation.stageSize(),
      updateBox: (box) => { this.model.frame.box = box; this.updateFrame(); },
      onWheel: options.onWheel,
    });
    this.lastProjectState = this.model.fingerprint();
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.presentation.bindRatios(this.model.originalRatio, {
      preset: (ratio, id) => this.applyRatio(ratio, id),
      free: () => {
        this.model.data.ratioMode = "free";
        this.setActiveRatio("ratioFree");
        this.updateFrame();
      },
      custom: () => {
        this.model.data.ratioMode = "fixed";
        this.setActiveRatio("ratioCustom");
        this.handleRatioInput();
      },
      input: () => this.handleRatioInput(),
      focus: () => this.setActiveRatio("ratioCustom"),
      swap: () => this.swapRatio(),
    });
    this.interaction.bind();
  }

  get projectCanvas(): MapProject["canvas"] { return this.model.data.projectCanvas; }
  get bbox(): CropBBox | null { return this.model.data.bbox; }
  get box(): CropBox | null { return this.model.frame.box; }

  setProjectCanvas(canvas: MapProject["canvas"]): void {
    this.model.data.projectCanvas = { ...canvas };
    this.notifyProjectChanged();
  }

  setBBox(bbox: CropBBox | null): void {
    this.interaction.finish();
    this.model.setBounds(bbox);
    this.notifyProjectChanged();
  }

  resetBox(): void {
    this.interaction.finish();
    this.model.frame.box = null;
  }

  resetForLocationChange(): void {
    this.model.resetForLocationChange();
    this.notifyProjectChanged();
  }

  beforeStepChange(previous: WorkflowStep, next: WorkflowStep): void {
    this.interaction.finish();
    if (previous === "1" && (next === "2" || next === "3")) {
      this.updateBBox();
      this.model.captureRange(this.options.view);
    }
    if (next === "1" && (previous === "2" || previous === "3")) {
      const view = this.model.restoreRange();
      if (view) {
        Object.assign(this.options.view, view);
        this.options.applyViewTransform();
        this.options.updateWrapTransforms(true);
      }
    }
    if (next === "1" && previous === "0") this.resetForLocationChange();
  }

  afterStepChange(previous: WorkflowStep, next: WorkflowStep): void {
    this.presentation.renderStep(next, this.model.data.ratioMode === "fixed");
    if (next === "1") {
      if (!this.box && this.bbox) {
        this.model.restoreEditableFrame(this.options.resizeCanvasToStage(), this.options.view);
      }
      if (!this.model.data.activeRatioId) this.setActiveRatio("ratioOriginal");
      this.updateFrame();
    }
    if (next === "2" || next === "3") {
      if (!this.bbox) {
        if (!this.box) this.updateFrame();
        this.updateBBox();
      }
      if (previous !== next) this.zoomToBounds();
    }
    this.applyMapClip();
    this.updateOverlay();
  }

  applyRatio(ratio: number, targetId?: string): void {
    this.interaction.finish();
    if (!this.model.applyRatio(ratio, targetId)) return;
    this.presentation.renderRatio(this.model.data);
    this.updateFrame();
    this.notifyProjectChanged();
  }

  updateFrame(): void {
    const stage = this.presentation.stageSize();
    if (!stage || !this.presentation.elements.cropFrame) return;
    const step = this.options.getActiveStep();
    // The editable frame drives bounds only in Step 1; locked steps project saved bounds.
    const locked = step === "2" || step === "3";
    const box = locked && this.bbox
      ? this.model.screenRect(this.options.resizeCanvasToStage(), this.options.view)
      : this.model.prepareFrame(stage);
    if (box) this.presentation.renderFrame(box, this.model.data.ratioMode === "fixed");
    if (step === "1") this.updateBBox();
    this.options.requestBasemapDraw();
    this.applyMapClip();
    this.updateOverlay();
  }

  updateBBox(): void {
    if (this.options.getActiveStep() !== "1" && this.bbox) return;
    if (!this.presentation.elements.mapStage) return;
    this.model.commitFrame(this.options.resizeCanvasToStage(), this.options.view);
    this.notifyProjectChanged();
  }

  zoomToBounds(): void {
    const bbox = this.bbox;
    const stage = this.presentation.stageSize();
    if (!bbox || !stage || bbox.width <= 0 || bbox.height <= 0) return;
    const step = this.options.getActiveStep();
    const maxScale = step === "2" || step === "3" ? this.options.maxCropScale : this.options.maxScale;
    Object.assign(this.options.view, fitViewToCrop(
      bbox, stage, this.options.resizeCanvasToStage(), this.options.minScale, maxScale,
    ));
    this.options.applyViewTransform();
    this.options.updateWrapTransforms(true);
  }

  applyMapClip(): void { this.presentation.applyMapClip(); }

  updateOverlay(): void {
    this.presentation.renderOverlay(this.options.getActiveStep(), this.currentScreenRect());
  }

  currentExportRect(): CropBox | null {
    const stage = this.presentation.stageSize();
    if (!stage) return null;
    const rect = this.currentScreenRect();
    if (!rect) return { left: 0, top: 0, ...stage };
    const clipped = clipScreenBox(rect, stage);
    return { ...clipped, width: Math.max(1, clipped.width), height: Math.max(1, clipped.height) };
  }

  resolveFrameBox(): CropBox | undefined { return this.presentation.resolveFrameBox(); }

  applyProjectUi(ui: MapProject["ui"]): void {
    this.model.applyProjectUi(ui);
    this.presentation.renderRatio(this.model.data, true);
    this.notifyProjectChanged();
  }

  projectUiState(): ReturnType<CropModel["projectUiState"]> {
    return this.model.projectUiState();
  }

  private currentScreenRect(): CropBox | null {
    if (!this.presentation.elements.mapStage) return null;
    return this.model.screenRect(this.options.resizeCanvasToStage(), this.options.view);
  }

  private setActiveRatio(id?: string): void {
    this.model.data.activeRatioId = id;
    this.presentation.renderRatio(this.model.data);
    this.notifyProjectChanged();
  }

  private handleRatioInput(): void {
    const [first, second] = this.presentation.customRatio();
    if (this.model.setCustomRatio(first, second)) this.updateFrame();
    this.notifyProjectChanged();
  }

  private swapRatio(): void {
    const data = this.model.data;
    if (data.activeRatioId === "ratioFree") return;
    if (data.activeRatioId === "ratioCustom") {
      this.presentation.swapCustomInputs();
      this.handleRatioInput();
      return;
    }
    const swapped: Record<string, string> = {
      ratio43: "ratio34", ratio34: "ratio43", ratio169: "ratio916", ratio916: "ratio169",
    };
    const ratio = data.ratio > 0 ? 1 / data.ratio : 1 / this.model.originalRatio;
    this.applyRatio(ratio, data.activeRatioId ? swapped[data.activeRatioId] ?? data.activeRatioId : undefined);
  }

  private notifyProjectChanged(): void {
    const fingerprint = this.model.fingerprint();
    if (fingerprint === this.lastProjectState) return;
    this.lastProjectState = fingerprint;
    this.options.onProjectChanged?.();
  }
}
