import { describe, expect, it } from "vitest";

import { validateProject } from "../../src/shared/schema/validate";
import { createTestPointObject, createTestProject } from "../fixtures/projects";

describe("validateProject", () => {
  it("accepts a complete project", () => {
    expect(validateProject(createTestProject())).toEqual({
      valid: true,
      errors: []
    });
  });

  it("returns a root error for non-object input", () => {
    expect(validateProject(null)).toEqual({
      valid: false,
      errors: [{ path: "$", message: "must be an object" }]
    });
  });

  it("reports missing top-level structures without throwing", () => {
    const result = validateProject({
      schemaVersion: "0.2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dataPackVersion: "2026.02"
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(["canvas", "viewport", "layers", "objects"])
    );
  });

  it("rejects unsupported object types and missing layer references", () => {
    const project = createTestProject();
    project.objects = [
      createTestPointObject({
        type: "unsupported" as never,
        layerId: "missing-layer"
      })
    ];

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: "objects[0].type", message: "unsupported object type" },
        {
          path: "objects[0].layerId",
          message: "must reference an existing layer"
        }
      ])
    );
  });

  it("rejects multiple layers and duplicate ids", () => {
    const project = createTestProject();
    project.layers.push({ ...project.layers[0] });
    project.objects.push(createTestPointObject());

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: "layers", message: "must contain exactly one layer" },
        { path: "layers[1].id", message: "must be unique" },
        { path: "objects[1].id", message: "must be unique" }
      ])
    );
  });

  it("rejects canvas sizes that would create excessive output", () => {
    const pixelProject = createTestProject();
    pixelProject.canvas.width = 8193;
    const millimeterProject = createTestProject();
    millimeterProject.canvas = { width: 2200, height: 297, unit: "mm" };

    expect(validateProject(pixelProject).errors).toEqual(
      expect.arrayContaining([
        {
          path: "canvas.width",
          message: "must not exceed 8192 logical output pixels"
        }
      ])
    );
    expect(validateProject(millimeterProject).errors).toEqual(
      expect.arrayContaining([
        {
          path: "canvas.width",
          message: "must not exceed 8192 logical output pixels"
        }
      ])
    );
  });

  it("rejects invalid coordinates and non-finite style values", () => {
    const project = createTestProject();
    project.objects = [
      createTestPointObject({
        geometry: { kind: "point", lon: 181, lat: -91 },
        style: { fontSize: Number.NaN }
      })
    ];

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          path: "objects[0].geometry.lon",
          message: "must be between -180 and 180"
        },
        {
          path: "objects[0].geometry.lat",
          message: "must be between -90 and 90"
        },
        {
          path: "objects[0].style.fontSize",
          message: "must be a finite number"
        }
      ])
    );
  });

  it("requires longitude/latitude viewport coordinates to use EPSG:4326", () => {
    const project = createTestProject() as unknown as {
      viewport: { projection: string };
    };
    project.viewport.projection = "EPSG:3857";

    expect(validateProject(project)).toMatchObject({
      valid: false,
      errors: [
        {
          path: "viewport.projection",
          message: "must be EPSG:4326 because bbox uses longitude/latitude degrees"
        }
      ]
    });
  });

  it("accepts a viewport crossing the antimeridian", () => {
    const project = createTestProject();
    project.viewport.bbox = {
      west: 165,
      south: -20,
      east: -165,
      north: 30,
      crossesAntimeridian: true
    };

    expect(validateProject(project)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a bbox whose ordering disagrees with its antimeridian flag", () => {
    const project = createTestProject();
    project.viewport.bbox = {
      west: 165,
      south: -20,
      east: -165,
      north: 30,
      crossesAntimeridian: false
    };

    expect(validateProject(project).errors).toEqual(
      expect.arrayContaining([
        {
          path: "viewport.bbox",
          message: "west must be less than east when not crossing the antimeridian"
        }
      ])
    );
  });

  it("rejects malformed ordering and ratio settings", () => {
    const project = createTestProject() as unknown as Record<string, unknown>;
    project.ui = {
      listOrderKeys: ["marker:point-1", 42],
      ratioMode: "stretch",
      cropRatio: 0
    };

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          path: "ui.listOrderKeys",
          message: "must be an array of strings"
        },
        { path: "ui.ratioMode", message: "must be free or fixed" },
        { path: "ui.cropRatio", message: "must be positive" }
      ])
    );
  });

  it("rejects a canvas that disagrees with the saved crop ratio", () => {
    const project = createTestProject();
    project.canvas = { width: 1200, height: 800, unit: "px" };
    project.ui = { ratioMode: "fixed", cropRatio: 1 };

    expect(validateProject(project).errors).toEqual(
      expect.arrayContaining([
        {
          path: "canvas",
          message: "aspect ratio must match ui.cropRatio"
        }
      ])
    );
  });

  it("rejects malformed or oversized saved history", () => {
    const malformed = createTestProject() as unknown as Record<string, unknown>;
    malformed.history = { undo: "not-an-array", redo: [] };
    const oversized = createTestProject() as unknown as Record<string, unknown>;
    oversized.history = { undo: Array.from({ length: 301 }, () => ({})), redo: [] };
    const splitOversized = createTestProject() as unknown as Record<string, unknown>;
    splitOversized.history = {
      undo: Array.from({ length: 151 }, () => ({})),
      redo: Array.from({ length: 150 }, () => ({}))
    };

    expect(validateProject(malformed).errors).toEqual(
      expect.arrayContaining([{ path: "history.undo", message: "must be an array" }])
    );
    expect(validateProject(oversized).errors).toEqual(
      expect.arrayContaining([
        { path: "history.undo", message: "must contain at most 300 commands" }
      ])
    );
    expect(validateProject(splitOversized).errors).toEqual(
      expect.arrayContaining([
        { path: "history", message: "must contain at most 300 commands in total" }
      ])
    );
  });
});
