import type {
  EditorDocument,
  EditorObject,
  Marker,
  ShapeItem,
} from "./types.js";

function cloneMarker(marker: Marker): Marker {
  return { ...marker, style: { ...marker.style } };
}

function cloneShape(shape: ShapeItem): ShapeItem {
  return { ...shape, style: { ...shape.style } };
}

export function cloneEditorObject(object: EditorObject): EditorObject {
  return object.objectKind === "marker" ? cloneMarker(object) : cloneShape(object);
}

export function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return {
    objects: document.objects.map(cloneEditorObject),
    listOrderKeys: [...document.listOrderKeys],
    displayOrderKeys: [...document.displayOrderKeys],
  };
}
