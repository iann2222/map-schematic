import { describe, expect, it } from "vitest";

import {
  parseRelease,
  resolveInsidePack,
  validateManifest,
  validateRelease
} from "../../src/shared/datapack/manifest";
import type { DataPackManifest } from "../../src/shared/datapack/types";

function validManifest(): DataPackManifest {
  return {
    id: "standard",
    version: "2026.03",
    createdAt: "2026-03-01T00:00:00Z",
    projection: "EPSG:4326",
    basemap: {
      format: "geojson",
      layers: [{ id: "land", path: "basemap/land.geojson" }]
    },
    geonames: {
      format: "sqlite+fts",
      dbPath: "geonames/geonames.sqlite",
      languages: ["en"]
    },
    relief: null,
    files: [
      {
        path: "basemap/land.geojson",
        sizeBytes: 2,
        sha256: "a".repeat(64)
      },
      {
        path: "geonames/geonames.sqlite",
        sizeBytes: 2,
        sha256: "b".repeat(64)
      }
    ]
  };
}

describe("datapack manifest contract", () => {
  it("accepts a complete manifest", () => {
    expect(validateManifest(validManifest())).toEqual([]);
  });

  it("rejects unsafe and unlisted referenced paths", () => {
    const manifest = validManifest() as unknown as Record<string, unknown>;
    manifest.basemap = {
      format: "geojson",
      layers: [{ id: "land", path: "../outside.geojson" }]
    };

    const errors = validateManifest(manifest);
    expect(errors.some((error) => error.includes("escapes pack root"))).toBe(true);
  });

  it("rejects duplicate files and missing checksums", () => {
    const manifest = validManifest();
    manifest.files.push({ ...manifest.files[0], sha256: "invalid" });

    const errors = validateManifest(manifest);
    expect(errors).toEqual(
      expect.arrayContaining([
        "file path must be unique: basemap/land.geojson",
        "file checksum must be valid: basemap/land.geojson"
      ])
    );
  });

  it("keeps resolved files inside the pack root", () => {
    expect(resolveInsidePack("C:\\packs\\standard", "basemap/land.geojson")).toContain(
      "basemap"
    );
    expect(() => resolveInsidePack("C:\\packs\\standard", "../../outside")).toThrow(
      "escapes pack root"
    );
  });
});

describe("datapack release contract", () => {
  it("accepts an official GitHub HTTPS release", () => {
    const release = {
      id: "standard",
      version: "2026.03",
      url: "https://github.com/example/releases/download/v1/datapack.zip",
      sha256: "a".repeat(64)
    };
    expect(validateRelease(release)).toEqual([]);
    expect(parseRelease(release)).toEqual(release);
  });

  it("rejects non-GitHub, insecure, and unsafe release settings", () => {
    const errors = validateRelease({
      id: "../standard",
      version: "2026/03",
      url: "http://example.com/datapack.zip",
      sha256: "bad"
    });
    expect(errors.length).toBe(4);
  });
});
