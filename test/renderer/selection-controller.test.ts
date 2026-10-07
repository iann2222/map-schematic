import { describe, expect, it, vi } from "vitest";
import { createAppState } from "../../src/renderer/app-state.js";
import { SelectionController } from "../../src/renderer/controllers/selection-controller.js";
import { EditorCore } from "../../src/renderer/editor/editor-core.js";
import type { Marker, ShapeItem } from "../../src/renderer/editor/types.js";

describe("SelectionController drag transactions", () => {
  it.each(["marker", "shape", "label"] as const)("routes %s dragging through EditorCore", (kind) => {
    const marker: Marker = {
      objectKind: "marker", id: "m", layerId: "layer-1", name: "A",
      longitude: 0, latitude: 0, sourceType: "manual", labelMode: "name",
      style: { dotSize: 7, textSize: 7, dotColor: "#ffffff", textColor: "#ffffff",
        textOffsetX: 8, textOffsetY: -6, fontFamily: "sans-serif" },
    };
    const shape: ShapeItem = {
      objectKind: "shape", id: "s", layerId: "layer-1", type: "area",
      longitude: 0, latitude: 0, width: 100, height: 40, text: "A",
      style: { strokeColor: "#ffffff", strokeWidth: 2, fillColor: "#ffffff",
        fillOpacity: 0.4, textColor: "#ffffff", textSize: 7, fontFamily: "sans-serif" },
    };
    const core = new EditorCore({ objects: [marker, shape], listOrderKeys: [], displayOrderKeys: [] });
    const before = JSON.stringify(core.document);
    const state = createAppState().selection;
    const start = { startX: 0, startY: 0, startLon: 0, startLat: 0 };
    if (kind === "marker") state.markerDrag = { ...start, markerId: "m" };
    if (kind === "shape") state.shapeDrag = { ...start, shapeId: "s" };
    if (kind === "label") state.labelDrag = {
      markerId: "m", startX: 0, startY: 0, startOffsetX: 8, startOffsetY: -6,
    };
    const updateTransactionObject = vi.fn((id, update) => core.updateTransactionObject(id, update));
    const requestMapObjects = vi.fn();
    const renderMapObjects = vi.fn();
    const controller = new SelectionController({
      state, getActiveStep: () => "3",
      getMarkers: () => core.document.objects.filter((object): object is Marker => object.objectKind === "marker"),
      getShapes: () => core.document.objects.filter((object): object is ShapeItem => object.objectKind === "shape"),
      clearToolPreviews: vi.fn(), clearMarkerPreview: vi.fn(), setActiveTool: vi.fn(),
      syncMarkerInspector: vi.fn(), syncShapeInspector: vi.fn(), syncItemName: vi.fn(),
      updateMarkerStyles: vi.fn(), renderMapObjects, requestMapObjects, renderObjectList: vi.fn(),
      updateMarker: vi.fn(), updateShape: vi.fn(),
      getMapMetrics: () => ({ scale: 1, scaleFit: 1, width: 1200, height: 800 }),
      mapPointFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      commitTransaction: () => { core.commitTransaction(); }, updateTransactionObject,
      hasOpenModal: () => false, mapElement: null,
    });
    core.beginTransaction();
    for (const clientX of [10, 20]) {
      expect(controller.moveDrag({ clientX, clientY: 10 } as MouseEvent)).toBe(true);
    }
    expect(updateTransactionObject).toHaveBeenCalledTimes(2);
    expect(requestMapObjects).toHaveBeenCalledTimes(2);
    expect(renderMapObjects).not.toHaveBeenCalled();
    expect(JSON.stringify(core.document)).not.toBe(before);
    expect(core.undoCount).toBe(0);
    expect(controller.finishDrag()).toBe(true);
    expect(renderMapObjects).toHaveBeenCalledTimes(1);
    expect(core.undoCount).toBe(1);
    core.undo();
    expect(JSON.stringify(core.document)).toBe(before);
    expect(controller.finishDrag()).toBe(false);
  });
});
