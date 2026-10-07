import type { CropController } from "../controllers/crop-controller.js";
import type { MapViewportController } from "../controllers/map-viewport-controller.js";
import type { BasemapRenderer } from "../map/basemap-renderer.js";
import { canvasPixelDimensions } from "../project/canvas.js";
import { ensureMapRoot, ensureBasemapContainer } from "../map/rendering-utils.js";

export function createExportRenderer(options: {
  canvas: HTMLCanvasElement | null;
  svg: SVGSVGElement | null;
  mapStage: HTMLDivElement | null;
  cropController: Pick<CropController, "currentExportRect" | "projectCanvas">;
  mapViewport: Pick<MapViewportController, "view" | "wrapShift" | "resizeCanvasToStage">;
  basemapRenderer: Pick<BasemapRenderer, "hasLayers" | "layers" | "exportStyle" | "exportWrapSpan" | "reliefEnabled" | "hillshadeTexture" | "reliefAlpha">;
  mapWidth: number;
  mapHeight: number;
  flushOverlay?: () => void;
}) {
  const { canvas, svg, mapStage, cropController, mapViewport, basemapRenderer,
    mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT } = options;
  const view = mapViewport.view;
  const resizeCanvasToStage = () => mapViewport.resizeCanvasToStage();

  async function renderExportCanvas(exportScale = 1): Promise<{
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
  } | null> {
    options.flushOverlay?.();
    if (!canvas || !svg || !mapStage) {
      return null;
    }
    const stageRect = mapStage.getBoundingClientRect();
    const scaleX = canvas.width / stageRect.width;
    const scaleY = canvas.height / stageRect.height;
    const crop = cropController.currentExportRect();
    if (!crop) {
      return null;
    }
    const outputSize = canvasPixelDimensions(
      cropController.projectCanvas,
      exportScale,
    );
    const outWidth = outputSize.width;
    const outHeight = outputSize.height;
    const outCanvas = document.createElement("canvas");
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const sourceX = crop.left * scaleX;
    const sourceY = crop.top * scaleY;
    const sourceWidth = crop.width * scaleX;
    const sourceHeight = crop.height * scaleY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outWidth,
      outHeight,
    );
    const serializer = new XMLSerializer();
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(canvas.width));
    svgClone.setAttribute("height", String(canvas.height));
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg load failed"));
        img.src = url;
      });
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outWidth,
        outHeight,
      );
    } finally {
      URL.revokeObjectURL(url);
    }
    return { canvas: outCanvas, width: outWidth, height: outHeight };
  }

  function renderExportSvg(): {
    data: string;
    width: number;
    height: number;
  } | null {
    options.flushOverlay?.();
    if (!svg || !mapStage || !basemapRenderer.hasLayers) {
      return null;
    }
    const crop = cropController.currentExportRect();
    if (!crop) {
      return null;
    }
    const stageRect = mapStage.getBoundingClientRect();
    const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
    if (scaleFit <= 0) {
      return null;
    }

    const viewBoxX = (crop.left - offsetX) / scaleFit;
    const viewBoxY = (crop.top - offsetY) / scaleFit;
    const viewBoxWidth = crop.width / scaleFit;
    const viewBoxHeight = crop.height / scaleFit;
    const outputSize = canvasPixelDimensions(cropController.projectCanvas);
    const outputWidth = outputSize.width;
    const outputHeight = outputSize.height;
    const svgNs = "http://www.w3.org/2000/svg";
    const xlinkNs = "http://www.w3.org/1999/xlink";
    const xmlnsNs = "http://www.w3.org/2000/xmlns/";
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("xmlns", svgNs);
    svgClone.setAttributeNS(xmlnsNs, "xmlns:xlink", xlinkNs);
    svgClone.setAttribute(
      "width",
      cropController.projectCanvas.unit === "mm"
        ? `${cropController.projectCanvas.width}mm`
        : String(outputWidth),
    );
    svgClone.setAttribute(
      "height",
      cropController.projectCanvas.unit === "mm"
        ? `${cropController.projectCanvas.height}mm`
        : String(outputHeight),
    );
    svgClone.setAttribute(
      "viewBox",
      `${viewBoxX.toFixed(4)} ${viewBoxY.toFixed(4)} ${viewBoxWidth.toFixed(4)} ${viewBoxHeight.toFixed(4)}`,
    );
    svgClone.setAttribute("preserveAspectRatio", "none");
    svgClone.removeAttribute("class");

    svgClone
      .querySelectorAll('[data-export-ignore="true"], [data-preview="true"]')
      .forEach((element) => element.remove());
    svgClone.querySelectorAll("[data-dragging]").forEach((element) => {
      element.removeAttribute("data-dragging");
    });
    svgClone
      .querySelectorAll<SVGCircleElement>('circle[data-marker="dot"]')
      .forEach((dot) => dot.setAttribute("stroke", "#fff7ed"));

    let defs = svgClone.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(svgNs, "defs");
      svgClone.insertBefore(defs, svgClone.firstChild);
    }
    defs.querySelector("#map-clip")?.remove();
    defs.querySelector("#export-basemap-world")?.remove();

    const root = ensureMapRoot(svgClone);
    root.removeAttribute("clip-path");
    const basemapContainer = ensureBasemapContainer(root);
    basemapContainer.innerHTML = "";
    root.insertBefore(basemapContainer, root.firstChild);

    const worldDefinition = document.createElementNS(svgNs, "g");
    worldDefinition.setAttribute("id", "export-basemap-world");
    for (const layer of basemapRenderer.layers) {
      if (layer.pathData.length === 0) {
        continue;
      }
      const style = basemapRenderer.exportStyle(layer.id);
      const pathElement = document.createElementNS(svgNs, "path");
      pathElement.setAttribute("d", layer.pathData.join(" "));
      pathElement.setAttribute("fill", style.fill ?? "none");
      pathElement.setAttribute("fill-rule", "evenodd");
      pathElement.setAttribute("stroke", style.stroke ?? "none");
      if (style.stroke && style.stroke !== "none") {
        pathElement.setAttribute(
          "stroke-width",
          String((style.strokeWidth ?? 0.4) / view.scale),
        );
        pathElement.setAttribute("stroke-linejoin", "round");
        pathElement.setAttribute("stroke-linecap", "round");
      }
      worldDefinition.appendChild(pathElement);
    }

    if (basemapRenderer.reliefEnabled && basemapRenderer.hillshadeTexture) {
      const image = document.createElementNS(svgNs, "image");
      const imageData = basemapRenderer.hillshadeTexture.toDataURL("image/png");
      image.setAttribute("href", imageData);
      image.setAttributeNS(xlinkNs, "xlink:href", imageData);
      image.setAttribute("x", "0");
      image.setAttribute("y", "0");
      image.setAttribute("width", String(MAP_WIDTH));
      image.setAttribute("height", String(MAP_HEIGHT));
      image.setAttribute("preserveAspectRatio", "none");
      image.setAttribute(
        "opacity",
        String(basemapRenderer.reliefAlpha),
      );
      image.setAttribute("style", "mix-blend-mode:multiply");
      worldDefinition.appendChild(image);
    }
    defs.appendChild(worldDefinition);

    const wrapShift = mapViewport.wrapShift;
    const wrapSpan = basemapRenderer.exportWrapSpan(stageRect.width, scaleFit);
    for (let i = -wrapSpan;i <= wrapSpan;i += 1) {
      const use = document.createElementNS(svgNs, "use");
      use.setAttribute("href", "#export-basemap-world");
      use.setAttributeNS(xlinkNs, "xlink:href", "#export-basemap-world");
      use.setAttribute(
        "transform",
        `translate(${(i + wrapShift) * MAP_WIDTH} 0)`,
      );
      basemapContainer.appendChild(use);
    }

    const background = document.createElementNS(svgNs, "rect");
    background.setAttribute("x", viewBoxX.toFixed(4));
    background.setAttribute("y", viewBoxY.toFixed(4));
    background.setAttribute("width", viewBoxWidth.toFixed(4));
    background.setAttribute("height", viewBoxHeight.toFixed(4));
    background.setAttribute("fill", "#0a1020");
    svgClone.insertBefore(background, svgClone.firstChild);

    const serializer = new XMLSerializer();
    const data = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(svgClone)}`;
    return { data, width: outputWidth, height: outputHeight };
  }

  return { renderCanvas: renderExportCanvas, renderSvg: renderExportSvg };
}
