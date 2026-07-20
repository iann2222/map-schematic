import { ensureMapRoot, ensureMarkersContainer } from "../map/rendering-utils.js";

export function updateMarkerStyles(options: {
  svg: SVGSVGElement | null;
  scale: number;
  activeStep: string;
  selectedMarkerId: string | null;
  labelZoomScale: (scale: number) => number;
  labelOffsetScale: (scale: number) => number;
}): void {
  if (!options.svg) return;
  const root = ensureMapRoot(options.svg);
  const markerWrap = ensureMarkersContainer(root);
  markerWrap.querySelectorAll<SVGCircleElement>('circle[data-marker="dot"]').forEach((dot) => {
    const base = Number(dot.getAttribute("data-base") ?? "4");
    dot.setAttribute("r", (base / options.scale).toFixed(2));
    dot.setAttribute("stroke-width", (1.2 / options.scale).toFixed(2));
    const id = dot.getAttribute("data-id");
    dot.setAttribute("stroke", options.activeStep === "3" && id === options.selectedMarkerId ? "#38bdf8" : "#fff7ed");
  });
  markerWrap.querySelectorAll<SVGTextElement>('text[data-marker="label"]').forEach((label) => {
    const base = Number(label.getAttribute("data-base") ?? "13");
    label.setAttribute("font-size", (base * options.labelZoomScale(options.scale)).toFixed(2));
    const baseX = Number(label.getAttribute("data-x") ?? "0");
    const baseY = Number(label.getAttribute("data-y") ?? "0");
    const offsetX = Number(label.getAttribute("data-offset-x") ?? "0");
    const offsetY = Number(label.getAttribute("data-offset-y") ?? "0");
    const offsetScale = options.labelOffsetScale(options.scale);
    label.setAttribute("x", (baseX + offsetX * offsetScale).toFixed(2));
    label.setAttribute("y", (baseY + offsetY * offsetScale).toFixed(2));
  });
}
