import type { MapProject } from "../bridge.js";

export type ProjectCanvas = MapProject["canvas"];

export const DEFAULT_PROJECT_CANVAS: ProjectCanvas = {
  width: 1200,
  height: 800,
  unit: "px",
};

const CSS_PIXELS_PER_MM = 96 / 25.4;

function roundDimension(value: number, unit: ProjectCanvas["unit"]): number {
  if (unit === "px") {
    return Math.max(1, Math.round(value));
  }
  return Math.max(0.01, Math.round(value * 100) / 100);
}

export function canvasAspectRatio(canvas: ProjectCanvas): number {
  return canvas.width / canvas.height;
}

export function fitCanvasToAspectRatio(
  canvas: ProjectCanvas,
  aspectRatio: number,
): ProjectCanvas {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { ...canvas };
  }
  const longEdge = Math.max(canvas.width, canvas.height);
  if (aspectRatio >= 1) {
    return {
      width: roundDimension(longEdge, canvas.unit),
      height: roundDimension(longEdge / aspectRatio, canvas.unit),
      unit: canvas.unit,
    };
  }
  return {
    width: roundDimension(longEdge * aspectRatio, canvas.unit),
    height: roundDimension(longEdge, canvas.unit),
    unit: canvas.unit,
  };
}

export function canvasPixelDimensions(
  canvas: ProjectCanvas,
  scale = 1,
): { width: number; height: number } {
  const unitScale = canvas.unit === "mm" ? CSS_PIXELS_PER_MM : 1;
  const outputScale = Math.max(0.01, scale);
  return {
    width: Math.max(1, Math.round(canvas.width * unitScale * outputScale)),
    height: Math.max(1, Math.round(canvas.height * unitScale * outputScale)),
  };
}
