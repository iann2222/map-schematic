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

export function normalizeEditorOrders(document: EditorDocument): void {
  const keys = document.objects.map((object) => `${object.objectKind}:${object.id}`);
  const valid = new Set(keys);
  const normalize = (source: string[]): string[] => {
    const seen = new Set<string>();
    return [...source, ...keys].filter((key) => {
      if (!valid.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  document.listOrderKeys = normalize(document.listOrderKeys);
  document.displayOrderKeys = normalize(document.displayOrderKeys);
}
