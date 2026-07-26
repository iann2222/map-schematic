export type SchemaVersion = "0.7";

// Viewport bbox values are always longitude/latitude degrees.
export type Projection = "EPSG:4326";

export type CanvasUnit = "px" | "mm";

export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
  crossesAntimeridian: boolean;
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

export type HistoryMarkerStyle = {
  dotSize: number;
  textSize: number;
  dotColor: string;
  textColor: string;
  textOffsetX: number;
  textOffsetY: number;
  textAnchor?: "start" | "end";
  fontFamily: string;
};

export type HistoryMarkerSnapshot = {
  objectKind: "marker";
  id: string;
  layerId: string;
  name: string;
  nameAlt?: string;
  displayName?: string;
  latitude: number;
  longitude: number;
  sourceId?: string;
  style: HistoryMarkerStyle;
  sourceType: "geonames" | "coords" | "manual";
  labelMode: "name" | "coords";
  labelName?: string;
  showLabel?: boolean;
  kind?: "label" | "point";
};

export type HistoryShapeStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  textSize: number;
  fontFamily: string;
};

export type HistoryShapeSnapshot = {
  objectKind: "shape";
  id: string;
  layerId: string;
  type: "line" | "area" | "text" | "arrow";
  displayName?: string;
  longitude: number;
  latitude: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  style: HistoryShapeStyle;
};

export type HistoryObjectSnapshot =
  | HistoryMarkerSnapshot
  | HistoryShapeSnapshot;

export type StoredHistoryFieldValue =
  | { present: false }
  | { present: true; value: string | number | boolean };

export type SerializedEditorFieldChange = {
  path: [string] | ["style", string];
  before: StoredHistoryFieldValue;
  after: StoredHistoryFieldValue;
};

export type SerializedEditorCommand =
  | {
      type: "add-object";
      object: HistoryObjectSnapshot;
      objectIndex: number;
      listOrderIndex: number;
      displayOrderIndex: number;
    }
  | {
      type: "remove-object";
      object: HistoryObjectSnapshot;
      objectIndex: number;
      listOrderIndex: number;
      displayOrderIndex: number;
    }
  | {
      type: "update-object";
      objectId: string;
      objectKind: HistoryObjectSnapshot["objectKind"];
      changes: SerializedEditorFieldChange[];
    }
  | {
      type: "reorder-objects";
      mode: "list" | "display";
      before: string[];
      after: string[];
    }
  | {
      type: "clear-objects";
      objects: HistoryObjectSnapshot[];
      listOrderKeys: string[];
      displayOrderKeys: string[];
    }
  | {
      type: "batch";
      commands: SerializedEditorCommand[];
    };

export type HistoryVersion = 1;

export type ProjectHistory = {
  historyVersion: HistoryVersion;
  undo: SerializedEditorCommand[];
  redo: SerializedEditorCommand[];
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
  history: ProjectHistory;
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
