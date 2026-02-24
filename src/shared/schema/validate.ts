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

function validateBBox(bbox: MapProject["viewport"]["bbox"], errors: ValidationError[]) {
  const fields: Array<keyof typeof bbox> = ["minLon", "minLat", "maxLon", "maxLat"];
  for (const field of fields) {
    if (!isFiniteNumber(bbox[field])) {
      errors.push({ path: `viewport.bbox.${field}`, message: "must be a finite number" });
    }
  }
  if (
    isFiniteNumber(bbox.minLon) &&
    isFiniteNumber(bbox.maxLon) &&
    bbox.minLon >= bbox.maxLon
  ) {
    errors.push({ path: "viewport.bbox", message: "minLon must be less than maxLon" });
  }
  if (
    isFiniteNumber(bbox.minLat) &&
    isFiniteNumber(bbox.maxLat) &&
    bbox.minLat >= bbox.maxLat
  ) {
    errors.push({ path: "viewport.bbox", message: "minLat must be less than maxLat" });
  }
}

export function validateProject(input: MapProject): ValidationResult {
  const errors: ValidationError[] = [];

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

  if (!isFiniteNumber(input.canvas.width) || input.canvas.width <= 0) {
    errors.push({ path: "canvas.width", message: "must be a positive number" });
  }
  if (!isFiniteNumber(input.canvas.height) || input.canvas.height <= 0) {
    errors.push({ path: "canvas.height", message: "must be a positive number" });
  }
  if (input.canvas.unit !== "px" && input.canvas.unit !== "mm") {
    errors.push({ path: "canvas.unit", message: "must be px or mm" });
  }

  if (input.viewport.projection !== "EPSG:3857" && input.viewport.projection !== "EPSG:4326") {
    errors.push({ path: "viewport.projection", message: "unsupported projection" });
  }

  validateBBox(input.viewport.bbox, errors);

  for (let i = 0; i < input.layers.length; i += 1) {
    const layer = input.layers[i];
    const prefix = `layers[${i}]`;
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

  for (let i = 0; i < input.objects.length; i += 1) {
    const obj = input.objects[i];
    const prefix = `objects[${i}]`;
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

  return { valid: errors.length === 0, errors };
}
