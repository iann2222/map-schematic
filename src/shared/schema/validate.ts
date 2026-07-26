import { CURRENT_SCHEMA_VERSION, MapProject } from "./mapproj";
import { validateProjectHistory } from "./history";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord
} from "../validation/primitives";

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

function isIsoDateString(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validateStringArray(value: unknown, path: string, errors: ValidationError[]): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push({ path, message: "must be an array of strings" });
  }
}

function validateBBox(
  bbox: unknown,
  path: string,
  errors: ValidationError[]
): bbox is MapProject["viewport"]["bbox"] {
  if (!isRecord(bbox)) {
    errors.push({ path, message: "must be an object" });
    return false;
  }
  const fields = ["west", "south", "east", "north"] as const;
  for (const field of fields) {
    if (!isFiniteNumber(bbox[field])) {
      errors.push({ path: `${path}.${field}`, message: "must be a finite number" });
    }
  }
  for (const field of ["west", "east"] as const) {
    if (isFiniteNumber(bbox[field]) && (bbox[field] < -180 || bbox[field] > 180)) {
      errors.push({ path: `${path}.${field}`, message: "must be between -180 and 180" });
    }
  }
  for (const field of ["south", "north"] as const) {
    if (isFiniteNumber(bbox[field]) && (bbox[field] < -90 || bbox[field] > 90)) {
      errors.push({ path: `${path}.${field}`, message: "must be between -90 and 90" });
    }
  }
  if (typeof bbox.crossesAntimeridian !== "boolean") {
    errors.push({
      path: `${path}.crossesAntimeridian`,
      message: "must be a boolean"
    });
  } else if (isFiniteNumber(bbox.west) && isFiniteNumber(bbox.east)) {
    if (bbox.crossesAntimeridian && bbox.west <= bbox.east) {
      errors.push({
        path,
        message: "west must be greater than east when crossing the antimeridian"
      });
    }
    if (!bbox.crossesAntimeridian && bbox.west >= bbox.east) {
      errors.push({
        path,
        message: "west must be less than east when not crossing the antimeridian"
      });
    }
    const longitudeSpan = bbox.crossesAntimeridian
      ? bbox.east + 360 - bbox.west
      : bbox.east - bbox.west;
    if (longitudeSpan <= 0 || longitudeSpan > 360) {
      errors.push({
        path,
        message: "longitude span must be greater than 0 and at most 360 degrees"
      });
    }
  }
  if (
    isFiniteNumber(bbox.south) &&
    isFiniteNumber(bbox.north) &&
    bbox.south >= bbox.north
  ) {
    errors.push({ path, message: "south must be less than north" });
  }
  return (
    fields.every((field) => isFiniteNumber(bbox[field])) &&
    typeof bbox.crossesAntimeridian === "boolean"
  );
}

