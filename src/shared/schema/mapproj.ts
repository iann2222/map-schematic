import type {
  Canvas,
  MapProject,
  Projection,
  SchemaVersion,
  Viewport
} from "./mapproj-contract";

export type * from "./mapproj-contract";

export const CURRENT_SCHEMA_VERSION = "0.4" as const satisfies SchemaVersion;

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
    width: params.canvas?.width ?? 1280,
    height: params.canvas?.height ?? 720,
    unit: params.canvas?.unit ?? "px"
  };
  const viewport: Viewport = {
    bbox: params.viewport?.bbox ?? {
      minLon: -180,
      minLat: -85,
      maxLon: 180,
      maxLat: 85
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
        name: "Default",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 0
      }
    ],
    objects: [],
    history: { undo: [], redo: [] },
    ui: {}
  };
}
