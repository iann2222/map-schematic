import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import {
  migrateProject,
  ProjectMigrationError,
  ProjectMigrationResult
} from "./migrate";
import { MapProject } from "./mapproj";
import { validateProject, ValidationResult } from "./validate";

export type LoadProjectResult = {
  project: MapProject;
  validation: ValidationResult;
  migration: ProjectMigrationResult;
};

export function serializeProject(project: MapProject): string {
  return JSON.stringify(project, null, 2);
}

export function projectBackupPath(filePath: string): string {
  return `${filePath}.bak`;
}

function temporaryPath(filePath: string, purpose: string): string {
  return `${filePath}.${purpose}-${process.pid}-${randomUUID()}`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await fs.open(filePath, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncParentDirectory(filePath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(path.dirname(filePath), "r");
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some platforms, including Windows.
  } finally {
    await handle?.close();
  }
}

async function writeDurableFile(filePath: string, payload: string): Promise<void> {
  const handle = await fs.open(filePath, "wx");
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function requireValidProjectFile(filePath: string): Promise<LoadProjectResult> {
  const loaded = await loadProjectFromFile(filePath);
  if (!loaded.validation.valid) {
    const details = loaded.validation.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`Project validation failed: ${details}`);
  }
  return loaded;
}

async function preserveValidProject(filePath: string): Promise<void> {
  if (!(await pathExists(filePath))) {
    return;
  }
  let loaded: LoadProjectResult;
  try {
    loaded = await loadProjectFromFile(filePath);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ProjectMigrationError) {
      return;
    }
    throw error;
  }
  if (!loaded.validation.valid) {
    return;
  }

  const backupPath = projectBackupPath(filePath);
  const backupTempPath = temporaryPath(filePath, "backup");
  try {
    await fs.copyFile(filePath, backupTempPath);
    await syncFile(backupTempPath);
    await requireValidProjectFile(backupTempPath);
    await fs.rename(backupTempPath, backupPath);
    await syncParentDirectory(backupPath);
  } finally {
    await fs.rm(backupTempPath, { force: true });
  }
}

async function writeProjectAtomically(
  filePath: string,
  project: MapProject,
  preserveCurrent: boolean
): Promise<void> {
  const validation = validateProject(project);
  if (!validation.valid) {
    const details = validation.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`Project validation failed: ${details}`);
  }

  const hadCurrentFile = await pathExists(filePath);
  const tempPath = temporaryPath(filePath, "saving");
  try {
    await writeDurableFile(tempPath, serializeProject(project));
    await requireValidProjectFile(tempPath);
    if (preserveCurrent && hadCurrentFile) {
      await preserveValidProject(filePath);
    }
    await fs.rename(tempPath, filePath);
    if (preserveCurrent && !hadCurrentFile) {
      await fs.rm(projectBackupPath(filePath), { force: true });
    }
    await syncParentDirectory(filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

export async function saveProjectToFile(filePath: string, project: MapProject): Promise<void> {
  await writeProjectAtomically(filePath, project, true);
}

export async function loadProjectFromFile(filePath: string): Promise<LoadProjectResult> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const migration = migrateProject(parsed);
  const validation = validateProject(migration.project);
  return { project: migration.project, validation, migration };
}

export async function loadValidProjectBackup(filePath: string): Promise<LoadProjectResult | null> {
  try {
    return await requireValidProjectFile(projectBackupPath(filePath));
  } catch {
    return null;
  }
}

export async function restoreProjectFromBackup(filePath: string): Promise<LoadProjectResult> {
  const backup = await requireValidProjectFile(projectBackupPath(filePath));
  await writeProjectAtomically(filePath, backup.project, false);
  return loadProjectFromFile(filePath);
}
