import { describe, expect, it } from "vitest";

import {
  createAddObjectCommand,
  createClearObjectsCommand,
  createRemoveObjectCommand,
  createReorderCommand,
  createUpdateObjectCommand,
} from "../../src/renderer/editor/commands.js";
import { EditorCore } from "../../src/renderer/editor/editor-core.js";
import { cloneEditorObject } from "../../src/renderer/editor/document.js";
import type {
  EditorDocument,
  Marker,
  ShapeItem,
} from "../../src/renderer/editor/types.js";

function createMarker(name = "A"): Marker {
  return {
    objectKind: "marker",
    id: "marker-1",
    layerId: "layer-1",
    name,
    latitude: 25,
    longitude: 121,
    sourceType: "manual",
    labelMode: "name",
    style: {
      dotSize: 7,
      textSize: 7,
      dotColor: "#f97316",
      textColor: "#fde68a",
      textOffsetX: 8,
      textOffsetY: -6,
      fontFamily: "sans-serif",
    },
  };
}

function createShape(): ShapeItem {
  return {
    objectKind: "shape",
    id: "shape-1",
    layerId: "layer-1",
    type: "text",
    longitude: 120,
    latitude: 24,
    width: 100,
    height: 40,
    text: "文字",
    style: {
      strokeColor: "#111111",
      strokeWidth: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.4,
      textColor: "#111111",
      textSize: 7,
      fontFamily: "sans-serif",
    },
  };
}

function createDocument(objects: EditorDocument["objects"] = []): EditorDocument {
  const keys = objects.map((object) => `${object.objectKind}:${object.id}`);
  return {
    objects,
    listOrderKeys: [...keys],
    displayOrderKeys: [...keys],
  };
}

function markerFrom(core: EditorCore): Marker {
  const object = core.document.objects.find((item) => item.id === "marker-1");
  if (!object || object.objectKind !== "marker") {
    throw new Error("Expected marker-1");
  }
  return object;
}

