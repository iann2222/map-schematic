import { CURRENT_SCHEMA_VERSION, MapProject } from "./mapproj";

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
  const fields = ["minLon", "minLat", "maxLon", "maxLat"] as const;
  for (const field of fields) {
    if (!isFiniteNumber(bbox[field])) {
      errors.push({ path: `${path}.${field}`, message: "must be a finite number" });
    }
  }
  for (const field of ["minLon", "maxLon"] as const) {
    if (isFiniteNumber(bbox[field]) && (bbox[field] < -180 || bbox[field] > 180)) {
      errors.push({ path: `${path}.${field}`, message: "must be between -180 and 180" });
    }
  }
  for (const field of ["minLat", "maxLat"] as const) {
    if (isFiniteNumber(bbox[field]) && (bbox[field] < -90 || bbox[field] > 90)) {
      errors.push({ path: `${path}.${field}`, message: "must be between -90 and 90" });
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
      if (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
        errors.push({ path: `${prefix}.opacity`, message: "must be between 0 and 1" });
      }
      if (!isFiniteNumber(layer.zIndex)) {
        errors.push({ path: `${prefix}.zIndex`, message: "must be a number" });
      }
      if (typeof layer.visible !== "boolean") {
        errors.push({ path: `${prefix}.visible`, message: "must be a boolean" });
      }
      if (typeof layer.locked !== "boolean") {
        errors.push({ path: `${prefix}.locked`, message: "must be a boolean" });
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
          "dotSize", "textSize", "width", "height"
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
  }

  return { valid: errors.length === 0, errors };
}
