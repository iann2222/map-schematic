export type SchemaVersion = "0.1";

export type Projection = "EPSG:3857" | "EPSG:4326";

export type CanvasUnit = "px" | "mm";

export type BBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type Canvas = {
  width: number;
  height: number;
  unit: CanvasUnit;
};

export type Viewport = {
  bbox: BBox;
  projection: Projection;
};

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  zIndex: number;
};

export type Geometry =
  | { kind: "point"; lon: number; lat: number }
  | { kind: "polygon"; rings: Array<Array<[number, number]>> }
  | { kind: "none" };

export type TextStyle = {
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type StrokeStyle = {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
};

export type FillStyle = {
  fill?: string;
  fillOpacity?: number;
};

export type Style = TextStyle & StrokeStyle & FillStyle;

export type Provenance = {
  source: "geonames" | "manual";
  sourceId?: string;
  query?: string;
};

export type MapObject = {
  id: string;
  type: "pointLabel" | "areaLabel" | "textOnly" | "arrow" | "polyline";
  layerId: string;
  style: Style;
  geometry: Geometry;
  text?: string;
  provenance?: Provenance;
};

export type MapProject = {
  schemaVersion: SchemaVersion;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  dataPackVersion: string;
  dataPackId?: string;
  canvas: Canvas;
  viewport: Viewport;
  layers: Layer[];
  objects: MapObject[];
};

export function createEmptyProject(params: {
  dataPackVersion: string;
  dataPackId?: string;
  projection?: Projection;
  canvas?: Partial<Canvas>;
  viewport?: Partial<Viewport>;
}): MapProject {
  const now = new Date().toISOString();
  const projection: Projection = params.projection ?? "EPSG:3857";
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
    schemaVersion: "0.1",
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
    objects: []
  };
}
