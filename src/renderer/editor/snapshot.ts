import type { EditorSnapshot, Marker, ShapeItem } from "./types.js";

function cloneMarker(marker: Marker): Marker {
  return { ...marker, style: { ...marker.style } };
}

function cloneShape(shape: ShapeItem): ShapeItem {
  return { ...shape, style: { ...shape.style } };
}

export function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    markers: snapshot.markers.map(cloneMarker),
    shapes: snapshot.shapes.map(cloneShape),
    listOrderKeys: [...snapshot.listOrderKeys],
    displayOrderKeys: [...snapshot.displayOrderKeys],
    selectedMarkerId: snapshot.selectedMarkerId,
    selectedShapeId: snapshot.selectedShapeId
  };
}

export function editorSnapshotsEqual(
  left: EditorSnapshot,
  right: EditorSnapshot
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
