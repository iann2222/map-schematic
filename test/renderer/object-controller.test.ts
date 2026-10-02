import { describe, expect, it, vi } from "vitest";
import { createObjectController } from "../../src/renderer/controllers/object-controller.js";
import { ObjectOrderModel } from "../../src/renderer/overlay/object-order-model.js";
import { isMarker, isShape } from "../../src/renderer/editor/types.js";
import { createEditorProject } from "../fixtures/editor-project.js";

function setup() {
  const fixture = createEditorProject();
  const { core, state } = fixture;
  const order = new ObjectOrderModel({
    document: core.document,
    getMarkers: () => core.document.objects.filter(isMarker), getShapes: () => core.document.objects.filter(isShape)
  });
  const root = { getElementById: () => null, querySelectorAll: () => [] } as unknown as Document;
  const controller = createObjectController({
    core, state: state.objects, selectionState: state.selection, order, root,
    getActiveStep: () => "3", getDefaultLayerId: () => "layer-1", getViewCenter: () => [481, 25],
    getVisibleBounds: () => null, getScale: () => 1, mapWidth: 1200, mapHeight: 800,
    selectMarker: vi.fn(), selectShape: vi.fn(), renderMapObjects: vi.fn(), renderObjectList: vi.fn(),
    syncMarkerInspector: vi.fn(), syncShapeInspector: vi.fn(), syncItemName: vi.fn(), setStatus: vi.fn()
  });
  return { ...fixture, controller };
}

describe("ObjectController operations", () => {
  it("keeps tool previews outside the document and history", () => {
    const { controller, snapshot, core, state } = setup();
    const baseline = snapshot.fingerprint();
    controller.setActiveTool("area");
    expect(state.objects.previewShape).toMatchObject({ type: "area", longitude: 121 });
    expect(snapshot.fingerprint()).toBe(baseline);
    expect(core.undoCount).toBe(0);
    controller.resetTransient();
    expect(state.objects.previewShape).toBeNull();
  });

  it("adds, edits and deletes through reversible Core commands", () => {
    const { controller, core } = setup();
    controller.addToolItem("marker");
    const marker = core.document.objects.filter(isMarker).at(-1)!;
    expect(marker).toMatchObject({ name: "點標示1", longitude: 121 });
    expect(core.undoCount).toBe(1);
    controller.updateMarkerObject(marker, (draft) => { draft.name = "Renamed"; });
    controller.deleteMarker(marker.id);
    expect(core.document.objects).toHaveLength(1);
    core.undo();
    expect(core.document.objects.at(-1)).toMatchObject({ name: "Renamed" });
    core.undo();
    expect(core.document.objects.at(-1)).toMatchObject({ name: "點標示1" });
    core.undo();
    expect(core.document.objects).toHaveLength(1);
  });

  it("retains list and display order when clearing and undoing", () => {
    const { controller, core } = setup();
    controller.addToolItem("arrow");
    const before = JSON.stringify(core.document);
    controller.handleClearMarkers();
    expect(core.document.objects).toHaveLength(0);
    core.undo();
    expect(JSON.stringify(core.document)).toBe(before);
  });
});
