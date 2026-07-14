import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadProjectFromFile,
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
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("serializes a project as readable JSON", () => {
    const project = createTestProject();
    const serialized = serializeProject(project);

    expect(serialized).toContain('\n  "schemaVersion": "0.1"');
    expect(JSON.parse(serialized)).toEqual(project);
  });

  it("saves and loads a valid project", async () => {
    const filePath = path.join(tempDir, "roundtrip.mapproj");
    const project = createTestProject();

    await saveProjectToFile(filePath, project);
    const loaded = await loadProjectFromFile(filePath);

    expect(loaded.project).toEqual(project);
    expect(loaded.validation).toEqual({ valid: true, errors: [] });
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

  it("returns validation errors for structurally invalid JSON projects", async () => {
    const filePath = path.join(tempDir, "structurally-invalid.mapproj");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: "0.1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dataPackVersion: "2026.02"
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
