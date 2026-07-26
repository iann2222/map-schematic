import { describe, expect, it } from "vitest";

import type { MapProject } from "../../src/renderer/bridge.js";
import {
  editorDocumentToV02Objects,
  mapProjectToEditorDocument
} from "../../src/renderer/project/v02-adapter.js";

function createProject(): MapProject {
  return {
    schemaVersion: "0.4",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dataPackVersion: "2026.02",
    dataPackId: "standard",
    canvas: { width: 1200, height: 800, unit: "px" },
    viewport: {
      bbox: { minLon: 120, minLat: 20, maxLon: 122, maxLat: 26 },
      projection: "EPSG:4326"
    },
    layers: [
      {
        id: "layer-1",
        name: "Default",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 0
      },
      {
        id: "layer-labels",
        name: "Labels",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1
      }
    ],
    objects: [
      {
        id: "marker-1",
        type: "pointLabel",
        layerId: "layer-labels",
        style: {
          name: "台北",
          sourceType: "geonames",
          dotColor: "#f97316",
          textColor: "#fde68a",
          dotSize: 7,
          textSize: 7,
          textOffsetX: 8,
          textOffsetY: -6,
          fontFamily: "sans-serif",
          labelMode: "name"
        },
        geometry: { kind: "point", lon: 121.5654, lat: 25.033 },
        text: "台北",
        provenance: { source: "geonames", sourceId: "1668341" }
      },
      {
        id: "arrow-1",
        type: "arrow",
        layerId: "layer-labels",
        style: {
          shapeType: "arrow",
          width: 140,
          height: 56,
          rotation: 45,
          strokeColor: "#38bdf8",
          strokeWidth: 2,
          fillColor: "#38bdf8",
          fillOpacity: 0.35,
          textColor: "#fde68a",
          textSize: 7,
          fontFamily: "sans-serif"
        },
        geometry: { kind: "point", lon: 121, lat: 24 },
        provenance: { source: "manual", query: "shape:arrow" }
      },
      {
        id: "polygon-1",
        type: "areaLabel",
        layerId: "layer-1",
        style: { fill: "#38bdf8" },
        geometry: {
          kind: "polygon",
          rings: [[[120, 24], [122, 24], [121, 26]]]
        },
        provenance: { source: "manual" }
      }
    ],
    history: { undo: [], redo: [] },
    ui: {
      listOrderKeys: ["marker:marker-1", "shape:arrow-1"],
      displayOrderKeys: ["shape:arrow-1", "marker:marker-1"]
    }
  };
}

describe("mapproj v0.2 editor adapter", () => {
  it("loads markers and shapes into one editor document", () => {
    const loaded = mapProjectToEditorDocument(createProject());

    expect(loaded.document.objects.map((object) => object.objectKind)).toEqual([
      "marker",
      "shape"
    ]);
    expect(loaded.document.listOrderKeys).toEqual([
      "marker:marker-1",
      "shape:arrow-1"
    ]);
    const arrow = loaded.document.objects.find(
      (object) => object.objectKind === "shape" && object.id === "arrow-1"
    );
    expect(arrow?.objectKind === "shape" ? arrow.rotation : undefined).toBe(45);
    expect(loaded.preservedObjects.map((object) => object.id)).toEqual(["polygon-1"]);
    expect(loaded.document.objects.map((object) => object.layerId)).toEqual([
      "layer-labels",
      "layer-labels"
    ]);
  });

  it("round-trips editable and preserved objects without losing their type", () => {
    const loaded = mapProjectToEditorDocument(createProject());
    const saved = editorDocumentToV02Objects(
      loaded.document,
      loaded.preservedObjects
    );

    expect(saved.map((object) => [object.id, object.type])).toEqual([
      ["marker-1", "pointLabel"],
      ["arrow-1", "arrow"],
      ["polygon-1", "areaLabel"]
    ]);
    expect(saved[2]).toEqual(createProject().objects[2]);
    expect(saved[1].style.rotation).toBe(45);
    expect(saved.map((object) => object.layerId)).toEqual([
      "layer-labels",
      "layer-labels",
      "layer-1"
    ]);
  });

  it("defaults missing shape rotation to zero", () => {
    const project = createProject();
    delete project.objects[1].style.rotation;

    const loaded = mapProjectToEditorDocument(project);
    const arrow = loaded.document.objects.find(
      (object) => object.objectKind === "shape" && object.id === "arrow-1"
    );

    expect(arrow?.objectKind === "shape" ? arrow.rotation : undefined).toBe(0);
  });

  it("converts legacy negative rotation to an equivalent positive angle", () => {
    const project = createProject();
    project.objects[1].style.rotation = -90;

    const loaded = mapProjectToEditorDocument(project);
    const arrow = loaded.document.objects.find(
      (object) => object.objectKind === "shape" && object.id === "arrow-1"
    );

    expect(arrow?.objectKind === "shape" ? arrow.rotation : undefined).toBe(270);
  });
});
