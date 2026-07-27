import type { CropBox } from "./crop-controller.js";

export function centeredCropBox(
  stageWidth: number,
  stageHeight: number,
  ratio: number,
  inset = 12,
): CropBox {
  let width = stageWidth;
  let height = width / ratio;
  if (height > stageHeight) {
    height = stageHeight;
    width = height * ratio;
  }
  width = Math.max(1, width - inset * 2);
  height = Math.max(1, height - inset * 2);
  return {
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  };
}

export function clampCropBox(
  box: CropBox,
  stageWidth: number,
  stageHeight: number,
  minimumSize = 40,
): CropBox {
  const width = Math.max(
    minimumSize,
    Math.min(box.width, Math.max(1, stageWidth)),
  );
  const height = Math.max(
    minimumSize,
    Math.min(box.height, Math.max(1, stageHeight)),
  );
  return {
    left: Math.min(Math.max(0, box.left), Math.max(0, stageWidth - width)),
    top: Math.min(Math.max(0, box.top), Math.max(0, stageHeight - height)),
    width,
    height,
  };
}

export function resizeCropBox(options: {
  start: CropBox;
  handle: string;
  deltaX: number;
  deltaY: number;
  ratioMode: "free" | "fixed";
  ratio: number;
  minimumSize?: number;
}): CropBox {
  const {
    start,
    handle,
    deltaX,
    deltaY,
    ratioMode,
    ratio,
    minimumSize = 40,
  } = options;
  const box = { ...start };
  if (ratioMode === "fixed") {
    const widthFromX = handle.includes("w")
      ? start.width - deltaX
      : start.width + deltaX;
    const heightFromY = handle.includes("n")
      ? start.height - deltaY
      : start.height + deltaY;
    const width = Math.max(
      minimumSize,
      Math.abs(deltaX) >= Math.abs(deltaY)
        ? widthFromX
        : heightFromY * ratio,
    );
    const height = width / ratio;
    if (handle.includes("w")) {
      box.left = start.left + start.width - width;
    }
    if (handle.includes("n")) {
      box.top = start.top + start.height - height;
    }
    box.width = width;
    box.height = height;
    return box;
  }
  if (handle.includes("e")) box.width = start.width + deltaX;
  if (handle.includes("s")) box.height = start.height + deltaY;
  if (handle.includes("w")) {
    box.width = start.width - deltaX;
    box.left = start.left + deltaX;
  }
  if (handle.includes("n")) {
    box.height = start.height - deltaY;
    box.top = start.top + deltaY;
  }
  return box;
}

export function cropHandleCursor(handle: string): string {
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return "move";
}
