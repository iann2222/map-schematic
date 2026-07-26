import { CURRENT_SCHEMA_VERSION, MapProject } from "./mapproj";
import {
  createEmptyProjectHistory,
  migrateLegacyProjectHistory
} from "./history";
import {
  isRecord,
  type UnknownRecord
} from "../validation/primitives";

export type ProjectMigrationResult = {
  project: MapProject;
  fromVersion: string;
  toVersion: typeof CURRENT_SCHEMA_VERSION;
  migrated: boolean;
  appliedVersions: string[];
};

export class ProjectMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectMigrationError";
  }
}

type ProjectRecord = UnknownRecord;

type MigrationStep = {
  toVersion: string;
  migrate: (project: ProjectRecord) => ProjectRecord;
};

function migrateViewportBBox(viewport: unknown): unknown {
  if (!isRecord(viewport) || !isRecord(viewport.bbox)) {
    return viewport;
  }
  const bbox = viewport.bbox;
  if (
    typeof bbox.minLon !== "number" ||
    typeof bbox.minLat !== "number" ||
    typeof bbox.maxLon !== "number" ||
    typeof bbox.maxLat !== "number"
  ) {
    return viewport;
  }
  return {
    ...viewport,
    bbox: {
      west: bbox.minLon,
      south: bbox.minLat,
      east: bbox.maxLon,
      north: bbox.maxLat,
      crossesAntimeridian: false
    }
  };
}

function migrateCanvasToCropRatio(canvas: unknown, ui: unknown): unknown {
  if (!isRecord(canvas) || !isRecord(ui)) {
    return canvas;
  }
  if (
    typeof canvas.width !== "number" ||
    typeof canvas.height !== "number" ||
    (canvas.unit !== "px" && canvas.unit !== "mm") ||
    typeof ui.cropRatio !== "number" ||
    !Number.isFinite(ui.cropRatio) ||
    ui.cropRatio <= 0
  ) {
    return canvas;
  }
  const longEdge = Math.max(canvas.width, canvas.height);
  const round = (value: number) =>
    canvas.unit === "px"
      ? Math.max(1, Math.round(value))
      : Math.max(0.01, Math.round(value * 100) / 100);
  return ui.cropRatio >= 1
    ? {
        width: round(longEdge),
        height: round(longEdge / ui.cropRatio),
        unit: canvas.unit
      }
    : {
        width: round(longEdge * ui.cropRatio),
        height: round(longEdge),
        unit: canvas.unit
      };
}

function migrateSingleLayer(layers: unknown): unknown {
  if (!Array.isArray(layers)) {
    return layers;
  }
  return layers.map((layer) =>
    isRecord(layer)
      ? {
          id: layer.id,
          name: layer.name
        }
      : layer
  );
}

const migrations: Record<string, MigrationStep> = {
  "0.1": {
    toVersion: "0.2",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.2",
      ui:
        project.ui === undefined
          ? {}
          : isRecord(project.ui)
            ? { ...project.ui }
            : project.ui
      })
  },
  "0.2": {
    toVersion: "0.3",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.3",
      viewport: isRecord(project.viewport)
        ? {
            ...project.viewport,
            // The bbox contract has always used longitude/latitude degrees.
            projection: "EPSG:4326"
          }
        : project.viewport
    })
  },
  "0.3": {
    toVersion: "0.4",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.4",
      history:
        project.history === undefined
          ? { undo: [], redo: [] }
          : project.history
    })
  },
  "0.4": {
    toVersion: "0.5",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.5",
      viewport: migrateViewportBBox(project.viewport)
    })
  },
  "0.5": {
    toVersion: "0.6",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.6",
      canvas: migrateCanvasToCropRatio(project.canvas, project.ui),
      layers: migrateSingleLayer(project.layers)
    })
  },
  "0.6": {
    toVersion: "0.7",
    migrate: (project) => ({
      ...project,
      schemaVersion: "0.7",
      history:
        project.history === undefined
          ? createEmptyProjectHistory()
          : migrateLegacyProjectHistory(project.history)
    })
  }
};

export function migrateProject(input: unknown): ProjectMigrationResult {
  if (!isRecord(input)) {
    throw new ProjectMigrationError("Project root must be an object");
  }
  if (typeof input.schemaVersion !== "string" || input.schemaVersion.length === 0) {
    throw new ProjectMigrationError("Project is missing schemaVersion");
  }

  const fromVersion = input.schemaVersion;
  let currentVersion = fromVersion;
  let project: ProjectRecord = { ...input };
  const appliedVersions: string[] = [];
  const visitedVersions = new Set<string>();

  while (currentVersion !== CURRENT_SCHEMA_VERSION) {
    if (visitedVersions.has(currentVersion)) {
      throw new ProjectMigrationError(`Project migration cycle detected at ${currentVersion}`);
    }
    visitedVersions.add(currentVersion);

    const step = migrations[currentVersion];
    if (!step) {
      throw new ProjectMigrationError(
        `Unsupported project schemaVersion: ${currentVersion}`
      );
    }
    project = step.migrate(project);
    currentVersion = step.toVersion;
    appliedVersions.push(currentVersion);
  }

  return {
    project: project as MapProject,
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    migrated: appliedVersions.length > 0,
    appliedVersions
  };
}
