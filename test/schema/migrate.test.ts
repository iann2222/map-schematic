import { describe, expect, it } from "vitest";

import {
  migrateProject,
  ProjectMigrationError
} from "../../src/shared/schema/migrate";
import { validateProject } from "../../src/shared/schema/validate";
import { createTestProject } from "../fixtures/projects";

function createLegacyProject(): Record<string, unknown> {
  const current = createTestProject();
  const legacy = {
    ...current,
    schemaVersion: "0.1",
    viewport: {
      projection: "EPSG:4326",
      bbox: {
        minLon: current.viewport.bbox.west,
        minLat: current.viewport.bbox.south,
        maxLon: current.viewport.bbox.east,
        maxLat: current.viewport.bbox.north
      }
    }
  } as Record<string, unknown>;
  delete legacy.ui;
  return legacy;
}

function createLegacyHistoryCommand(): Record<string, unknown> {
  return {
    type: "update-object",
    objectId: "point-1",
    objectKind: "marker",
    changes: [
      {
        path: ["name"],
        before: { present: true, value: "Taipei" },
        after: { present: true, value: "Taipei City" }
      }
    ]
  };
}

describe("migrateProject", () => {
  it("migrates a 0.1 project to 0.7 and adds required containers", () => {
    const legacy = createLegacyProject();
    const result = migrateProject(legacy);

    expect(result).toMatchObject({
      fromVersion: "0.1",
      toVersion: "0.7",
      migrated: true,
      appliedVersions: ["0.2", "0.3", "0.4", "0.5", "0.6", "0.7"]
    });
    expect(result.project.schemaVersion).toBe("0.7");
    expect(result.project.viewport.bbox).toEqual({
      west: -180,
      south: -85,
      east: 180,
      north: 85,
      crossesAntimeridian: false
    });
    expect(result.project.ui).toEqual({});
    expect(result.project.history).toEqual({
      historyVersion: 1,
      undo: [],
      redo: []
    });
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
    expect(legacy).not.toHaveProperty("ui");
  });

  it("preserves existing 0.1 UI settings", () => {
    const legacy = createLegacyProject();
    legacy.ui = { hillshadeEnabled: true, ratioMode: "fixed" };

    const result = migrateProject(legacy);
    expect(result.project.ui).toEqual({
      hillshadeEnabled: true,
      ratioMode: "fixed"
    });
  });

  it("normalizes the legacy viewport projection to its longitude/latitude bbox contract", () => {
    const legacy = createLegacyProject() as unknown as {
      schemaVersion: string;
      viewport: { projection: string };
    };
    legacy.schemaVersion = "0.2";
    (legacy as unknown as Record<string, unknown>).ui = {};
    legacy.viewport.projection = "EPSG:3857";

    const result = migrateProject(legacy);

    expect(result.project.viewport.projection).toBe("EPSG:4326");
    expect(result.appliedVersions).toEqual([
      "0.3",
      "0.4",
      "0.5",
      "0.6",
      "0.7"
    ]);
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("adds an empty history container to a 0.3 project", () => {
    const legacy = createLegacyProject();
    legacy.schemaVersion = "0.3";
    delete legacy.history;

    const result = migrateProject(legacy);

    expect(result.project.history).toEqual({
      historyVersion: 1,
      undo: [],
      redo: []
    });
    expect(result.appliedVersions).toEqual(["0.4", "0.5", "0.6", "0.7"]);
  });

  it("converts a 0.4 bbox to the explicit antimeridian contract", () => {
    const legacy = createLegacyProject();
    legacy.schemaVersion = "0.4";
    legacy.ui = {};
    legacy.history = {
      undo: [createLegacyHistoryCommand()],
      redo: []
    };

    const result = migrateProject(legacy);

    expect(result.appliedVersions).toEqual(["0.5", "0.6", "0.7"]);
    expect(result.project.viewport.bbox).toEqual({
      west: -180,
      south: -85,
      east: 180,
      north: 85,
      crossesAntimeridian: false
    });
    expect(result.project.history).toEqual({
      historyVersion: 1,
      undo: [createLegacyHistoryCommand()],
      redo: []
    });
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("migrates 0.5 canvas output and layer metadata to the 0.6 contract", () => {
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.5";
    legacy.canvas = { width: 1200, height: 800, unit: "px" };
    legacy.layers = [
      {
        id: "layer-1",
        name: "Default",
        visible: false,
        locked: true,
        opacity: 0.5,
        zIndex: 4
      }
    ];
    legacy.ui = { ratioMode: "fixed", cropRatio: 1 };

    const result = migrateProject(legacy);

    expect(result.appliedVersions).toEqual(["0.6", "0.7"]);
    expect(result.project.canvas).toEqual({
      width: 1200,
      height: 1200,
      unit: "px"
    });
    expect(result.project.layers).toEqual([
      { id: "layer-1", name: "Default" }
    ]);
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("adds historyVersion while preserving valid 0.6 commands", () => {
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.6";
    legacy.history = {
      undo: [createLegacyHistoryCommand()],
      redo: []
    };

    const result = migrateProject(legacy);

    expect(result.appliedVersions).toEqual(["0.7"]);
    expect(result.project.history).toEqual({
      historyVersion: 1,
      undo: [createLegacyHistoryCommand()],
      redo: []
    });
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("drops malformed legacy commands without losing project content", () => {
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.6";
    legacy.history = {
      undo: [{ type: "unknown-command", payload: "legacy" }],
      redo: []
    };

    const result = migrateProject(legacy);

    expect(result.project.objects).toEqual(legacy.objects);
    expect(result.project.history).toEqual({
      historyVersion: 1,
      undo: [],
      redo: []
    });
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("synchronizes a free crop ratio while migrating a 0.5 project", () => {
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.5";
    legacy.canvas = { width: 1200, height: 800, unit: "px" };
    legacy.ui = { ratioMode: "free", cropRatio: 2 };

    const result = migrateProject(legacy);

    expect(result.project.canvas).toEqual({
      width: 1200,
      height: 600,
      unit: "px"
    });
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
  });

  it("does not silently flatten a multi-layer 0.5 project", () => {
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.5";
    legacy.layers = [
      {
        id: "layer-1",
        name: "Default",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 0
      },
      {
        id: "layer-2",
        name: "Labels",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1
      }
    ];

    const result = migrateProject(legacy);

    expect(result.project.layers).toHaveLength(2);
    expect(validateProject(result.project).errors).toEqual(
      expect.arrayContaining([
        { path: "layers", message: "must contain exactly one layer" }
      ])
    );
  });

  it("does not hide invalid legacy UI values", () => {
    const legacy = createLegacyProject();
    legacy.ui = 42;

    const result = migrateProject(legacy);
    expect(validateProject(result.project)).toEqual({
      valid: false,
      errors: [{ path: "ui", message: "must be an object" }]
    });
  });

  it("returns a current project without applying migrations", () => {
    const current = createTestProject();
    const result = migrateProject(current);

    expect(result.migrated).toBe(false);
    expect(result.appliedVersions).toEqual([]);
    expect(result.project).toEqual(current);
  });

  it("rejects projects without a schema version", () => {
    expect(() => migrateProject({})).toThrowError(
      new ProjectMigrationError("Project is missing schemaVersion")
    );
  });

  it("rejects unsupported older and newer schema versions", () => {
    expect(() => migrateProject({ schemaVersion: "0.0" })).toThrow(
      "Unsupported project schemaVersion: 0.0"
    );
    expect(() => migrateProject({ schemaVersion: "9.0" })).toThrow(
      "Unsupported project schemaVersion: 9.0"
    );
  });
});
