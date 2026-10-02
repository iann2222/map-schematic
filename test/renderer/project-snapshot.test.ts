import { describe, expect, it, vi } from "vitest";
import { createEditorProject } from "../fixtures/editor-project.js";
import { createAddObjectCommand, createUpdateObjectCommand, createReorderCommand } from "../../src/renderer/editor/commands.js";
import { cloneEditorObject } from "../../src/renderer/editor/document.js";
import { validateProject } from "../../src/shared/schema/validate.js";

describe("ProjectSnapshot", () => {
  it("ignores property insertion order when undo restores an optional field", () => {
    const { snapshot, core } = createEditorProject();
    let next = cloneEditorObject(core.document.objects[0]);
    next.displayName = "Custom";
    core.dispatch(createUpdateObjectCommand(core.document.objects[0], next));
    const saved = snapshot.fingerprint();
    next = cloneEditorObject(core.document.objects[0]);
    delete next.displayName;
    core.dispatch(createUpdateObjectCommand(core.document.objects[0], next));
    expect(snapshot.fingerprint()).not.toBe(saved);
    core.undo();
    expect(snapshot.fingerprint()).toBe(saved);
  });
  it("does not rebuild objects or export history during dirty checks", () => {
    const { snapshot, core } = createEditorProject();
    const exportHistory = vi.spyOn(core, "exportHistory");
    const build = vi.spyOn(snapshot, "build");
    const saved = snapshot.fingerprint();
    const stringify = vi.spyOn(JSON, "stringify");
    for (let i = 0;i < 10;i++) expect(snapshot.fingerprint()).toBe(saved);
    expect(stringify.mock.calls.some(([value]) => value === core.document)).toBe(false);
    stringify.mockRestore();
    expect(build).not.toHaveBeenCalled();
    expect(exportHistory).not.toHaveBeenCalled();
    const next = cloneEditorObject(core.document.objects[0]);
    if (next.objectKind === "marker") next.name = "B";
    core.dispatch(createUpdateObjectCommand(core.document.objects[0], next));
    expect(snapshot.fingerprint()).not.toBe(saved);
    core.undo();
    expect(snapshot.fingerprint()).toBe(saved);
    core.redo();
    expect(snapshot.fingerprint()).not.toBe(saved);
    expect(exportHistory).not.toHaveBeenCalled();
    expect(validateProject(snapshot.build()).valid).toBe(true);
    snapshot.build();
    expect(exportHistory).toHaveBeenCalledOnce();
  });

  it("invalidates live drag content without exporting history until commit", () => {
    const { snapshot, core } = createEditorProject();
    const saved = snapshot.fingerprint();
    const revision = core.historyRevision;
    core.beginTransaction();
    core.updateTransactionObject("m", (draft) => { draft.longitude = 122; });
    expect(snapshot.fingerprint()).not.toBe(saved);
    expect(core.historyRevision).toBe(revision);
    core.cancelTransaction(true);
    expect(snapshot.fingerprint()).toBe(saved);
  });

  it("detects canvas, crop, style, relief, data version and ordering changes", () => {
    const { snapshot, crop, basemap, state, core } = createEditorProject();
    const second = cloneEditorObject(core.document.objects[0]);
    second.id = "second";
    core.dispatch(createAddObjectCommand(core.document, second));
    const initial = snapshot.fingerprint();
    crop.projectCanvas.width = 1400;
    expect(snapshot.fingerprint()).not.toBe(initial);
    crop.projectCanvas.width = 1200;
    expect(snapshot.fingerprint()).toBe(initial);
    crop.bbox = { x: 10, y: 10, width: 100, height: 100 };
    expect(snapshot.fingerprint()).not.toBe(initial);
    crop.bbox = null;
    basemap.activeStyleId = "styleDark";
    expect(snapshot.fingerprint()).not.toBe(initial);
    basemap.activeStyleId = "styleOriginal";
    basemap.reliefEnabled = true;
    expect(snapshot.fingerprint()).not.toBe(initial);
    basemap.reliefEnabled = false;
    state.datapack.version = "2026.03";
    expect(snapshot.fingerprint()).not.toBe(initial);
    state.datapack.version = "2026.02";
    core.dispatch(createReorderCommand("display", core.document.displayOrderKeys, [...core.document.displayOrderKeys].reverse()));
    expect(snapshot.fingerprint()).not.toBe(initial);
  });

  it("preserves unsupported geometry and reloads saved commands", () => {
    const { snapshot, core, state } = createEditorProject();
    const next = cloneEditorObject(core.document.objects[0]);
    if (next.objectKind === "marker") next.name = "B";
    core.dispatch(createUpdateObjectCommand(core.document.objects[0], next));
    const project = snapshot.build()!;
    project.objects.push({
      id: "polygon", layerId: "layer-1", type: "areaLabel", style: {},
      geometry: { kind: "polygon", rings: [[[120, 24], [122, 24], [121, 26]]] }
    });
    state.project.current = project;
    expect(snapshot.apply(project)).toEqual({ historyRestored: true, preservedObjectCount: 1 });
    expect(snapshot.build()!.objects.at(-1)).toEqual(project.objects.at(-1));
    core.undo();
    expect(core.document.objects[0]).toMatchObject({ name: "A" });
    core.redo();
    expect(core.document.objects[0]).toMatchObject({ name: "B" });
  });
});
