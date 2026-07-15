import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type {
  DataPackManifest,
  DataPackRef,
  DataPackRelease
} from "../../src/shared/datapack/types";

export function sha256Buffer(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createTestDatapack(
  rootPath: string,
  ref: DataPackRef,
  label = ref.version
): Promise<DataPackManifest> {
  const basemapPath = "basemap/land.geojson";
  const geonamesPath = "geonames/geonames.sqlite";
  const basemap = JSON.stringify({ type: "FeatureCollection", features: [], label });
  const geonames = `sqlite-test-${label}`;
  await fs.mkdir(path.join(rootPath, "basemap"), { recursive: true });
  await fs.mkdir(path.join(rootPath, "geonames"), { recursive: true });
  await fs.writeFile(path.join(rootPath, basemapPath), basemap, "utf8");
  await fs.writeFile(path.join(rootPath, geonamesPath), geonames, "utf8");
  const manifest: DataPackManifest = {
    ...ref,
    createdAt: "2026-07-15T00:00:00.000Z",
    projection: "EPSG:4326",
    basemap: {
      format: "geojson",
      layers: [{ id: "land", path: basemapPath }]
    },
    geonames: {
      format: "sqlite+fts",
      dbPath: geonamesPath,
      languages: ["en", "zh-TW"]
    },
    relief: null,
    files: [
      {
        path: basemapPath,
        sizeBytes: Buffer.byteLength(basemap),
        sha256: sha256Buffer(basemap)
      },
      {
        path: geonamesPath,
        sizeBytes: Buffer.byteLength(geonames),
        sha256: sha256Buffer(geonames)
      }
    ]
  };
  await fs.writeFile(
    path.join(rootPath, "datapack.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  return manifest;
}

export async function createTestRelease(
  archivePath: string,
  ref: DataPackRef
): Promise<DataPackRelease> {
  const archive = `archive-${ref.id}-${ref.version}`;
  await fs.writeFile(archivePath, archive, "utf8");
  return {
    ...ref,
    url: `https://github.com/example/releases/download/${ref.version}/datapack.zip`,
    sha256: sha256Buffer(archive),
    sourceFiles: ["geodata_source/test/"]
  };
}
