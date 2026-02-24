import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";

import { getActivePath, getManifestPath, getPacksRoot, getPackRoot } from "./layout";
import { DataPackManifest, DataPackRef } from "./types";
import { readManifest } from "./manifest";

export type ActivePackState = {
  active: DataPackRef | null;
};

export type LocalPackInfo = {
  ref: DataPackRef;
  rootPath: string;
  manifestPath: string;
  manifest?: DataPackManifest;
};

export async function ensureDataRootExists(dataRoot: string): Promise<void> {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(getPacksRoot(dataRoot), { recursive: true });
}

export async function listLocalPacks(dataRoot: string): Promise<LocalPackInfo[]> {
  const packsRoot = getPacksRoot(dataRoot);
  const result: LocalPackInfo[] = [];

  let idEntries: Dirent[];
  try {
    idEntries = await fs.readdir(packsRoot, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const idEntry of idEntries) {
    if (!idEntry.isDirectory()) {
      continue;
    }
    const id = idEntry.name;
    const idPath = path.join(packsRoot, id);
    const versionEntries = await fs.readdir(idPath, { withFileTypes: true });
    for (const versionEntry of versionEntries) {
      if (!versionEntry.isDirectory()) {
        continue;
      }
      const version = versionEntry.name;
      const rootPath = getPackRoot(dataRoot, id, version);
      const manifestPath = getManifestPath(dataRoot, id, version);
      result.push({
        ref: { id, version },
        rootPath,
        manifestPath
      });
    }
  }

  return result;
}

export async function loadLocalPacksWithManifest(dataRoot: string): Promise<LocalPackInfo[]> {
  const packs = await listLocalPacks(dataRoot);
  const enriched: LocalPackInfo[] = [];
  for (const pack of packs) {
    try {
      const manifest = await readManifest(pack.manifestPath);
      enriched.push({ ...pack, manifest });
    } catch {
      enriched.push(pack);
    }
  }
  return enriched;
}

export async function readActivePack(dataRoot: string): Promise<ActivePackState> {
  const activePath = getActivePath(dataRoot);
  try {
    const raw = await fs.readFile(activePath, "utf8");
    const parsed = JSON.parse(raw) as ActivePackState;
    return { active: parsed.active ?? null };
  } catch {
    return { active: null };
  }
}

export async function setActivePack(dataRoot: string, ref: DataPackRef): Promise<void> {
  const activePath = getActivePath(dataRoot);
  const payload: ActivePackState = { active: ref };
  await fs.writeFile(activePath, JSON.stringify(payload, null, 2), "utf8");
}

export function validateManifest(manifest: DataPackManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) {
    errors.push("id is required");
  }
  if (!manifest.version) {
    errors.push("version is required");
  }
  if (!manifest.createdAt) {
    errors.push("createdAt is required");
  }
  return errors;
}
