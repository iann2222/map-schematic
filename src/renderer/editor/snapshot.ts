import type {
  EditorDocument,
  EditorObject,
  EditorSnapshot,
  Marker,
  ShapeItem
} from "./types.js";

function cloneMarker(marker: Marker): Marker {
  return { ...marker, style: { ...marker.style } };
}

function cloneShape(shape: ShapeItem): ShapeItem {
  return { ...shape, style: { ...shape.style } };
}

function cloneEditorObject(object: EditorObject): EditorObject {
  return object.objectKind === "marker" ? cloneMarker(object) : cloneShape(object);
}

export function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return {
    objects: document.objects.map(cloneEditorObject),
    listOrderKeys: [...document.listOrderKeys],
    displayOrderKeys: [...document.displayOrderKeys]
  };
}

export function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    document: cloneEditorDocument(snapshot.document),
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
