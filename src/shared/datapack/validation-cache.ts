import fs from "fs/promises";
import path from "path";

import {
  isSafePackSegment,
  readManifest,
  resolveInsidePack,
  sha256File,
  validateInstalledDatapack
} from "./manifest";
import type {
  DataPackManifest,
  DataPackRef
} from "./types";
import {
  isNonEmptyString,
  isRecord
} from "../validation/primitives";

export const DATAPACK_VALIDATION_CACHE_FILENAME = ".validation-cache.json";
const VALIDATION_CACHE_SCHEMA_VERSION = 1;

type ValidationCacheEntry = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  ctimeMs: number;
};

type ValidationCache = {
  schemaVersion: number;
  id: string;
  version: string;
  manifestSha256: string;
  files: ValidationCacheEntry[];
};

export async function validateInstalledDatapackCached(
  packRoot: string,
  expected?: DataPackRef
): Promise<DataPackManifest> {
  const manifest = await readManifest(path.join(packRoot, "datapack.json"));
  validateExpectedRef(manifest, expected);
  if (await matchesValidationCache(packRoot, manifest)) {
    return manifest;
  }
  const validated = await validateInstalledDatapack(packRoot, expected);
  await writeInstalledDatapackValidationCache(packRoot, validated).catch(
    () => undefined
  );
  return validated;
}

export async function writeInstalledDatapackValidationCache(
  packRoot: string,
  manifest: DataPackManifest
): Promise<void> {
  const manifestPath = path.join(packRoot, "datapack.json");
  const files: ValidationCacheEntry[] = [];
  for (const entry of manifest.files) {
    const stat = await fs.stat(resolveInsidePack(packRoot, entry.path));
    files.push({
      path: entry.path,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs
    });
  }
  const cache: ValidationCache = {
    schemaVersion: VALIDATION_CACHE_SCHEMA_VERSION,
    id: manifest.id,
    version: manifest.version,
    manifestSha256: await sha256File(manifestPath),
    files
  };
  await fs.writeFile(
    path.join(packRoot, DATAPACK_VALIDATION_CACHE_FILENAME),
    JSON.stringify(cache),
    "utf8"
  );
}

async function matchesValidationCache(
  packRoot: string,
  manifest: DataPackManifest
): Promise<boolean> {
  let cache: ValidationCache;
  try {
    const raw = await fs.readFile(
      path.join(packRoot, DATAPACK_VALIDATION_CACHE_FILENAME),
      "utf8"
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidationCache(parsed)) {
      return false;
    }
    cache = parsed;
  } catch {
    return false;
  }
  if (
    cache.id !== manifest.id ||
    cache.version !== manifest.version ||
    cache.files.length !== manifest.files.length
  ) {
    return false;
  }
  const manifestSha256 = await sha256File(
    path.join(packRoot, "datapack.json")
  );
  if (cache.manifestSha256.toLowerCase() !== manifestSha256.toLowerCase()) {
    return false;
  }
  const cachedFiles = new Map(
    cache.files.map((entry) => [entry.path, entry])
  );
  for (const entry of manifest.files) {
    const cached = cachedFiles.get(entry.path);
    if (!cached) {
      return false;
    }
    try {
      const stat = await fs.stat(resolveInsidePack(packRoot, entry.path));
      if (
        !stat.isFile() ||
        stat.size !== entry.sizeBytes ||
        stat.size !== cached.sizeBytes ||
        stat.mtimeMs !== cached.mtimeMs ||
        stat.ctimeMs !== cached.ctimeMs
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function validateExpectedRef(
  manifest: DataPackManifest,
  expected?: DataPackRef
): void {
  if (
    expected &&
    (manifest.id !== expected.id || manifest.version !== expected.version)
  ) {
    throw new Error(
      `Installed pack mismatch: expected ${expected.id} ${expected.version}, got ${manifest.id} ${manifest.version}`
    );
  }
}

function isValidationCache(input: unknown): input is ValidationCache {
  if (
    !isRecord(input) ||
    input.schemaVersion !== VALIDATION_CACHE_SCHEMA_VERSION ||
    !isSafePackSegment(input.id) ||
    !isSafePackSegment(input.version) ||
    !isSha256(input.manifestSha256) ||
    !Array.isArray(input.files)
  ) {
    return false;
  }
  return input.files.every(
    (entry) =>
      isRecord(entry) &&
      isNonEmptyString(entry.path) &&
      Number.isSafeInteger(entry.sizeBytes) &&
      (entry.sizeBytes as number) >= 0 &&
      typeof entry.mtimeMs === "number" &&
      Number.isFinite(entry.mtimeMs) &&
      typeof entry.ctimeMs === "number" &&
      Number.isFinite(entry.ctimeMs)
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
