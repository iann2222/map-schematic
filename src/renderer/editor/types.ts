export type MarkerStyle = {
  dotSize: number;
  textSize: number;
  dotColor: string;
  textColor: string;
  textOffsetX: number;
  textOffsetY: number;
  textAnchor?: "start" | "end";
  fontFamily: string;
};

export type Marker = {
  objectKind: "marker";
  id: string;
  name: string;
  nameAlt?: string;
  displayName?: string;
  latitude: number;
  longitude: number;
  sourceId?: string;
  style: MarkerStyle;
  sourceType: "geonames" | "coords" | "manual";
  labelMode: "name" | "coords";
  labelName?: string;
  showLabel?: boolean;
  kind?: "label" | "point";
};

export type ShapeStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  textSize: number;
  fontFamily: string;
};

export type ShapeItem = {
  objectKind: "shape";
  id: string;
  type: "line" | "area" | "text" | "arrow";
  displayName?: string;
  longitude: number;
  latitude: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  style: ShapeStyle;
};

export type EditorObject = Marker | ShapeItem;

export type EditorDocument = {
  objects: EditorObject[];
  listOrderKeys: string[];
  displayOrderKeys: string[];
};

export function isMarker(object: EditorObject): object is Marker {
  return object.objectKind === "marker";
}

export function isShape(object: EditorObject): object is ShapeItem {
  return object.objectKind === "shape";
}
