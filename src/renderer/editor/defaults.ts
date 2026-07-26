import type { MarkerStyle, ShapeItem, ShapeStyle } from "./types.js";

export function defaultMarkerStyle(): MarkerStyle {
  return {
    dotSize: 7,
    textSize: 7,
    dotColor: "#f97316",
    textColor: "#fde68a",
    textOffsetX: 8,
    textOffsetY: -6,
    textAnchor: "start",
    fontFamily: "IBM Plex Sans, sans-serif",
  };
}

export function defaultShapeStyle(type: ShapeItem["type"]): ShapeStyle {
  const style: ShapeStyle = {
    strokeColor: "#38bdf8",
    strokeWidth: 2,
    fillColor: "#38bdf8",
    fillOpacity: 0.35,
    textColor: "#fde68a",
    textSize: 7,
    fontFamily: "IBM Plex Sans, sans-serif",
  };
  if (type === "area") {
    style.fillOpacity = 0.4;
  }
  return style;
}
