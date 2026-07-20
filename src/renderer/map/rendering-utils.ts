export type LayerStyle = { fill?: string; stroke?: string; strokeWidth?: number };

const SVG_NS = "http://www.w3.org/2000/svg";

const layerStylePresets: Record<string, Record<string, LayerStyle>> = {
  styleOriginal: {
    ocean: { fill: "#0f1c3f" }, land: { fill: "#1f2937" }, lakes: { fill: "#142247" },
    rivers: { stroke: "#3b82f6", strokeWidth: 0.6 }, coastline: { stroke: "#cbd5f5", strokeWidth: 0.6 },
  },
  styleDefault: {
    ocean: { fill: "#dbeafe" }, land: { fill: "#f1f5f9" }, lakes: { fill: "#bfdbfe" },
    rivers: { stroke: "#60a5fa", strokeWidth: 0.6 }, coastline: { stroke: "#94a3b8", strokeWidth: 0.6 },
    borders: { stroke: "#cbd5f5", strokeWidth: 0.4 },
  },
  styleMinimal: {
    ocean: { fill: "#eef2f7" }, land: { fill: "#f1f5f9" }, lakes: { fill: "#e2e8f0" },
    rivers: { stroke: "none", strokeWidth: 0 }, coastline: { stroke: "#aebccd", strokeWidth: 0.75 },
    borders: { stroke: "none", strokeWidth: 0 },
  },
  styleDark: {
    ocean: { fill: "#0b1020" }, land: { fill: "#1f2a44" }, lakes: { fill: "#101a33" },
    rivers: { stroke: "#3b82f6", strokeWidth: 0.6 }, coastline: { stroke: "#cbd5f5", strokeWidth: 0.6 },
    borders: { stroke: "#64748b", strokeWidth: 0.4 },
  },
  styleOutline: {
    ocean: { fill: "none" }, land: { fill: "none" }, lakes: { fill: "none" },
    rivers: { stroke: "none", strokeWidth: 0 }, coastline: { stroke: "#e2e8f0", strokeWidth: 0.85 },
    borders: { stroke: "#94a3b8", strokeWidth: 0.55 },
  },
  styleSoft: {
    ocean: { fill: "#e8f0fb" }, land: { fill: "#faf6e8" }, lakes: { fill: "#d8e7fb" },
    rivers: { stroke: "#8fb7e8", strokeWidth: 0.5 }, coastline: { stroke: "#c3cee3", strokeWidth: 0.48 },
    borders: { stroke: "#d8dee8", strokeWidth: 0.28 },
  },
};

export function layerStyleFor(styleId: string, layerId: string): LayerStyle {
  const styles = layerStylePresets[styleId] ?? layerStylePresets.styleOriginal;
  return styles[layerId] ?? { stroke: "#64748b", strokeWidth: 0.4 };
}

export function buildHillshadeTexture(options: {
  image: HTMLImageElement;
  width: number;
  height: number;
  unproject: (x: number, y: number, width: number, height: number) => [number, number];
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const imageWidth = options.image.naturalWidth || options.image.width;
  const imageHeight = options.image.naturalHeight || options.image.height;
  for (let y = 0; y < options.height; y += 1) {
    const [, latitude] = options.unproject(0, y, options.width, options.height);
    const sourceY = ((90 - Math.max(-85, Math.min(85, latitude))) / 180) * imageHeight;
    ctx.drawImage(options.image, 0, sourceY, imageWidth, 1, 0, y, options.width, 1);
  }
  return canvas;
}

export async function loadHillshadeTexture(
  path: string,
  projection: string | null,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  try {
    if (projection !== "EPSG:3857" || !("createImageBitmap" in window)) return null;
    const response = await fetch(path);
    const bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: width, resizeHeight: height, resizeQuality: "high",
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

export function ensureMapRoot(svg: SVGSVGElement): SVGGElement {
  return ensureGroup(svg, "map-root", "data-layer");
}

export function ensureBasemapContainer(root: SVGGElement): SVGGElement {
  return ensureGroup(root, "basemap-wrap", "data-layer");
}

export function ensureMarkersContainer(root: SVGGElement): SVGGElement {
  return ensureGroup(root, "markers-wrap", "data-layer");
}

export function ensureShapesContainer(root: SVGGElement): SVGGElement {
  return ensureGroup(root, "shapes-wrap", "data-layer");
}

function ensureGroup(parent: SVGElement, id: string, attribute: string): SVGGElement {
  let group = parent.querySelector(`g[${attribute}="${id}"]`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS(SVG_NS, "g");
    group.setAttribute(attribute, id);
    parent.appendChild(group);
  }
  return group;
}

export function ensureWrapGroup(container: SVGGElement, id: string, offsetX: number): SVGGElement {
  let group = container.querySelector(`g[data-wrap="${id}"]`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("data-wrap", id);
    container.appendChild(group);
  }
  group.setAttribute("transform", `translate(${offsetX} 0)`);
  return group;
}
