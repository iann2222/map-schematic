import { describe, expect, it } from "vitest";

import { HistoryManager } from "../../src/renderer/editor/history.js";
import {
  cloneEditorSnapshot,
  editorSnapshotsEqual
} from "../../src/renderer/editor/snapshot.js";
import type {
  EditorSnapshot,
  Marker
} from "../../src/renderer/editor/types.js";

function createSnapshot(name = "A"): EditorSnapshot {
  return {
    document: {
      objects: [
        {
          objectKind: "marker",
          id: "marker-1",
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
            fontFamily: "sans-serif"
          }
        }
      ],
      listOrderKeys: ["marker:marker-1"],
      displayOrderKeys: ["marker:marker-1"]
    },
    selectedMarkerId: "marker-1",
    selectedShapeId: null
  };
}

function firstMarker(snapshot: EditorSnapshot | null): Marker {
  const object = snapshot?.document.objects[0];
  if (!object || object.objectKind !== "marker") {
    throw new Error("Expected first editor object to be a marker");
  }
  return object;
}

function createHistory(limit = 100): HistoryManager<EditorSnapshot> {
  return new HistoryManager({
    clone: cloneEditorSnapshot,
    equals: editorSnapshotsEqual,
    limit,
    mergeWindowMs: 750
  });
}

describe("renderer history", () => {
  it("ignores changes that do not alter editor state", () => {
    const history = createHistory();
    const snapshot = createSnapshot();

    expect(history.record(snapshot, cloneEditorSnapshot(snapshot))).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it("undoes and redoes a recorded change", () => {
    const history = createHistory();
    history.record(createSnapshot("A"), createSnapshot("B"));

    expect(firstMarker(history.undo()).name).toBe("A");
    expect(history.canRedo).toBe(true);
    expect(firstMarker(history.redo()).name).toBe("B");
  });

  it("clears the redo branch after a new edit", () => {
    const history = createHistory();
    history.record(createSnapshot("A"), createSnapshot("B"));
    history.undo();
    history.record(createSnapshot("A"), createSnapshot("C"));

    expect(history.canRedo).toBe(false);
    expect(firstMarker(history.undo()).name).toBe("A");
  });

  it("merges consecutive edits with the same key", () => {
    const history = createHistory();
    history.record(createSnapshot("A"), createSnapshot("B"), {
      mergeKey: "marker-1:name",
      timestamp: 1000
    });
    history.record(createSnapshot("B"), createSnapshot("C"), {
      mergeKey: "marker-1:name",
      timestamp: 1500
    });

    expect(history.undoCount).toBe(1);
    expect(firstMarker(history.undo()).name).toBe("A");
    expect(firstMarker(history.redo()).name).toBe("C");
  });

  it("keeps snapshots isolated from later mutations", () => {
    const history = createHistory();
    const before = createSnapshot("A");
    const after = createSnapshot("B");
    history.record(before, after);
    firstMarker(before).name = "changed-before";
    firstMarker(after).style.dotSize = 99;

    expect(firstMarker(history.undo()).name).toBe("A");
    expect(firstMarker(history.redo()).style.dotSize).toBe(7);
  });

  it("drops the oldest entries after reaching the limit", () => {
    const history = createHistory(2);
    history.record(createSnapshot("A"), createSnapshot("B"));
    history.record(createSnapshot("B"), createSnapshot("C"));
    history.record(createSnapshot("C"), createSnapshot("D"));

    expect(firstMarker(history.undo()).name).toBe("C");
    expect(firstMarker(history.undo()).name).toBe("B");
    expect(history.undo()).toBeNull();
  });
});
