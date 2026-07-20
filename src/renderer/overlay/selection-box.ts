const SVG_NS = "http://www.w3.org/2000/svg";

export function insertDashedSelectionBox(options: {
  parent: SVGGElement;
  before: SVGElement;
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  strokeWidth: number;
  dataAttribute: "data-marker" | "data-shape";
  dataValue: string;
}): void {
  const box = document.createElementNS(SVG_NS, "g");
  const left = options.x - options.padding;
  const top = options.y - options.padding;
  const width = options.width + options.padding * 2;
  const height = options.height + options.padding * 2;
  box.setAttribute(options.dataAttribute, options.dataValue);
  box.setAttribute("data-export-ignore", "true");
  box.style.pointerEvents = "none";

  const addLine = (x1: number, y1: number, x2: number, y2: number, segments: number) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1.toFixed(2));
    line.setAttribute("y1", y1.toFixed(2));
    line.setAttribute("x2", x2.toFixed(2));
    line.setAttribute("y2", y2.toFixed(2));
    line.setAttribute("stroke", "rgba(56, 189, 248, 0.95)");
    line.setAttribute("stroke-width", options.strokeWidth.toFixed(2));
    line.setAttribute("stroke-linecap", "butt");
    const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    const dash = length / Math.max(1, segments * 2 - 1);
    line.setAttribute("stroke-dasharray", `${dash.toFixed(2)} ${dash.toFixed(2)}`);
    box.appendChild(line);
  };

  addLine(left, top, left + width, top, 4);
  addLine(left + width, top, left + width, top + height, 3);
  addLine(left + width, top + height, left, top + height, 4);
  addLine(left, top + height, left, top, 3);
  options.parent.insertBefore(box, options.before);
}
