import crypto from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";

import {
  DataPackManifest,
  DataPackRef,
  DataPackRelease
} from "./types";
import {
  isNonEmptyString,
  isRecord
} from "../validation/primitives";

const MAX_PACK_SEGMENT_LENGTH = 64;
const WINDOWS_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)
]);

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function isSafePackSegment(value: unknown): value is string {
  if (
    !isNonEmptyString(value) ||
    value.length > MAX_PACK_SEGMENT_LENGTH ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/.test(value) ||
    value.includes("..")
  ) {
    return false;
  }
  return !WINDOWS_RESERVED_NAMES.has(value.split(".", 1)[0].toUpperCase());
}

export function resolveInsidePack(root: string, relativePath: string): string {
  if (
    !isNonEmptyString(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Datapack file path must be relative: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Datapack file path escapes pack root: ${relativePath}`);
  }
  return resolvedPath;
}

export function validateRelease(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return ["release must be an object"];
  }
  if (!isSafePackSegment(input.id)) {
    errors.push("id must be a safe non-empty path segment");
  }
  if (!isSafePackSegment(input.version)) {
    errors.push("version must be a safe non-empty path segment");
  }
  if (!isNonEmptyString(input.url)) {
    errors.push("url must be a non-empty string");
  } else {
    try {
      const url = new URL(input.url);
      if (url.protocol !== "https:" || url.hostname !== "github.com") {
        errors.push("url must be an HTTPS github.com release URL");
      }
    } catch {
      errors.push("url must be a valid URL");
    }
  }
  if (!isSha256(input.sha256)) {
    errors.push("sha256 must be a 64-character hexadecimal checksum");
  }
  if (
    input.sourceFiles !== undefined &&
    (!Array.isArray(input.sourceFiles) ||
      input.sourceFiles.some((entry) => typeof entry !== "string"))
  ) {
    errors.push("sourceFiles must be an array of strings");
  }
  return errors;
}

export function parseRelease(input: unknown): DataPackRelease {
  const errors = validateRelease(input);
  if (errors.length > 0) {
    throw new Error(`Invalid datapack release config: ${errors.join("; ")}`);
  }
  return input as DataPackRelease;
}

export function validateManifest(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return ["manifest must be an object"];
  }
  if (!isSafePackSegment(input.id)) {
    errors.push("id must be a safe non-empty path segment");
  }
  if (!isSafePackSegment(input.version)) {
    errors.push("version must be a safe non-empty path segment");
  }
  if (!isNonEmptyString(input.createdAt) || !Number.isFinite(Date.parse(input.createdAt))) {
    errors.push("createdAt must be a valid date string");
  }
  if (input.projection !== "EPSG:4326") {
    errors.push("projection must be EPSG:4326");
  }
  if (input.buildEnvironment !== undefined) {
    if (!isRecord(input.buildEnvironment)) {
      errors.push("buildEnvironment must be an object");
    } else {
      for (const field of [
        "python",
        "geopandas",
        "pyogrio",
        "pyproj",
        "pillow",
        "gdal"
      ]) {
        if (!isNonEmptyString(input.buildEnvironment[field])) {
          errors.push(`buildEnvironment.${field} must be a non-empty string`);
        }
      }
      if (input.buildEnvironment.condaPlatform !== "win-64") {
        errors.push("buildEnvironment.condaPlatform must be win-64");
      }
      if (!isSha256(input.buildEnvironment.condaLockSha256)) {
        errors.push("buildEnvironment.condaLockSha256 must be a SHA-256 checksum");
      }
    }
  }

  const referencedPaths = new Set<string>();
  if (!isRecord(input.basemap) || input.basemap.format !== "geojson") {
    errors.push("basemap.format must be geojson");
  } else if (!Array.isArray(input.basemap.layers) || input.basemap.layers.length === 0) {
    errors.push("basemap.layers must be a non-empty array");
  } else {
    const layerIds = new Set<string>();
    for (const layer of input.basemap.layers) {
      if (!isRecord(layer) || !isNonEmptyString(layer.id) || !isNonEmptyString(layer.path)) {
        errors.push("each basemap layer must contain non-empty id and path");
        continue;
      }
      if (layerIds.has(layer.id)) {
        errors.push(`basemap layer id must be unique: ${layer.id}`);
      }
      layerIds.add(layer.id);
      try {
        resolveInsidePack("/datapack", layer.path);
        referencedPaths.add(layer.path);
      } catch (error) {
        errors.push(String(error));
      }
    }
  }

  if (!isRecord(input.geonames) || input.geonames.format !== "sqlite+fts") {
    errors.push("geonames.format must be sqlite+fts");
  } else {
    if (!isNonEmptyString(input.geonames.dbPath)) {
      errors.push("geonames.dbPath must be a non-empty string");
    } else {
      try {
        resolveInsidePack("/datapack", input.geonames.dbPath);
        referencedPaths.add(input.geonames.dbPath);
      } catch (error) {
        errors.push(String(error));
      }
    }
    if (
      !Array.isArray(input.geonames.languages) ||
      input.geonames.languages.some((entry) => !isNonEmptyString(entry))
    ) {
      errors.push("geonames.languages must be an array of non-empty strings");
    }
  }

  if (input.relief !== undefined && input.relief !== null) {
    if (
      !isRecord(input.relief) ||
      !isNonEmptyString(input.relief.format) ||
      !isNonEmptyString(input.relief.path)
    ) {
      errors.push("relief must contain non-empty format and path");
    } else {
      try {
        resolveInsidePack("/datapack", input.relief.path);
        referencedPaths.add(input.relief.path);
      } catch (error) {
        errors.push(String(error));
      }
    }
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    errors.push("files must be a non-empty array");
  } else {
    const filePaths = new Set<string>();
    for (const entry of input.files) {
      if (!isRecord(entry) || !isNonEmptyString(entry.path)) {
        errors.push("each file entry must contain a non-empty path");
        continue;
      }
      try {
        resolveInsidePack("/datapack", entry.path);
      } catch (error) {
        errors.push(String(error));
      }
      if (filePaths.has(entry.path)) {
        errors.push(`file path must be unique: ${entry.path}`);
      }
      filePaths.add(entry.path);
      if (!Number.isSafeInteger(entry.sizeBytes) || (entry.sizeBytes as number) < 0) {
        errors.push(`file size must be a non-negative integer: ${entry.path}`);
      }
      if (entry.path !== "datapack.json" && !isSha256(entry.sha256)) {
        errors.push(`file checksum must be valid: ${entry.path}`);
      }
    }
    for (const referencedPath of referencedPaths) {
      if (!filePaths.has(referencedPath)) {
        errors.push(`referenced file is missing from files list: ${referencedPath}`);
      }
    }
  }
  return errors;
}

export function parseManifest(input: unknown): DataPackManifest {
  const errors = validateManifest(input);
  if (errors.length > 0) {
    throw new Error(`Invalid datapack manifest: ${errors.join("; ")}`);
  }
  return input as DataPackManifest;
}

export async function readManifest(manifestPath: string): Promise<DataPackManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return parseManifest(JSON.parse(raw) as unknown);
}

export async function sha256File(target: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(target)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function validateInstalledDatapack(
  packRoot: string,
  expected?: DataPackRef
): Promise<DataPackManifest> {
  const manifest = await readManifest(path.join(packRoot, "datapack.json"));
  if (expected && (manifest.id !== expected.id || manifest.version !== expected.version)) {
    throw new Error(
      `Installed pack mismatch: expected ${expected.id} ${expected.version}, got ${manifest.id} ${manifest.version}`
    );
  }
  for (const entry of manifest.files) {
    const filePath = resolveInsidePack(packRoot, entry.path);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`Datapack path is not a file: ${entry.path}`);
    }
    if (stat.size !== entry.sizeBytes) {
      throw new Error(`Datapack file size mismatch: ${entry.path}`);
    }
    if (entry.path !== "datapack.json") {
      const actual = await sha256File(filePath);
      if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
        throw new Error(`Datapack file checksum mismatch: ${entry.path}`);
      }
    }
  }
  return manifest;
}
