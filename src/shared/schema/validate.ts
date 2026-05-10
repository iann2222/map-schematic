import { MapProject } from "./mapproj";

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  const fields = ["minLon", "minLat", "maxLon", "maxLat"] as const;
  for (const field of fields) {
    if (!isFiniteNumber(bbox[field])) {
      errors.push({ path: `${path}.${field}`, message: "must be a finite number" });
    }
  }
  if (
    isFiniteNumber(bbox.minLon) &&
    isFiniteNumber(bbox.maxLon) &&
    bbox.minLon >= bbox.maxLon
  ) {
    errors.push({ path, message: "minLon must be less than maxLon" });
  }
  if (
    isFiniteNumber(bbox.minLat) &&
    isFiniteNumber(bbox.maxLat) &&
    bbox.minLat >= bbox.maxLat
  ) {
    errors.push({ path, message: "minLat must be less than maxLat" });
  }
  return fields.every((field) => isFiniteNumber(bbox[field]));
}

export function validateProject(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }

  if (input.schemaVersion !== "0.1") {
    errors.push({ path: "schemaVersion", message: "unsupported schemaVersion" });
  }

  if (!isNonEmptyString(input.createdAt)) {
    errors.push({ path: "createdAt", message: "must be an ISO string" });
  }

  if (!isNonEmptyString(input.updatedAt)) {
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
    }
  }

  const viewport = input.viewport;
  if (!isRecord(viewport)) {
    errors.push({ path: "viewport", message: "must be an object" });
  } else {
    if (viewport.projection !== "EPSG:3857" && viewport.projection !== "EPSG:4326") {
      errors.push({ path: "viewport.projection", message: "unsupported projection" });
    }
    validateBBox(viewport.bbox, "viewport.bbox", errors);
  }

  const layers = input.layers;
  if (!Array.isArray(layers)) {
    errors.push({ path: "layers", message: "must be an array" });
  } else {
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      const prefix = `layers[${i}]`;
      if (!isRecord(layer)) {
        errors.push({ path: prefix, message: "must be an object" });
        continue;
      }
      if (!isNonEmptyString(layer.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be a non-empty string" });
      }
      if (!isNonEmptyString(layer.name)) {
        errors.push({ path: `${prefix}.name`, message: "must be a non-empty string" });
      }
      if (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
        errors.push({ path: `${prefix}.opacity`, message: "must be between 0 and 1" });
      }
      if (!isFiniteNumber(layer.zIndex)) {
        errors.push({ path: `${prefix}.zIndex`, message: "must be a number" });
      }
    }
  }

  const objects = input.objects;
  if (!Array.isArray(objects)) {
    errors.push({ path: "objects", message: "must be an array" });
  } else {
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i];
      const prefix = `objects[${i}]`;
      if (!isRecord(obj)) {
        errors.push({ path: prefix, message: "must be an object" });
        continue;
      }
      if (!isNonEmptyString(obj.id)) {
        errors.push({ path: `${prefix}.id`, message: "must be a non-empty string" });
      }
      if (!isNonEmptyString(obj.layerId)) {
        errors.push({ path: `${prefix}.layerId`, message: "must be a non-empty string" });
      }
      if (!isNonEmptyString(obj.type)) {
        errors.push({ path: `${prefix}.type`, message: "must be a non-empty string" });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
