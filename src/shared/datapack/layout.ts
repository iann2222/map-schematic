import path from "path";

export const PACKS_DIR = "packs";
export const ACTIVE_FILE = "active.json";
export const MANIFEST_FILE = "datapack.json";

export function getPacksRoot(dataRoot: string): string {
  return path.join(dataRoot, PACKS_DIR);
}

export function getPackRoot(dataRoot: string, id: string, version: string): string {
  return path.join(getPacksRoot(dataRoot), id, version);
}

export function getManifestPath(dataRoot: string, id: string, version: string): string {
  return path.join(getPackRoot(dataRoot, id, version), MANIFEST_FILE);
}

export function getActivePath(dataRoot: string): string {
  return path.join(dataRoot, ACTIVE_FILE);
}
