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
    schemaVersion: "0.1"
  } as Record<string, unknown>;
  delete legacy.ui;
  return legacy;
}

describe("migrateProject", () => {
  it("migrates a 0.1 project to 0.3 and adds the UI container", () => {
    const legacy = createLegacyProject();
    const result = migrateProject(legacy);

    expect(result).toMatchObject({
      fromVersion: "0.1",
      toVersion: "0.3",
      migrated: true,
      appliedVersions: ["0.2", "0.3"]
    });
    expect(result.project.schemaVersion).toBe("0.3");
    expect(result.project.ui).toEqual({});
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
    const legacy = createTestProject() as unknown as {
      schemaVersion: string;
      viewport: { projection: string };
    };
    legacy.schemaVersion = "0.2";
    legacy.viewport.projection = "EPSG:3857";

    const result = migrateProject(legacy);

    expect(result.project.viewport.projection).toBe("EPSG:4326");
    expect(result.appliedVersions).toEqual(["0.3"]);
    expect(validateProject(result.project)).toEqual({ valid: true, errors: [] });
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
