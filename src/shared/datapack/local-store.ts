import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import {
  getActivePath,
  getManifestPath,
  getPacksRoot,
  getPackRoot
} from "./layout";
import {
  isSafePackSegment,
  validateInstalledDatapack
} from "./manifest";
import type {
  DataPackManifest,
  DataPackRef
} from "./types";

export type ActivePackState = {
  active: DataPackRef | null;
};

export type LocalPackInfo = {
  ref: DataPackRef;
  rootPath: string;
  manifestPath: string;
  manifest?: DataPackManifest;
};

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function ensureDataRootExists(dataRoot: string): Promise<void> {
  await fs.mkdir(getPacksRoot(dataRoot), { recursive: true });
}

export async function listLocalPacks(
  dataRoot: string
): Promise<LocalPackInfo[]> {
  const packsRoot = getPacksRoot(dataRoot);
  const result: LocalPackInfo[] = [];
  let idEntries;
  try {
    idEntries = await fs.readdir(packsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return result;
    }
    throw error;
  }
  for (const idEntry of idEntries) {
    if (!idEntry.isDirectory() || !isSafePackSegment(idEntry.name)) {
      continue;
    }
    const idPath = path.join(packsRoot, idEntry.name);
    const versionEntries = await fs.readdir(idPath, { withFileTypes: true });
    for (const versionEntry of versionEntries) {
      if (
        !versionEntry.isDirectory() ||
        !isSafePackSegment(versionEntry.name)
      ) {
        continue;
      }
      const ref = { id: idEntry.name, version: versionEntry.name };
      result.push({
        ref,
        rootPath: getPackRoot(dataRoot, ref.id, ref.version),
        manifestPath: getManifestPath(dataRoot, ref.id, ref.version)
      });
    }
  }
  return result;
}

export async function loadLocalPacksWithManifest(
  dataRoot: string
): Promise<LocalPackInfo[]> {
  const packs = await listLocalPacks(dataRoot);
  return Promise.all(
    packs.map(async (pack) => {
      try {
        const manifest = await validateInstalledDatapack(
          pack.rootPath,
          pack.ref
        );
        return { ...pack, manifest };
      } catch {
        return pack;
      }
    })
  );
}

export async function readActivePack(
  dataRoot: string
): Promise<ActivePackState> {
  try {
    const raw = await fs.readFile(getActivePath(dataRoot), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { active: null };
    }
    const active = (parsed as { active?: unknown }).active;
    if (
      typeof active !== "object" ||
      active === null ||
      Array.isArray(active)
    ) {
      return { active: null };
    }
    const ref = active as { id?: unknown; version?: unknown };
    if (!isSafePackSegment(ref.id) || !isSafePackSegment(ref.version)) {
      return { active: null };
    }
    return { active: { id: ref.id, version: ref.version } };
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    ) {
      return { active: null };
    }
    throw error;
  }
}

export async function setActivePack(
  dataRoot: string,
  ref: DataPackRef
): Promise<void> {
  if (!isSafePackSegment(ref.id) || !isSafePackSegment(ref.version)) {
    throw new Error("Active datapack id and version must be safe path segments");
  }
  await ensureDataRootExists(dataRoot);
  const activePath = getActivePath(dataRoot);
  const tempPath = `${activePath}.saving-${process.pid}-${randomUUID()}`;
  const handle = await fs.open(tempPath, "wx");
  try {
    await handle.writeFile(JSON.stringify({ active: ref }, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tempPath, activePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
