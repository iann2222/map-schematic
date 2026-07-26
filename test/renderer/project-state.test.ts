import { describe, expect, it } from "vitest";

import {
  partitionProjectObjects,
  projectFingerprint
} from "../../src/renderer/project/project-state.js";
import type { MapProject } from "../../src/renderer/bridge.js";

function createProject(): MapProject {
  return {
    schemaVersion: "0.7",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dataPackVersion: "2026.02",
    dataPackId: "standard",
    canvas: { width: 1200, height: 800, unit: "px" },
    viewport: {
      bbox: {
        west: 120,
        south: 20,
        east: 122,
        north: 26,
        crossesAntimeridian: false
      },
      projection: "EPSG:4326"
    },
    layers: [{ id: "layer-1", name: "Default" }],
    objects: [],
    history: { historyVersion: 1, undo: [], redo: [] },
    ui: {}
  };
}

describe("renderer project state", () => {
  it("separates editable point objects from geometry that must be preserved", () => {
    const project = createProject();
    const point = {
      id: "point-1",
      type: "pointLabel" as const,
      layerId: "layer-1",
      style: {},
      geometry: { kind: "point" as const, lon: 121, lat: 25 }
    };
    const polygon = {
      id: "area-1",
      type: "areaLabel" as const,
      layerId: "layer-1",
      style: { fill: "#38bdf8" },
      geometry: {
        kind: "polygon" as const,
        rings: [[[120, 24], [122, 24], [121, 26]] as [number, number][]]
      }
    };
    project.objects = [point, polygon];

    const result = partitionProjectObjects(project.objects);

    expect(result.editablePointObjects).toEqual([point]);
    expect(result.preservedObjects).toEqual([polygon]);
    result.preservedObjects[0].style.fill = "#000000";
    expect(polygon.style.fill).toBe("#38bdf8");
  });

  it("ignores timestamps when comparing saved project content", () => {
    const first = createProject();
    const second = createProject();
    second.createdAt = "2025-01-01T00:00:00.000Z";
    second.updatedAt = "2026-07-15T00:00:00.000Z";

    expect(projectFingerprint(second)).toBe(projectFingerprint(first));

    second.ui.hillshadeEnabled = true;
    expect(projectFingerprint(second)).not.toBe(projectFingerprint(first));
  });
});
