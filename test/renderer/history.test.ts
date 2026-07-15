import { describe, expect, it } from "vitest";

import { HistoryManager } from "../../src/renderer/editor/history.js";
import {
  cloneEditorSnapshot,
  editorSnapshotsEqual
} from "../../src/renderer/editor/snapshot.js";
import type { EditorSnapshot } from "../../src/renderer/editor/types.js";

function createSnapshot(name = "A"): EditorSnapshot {
  return {
    markers: [
      {
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
    shapes: [],
    listOrderKeys: ["marker:marker-1"],
    displayOrderKeys: ["marker:marker-1"],
    selectedMarkerId: "marker-1",
    selectedShapeId: null
  };
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

    expect(history.undo()?.markers[0].name).toBe("A");
    expect(history.canRedo).toBe(true);
    expect(history.redo()?.markers[0].name).toBe("B");
  });

  it("clears the redo branch after a new edit", () => {
    const history = createHistory();
    history.record(createSnapshot("A"), createSnapshot("B"));
    history.undo();
    history.record(createSnapshot("A"), createSnapshot("C"));

    expect(history.canRedo).toBe(false);
    expect(history.undo()?.markers[0].name).toBe("A");
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
    expect(history.undo()?.markers[0].name).toBe("A");
    expect(history.redo()?.markers[0].name).toBe("C");
  });

  it("keeps snapshots isolated from later mutations", () => {
    const history = createHistory();
    const before = createSnapshot("A");
    const after = createSnapshot("B");
    history.record(before, after);
    before.markers[0].name = "changed-before";
    after.markers[0].style.dotSize = 99;

    expect(history.undo()?.markers[0].name).toBe("A");
    expect(history.redo()?.markers[0].style.dotSize).toBe(7);
  });

  it("drops the oldest entries after reaching the limit", () => {
    const history = createHistory(2);
    history.record(createSnapshot("A"), createSnapshot("B"));
    history.record(createSnapshot("B"), createSnapshot("C"));
    history.record(createSnapshot("C"), createSnapshot("D"));

    expect(history.undo()?.markers[0].name).toBe("C");
    expect(history.undo()?.markers[0].name).toBe("B");
    expect(history.undo()).toBeNull();
  });
});
