import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadProjectFromFile,
  loadValidProjectBackup,
  projectBackupPath,
  restoreProjectFromBackup,
  saveProjectToFile,
  serializeProject
} from "../../src/shared/schema/io";
import { createTestProject } from "../fixtures/projects";

describe("project schema IO", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "map-schematic-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("serializes a project as readable JSON", () => {
    const project = createTestProject();
    const serialized = serializeProject(project);

    expect(serialized).toContain('\n  "schemaVersion": "0.6"');
    expect(JSON.parse(serialized)).toEqual(project);
  });

  it("saves and loads a valid project", async () => {
    const filePath = path.join(tempDir, "roundtrip.mapproj");
    const project = createTestProject();

    await saveProjectToFile(filePath, project);
    const loaded = await loadProjectFromFile(filePath);

    expect(loaded.project).toEqual(project);
    expect(loaded.validation).toEqual({ valid: true, errors: [] });
    expect(loaded.migration.migrated).toBe(false);
    await expect(fs.access(projectBackupPath(filePath))).rejects.toThrow();
  });

  it("round-trips a viewport crossing the antimeridian", async () => {
    const filePath = path.join(tempDir, "antimeridian.mapproj");
    const project = createTestProject();
    project.viewport.bbox = {
      west: 165,
      south: -20,
      east: -165,
      north: 30,
      crossesAntimeridian: true
    };

    await saveProjectToFile(filePath, project);
    const loaded = await loadProjectFromFile(filePath);

    expect(loaded.project.viewport.bbox).toEqual(project.viewport.bbox);
    expect(loaded.validation).toEqual({ valid: true, errors: [] });
  });

  it("keeps the previous valid project as a backup", async () => {
    const filePath = path.join(tempDir, "with-backup.mapproj");
    const firstProject = createTestProject();
    const secondProject = createTestProject();
    secondProject.objects[0].text = "New label";
    const thirdProject = createTestProject();
    thirdProject.objects[0].text = "Newest label";

    await saveProjectToFile(filePath, firstProject);
    await saveProjectToFile(filePath, secondProject);
    await saveProjectToFile(filePath, thirdProject);

    const current = await loadProjectFromFile(filePath);
    const backup = await loadValidProjectBackup(filePath);
    expect(current.project.objects[0].text).toBe("Newest label");
    expect(backup?.project).toEqual(secondProject);
  });

  it("does not replace a valid backup with a damaged current file", async () => {
    const filePath = path.join(tempDir, "preserve-backup.mapproj");
    const firstProject = createTestProject();
    const secondProject = createTestProject();
    secondProject.objects[0].text = "Second version";
    const replacementProject = createTestProject();
    replacementProject.objects[0].text = "Replacement";

    await saveProjectToFile(filePath, firstProject);
    await saveProjectToFile(filePath, secondProject);
    await fs.writeFile(filePath, "{damaged", "utf8");
    await saveProjectToFile(filePath, replacementProject);

    expect((await loadProjectFromFile(filePath)).project).toEqual(replacementProject);
    expect((await loadValidProjectBackup(filePath))?.project).toEqual(firstProject);
  });

  it("removes an orphaned backup after creating a new project with the same name", async () => {
    const filePath = path.join(tempDir, "recreated.mapproj");
    const orphanedProject = createTestProject();
    const newProject = createTestProject();
    newProject.objects[0].text = "New project";
    await fs.writeFile(
      projectBackupPath(filePath),
      serializeProject(orphanedProject),
      "utf8"
    );

    await saveProjectToFile(filePath, newProject);

    expect((await loadProjectFromFile(filePath)).project).toEqual(newProject);
    await expect(fs.access(projectBackupPath(filePath))).rejects.toThrow();
  });

  it("leaves the original project intact when the atomic commit fails", async () => {
    const filePath = path.join(tempDir, "commit-failure.mapproj");
    const firstProject = createTestProject();
    const secondProject = createTestProject();
    secondProject.objects[0].text = "Must not be committed";
    await saveProjectToFile(filePath, firstProject);

    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === filePath) {
        throw new Error("simulated commit failure");
      }
      return originalRename(oldPath, newPath);
    });

    await expect(saveProjectToFile(filePath, secondProject)).rejects.toThrow(
      "simulated commit failure"
    );
    const loaded = await loadProjectFromFile(filePath);
    expect(loaded.project).toEqual(firstProject);
    expect((await fs.readdir(tempDir)).some((name) => name.includes(".saving-"))).toBe(false);
  });

  it("restores a damaged project from its last valid backup", async () => {
    const filePath = path.join(tempDir, "recover.mapproj");
    const firstProject = createTestProject();
    const secondProject = createTestProject();
    secondProject.objects[0].text = "Second version";
    await saveProjectToFile(filePath, firstProject);
    await saveProjectToFile(filePath, secondProject);
    await fs.writeFile(filePath, "{damaged", "utf8");

    const backup = await loadValidProjectBackup(filePath);
    expect(backup?.project).toEqual(firstProject);

    const restored = await restoreProjectFromBackup(filePath);
    expect(restored.project).toEqual(firstProject);
    expect((await loadValidProjectBackup(filePath))?.project).toEqual(firstProject);
  });

  it("does not offer an invalid backup for recovery", async () => {
    const filePath = path.join(tempDir, "invalid-backup.mapproj");
    await fs.writeFile(projectBackupPath(filePath), "{invalid", "utf8");

    await expect(loadValidProjectBackup(filePath)).resolves.toBeNull();
    await expect(restoreProjectFromBackup(filePath)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("refuses to save a project that fails validation", async () => {
    const filePath = path.join(tempDir, "invalid.mapproj");
    const project = createTestProject();
    project.canvas.width = 0;

    await expect(saveProjectToFile(filePath, project)).rejects.toThrow(
      "Project validation failed: canvas.width: must be a positive number"
    );
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("does not modify an existing project when replacement validation fails", async () => {
    const filePath = path.join(tempDir, "invalid-replacement.mapproj");
    const original = createTestProject();
    const invalid = createTestProject();
    invalid.canvas.width = 0;
    await saveProjectToFile(filePath, original);

    await expect(saveProjectToFile(filePath, invalid)).rejects.toThrow(
      "Project validation failed"
    );
    expect((await loadProjectFromFile(filePath)).project).toEqual(original);
    await expect(fs.access(projectBackupPath(filePath))).rejects.toThrow();
  });

  it("migrates a legacy project while loading", async () => {
    const filePath = path.join(tempDir, "legacy.mapproj");
    const legacy = createTestProject() as unknown as Record<string, unknown>;
    legacy.schemaVersion = "0.1";
    legacy.viewport = {
      projection: "EPSG:4326",
      bbox: { minLon: -180, minLat: -85, maxLon: 180, maxLat: 85 }
    };
    delete legacy.ui;
    await fs.writeFile(filePath, JSON.stringify(legacy), "utf8");

    const loaded = await loadProjectFromFile(filePath);
    expect(loaded.project.schemaVersion).toBe("0.6");
    expect(loaded.project.ui).toEqual({});
    expect(loaded.validation.valid).toBe(true);
    expect(loaded.migration).toMatchObject({
      migrated: true,
      fromVersion: "0.1",
      toVersion: "0.6",
      appliedVersions: ["0.2", "0.3", "0.4", "0.5", "0.6"]
    });
  });

  it("returns validation errors for structurally invalid JSON projects", async () => {
    const filePath = path.join(tempDir, "structurally-invalid.mapproj");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: "0.6",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dataPackVersion: "2026.02",
        ui: {}
      }),
      "utf8"
    );

    const loaded = await loadProjectFromFile(filePath);
    expect(loaded.validation.valid).toBe(false);
    expect(loaded.validation.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(["canvas", "viewport", "layers", "objects"])
    );
  });

  it("rejects malformed JSON", async () => {
    const filePath = path.join(tempDir, "malformed.mapproj");
    await fs.writeFile(filePath, "{not-json", "utf8");

    await expect(loadProjectFromFile(filePath)).rejects.toBeInstanceOf(SyntaxError);
  });
});
