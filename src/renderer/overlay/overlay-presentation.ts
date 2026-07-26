export function shapeStrokeScale(width: number, height: number): number {
  const minDim = Math.max(24, Math.min(width, height));
  return Math.max(0.42, Math.min(1, minDim / 120));
}

export function labelZoomScale(scale: number): number {
  const normalized = Math.max(1, scale);
  if (normalized <= 2) {
    return Math.max(1.52, Math.min(3.4, 3.4 - (normalized - 1) * 1.88));
  }
  return Math.max(0.18, 1.52 / Math.pow(normalized / 2, 0.64));
}

export function labelOffsetScale(scale: number): number {
  const normalized = Math.max(1, scale);
  return normalized <= 2
    ? 1
    : Math.max(0.38, 1 / Math.pow(normalized / 2, 0.3));
}

export function applyDraggingLabelOutline(label: SVGTextElement, textSize: number): void {
  const px = Math.max(0.25, Math.min(0.5, textSize / 26));
  label.setAttribute("paint-order", "stroke fill");
  label.setAttribute("stroke", "rgba(56, 189, 248, 0.9)");
  label.setAttribute("stroke-width", px.toFixed(2));
  label.setAttribute("stroke-dasharray", `${Math.max(1, px * 2).toFixed(2)} ${Math.max(1.5, px * 2.6).toFixed(2)}`);
  label.setAttribute("stroke-linecap", "round");
  label.setAttribute("stroke-linejoin", "round");
}

export function clearDraggingLabelOutline(label: SVGTextElement): void {
  label.removeAttribute("paint-order");
  label.removeAttribute("stroke");
  label.removeAttribute("stroke-width");
  label.removeAttribute("stroke-dasharray");
  label.removeAttribute("stroke-linecap");
  label.removeAttribute("stroke-linejoin");
}
