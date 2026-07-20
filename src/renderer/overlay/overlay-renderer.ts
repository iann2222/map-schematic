import type { Marker, ShapeItem } from "../editor/types.js";
import { project } from "../map/geometry.js";
import { ensureMapRoot, ensureMarkersContainer, ensureShapesContainer, ensureWrapGroup } from "../map/rendering-utils.js";
import { labelOffsetScale, labelZoomScale, shapeStrokeScale } from "./overlay-presentation.js";
import { insertDashedSelectionBox } from "./selection-box.js";
import { createOverlayInteractionController } from "./interaction-controller.js";

type OverlayRenderHost = {
  getState: () => {
    svg: SVGSVGElement | null;
    view: { scale: number };
    WRAPS: ReadonlyArray<number>;
    worldShift: number;
    activeStep: string;
    selectedMarkerId: string | null;
    selectedShapeId: string | null;
    selectedLabelMarkerId: string | null;
    previewMarker: Marker | null;
    previewToolMarker: Marker | null;
    previewShape: ShapeItem | null;
    labelDrag: { markerId: string } | null;
    shapeDrag: { shapeId: string } | null;
    lastScaleFit: number;
  };
  markerObjects: () => Marker[];
  shapeObjects: () => ShapeItem[];
  getDisplayRankMap: () => Map<string, number>;
  markerOverlayKey: (id: string) => string;
  shapeOverlayKey: (id: string) => string;
  markerLabelText: (marker: Marker) => string;
  selectMarker: (id: string) => void;
  selectShape: (id: string) => void;
  mapPointFromEvent: (event: MouseEvent) => { x: number; y: number };
  beginEditorTransaction: () => void;
  setSelectedLabelMarkerId: (id: string) => void;
  setMarkerDrag: (drag: {
    markerId: string;
    startX: number;
    startY: number;
    startLon: number;
    startLat: number;
  } | null) => void;
  setLabelDrag: (drag: {
    markerId: string;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null) => void;
  setShapeDrag: (drag: {
    shapeId: string;
    startX: number;
    startY: number;
    startLon: number;
    startLat: number;
  } | null) => void;
};

export function createOverlayRenderer(host: OverlayRenderHost): { renderMarkers: () => void; renderShapes: () => void } {
function renderMarkers() {
  const state = host.getState();
  const { svg, view, WRAPS, worldShift, activeStep, selectedMarkerId, selectedLabelMarkerId, previewMarker, previewToolMarker, labelDrag, lastScaleFit } = state;
  const { markerObjects, getDisplayRankMap, markerOverlayKey, markerLabelText, selectMarker, selectShape, mapPointFromEvent, beginEditorTransaction } = host;
  if (!svg) {
    return;
  }
  const interactions = createOverlayInteractionController({
    isEditing: () => activeStep === "3",
    pointFromEvent: mapPointFromEvent,
    beginTransaction: beginEditorTransaction,
    selectMarker,
    selectShape,
    selectMarkerLabel: (id) => {
      host.setSelectedLabelMarkerId(id);
      renderMarkers();
    },
    setMarkerLabelSelection: (id) => {
      host.setSelectedLabelMarkerId(id);
    },
    beginMarkerDrag: (drag) => {
      host.setMarkerDrag(drag);
    },
    beginLabelDrag: (drag) => {
      host.setLabelDrag(drag);
    },
    beginShapeDrag: (drag) => {
      host.setShapeDrag(drag);
    },
  });
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const root = ensureMapRoot(svg);
  const markerWrap = ensureMarkersContainer(root);
  const rankMap = getDisplayRankMap();
  const sortedMarkers = [...markerObjects()].sort((a, b) => {
    const ra = rankMap.get(markerOverlayKey(a.id)) ?? Number.MAX_SAFE_INTEGER;
    const rb = rankMap.get(markerOverlayKey(b.id)) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) {
      return ra - rb;
    }
    return 0;
  });
  const renderItems: Array<{ marker: Marker; preview: boolean }> = [
    ...sortedMarkers.map((marker) => ({ marker, preview: false })),
  ];
  if (previewMarker) {
    renderItems.push({ marker: previewMarker, preview: true });
  }
  if (previewToolMarker) {
    renderItems.push({ marker: previewToolMarker, preview: true });
  }

  for (const i of WRAPS) {
    const wrap = ensureWrapGroup(
      markerWrap,
      `marker-${i}`,
      (i + worldShift) * width,
    );
    wrap.innerHTML = "";
    for (const item of renderItems) {
      const marker = item.marker;
      const [x, y] = project(marker.longitude, marker.latitude, width, height);
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", x.toFixed(2));
      circle.setAttribute("cy", y.toFixed(2));
      circle.setAttribute("data-marker", "dot");
      circle.setAttribute("data-id", marker.id);
      circle.setAttribute("data-base", String(marker.style.dotSize));
      circle.setAttribute("r", (marker.style.dotSize / view.scale).toFixed(2));
      circle.setAttribute("fill", marker.style.dotColor);
        circle.setAttribute(
          "stroke",
          activeStep === "3" && marker.id === selectedMarkerId
            ? "#38bdf8"
            : "#fff7ed",
        );
      circle.setAttribute("stroke-width", (1.2 / view.scale).toFixed(2));
      if (item.preview) {
        circle.setAttribute("opacity", "0.7");
        circle.setAttribute("data-preview", "true");
      }
      const hit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      const hitRadius = Math.max(14, marker.style.dotSize * 3) / view.scale;
      hit.setAttribute("cx", x.toFixed(2));
      hit.setAttribute("cy", y.toFixed(2));
      hit.setAttribute("r", hitRadius.toFixed(2));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("data-marker", "dot-hit");
      hit.setAttribute("data-id", marker.id);
      hit.setAttribute("data-export-ignore", "true");
      hit.style.pointerEvents = "all";
      circle.addEventListener("click", (event) => {
        interactions.selectMarker(event, marker, item.preview);
      });
      hit.addEventListener("mousedown", (event) => {
        interactions.beginMarkerDrag(event, marker, item.preview);
      });
      wrap.appendChild(hit);
      wrap.appendChild(circle);

      if (marker.showLabel === false) {
        continue;
      }
      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      const scale = labelZoomScale(view.scale);
      const offsetScale = labelOffsetScale(view.scale);
      const offsetX = marker.style.textOffsetX * offsetScale;
      const offsetY = marker.style.textOffsetY * offsetScale;
      label.setAttribute("data-x", x.toFixed(2));
      label.setAttribute("data-y", y.toFixed(2));
      label.setAttribute("data-offset-x", marker.style.textOffsetX.toFixed(2));
      label.setAttribute("data-offset-y", marker.style.textOffsetY.toFixed(2));
      label.setAttribute("x", (x + offsetX).toFixed(2));
      label.setAttribute("y", (y + offsetY).toFixed(2));
      label.setAttribute(
        "text-anchor",
        marker.style.textAnchor ??
          (marker.style.textOffsetX < 0 ? "end" : "start"),
      );
      label.setAttribute("data-marker", "label");
      label.setAttribute("data-id", marker.id);
      label.setAttribute("data-base", String(marker.style.textSize));
      label.setAttribute("fill", marker.style.textColor);
      label.setAttribute(
        "font-size",
        (marker.style.textSize * scale).toFixed(2),
      );
      label.setAttribute("font-family", marker.style.fontFamily);
      const labelText = markerLabelText(marker);
      label.textContent = labelText;
      if (item.preview) {
        label.setAttribute("data-preview", "true");
      }
      const isLabelSelected =
        !!(labelDrag && labelDrag.markerId === marker.id) ||
        selectedLabelMarkerId === marker.id;
      if (isLabelSelected) {
        label.setAttribute("data-dragging", "true");
      } else {
        label.removeAttribute("data-dragging");
      }
      label.addEventListener("click", (event) => {
        interactions.selectLabel(event, marker, item.preview);
      });
      const startLabelDrag = (event: MouseEvent) => {
        label.setAttribute("data-dragging", "true");
        interactions.beginLabelDrag(event, marker, item.preview);
      };
      label.addEventListener("mousedown", startLabelDrag);
      wrap.appendChild(label);

      const labelBox = label.getBBox();
      const labelHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const renderedFontSize = marker.style.textSize * scale;
      const zoomStroke = 2.65 / Math.pow(Math.max(1, view.scale), 0.24);
      const textStroke = renderedFontSize * 0.045;
      const desiredScreenStroke = Math.max(
        0.85,
        Math.min(3.2, zoomStroke + textStroke),
      );
      const dragStroke =
        desiredScreenStroke / Math.max(0.001, view.scale * lastScaleFit);
      const selectionPad = Math.max(
        0.35,
        Math.min(2.4, renderedFontSize * 0.045 + dragStroke * 1.15),
      );
      const hitPad = selectionPad;
      labelHit.setAttribute("x", (labelBox.x - hitPad).toFixed(2));
      labelHit.setAttribute("y", (labelBox.y - hitPad).toFixed(2));
      labelHit.setAttribute("width", (labelBox.width + hitPad * 2).toFixed(2));
      labelHit.setAttribute("height", (labelBox.height + hitPad * 2).toFixed(2));
      labelHit.setAttribute("fill", "transparent");
      labelHit.setAttribute("data-marker", "label-hit");
      labelHit.setAttribute("data-id", marker.id);
      labelHit.setAttribute("data-export-ignore", "true");
      labelHit.style.pointerEvents = "all";
      labelHit.addEventListener("click", (event) => {
        interactions.selectLabel(event, marker, item.preview);
      });
      labelHit.addEventListener("mousedown", startLabelDrag);
      wrap.insertBefore(labelHit, label);
      if (isLabelSelected) {
        insertDashedSelectionBox({
          parent: wrap,
          before: label,
          x: labelBox.x,
          y: labelBox.y,
          width: labelBox.width,
          height: labelBox.height,
          padding: selectionPad,
          strokeWidth: dragStroke,
          dataAttribute: "data-marker",
          dataValue: "label-drag-box",
        });
      }
    }
  }
  renderShapes();
}

function renderShapes(): void {
  const state = host.getState();
  const { svg, view, WRAPS, worldShift, activeStep, selectedShapeId, previewShape, shapeDrag, lastScaleFit } = state;
  const { shapeObjects, getDisplayRankMap, shapeOverlayKey, selectMarker, selectShape, mapPointFromEvent, beginEditorTransaction } = host;
  if (!svg) {
    return;
  }
  const interactions = createOverlayInteractionController({
    isEditing: () => activeStep === "3",
    pointFromEvent: mapPointFromEvent,
    beginTransaction: beginEditorTransaction,
    selectMarker,
    selectShape,
    selectMarkerLabel: (id) => {
      host.setSelectedLabelMarkerId(id);
      renderMarkers();
    },
    setMarkerLabelSelection: (id) => {
      host.setSelectedLabelMarkerId(id);
    },
    beginMarkerDrag: (drag) => {
      host.setMarkerDrag(drag);
    },
    beginLabelDrag: (drag) => {
      host.setLabelDrag(drag);
    },
    beginShapeDrag: (drag) => {
      host.setShapeDrag(drag);
    },
  });
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const root = ensureMapRoot(svg);
  const shapeWrap = ensureShapesContainer(root);
  const rankMap = getDisplayRankMap();
  const sortedShapes = [...shapeObjects()].sort((a, b) => {
    const ra = rankMap.get(shapeOverlayKey(a.id)) ?? Number.MAX_SAFE_INTEGER;
    const rb = rankMap.get(shapeOverlayKey(b.id)) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) {
      return ra - rb;
    }
    return 0;
  });
  const renderItems: Array<{ shape: ShapeItem; preview: boolean }> = [
    ...sortedShapes.map((shape) => ({ shape, preview: false })),
  ];
  if (previewShape) {
    renderItems.push({ shape: previewShape, preview: true });
  }
  for (const i of WRAPS) {
    const wrap = ensureWrapGroup(
      shapeWrap,
      `shape-${i}`,
      (i + worldShift) * width,
    );
    wrap.innerHTML = "";
    for (const item of renderItems) {
      const shape = item.shape;
      const [x, y] = project(shape.longitude, shape.latitude, width, height);
      if (shape.type === "line") {
        const half = shape.width / 2;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.setAttribute("x1", (x - half).toFixed(2));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("x2", (x + half).toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("stroke", shape.style.strokeColor);
        line.setAttribute(
          "stroke-width",
          (shape.style.strokeWidth / view.scale).toFixed(2),
        );
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("data-shape", "line");
        line.setAttribute("data-id", shape.id);
        if (item.preview) {
          line.setAttribute("opacity", "0.6");
          line.setAttribute("data-preview", "true");
        }
        const hit = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        hit.setAttribute("x1", (x - half).toFixed(2));
        hit.setAttribute("y1", y.toFixed(2));
        hit.setAttribute("x2", (x + half).toFixed(2));
        hit.setAttribute("y2", y.toFixed(2));
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute(
          "stroke-width",
          (Math.max(14, shape.style.strokeWidth * 4) / view.scale).toFixed(2),
        );
        hit.setAttribute("stroke-linecap", "round");
        hit.setAttribute("data-shape", "line");
        hit.setAttribute("data-id", shape.id);
        hit.setAttribute("data-export-ignore", "true");
        line.addEventListener("click", (event) => {
          interactions.selectShape(event, shape, item.preview);
        });
        const onDragStart = (event: MouseEvent) => {
          interactions.beginShapeDrag(event, shape, item.preview);
        };
        line.addEventListener("mousedown", onDragStart);
        hit.addEventListener("mousedown", onDragStart);
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.appendChild(hit);
        wrap.appendChild(line);
      } else if (shape.type === "arrow") {
        const half = shape.width / 2;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.setAttribute("x1", (x - half).toFixed(2));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("x2", (x + half).toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("stroke", shape.style.strokeColor);
        line.setAttribute(
          "stroke-width",
          (shape.style.strokeWidth / view.scale).toFixed(2),
        );
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("data-shape", "arrow");
        line.setAttribute("data-id", shape.id);
        const headSize = Math.max(6, shape.style.strokeWidth * 2) / view.scale;
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        const x2 = x + half;
        const y2 = y;
        const d = `M ${x2.toFixed(2)} ${y2.toFixed(2)} L ${(
          x2 - headSize
        ).toFixed(2)} ${(y2 - headSize * 0.6).toFixed(2)} L ${(
          x2 - headSize
        ).toFixed(2)} ${(y2 + headSize * 0.6).toFixed(2)} Z`;
        path.setAttribute("d", d);
        path.setAttribute("fill", shape.style.strokeColor);
        path.setAttribute("data-shape", "arrow");
        path.setAttribute("data-id", shape.id);
        if (item.preview) {
          line.setAttribute("opacity", "0.6");
          line.setAttribute("data-preview", "true");
          path.setAttribute("opacity", "0.6");
          path.setAttribute("data-preview", "true");
        }
        const onClick = (event: MouseEvent) => {
          interactions.selectShape(event, shape, item.preview);
        };
        const onDragStart = (event: MouseEvent) => {
          interactions.beginShapeDrag(event, shape, item.preview);
        };
        line.addEventListener("click", onClick);
        path.addEventListener("click", onClick);
        line.addEventListener("mousedown", onDragStart);
        path.addEventListener("mousedown", onDragStart);
        const hit = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        hit.setAttribute("x1", (x - half).toFixed(2));
        hit.setAttribute("y1", y.toFixed(2));
        hit.setAttribute("x2", (x + half).toFixed(2));
        hit.setAttribute("y2", y.toFixed(2));
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute(
          "stroke-width",
          (Math.max(14, shape.style.strokeWidth * 4) / view.scale).toFixed(2),
        );
        hit.setAttribute("stroke-linecap", "round");
        hit.setAttribute("data-shape", "arrow");
        hit.setAttribute("data-id", shape.id);
        hit.setAttribute("data-export-ignore", "true");
        if (!item.preview) {
          hit.addEventListener("mousedown", onDragStart);
          hit.addEventListener("click", onClick);
        }
        wrap.appendChild(hit);
        wrap.appendChild(line);
        wrap.appendChild(path);
      } else if (shape.type === "area") {
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("x", (x - shape.width / 2).toFixed(2));
        rect.setAttribute("y", (y - shape.height / 2).toFixed(2));
        rect.setAttribute("width", shape.width.toFixed(2));
        rect.setAttribute("height", shape.height.toFixed(2));
        rect.setAttribute("fill", shape.style.fillColor);
        rect.setAttribute("fill-opacity", shape.style.fillOpacity.toFixed(2));
        rect.setAttribute("stroke", shape.style.strokeColor);
        const areaStrokeScale = shapeStrokeScale(shape.width, shape.height);
        rect.setAttribute(
          "stroke-width",
          ((shape.style.strokeWidth * areaStrokeScale) / view.scale).toFixed(2),
        );
        rect.setAttribute("data-shape", "area");
        rect.setAttribute("data-id", shape.id);
        if (item.preview) {
          rect.setAttribute("opacity", "0.6");
          rect.setAttribute("data-preview", "true");
        }
        rect.addEventListener("click", (event) => {
          interactions.selectShape(event, shape, item.preview);
        });
        rect.addEventListener("mousedown", (event) => {
          interactions.beginShapeDrag(event, shape, item.preview);
        });
        const hit = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        hit.setAttribute("x", (x - shape.width / 2).toFixed(2));
        hit.setAttribute("y", (y - shape.height / 2).toFixed(2));
        hit.setAttribute("width", shape.width.toFixed(2));
        hit.setAttribute("height", shape.height.toFixed(2));
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("data-shape", "area");
        hit.setAttribute("data-id", shape.id);
        hit.setAttribute("data-export-ignore", "true");
        hit.addEventListener("mousedown", (event) => {
          interactions.beginShapeDrag(event, shape, item.preview);
        });
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.appendChild(hit);
        wrap.appendChild(rect);
      } else if (shape.type === "text") {
        const label = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        const scale = labelZoomScale(view.scale);
        label.setAttribute("x", x.toFixed(2));
        label.setAttribute("y", y.toFixed(2));
        label.setAttribute("fill", shape.style.textColor);
        label.setAttribute(
          "font-size",
          (shape.style.textSize * scale).toFixed(2),
        );
        label.setAttribute("font-family", shape.style.fontFamily);
        label.setAttribute("data-shape", "text");
        label.setAttribute("data-id", shape.id);
        label.textContent = shape.text ?? "文字標示";
        if (item.preview) {
          label.setAttribute("opacity", "0.6");
          label.setAttribute("data-preview", "true");
        }
        const startTextShapeDrag = (event: MouseEvent) => {
          if (activeStep !== "3" || item.preview) return;
          svg?.classList.add("shape-moving");
          interactions.beginShapeDrag(event, shape, item.preview);
        };
        label.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        label.addEventListener("mousedown", startTextShapeDrag);
        wrap.appendChild(label);

        const labelBox = label.getBBox();
        const renderedFontSize = shape.style.textSize * scale;
        const zoomStroke = 2.65 / Math.pow(Math.max(1, view.scale), 0.24);
        const textStroke = renderedFontSize * 0.045;
        const desiredScreenStroke = Math.max(
          0.85,
          Math.min(3.2, zoomStroke + textStroke),
        );
        const dragStroke =
          desiredScreenStroke / Math.max(0.001, view.scale * lastScaleFit);
        const selectionPad = Math.max(
          0.35,
          Math.min(2.4, renderedFontSize * 0.045 + dragStroke * 1.15),
        );
        const hitPad = selectionPad;
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.setAttribute("x", (labelBox.x - hitPad).toFixed(2));
        hit.setAttribute("y", (labelBox.y - hitPad).toFixed(2));
        hit.setAttribute("width", (labelBox.width + hitPad * 2).toFixed(2));
        hit.setAttribute("height", (labelBox.height + hitPad * 2).toFixed(2));
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("data-shape", "text");
        hit.setAttribute("data-id", shape.id);
        hit.setAttribute("data-export-ignore", "true");
        hit.addEventListener("mousedown", startTextShapeDrag);
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.insertBefore(hit, label);
        const isTextSelected =
          !item.preview &&
          (selectedShapeId === shape.id || shapeDrag?.shapeId === shape.id);
        if (isTextSelected) {
          insertDashedSelectionBox({
            parent: wrap,
            before: label,
            x: labelBox.x,
            y: labelBox.y,
            width: labelBox.width,
            height: labelBox.height,
            padding: selectionPad,
            strokeWidth: dragStroke,
            dataAttribute: "data-shape",
            dataValue: "text-selection",
          });
        }
      }
    }
  }
}

  return { renderMarkers, renderShapes };
}