describe("EditorCore history", () => {
  it("adds an object and restores its order entries through undo and redo", () => {
    const core = new EditorCore(createDocument());

    expect(
      core.dispatch(createAddObjectCommand(core.document, createMarker())),
    ).toBe(true);
    expect(core.document.listOrderKeys).toEqual(["marker:marker-1"]);

    expect(core.undo()).not.toBeNull();
    expect(core.document.objects).toEqual([]);
    expect(core.document.listOrderKeys).toEqual([]);

    expect(core.redo()).not.toBeNull();
    expect(markerFrom(core).name).toBe("A");
  });

  it("records only changed object fields and handles an absent optional field", () => {
    const marker = createMarker();
    const core = new EditorCore(createDocument([marker]));
    const next = cloneEditorObject(markerFrom(core)) as Marker;
    next.displayName = "自訂名稱";
    next.style.dotSize = 12;
    const command = createUpdateObjectCommand(markerFrom(core), next);

    expect(command?.type).toBe("update-object");
    expect(command?.type === "update-object" && command.changes).toHaveLength(2);
    expect(core.dispatch(command)).toBe(true);
    expect(markerFrom(core).displayName).toBe("自訂名稱");
    expect(markerFrom(core).style.dotSize).toBe(12);

    core.undo();
    expect(
      Object.prototype.hasOwnProperty.call(markerFrom(core), "displayName"),
    ).toBe(false);
    expect(markerFrom(core).style.dotSize).toBe(7);
  });

  it("merges consecutive edits to the same field", () => {
    const core = new EditorCore(createDocument([createMarker()]), {
      mergeWindowMs: 750,
    });
    const first = cloneEditorObject(markerFrom(core)) as Marker;
    first.name = "B";
    core.dispatch(createUpdateObjectCommand(markerFrom(core), first), {
      mergeKey: "marker-1:name",
      timestamp: 1000,
    });
    const second = cloneEditorObject(markerFrom(core)) as Marker;
    second.name = "C";
    core.dispatch(createUpdateObjectCommand(markerFrom(core), second), {
      mergeKey: "marker-1:name",
      timestamp: 1500,
    });

    expect(core.undoCount).toBe(1);
    core.undo();
    expect(markerFrom(core).name).toBe("A");
    core.redo();
    expect(markerFrom(core).name).toBe("C");
  });

  it("removes a merged history entry when an edit returns to its start value", () => {
    const core = new EditorCore(createDocument([createMarker()]));
    const changed = cloneEditorObject(markerFrom(core)) as Marker;
    changed.name = "B";
    core.dispatch(createUpdateObjectCommand(markerFrom(core), changed), {
      mergeKey: "marker-1:name",
      timestamp: 1000,
    });
    const restored = cloneEditorObject(markerFrom(core)) as Marker;
    restored.name = "A";
    core.dispatch(createUpdateObjectCommand(markerFrom(core), restored), {
      mergeKey: "marker-1:name",
      timestamp: 1500,
    });

    expect(core.canUndo).toBe(false);
    expect(markerFrom(core).name).toBe("A");
  });

  it("turns live drag mutations into one reversible transaction", () => {
    const core = new EditorCore(createDocument([createMarker()]));
    core.beginTransaction();
    markerFrom(core).longitude = 122;
    markerFrom(core).latitude = 26;

    expect(core.commitTransaction()).toBe(true);
    expect(core.undoCount).toBe(1);
    core.undo();
    expect(markerFrom(core).longitude).toBe(121);
    expect(markerFrom(core).latitude).toBe(25);
  });

  it("removes and restores an object at its original positions", () => {
    const core = new EditorCore(createDocument([createMarker(), createShape()]));
    expect(
      core.dispatch(createRemoveObjectCommand(core.document, "marker-1")),
    ).toBe(true);
    expect(core.document.objects.map((object) => object.id)).toEqual(["shape-1"]);

    core.undo();
    expect(core.document.objects.map((object) => object.id)).toEqual([
      "marker-1",
      "shape-1",
    ]);
    expect(core.document.displayOrderKeys).toEqual([
      "marker:marker-1",
      "shape:shape-1",
    ]);
  });

  it("reorders and clears objects without losing undo data", () => {
    const core = new EditorCore(createDocument([createMarker(), createShape()]));
    const reversed = [...core.document.listOrderKeys].reverse();
    core.dispatch(
      createReorderCommand("list", core.document.listOrderKeys, reversed),
    );
    expect(core.document.listOrderKeys).toEqual(reversed);

    core.dispatch(createClearObjectsCommand(core.document));
    expect(core.document.objects).toEqual([]);
    core.undo();
    expect(core.document.objects).toHaveLength(2);
    expect(core.document.listOrderKeys).toEqual(reversed);
  });

  it("rejects a stale command without adding history", () => {
    const marker = createMarker();
    const core = new EditorCore(createDocument([marker]));
    const next = cloneEditorObject(marker) as Marker;
    next.name = "B";
    const command = createUpdateObjectCommand(marker, next);
    markerFrom(core).name = "outside-change";

    expect(core.dispatch(command)).toBe(false);
    expect(core.canUndo).toBe(false);
  });

  it("drops the oldest history entries at the configured limit", () => {
    const core = new EditorCore(createDocument([createMarker()]), { limit: 2 });
    for (const name of ["B", "C", "D"]) {
      const next = cloneEditorObject(markerFrom(core)) as Marker;
      next.name = name;
      core.dispatch(createUpdateObjectCommand(markerFrom(core), next));
    }

    core.undo();
    expect(markerFrom(core).name).toBe("C");
    core.undo();
    expect(markerFrom(core).name).toBe("B");
    expect(core.undo()).toBeNull();
  });

  it("replaces a loaded document and clears both history branches", () => {
    const core = new EditorCore(createDocument());
    core.dispatch(createAddObjectCommand(core.document, createMarker()));
    core.undo();

    core.replaceDocument(createDocument([createShape()]));

    expect(core.canUndo).toBe(false);
    expect(core.canRedo).toBe(false);
    expect(core.document.objects.map((object) => object.id)).toEqual(["shape-1"]);
  });
});
