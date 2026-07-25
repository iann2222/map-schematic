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

  it("rejects duplicate layer and object ids", () => {
    const project = createTestProject();
    project.layers.push({ ...project.layers[0] });
    project.objects.push(createTestPointObject());

    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: "layers[1].id", message: "must be unique" },
        { path: "objects[1].id", message: "must be unique" }
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
});
