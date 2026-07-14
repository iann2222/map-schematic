import type { MapObject, MapProject } from "../../src/shared/schema/mapproj";
import { createEmptyProject } from "../../src/shared/schema/mapproj";

export function createTestPointObject(overrides: Partial<MapObject> = {}): MapObject {
  return {
    id: "point-1",
    type: "pointLabel",
    layerId: "layer-1",
    style: {
      fontFamily: "sans-serif",
      fontSize: 12,
      fill: "#111827"
    },
    geometry: { kind: "point", lon: 121.5654, lat: 25.033 },
    text: "Taipei",
    provenance: { source: "manual" },
    ...overrides
  };
}

export function createTestProject(): MapProject {
  const project = createEmptyProject({
    dataPackId: "standard",
    dataPackVersion: "2026.02"
  });
  project.objects.push(createTestPointObject());
  return project;
}
