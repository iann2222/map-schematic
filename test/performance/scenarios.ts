import { createEmptyProject, type MapProject, type MapObject } from "../../src/shared/schema/mapproj";

export const SCENARIO_VERSION = 1;
export const DEFAULT_COUNTS = [100, 500, 1000];

/** Fixed annotations only; the underlying map always comes from the installed official pack. */
export function createPerformanceProject(count: number, pack: { id: string; version: string }): MapProject {
  if (!Number.isInteger(count) || count < 5 || count > 5000) {
    throw new RangeError("Object count must be an integer between 5 and 5000");
  }
  const project = createEmptyProject({ dataPackId: pack.id, dataPackVersion: pack.version });
  project.createdAt = project.updatedAt = "2026-01-01T00:00:00.000Z";
  project.ui = { activeStyleId: "styleOriginal", hillshadeEnabled: false };
  const types: MapObject["type"][] = ["pointLabel", "textOnly", "polyline", "arrow", "areaLabel"];
  const shapes = { textOnly: "text", polyline: "line", arrow: "arrow", areaLabel: "area" } as const;
  project.objects = Array.from({ length: count }, (_, index): MapObject => {
    const type = types[index % types.length];
    const name = index === 0 ? "Drag target" : index % 7 === 0
      ? `Long annotation ${index}: fixed-width benchmark text covering several words and numbers 0123456789`
      : `Item ${index}`;
    // Reserve the southern part of the map for an unobstructed drag target.
    const lon = index === 0 ? 0 : (index % 2 === 0 ? -1 : 1) * (25 + (index * 17 % 120));
    const lat = index === 0 ? -65 : 20 + (index * 13 % 40);
    return {
      id: `bench-${index}`, type, layerId: "layer-1",
      geometry: { kind: "point", lon, lat }, text: name,
      provenance: { source: "manual", query: type === "pointLabel" ? "manual" : `shape:${shapes[type]}` },
      style: type === "pointLabel" ? {
        name, sourceType: "manual", kind: "point", labelMode: "name", labelName: name,
        showLabel: true, dotSize: 6, textSize: 10, dotColor: "#f97316",
        textColor: "#111827", textOffsetX: 10, textOffsetY: -8, fontFamily: "sans-serif",
      } : {
        shapeType: shapes[type], width: 48, height: type === "polyline" ? 0 : 28,
        rotation: index % 360, strokeColor: "#2563eb", strokeWidth: 2,
        fillColor: "#22c55e", fillOpacity: 0.25, textColor: "#111827",
        textSize: 10, fontFamily: "sans-serif",
      },
    };
  });
  return project;
}
