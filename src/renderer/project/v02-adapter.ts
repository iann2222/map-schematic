import type { MapProject } from "../bridge.js";
import type {
  EditorDocument,
  Marker,
  ShapeItem
} from "../editor/types.js";
import { isMarker, isShape } from "../editor/types.js";
import { partitionProjectObjects } from "./project-state.js";

export type V02EditorLoadResult = {
  document: EditorDocument;
  preservedObjects: MapProject["objects"];
};

function formatCoords(latitude: number, longitude: number): string {
  return `(${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
}

function markerLabelText(marker: Marker): string {
  const customLabel = marker.labelName?.trim();
  if (customLabel) {
    return customLabel;
  }
  if (marker.sourceType === "coords") {
    return marker.displayName?.trim() || marker.name;
  }
  if (marker.labelMode === "coords") {
    return formatCoords(marker.latitude, marker.longitude);
  }
  return marker.name;
}

function projectObjectTypeForShape(
  type: ShapeItem["type"],
): MapProject["objects"][number]["type"] {
  if (type === "area") {
    return "areaLabel";
  }
  if (type === "text") {
    return "textOnly";
  }
  if (type === "arrow") {
    return "arrow";
  }
  return "polyline";
}

function shapeTypeFromProjectObject(
  object: MapProject["objects"][number],
): ShapeItem["type"] | null {
  const shapeType = object.style.shapeType;
  if (
    shapeType === "line" ||
    shapeType === "area" ||
    shapeType === "text" ||
    shapeType === "arrow"
  ) {
    return shapeType;
  }
  if (object.type === "textOnly") {
    return "text";
  }
  if (object.type === "areaLabel") {
    return "area";
  }
  if (object.type === "arrow") {
    return "arrow";
  }
  return object.type === "polyline" ? "line" : null;
}

function markerSourceType(
  object: MapProject["objects"][number],
): Marker["sourceType"] {
  const sourceType = object.style.sourceType;
  if (sourceType === "geonames" || sourceType === "coords" || sourceType === "manual") {
    return sourceType;
  }
  if (object.provenance?.source === "geonames") {
    return "geonames";
  }
  return object.provenance?.query === "manual" ? "manual" : "coords";
}

export function editorDocumentToV02Objects(
  document: EditorDocument,
  preservedObjects: MapProject["objects"] = [],
): MapProject["objects"] {
  const markers = document.objects.filter(isMarker);
  const shapes = document.objects.filter(isShape);
  const markerObjects: MapProject["objects"] = markers.map((marker, index) => ({
    id: marker.id || `obj-${index + 1}`,
    type: "pointLabel",
    layerId: "layer-1",
    style: {
      name: marker.name,
      nameAlt: marker.nameAlt,
      displayName: marker.displayName,
      sourceType: marker.sourceType,
      kind: marker.kind,
      showLabel: marker.showLabel,
      dotColor: marker.style.dotColor,
      textColor: marker.style.textColor,
      dotSize: marker.style.dotSize,
      textSize: marker.style.textSize,
      fontFamily: marker.style.fontFamily,
      textOffsetX: marker.style.textOffsetX,
      textOffsetY: marker.style.textOffsetY,
      textAnchor: marker.style.textAnchor,
      labelMode: marker.labelMode,
      labelName: marker.labelName
    },
    geometry: {
      kind: "point",
      lon: marker.longitude,
      lat: marker.latitude
    },
    text: markerLabelText(marker),
    provenance:
      marker.sourceType === "geonames"
        ? {
            source: "geonames",
            sourceId: marker.sourceId ?? String(marker.id)
          }
        : { source: "manual", query: marker.sourceType }
  }));
  const shapeObjects: MapProject["objects"] = shapes.map((shape, index) => ({
    id: shape.id || `shape-${index + 1}`,
    type: projectObjectTypeForShape(shape.type),
    layerId: "layer-1",
    style: {
      shapeType: shape.type,
      displayName: shape.displayName,
      width: shape.width,
      height: shape.height,
      strokeColor: shape.style.strokeColor,
      strokeWidth: shape.style.strokeWidth,
      fillColor: shape.style.fillColor,
      fillOpacity: shape.style.fillOpacity,
      textColor: shape.style.textColor,
      textSize: shape.style.textSize,
      fontFamily: shape.style.fontFamily
    },
    geometry: { kind: "point", lon: shape.longitude, lat: shape.latitude },
    text: shape.text,
    provenance: { source: "manual", query: `shape:${shape.type}` }
  }));

  return [...markerObjects, ...shapeObjects, ...preservedObjects];
}

export function mapProjectToEditorDocument(project: MapProject): V02EditorLoadResult {
  const partitioned = partitionProjectObjects(project.objects ?? []);
  const objects: EditorDocument["objects"] = [];

  for (const object of partitioned.editablePointObjects) {
    if (object.geometry.kind !== "point") {
      continue;
    }
    const { lon, lat } = object.geometry;
    const style = object.style;
    if (object.type === "pointLabel") {
      const sourceType = markerSourceType(object);
      const coordsText = formatCoords(lat, lon);
      const labelName = typeof style.labelName === "string" ? style.labelName : undefined;
      const labelMode =
        style.labelMode === "name" || style.labelMode === "coords"
          ? style.labelMode
          : sourceType === "coords"
            ? "coords"
            : "name";
      const name =
        typeof style.name === "string" && style.name.trim().length > 0
          ? style.name
          : sourceType === "coords"
            ? "座標標示"
            : (object.text ?? "");
      objects.push({
        objectKind: "marker",
        id: object.id,
        name,
        nameAlt:
          typeof style.nameAlt === "string"
            ? style.nameAlt
            : sourceType === "coords"
              ? coordsText
              : undefined,
        displayName: typeof style.displayName === "string" ? style.displayName : undefined,
        latitude: lat,
        longitude: lon,
        sourceId: object.provenance?.sourceId,
        style: {
          dotColor: String(style.dotColor ?? "#f97316"),
          textColor: String(style.textColor ?? "#fde68a"),
          dotSize: Number(style.dotSize ?? 7),
          textSize: Number(style.textSize ?? 7),
          fontFamily: String(style.fontFamily ?? "IBM Plex Sans, sans-serif"),
          textOffsetX: Number(style.textOffsetX ?? 8),
          textOffsetY: Number(style.textOffsetY ?? -6),
          textAnchor:
            style.textAnchor === "end" || style.textAnchor === "start"
              ? style.textAnchor
              : undefined
        },
        sourceType,
        labelMode,
        labelName,
        showLabel: typeof style.showLabel === "boolean" ? style.showLabel : true,
        kind: style.kind === "point" ? "point" : "label"
      });
      continue;
    }

    const shapeType = shapeTypeFromProjectObject(object);
    if (!shapeType) {
      continue;
    }
    objects.push({
      objectKind: "shape",
      id: object.id,
      type: shapeType,
      displayName: typeof style.displayName === "string" ? style.displayName : undefined,
      longitude: lon,
      latitude: lat,
      width: Number(style.width ?? (shapeType === "line" ? 140 : 80)),
      height: Number(style.height ?? (shapeType === "line" ? 0 : 70)),
      text: typeof object.text === "string" ? object.text : undefined,
      style: {
        strokeColor: String(style.strokeColor ?? "#38bdf8"),
        strokeWidth: Number(style.strokeWidth ?? 2),
        fillColor: String(style.fillColor ?? "#38bdf8"),
        fillOpacity: Number(style.fillOpacity ?? 0.35),
        textColor: String(style.textColor ?? "#fde68a"),
        textSize: Number(style.textSize ?? 7),
        fontFamily: String(style.fontFamily ?? "IBM Plex Sans, sans-serif")
      }
    });
  }

  return {
    document: {
      objects,
      listOrderKeys: Array.isArray(project.ui?.listOrderKeys)
        ? [...project.ui.listOrderKeys]
        : [],
      displayOrderKeys: Array.isArray(project.ui?.displayOrderKeys)
        ? [...project.ui.displayOrderKeys]
        : []
    },
    preservedObjects: partitioned.preservedObjects
  };
}
