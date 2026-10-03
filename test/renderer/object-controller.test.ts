import { describe, expect, it, vi } from "vitest";
import { createObjectController } from "../../src/renderer/controllers/object-controller.js";
import { ObjectOrderModel } from "../../src/renderer/overlay/object-order-model.js";
import { isMarker, isShape } from "../../src/renderer/editor/types.js";
import { createEditorProject } from "../fixtures/editor-project.js";
import type { ModalManager, ModalOptions } from "../../src/renderer/ui/modal-manager.js";

function setup(withCoordinateDialog = false) {
  const fixture = createEditorProject();
  const { core, state } = fixture;
  const order = new ObjectOrderModel({
    document: core.document,
    getMarkers: () => core.document.objects.filter(isMarker), getShapes: () => core.document.objects.filter(isShape)
  });
  const cancel = { onclick: null as (() => void) | null, click() { this.onclick?.(); } };
  const save = { onclick: null as (() => void) | null };
  const label = { value: "", select: vi.fn() };
  const modal = { querySelectorAll: () => [], querySelector: () => ({ value: "name" }) };
  const elements: Record<string, unknown> = { coordEditModal: modal, coordEditSave: save, coordEditCancel: cancel, coordLabelInput: label };
  const root = { getElementById: (id: string) => withCoordinateDialog ? elements[id] ?? null : null, querySelectorAll: () => [] } as unknown as Document;
  const open = vi.fn((_element: HTMLElement | null, _options: ModalOptions) => {});
  const close = vi.fn();
  const controller = createObjectController({
    modals: { open, close } as unknown as ModalManager,
    core, state: state.objects, selectionState: state.selection, order, root,
    getActiveStep: () => "3", getDefaultLayerId: () => "layer-1", getViewCenter: () => [481, 25],
    getVisibleBounds: () => null, getScale: () => 1, mapWidth: 1200, mapHeight: 800,
    selectMarker: vi.fn(), selectShape: vi.fn(), renderMapObjects: vi.fn(), renderObjectList: vi.fn(),
    syncMarkerInspector: vi.fn(), syncShapeInspector: vi.fn(), syncItemName: vi.fn(), setStatus: vi.fn()
  });
  return { ...fixture, controller, open, close, label, save, cancel, modal };
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
  it("cancels coordinate editing through the modal dismiss callback without changing history", () => {
    const s = setup(true);
    const marker = s.core.document.objects.filter(isMarker)[0];
    s.controller.openCoordEditor(marker);
    expect(s.label.select).toHaveBeenCalledOnce();
    expect(s.open.mock.calls[0][1].initialFocus?.()).toBe(s.label);
    s.label.value = "Not saved";
    s.open.mock.calls[0][1].onDismiss();
    expect(s.state.objects.editingCoordMarker).toBeNull();
    expect(s.close).toHaveBeenCalledWith(s.modal);
    expect(s.core.undoCount).toBe(0);
    expect(marker.labelName).toBeUndefined();
  });
  it("saves coordinate label editing as one reversible command and closes the modal", () => {
    const s = setup(true);
    const marker = s.core.document.objects.filter(isMarker)[0];
    s.controller.openCoordEditor(marker);
    s.label.value = "New label";
    s.save.onclick?.();
    expect(s.close).toHaveBeenCalledWith(s.modal);
    expect(s.core.document.objects.filter(isMarker)[0].labelName).toBe("New label");
    expect(s.core.undoCount).toBe(1);
    s.core.undo();
    expect(s.core.document.objects.filter(isMarker)[0].labelName).toBeUndefined();
  });
});
