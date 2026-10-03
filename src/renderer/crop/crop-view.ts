import type { WorkflowStep } from "../app-state.js";
import { ensureMapRoot } from "../map/rendering-utils.js";
import { bindFirstClickSelect } from "../ui/input-selection.js";
import { clipScreenBox } from "./geometry.js";
import { RATIO_IDS } from "./crop-model.js";
import type { CropBox, CropData, StageSize } from "./types.js";

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
    ratioButtons: RATIO_IDS
      .map((id) => element<HTMLButtonElement>(root, id))
      .filter((button): button is HTMLButtonElement => button !== null),
  };
}


export class CropView {
  readonly elements: CropElements;

  constructor(private readonly root: Document, private readonly mapWidth: number, private readonly mapHeight: number) {
    this.elements = collectElements(root);
  }

  stageSize(): StageSize | null {
    const rect = this.elements.mapStage?.getBoundingClientRect();
    return rect ? { width: Math.max(1, rect.width), height: Math.max(1, rect.height) } : null;
  }

  renderStep(step: WorkflowStep, fixed: boolean): void {
    const { cropFrame, mapWrap } = this.elements;
    cropFrame?.classList.toggle("hidden", step !== "1");
    cropFrame?.classList.toggle("interactive", step === "1");
    cropFrame?.classList.toggle("fixed", step === "1" && fixed);
    mapWrap?.classList.toggle("step-range", step === "1");
    mapWrap?.classList.toggle("step-locked", step === "2" || step === "3");
  }

  renderFrame(box: CropBox, fixed: boolean): void {
    const frame = this.elements.cropFrame;
    if (!frame) return;
    frame.classList.toggle("fixed", fixed);
    Object.assign(frame.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    const minDim = Math.max(36, Math.min(box.width, box.height));
    frame.style.setProperty("--crop-stroke", `${Math.max(0.9, Math.min(1.35, minDim / 260)).toFixed(2)}px`);
    frame.style.setProperty("--crop-handle-size", `${Math.max(6, Math.min(8, minDim / 70)).toFixed(2)}px`);
  }

  renderRatio(data: CropData, syncInputs = false): void {
    this.elements.ratioButtons.forEach((button) => {
      button.classList.toggle("active", button.id === data.activeRatioId);
    });
    if (this.elements.ratioSwap) this.elements.ratioSwap.disabled = data.activeRatioId === "ratioFree";
    if (syncInputs) {
      if (this.elements.ratioInputA) this.elements.ratioInputA.value = data.customRatioA === undefined ? "" : String(data.customRatioA);
      if (this.elements.ratioInputB) this.elements.ratioInputB.value = data.customRatioB === undefined ? "" : String(data.customRatioB);
    }
  }

  customRatio(): [number, number] {
    return [Number(this.elements.ratioInputA?.value ?? ""), Number(this.elements.ratioInputB?.value ?? "")];
  }

  swapCustomInputs(): void {
    const { ratioInputA, ratioInputB } = this.elements;
    if (ratioInputA && ratioInputB) [ratioInputA.value, ratioInputB.value] = [ratioInputB.value, ratioInputA.value];
  }

  bindRatios(originalRatio: number, handlers: {
    preset: (ratio: number, id: string) => void;
    free: () => void;
    custom: () => void;
    input: () => void;
    focus: () => void;
    swap: () => void;
  }): void {
    const presets: Record<string, number> = {
      ratioOriginal: originalRatio, ratioSquare: 1, ratio34: 3 / 4, ratio43: 4 / 3,
      ratio169: 16 / 9, ratio916: 9 / 16, ratioA4: 210 / 297,
    };
    for (const button of this.elements.ratioButtons) {
      button.addEventListener("click", () => {
        if (button.id === "ratioFree") handlers.free();
        else if (button.id === "ratioCustom") handlers.custom();
        else handlers.preset(presets[button.id], button.id);
      });
    }
    for (const input of [this.elements.ratioInputA, this.elements.ratioInputB]) {
      bindFirstClickSelect(input, () => true);
      input?.addEventListener("input", handlers.input);
      input?.addEventListener("focus", handlers.focus);
    }
    this.elements.ratioSwap?.addEventListener("click", handlers.swap);
  }

  applyMapClip(): void {
    const svg = this.elements.mapSvg;
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    let defs = svg.querySelector("defs");
    if (!defs) { defs = this.root.createElementNS(ns, "defs"); svg.appendChild(defs); }
    let clip = defs.querySelector("#map-clip");
    if (!clip) {
      clip = this.root.createElementNS(ns, "clipPath");
      clip.setAttribute("id", "map-clip");
      defs.appendChild(clip);
    }
    const rect = this.root.createElementNS(ns, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", (svg.viewBox.baseVal.width || this.mapWidth).toFixed(2));
    rect.setAttribute("height", (svg.viewBox.baseVal.height || this.mapHeight).toFixed(2));
    clip.replaceChildren(rect);
    ensureMapRoot(svg).setAttribute("clip-path", "url(#map-clip)");
  }

  renderOverlay(step: WorkflowStep, box: CropBox | null): void {
    const { cropOverlay, cropMaskTop, cropMaskLeft, cropMaskRight, cropMaskBottom } = this.elements;
    const stage = this.stageSize();
    if (!cropOverlay || !stage) return;
    if ((step !== "2" && step !== "3") || !box) {
      cropOverlay.classList.add("hidden");
      return;
    }
    if (!cropMaskTop || !cropMaskLeft || !cropMaskRight || !cropMaskBottom) return;
    const rect = clipScreenBox(box, stage);
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const masks: [HTMLElement, CropBox][] = [
      [cropMaskTop, { left: 0, top: 0, width: stage.width, height: rect.top }],
      [cropMaskLeft, { left: 0, top: rect.top, width: rect.left, height: rect.height }],
      [cropMaskRight, { left: right, top: rect.top, width: stage.width - right, height: rect.height }],
      [cropMaskBottom, { left: 0, top: bottom, width: stage.width, height: stage.height - bottom }],
    ];
    for (const [element, mask] of masks) {
      Object.assign(element.style, { left: `${mask.left}px`, top: `${mask.top}px`, width: `${mask.width}px`, height: `${mask.height}px` });
    }
    cropOverlay.classList.remove("hidden");
  }

  resolveFrameBox(): CropBox | undefined {
    const { cropFrame, mapStage } = this.elements;
    if (!cropFrame || !mapStage || cropFrame.classList.contains("hidden")) return undefined;
    const stage = mapStage.getBoundingClientRect();
    const frame = cropFrame.getBoundingClientRect();
    return { left: frame.left - stage.left, top: frame.top - stage.top, width: frame.width, height: frame.height };
  }
}
