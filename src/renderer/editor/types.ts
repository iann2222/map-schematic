import type {
  HistoryMarkerSnapshot,
  HistoryMarkerStyle,
  HistoryObjectSnapshot,
  HistoryShapeSnapshot,
  HistoryShapeStyle,
} from "../../shared/schema/mapproj-contract.js";

export type MarkerStyle = HistoryMarkerStyle;
export type Marker = HistoryMarkerSnapshot;
export type ShapeStyle = HistoryShapeStyle;
export type ShapeItem = HistoryShapeSnapshot;
export type EditorObject = HistoryObjectSnapshot;

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
