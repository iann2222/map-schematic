import type { MapProject } from "../bridge.js";

export type ViewTransform = { scale: number; tx: number; ty: number };
export type CropBox = { left: number; top: number; width: number; height: number };
export type CropBBox = { x: number; y: number; width: number; height: number };
export type StageSize = { width: number; height: number };
export type StageLayout = StageSize & { scaleFit: number; offsetX: number; offsetY: number };

export type CropData = {
  ratio: number;
  ratioMode: "free" | "fixed";
  activeRatioId?: string;
  projectCanvas: MapProject["canvas"];
  bbox: CropBBox | null;
  customRatioA?: number;
  customRatioB?: number;
};

export type CropFrameState = {
  box: CropBox | null;
  stageSize: StageSize | null;
};

export type CropRangeSnapshot = {
  frame: CropFrameState;
  bbox: CropBBox | null;
  view: ViewTransform;
};
