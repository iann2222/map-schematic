import type { EditorDocument, Marker, ShapeItem } from "../editor/types.js";
import type { OrderDialogItem } from "../controllers/order-dialog-controller.js";

export function markerListName(marker: Marker): string {
  if (marker.displayName?.trim()) {
    return marker.displayName.trim();
  }
  if (marker.sourceType === "coords") {
    return marker.labelName?.trim() || marker.name || "座標標示";
  }
  if (marker.kind === "point") {
    return marker.name;
  }
  if (marker.nameAlt && marker.nameAlt !== marker.name) {
    return `${marker.name} / ${marker.nameAlt}`;
  }
  return marker.name;
}

export function shapeDefaultName(shape: ShapeItem, index: number): string {
  const labels: Record<ShapeItem["type"], string> = {
    line: "線段",
    area: "區域",
    text: "文字",
    arrow: "箭頭",
  };
  if (shape.type === "text" && shape.text?.trim()) {
    const text = shape.text.trim();
    if (!/^文字標示\d*$/.test(text)) {
      return text;
    }
  }
  return `${labels[shape.type]}${index}`;
}

export function markerOrderKey(markerId: string): string {
  return `marker:${markerId}`;
}

export function shapeOrderKey(shapeId: string): string {
  return `shape:${shapeId}`;
}

function markerIdentity(marker: {
  name: string;
  latitude: number;
  longitude: number;
}): string {
  return `${marker.name}|${marker.latitude.toFixed(6)}|${marker.longitude.toFixed(6)}`;
}

function shapeIdentity(shape: {
  type: ShapeItem["type"];
  text?: string;
  latitude: number;
  longitude: number;
}): string {
  return `${shape.type}|${shape.text ?? ""}|${shape.latitude.toFixed(6)}|${shape.longitude.toFixed(6)}`;
}

function uniqueNames(
  entries: Array<{ key: string; name: string }>,
): Map<string, string> {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  entries.forEach(({ key, name }) => {
    const baseName = name.trim() || "標示";
    const count = (counts.get(baseName) ?? 0) + 1;
    counts.set(baseName, count);
    names.set(key, count === 1 ? baseName : `${baseName} (${count})`);
  });
  return names;
}

export class ObjectOrderModel {
  private readonly document: EditorDocument;
  private readonly getMarkers: () => Marker[];
  private readonly getShapes: () => ShapeItem[];

  constructor(options: {
    document: EditorDocument;
    getMarkers: () => Marker[];
    getShapes: () => ShapeItem[];
  }) {
    this.document = options.document;
    this.getMarkers = options.getMarkers;
    this.getShapes = options.getShapes;
  }

  items(): OrderDialogItem[] {
    const markers = this.getMarkers();
    const shapes = this.getShapes();
    const shapeNames = this.shapeNames(shapes);
    const names = uniqueNames([
      ...markers.map((marker) => ({
        key: markerOrderKey(marker.id),
        name: markerListName(marker),
      })),
      ...shapes.map((shape) => ({
        key: shapeOrderKey(shape.id),
        name: shapeNames.get(shape.id) ?? "標示",
      })),
    ]);
    return [
      ...markers.map((marker) => ({
        key: markerOrderKey(marker.id),
        name:
          names.get(markerOrderKey(marker.id)) ?? markerListName(marker),
      })),
      ...shapes.map((shape) => ({
        key: shapeOrderKey(shape.id),
        name: names.get(shapeOrderKey(shape.id)) ?? "標示",
      })),
    ];
  }

  normalize(): void {
    const items = this.items();
    const valid = new Set(items.map((item) => item.key));
    const normalizeKeys = (source: string[]): string[] =>
      source.filter(
        (key, index) => valid.has(key) && source.indexOf(key) === index,
      );
    const listOrder = normalizeKeys(this.document.listOrderKeys);
    const displayOrder = normalizeKeys(this.document.displayOrderKeys);
    items.forEach(({ key }) => {
      if (!listOrder.includes(key)) {
        listOrder.push(key);
      }
      if (!displayOrder.includes(key)) {
        displayOrder.push(key);
      }
    });
    this.document.listOrderKeys = listOrder;
    this.document.displayOrderKeys = displayOrder;
  }

  displayRanks(): Map<string, number> {
    this.normalize();
    return new Map(
      this.document.displayOrderKeys.map((key, index) => [key, index]),
    );
  }

  shapeNames(shapes = this.getShapes()): Map<string, string> {
    const names = new Map<string, string>();
    const counters: Record<ShapeItem["type"], number> = {
      line: 0,
      area: 0,
      text: 0,
      arrow: 0,
    };
    shapes.forEach((shape) => {
      counters[shape.type] += 1;
      names.set(
        shape.id,
        shape.displayName?.trim() ||
          shapeDefaultName(shape, counters[shape.type]),
      );
    });
    return names;
  }

  hasDuplicateMarker(candidate: {
    name: string;
    latitude: number;
    longitude: number;
  }): boolean {
    const identity = markerIdentity(candidate);
    return this.getMarkers().some(
      (marker) => markerIdentity(marker) === identity,
    );
  }

  hasDuplicateShape(candidate: ShapeItem): boolean {
    const identity = shapeIdentity(candidate);
    return this.getShapes().some(
      (shape) => shapeIdentity(shape) === identity,
    );
  }
}
