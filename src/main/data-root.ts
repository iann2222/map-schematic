import fs from "fs";
import path from "path";

import { app } from "electron";

const DATA_ROOT_ENV = "MAP_SCHEMATIC_ROOT";
const LOCATION_FILE = "datapack-location.json";

type SavedDataRoot = {
  dataRoot?: unknown;
};

function locationFilePath(): string {
  return path.join(defaultDataRoot(), LOCATION_FILE);
}

function readSavedDataRoot(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(locationFilePath(), "utf8")) as SavedDataRoot;
    if (typeof parsed.dataRoot !== "string" || !parsed.dataRoot.trim()) {
      return null;
    }
    return path.resolve(parsed.dataRoot);
  } catch {
    return null;
  }
}

function saveDataRoot(dataRoot: string): void {
  const target = locationFilePath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ dataRoot }, null, 2), "utf8");
  } catch {
    // The application can still use the selected root for this launch.
  }
}

function defaultDataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const basePath = localAppData || app.getPath("appData");
  return path.resolve(basePath, "map-schematic");
}

function developmentDataRoot(): string | null {
  if (app.isPackaged) {
    return null;
  }
  const root = app.getAppPath();
  return fs.existsSync(path.join(root, "geodata", "active.json")) ? root : null;
}

/**
 * Chooses one writable base directory for the official data pack in both
 * development and packaged launches. MAP_SCHEMATIC_ROOT is intentionally
 * transient so scripts can opt into a portable or test-specific location.
 */
export function configureDataRoot(): string {
  const environmentRoot = process.env[DATA_ROOT_ENV]?.trim();
  if (environmentRoot) {
    const resolved = path.resolve(environmentRoot);
    process.env[DATA_ROOT_ENV] = resolved;
    return resolved;
  }

  const savedRoot = readSavedDataRoot();
  const selectedRoot = savedRoot ?? developmentDataRoot() ?? defaultDataRoot();
  const resolved = path.resolve(selectedRoot);
  process.env[DATA_ROOT_ENV] = resolved;

  if (!savedRoot) {
    saveDataRoot(resolved);
  }
  return resolved;
}
