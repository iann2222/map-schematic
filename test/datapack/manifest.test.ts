import { describe, expect, it } from "vitest";

import {
  isSafePackSegment,
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

  it("accepts the current official build environment identity", () => {
    const manifest = validManifest() as unknown as Record<string, unknown>;
    manifest.buildEnvironment = {
      python: "3.11.14",
      geopandas: "1.1.2",
      pyogrio: "0.11.1",
      pyproj: "3.7.2",
      pillow: "12.1.0",
      gdal: "3.11.4",
      condaPlatform: "win-64",
      condaLockSha256: "a".repeat(64)
    };

    expect(validateManifest(manifest)).toEqual([]);
  });

  it("accepts only portable bounded pack identifiers", () => {
    expect(isSafePackSegment("standard")).toBe(true);
    expect(isSafePackSegment("2026.03-beta_1")).toBe(true);
    for (const value of [
      "../outside",
      "2026..03",
      "2026.03.",
      "CON",
      "con.txt",
      "a".repeat(65)
    ]) {
      expect(isSafePackSegment(value)).toBe(false);
    }
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

  it("validates optional build environment metadata", () => {
    const manifest = validManifest() as unknown as Record<string, unknown>;
    manifest.buildEnvironment = {
      python: "3.11.14",
      geopandas: "1.1.2",
      pyogrio: "0.11.1",
      pyproj: "3.7.2",
      pillow: "",
      gdal: "3.11.4",
      condaPlatform: "win-64",
      condaLockSha256: "a".repeat(64)
    };

    expect(validateManifest(manifest)).toContain(
      "buildEnvironment.pillow must be a non-empty string"
    );
  });

  it("validates the Conda lock identity", () => {
    const manifest = validManifest() as unknown as Record<string, unknown>;
    manifest.buildEnvironment = {
      python: "3.11.14",
      geopandas: "1.1.2",
      pyogrio: "0.11.1",
      pyproj: "3.7.2",
      pillow: "12.1.0",
      gdal: "3.11.4",
      condaPlatform: "linux-64",
      condaLockSha256: "invalid"
    };

    expect(validateManifest(manifest)).toEqual(
      expect.arrayContaining([
        "buildEnvironment.condaPlatform must be win-64",
        "buildEnvironment.condaLockSha256 must be a SHA-256 checksum"
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
