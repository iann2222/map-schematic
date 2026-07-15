export type SchemaVersion = "0.2";

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
  textOffsetX?: number;
  textOffsetY?: number;
  labelMode?: "name" | "coords";
  labelName?: string;
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
  style: Style & Record<string, unknown>;
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
  ui: {
    listOrderKeys?: string[];
    displayOrderKeys?: string[];
    activeStyleId?: string;
    hillshadeEnabled?: boolean;
    hillshadeBlend?: string;
    ratioMode?: "free" | "fixed";
    activeRatioId?: string;
    cropRatio?: number;
    customRatioA?: number;
    customRatioB?: number;
  };
};
