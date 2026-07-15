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
  id: string;
  type: "line" | "area" | "text" | "arrow";
  displayName?: string;
  longitude: number;
  latitude: number;
  width: number;
  height: number;
  text?: string;
  style: ShapeStyle;
};

export type EditorSnapshot = {
  markers: Marker[];
  shapes: ShapeItem[];
  listOrderKeys: string[];
  displayOrderKeys: string[];
  selectedMarkerId: string | null;
  selectedShapeId: string | null;
};
