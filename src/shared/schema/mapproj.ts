import type {
  Canvas,
  MapProject,
  Projection,
  SchemaVersion,
  Viewport
} from "./mapproj-contract";
import { createEmptyProjectHistory } from "./history";

export type * from "./mapproj-contract";

export const CURRENT_SCHEMA_VERSION = "0.7" as const satisfies SchemaVersion;

export function createEmptyProject(params: {
  dataPackVersion: string;
  dataPackId?: string;
  projection?: Projection;
  canvas?: Partial<Canvas>;
  viewport?: Partial<Viewport>;
}): MapProject {
  const now = new Date().toISOString();
  const projection: Projection = params.projection ?? "EPSG:4326";
  const canvas: Canvas = {
    width: params.canvas?.width ?? 1200,
    height: params.canvas?.height ?? 800,
    unit: params.canvas?.unit ?? "px"
  };
  const viewport: Viewport = {
    bbox: params.viewport?.bbox ?? {
      west: -180,
      south: -85,
      east: 180,
      north: 85,
      crossesAntimeridian: false
    },
    projection
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    dataPackVersion: params.dataPackVersion,
    dataPackId: params.dataPackId,
    canvas,
    viewport,
    layers: [
      {
        id: "layer-1",
        name: "Default"
      }
    ],
    objects: [],
    history: createEmptyProjectHistory(),
    ui: {}
  };
}