export function validateProject(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }

  if (input.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: "unsupported schemaVersion" });
  }

  if (!isIsoDateString(input.createdAt)) {
    errors.push({ path: "createdAt", message: "must be an ISO string" });
  }

  if (!isIsoDateString(input.updatedAt)) {
    errors.push({ path: "updatedAt", message: "must be an ISO string" });
  }

  if (!isNonEmptyString(input.dataPackVersion)) {
    errors.push({ path: "dataPackVersion", message: "must be a non-empty string" });
  }

  const canvas = input.canvas;
  if (!isRecord(canvas)) {
    errors.push({ path: "canvas", message: "must be an object" });
  } else {
    if (!isFiniteNumber(canvas.width) || canvas.width <= 0) {
      errors.push({ path: "canvas.width", message: "must be a positive number" });
    }
    if (!isFiniteNumber(canvas.height) || canvas.height <= 0) {
      errors.push({ path: "canvas.height", message: "must be a positive number" });
    }
    if (canvas.unit !== "px" && canvas.unit !== "mm") {
      errors.push({ path: "canvas.unit", message: "must be px or mm" });
    } else {
      const unitScale = canvas.unit === "mm" ? 96 / 25.4 : 1;
      for (const field of ["width", "height"] as const) {
        if (
          isFiniteNumber(canvas[field]) &&
          canvas[field] * unitScale > 8192
        ) {
          errors.push({
            path: `canvas.${field}`,
            message: "must not exceed 8192 logical output pixels"
          });
        }
      }
    }
  }

  const viewport = input.viewport;
  if (!isRecord(viewport)) {
    errors.push({ path: "viewport", message: "must be an object" });
  } else {
    if (viewport.projection !== "EPSG:4326") {
      errors.push({
        path: "viewport.projection",
        message: "must be EPSG:4326 because bbox uses longitude/latitude degrees"
      });
    }
    validateBBox(viewport.bbox, "viewport.bbox", errors);
  }

  const layers = input.layers;
  if (!Array.isArray(layers)) {
    errors.push({ path: "layers", message: "must be an array" });
  } else {
    if (layers.length !== 1) {
      errors.push({
        path: "layers",
        message: "must contain exactly one layer"
      });
    }
    const layerIds = new Set<string>();
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      const prefix = `layers[${i}]`;
      if (!isRecord(layer)) {
        errors.push({ path: prefix, message: "must be an object" });
        continue;
      }
      if (!isNonEmptyString(layer.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be a non-empty string" });
      } else if (layerIds.has(layer.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be unique" });
      } else {
        layerIds.add(layer.id);
      }
      if (!isNonEmptyString(layer.name)) {
        errors.push({ path: `${prefix}.name`, message: "must be a non-empty string" });
      }
    }
  }

  const objects = input.objects;
  if (!Array.isArray(objects)) {
    errors.push({ path: "objects", message: "must be an array" });
  } else {
    const objectTypes = new Set(["pointLabel", "areaLabel", "textOnly", "arrow", "polyline"]);
    const layerIds = new Set(
      Array.isArray(layers)
        ? layers
            .filter((layer): layer is Record<string, unknown> => isRecord(layer))
            .map((layer) => layer.id)
            .filter((id): id is string => isNonEmptyString(id))
        : []
    );
    const objectIds = new Set<string>();
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i];
      const prefix = `objects[${i}]`;
      if (!isRecord(obj)) {
        errors.push({ path: prefix, message: "must be an object" });
        continue;
      }
      if (!isNonEmptyString(obj.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be a non-empty string" });
      } else if (objectIds.has(obj.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be unique" });
      } else {
        objectIds.add(obj.id);
      }
      if (!isNonEmptyString(obj.layerId)) {
        errors.push({ path: `${prefix}.layerId`, message: "must be a non-empty string" });
      } else if (!layerIds.has(obj.layerId)) {
        errors.push({ path: `${prefix}.layerId`, message: "must reference an existing layer" });
      }
      if (typeof obj.type !== "string" || !objectTypes.has(obj.type)) {
        errors.push({ path: `${prefix}.type`, message: "unsupported object type" });
      }

      const geometry = obj.geometry;
      if (!isRecord(geometry)) {
        errors.push({ path: `${prefix}.geometry`, message: "must be an object" });
      } else if (geometry.kind === "point") {
        if (!isFiniteNumber(geometry.lon) || geometry.lon < -180 || geometry.lon > 180) {
          errors.push({ path: `${prefix}.geometry.lon`, message: "must be between -180 and 180" });
        }
        if (!isFiniteNumber(geometry.lat) || geometry.lat < -90 || geometry.lat > 90) {
          errors.push({ path: `${prefix}.geometry.lat`, message: "must be between -90 and 90" });
        }
      } else if (geometry.kind === "polygon") {
        if (
          !Array.isArray(geometry.rings) ||
          geometry.rings.some(
            (ring) =>
              !Array.isArray(ring) ||
              ring.length < 3 ||
              ring.some(
                (point) =>
                  !Array.isArray(point) ||
                  point.length !== 2 ||
                  !isFiniteNumber(point[0]) ||
                  !isFiniteNumber(point[1]) ||
                  point[0] < -180 ||
                  point[0] > 180 ||
                  point[1] < -90 ||
                  point[1] > 90
              )
          )
        ) {
          errors.push({ path: `${prefix}.geometry.rings`, message: "must contain valid coordinate rings" });
        }
      } else if (geometry.kind !== "none") {
        errors.push({ path: `${prefix}.geometry.kind`, message: "unsupported geometry kind" });
      }

      const style = obj.style;
      if (!isRecord(style)) {
        errors.push({ path: `${prefix}.style`, message: "must be an object" });
      } else {
        const numericStyleFields = [
          "fontSize", "strokeWidth", "fillOpacity", "textOffsetX", "textOffsetY",
          "dotSize", "textSize", "width", "height", "rotation"
        ];
        for (const field of numericStyleFields) {
          if (style[field] !== undefined && !isFiniteNumber(style[field])) {
            errors.push({ path: `${prefix}.style.${field}`, message: "must be a finite number" });
          }
        }
        for (const field of ["fontSize", "strokeWidth", "dotSize", "textSize", "width", "height"]) {
          if (isFiniteNumber(style[field]) && style[field] < 0) {
            errors.push({ path: `${prefix}.style.${field}`, message: "must not be negative" });
          }
        }
        if (
          style.fillOpacity !== undefined &&
          isFiniteNumber(style.fillOpacity) &&
          (style.fillOpacity < 0 || style.fillOpacity > 1)
        ) {
          errors.push({ path: `${prefix}.style.fillOpacity`, message: "must be between 0 and 1" });
        }
        for (const field of [
          "fontFamily", "fill", "stroke", "strokeDasharray", "labelName",
          "name", "nameAlt", "displayName", "dotColor", "textColor",
          "strokeColor", "fillColor"
        ]) {
          if (style[field] !== undefined && typeof style[field] !== "string") {
            errors.push({ path: `${prefix}.style.${field}`, message: "must be a string" });
          }
        }
        if (style.showLabel !== undefined && typeof style.showLabel !== "boolean") {
          errors.push({ path: `${prefix}.style.showLabel`, message: "must be a boolean" });
        }
        if (
          style.labelMode !== undefined &&
          style.labelMode !== "name" &&
          style.labelMode !== "coords"
        ) {
          errors.push({ path: `${prefix}.style.labelMode`, message: "must be name or coords" });
        }
        if (
          style.sourceType !== undefined &&
          style.sourceType !== "geonames" &&
          style.sourceType !== "coords" &&
          style.sourceType !== "manual"
        ) {
          errors.push({
            path: `${prefix}.style.sourceType`,
            message: "must be geonames, coords, or manual"
          });
        }
        if (
          style.kind !== undefined &&
          style.kind !== "label" &&
          style.kind !== "point"
        ) {
          errors.push({ path: `${prefix}.style.kind`, message: "must be label or point" });
        }
        if (
          style.textAnchor !== undefined &&
          style.textAnchor !== "start" &&
          style.textAnchor !== "end"
        ) {
          errors.push({ path: `${prefix}.style.textAnchor`, message: "must be start or end" });
        }
        if (
          style.shapeType !== undefined &&
          style.shapeType !== "line" &&
          style.shapeType !== "area" &&
          style.shapeType !== "text" &&
          style.shapeType !== "arrow"
        ) {
          errors.push({
            path: `${prefix}.style.shapeType`,
            message: "must be line, area, text, or arrow"
          });
        }
      }

      if (obj.provenance !== undefined) {
        if (
          !isRecord(obj.provenance) ||
          (obj.provenance.source !== "geonames" && obj.provenance.source !== "manual")
        ) {
          errors.push({ path: `${prefix}.provenance`, message: "must contain a supported source" });
        }
      }
    }
  }

  errors.push(...validateProjectHistory(input.history).errors);

  if (!isRecord(input.ui)) {
    errors.push({ path: "ui", message: "must be an object" });
  } else {
    if (input.ui.listOrderKeys !== undefined) {
      validateStringArray(input.ui.listOrderKeys, "ui.listOrderKeys", errors);
    }
    if (input.ui.displayOrderKeys !== undefined) {
      validateStringArray(input.ui.displayOrderKeys, "ui.displayOrderKeys", errors);
    }
    if (input.ui.hillshadeEnabled !== undefined && typeof input.ui.hillshadeEnabled !== "boolean") {
      errors.push({ path: "ui.hillshadeEnabled", message: "must be a boolean" });
    }
    if (
      input.ui.ratioMode !== undefined &&
      input.ui.ratioMode !== "free" &&
      input.ui.ratioMode !== "fixed"
    ) {
      errors.push({ path: "ui.ratioMode", message: "must be free or fixed" });
    }
    for (const field of ["cropRatio", "customRatioA", "customRatioB"] as const) {
      if (input.ui[field] !== undefined && !isFiniteNumber(input.ui[field])) {
        errors.push({ path: `ui.${field}`, message: "must be a finite number" });
      } else if (isFiniteNumber(input.ui[field]) && input.ui[field] <= 0) {
        errors.push({ path: `ui.${field}`, message: "must be positive" });
      }
    }
    if (
      isRecord(canvas) &&
      isFiniteNumber(canvas.width) &&
      canvas.width > 0 &&
      isFiniteNumber(canvas.height) &&
      canvas.height > 0 &&
      isFiniteNumber(input.ui.cropRatio) &&
      input.ui.cropRatio > 0
    ) {
      const canvasRatio = canvas.width / canvas.height;
      const roundingTolerance = Math.max(
        0.001,
        1 / Math.min(canvas.width, canvas.height)
      );
      if (Math.abs(canvasRatio - input.ui.cropRatio) > roundingTolerance) {
        errors.push({
          path: "canvas",
          message: "aspect ratio must match ui.cropRatio"
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
