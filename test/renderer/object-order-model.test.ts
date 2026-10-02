import { describe, expect, it } from "vitest";

import type { EditorDocument, Marker, ShapeItem } from "../../src/renderer/editor/types.js";
import {
  markerOrderKey,
  ObjectOrderModel,
  shapeOrderKey,
} from "../../src/renderer/overlay/object-order-model.js";
import {
  defaultMarkerStyle,
  defaultShapeStyle,
} from "../../src/renderer/editor/defaults.js";
import { EditorCore } from "../../src/renderer/editor/editor-core.js";

function marker(id: string, name: string): Marker {
  return {
    objectKind: "marker",
    id,
    layerId: "layer-1",
    name,
    latitude: 0,
    longitude: 0,
    sourceType: "manual",
    labelMode: "name",
    showLabel: true,
    kind: "point",
    style: defaultMarkerStyle(),
  };
}

function shape(id: string): ShapeItem {
  return {
    objectKind: "shape",
    id,
    layerId: "layer-1",
    type: "line",
    latitude: 1,
    longitude: 1,
    width: 100,
    height: 20,
    rotation: 0,
    style: defaultShapeStyle("line"),
  };
}

describe("ObjectOrderModel", () => {
  it("normalizes stale order keys and appends missing objects", () => {
    const firstMarker = marker("m1", "台北");
    const secondMarker = marker("m2", "台北");
    const line = shape("s1");
    const document: EditorDocument = {
      objects: [firstMarker, secondMarker, line],
      listOrderKeys: ["missing", markerOrderKey("m2"), markerOrderKey("m2")],
      displayOrderKeys: [],
    };
    const core = new EditorCore(document);
    const model = new ObjectOrderModel({
      document: core.document,
      getMarkers: () => [firstMarker, secondMarker],
      getShapes: () => [line],
    });

    expect(core.document.listOrderKeys).toEqual([
      markerOrderKey("m2"),
      markerOrderKey("m1"),
      shapeOrderKey("s1"),
    ]);
    expect(core.document.displayOrderKeys).toEqual([
      markerOrderKey("m1"),
      markerOrderKey("m2"),
      shapeOrderKey("s1"),
    ]);
    expect(model.items().map((item) => item.name)).toEqual([
      "台北",
      "台北 (2)",
      "線段1",
    ]);
    const before = JSON.stringify(core.document);
    model.displayRanks();
    model.items();
    model.shapeNames();
    expect(JSON.stringify(core.document)).toBe(before);
  });
});
