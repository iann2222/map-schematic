import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { withDatapackLock } from "./data-root-lock";
import { DataPackError, datapackError, invalidDatapack, isInvalidOrMissingDatapack } from "./errors";
import type { DataPackIssue } from "./types";

import { getPackRoot } from "./layout";
import {
  sha256File,
  validateInstalledDatapack
} from "./manifest";
import { writeInstalledDatapackValidationCache } from "./validation-cache";
import {
  pathExists,
  setActivePack
} from "./local-store";
import type {
  DataPackRef,
  DataPackRelease,
  ReadyDataPack
} from "./types";

export type DataPackInstallerOptions = {
  dataRoot: string;
  release: DataPackRelease;
  downloadFile: (url: string, destination: string) => Promise<void>;
  extractArchive: (archivePath: string, destination: string) => Promise<void>;
  beforeReplace?: () => void | Promise<void>;
};

export type ValidateReadyPack = (
  ref: DataPackRef
) => Promise<ReadyDataPack | null>;

export async function replacePackRoot(
  targetRoot: string,
  incomingRoot: string,
  preserveCurrent: boolean,
  onWarning: (issue: DataPackIssue) => void = (issue) => console.warn("Datapack cleanup:", issue.message)
): Promise<string | null> {
  const previousPath = `${targetRoot}-previous`;
  const displacedPath = `${targetRoot}-displaced-${randomUUID()}`;
  let displacedCurrent = false;

  if (await pathExists(targetRoot)) {
    const destination = preserveCurrent ? previousPath : displacedPath;
    if (preserveCurrent && (await pathExists(previousPath))) {
      throw new Error("Datapack replacement has an unresolved previous pack");
    }
    await fs.rename(targetRoot, destination);
    displacedCurrent = true;
  }

  try {
    await fs.rename(incomingRoot, targetRoot);
  } catch (error) {
    if (displacedCurrent) {
      const restoreSource = preserveCurrent ? previousPath : displacedPath;
      try {
        await fs.rename(restoreSource, targetRoot);
      } catch {
        // Keep the preserved directory intact for the next recovery attempt.
      }
    }
    throw error;
  }

  if (displacedCurrent && !preserveCurrent) {
    await cleanupPath(displacedPath, onWarning);
  }
  return preserveCurrent && displacedCurrent ? previousPath : null;
}

export class DataPackInstaller {
  private readonly dataRoot: string;
  private readonly release: DataPackRelease;
  private readonly downloadFile: DataPackInstallerOptions["downloadFile"];
  private readonly extractArchive: DataPackInstallerOptions["extractArchive"];
  private readonly beforeReplace: DataPackInstallerOptions["beforeReplace"];

  constructor(options: DataPackInstallerOptions) {
    this.dataRoot = options.dataRoot;
    this.release = options.release;
    this.downloadFile = options.downloadFile;
    this.extractArchive = options.extractArchive;
    this.beforeReplace = options.beforeReplace;
  }

  async recoverInterruptedTarget(
    validatePack: ValidateReadyPack
  ): Promise<ReadyDataPack | null> {
    const ref = this.targetRef;
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    const previousPath = `${rootPath}-previous`;
    const warnings: DataPackIssue[] = [];
    const warn = (issue: DataPackIssue) => warnings.push(issue);
    if (!(await pathExists(previousPath))) {
      return null;
    }
    const current = await validatePack(ref);
    if (current) {
      await cleanupPath(previousPath, warn);
      return { ...current, warnings };
    }
    let manifest;
    try {
      manifest = await validateInstalledDatapack(previousPath, ref);
      await writeInstalledDatapackValidationCache(
        previousPath,
        manifest
      ).catch(() => undefined);
    } catch (error) {
      if (!isInvalidOrMissingDatapack(error)) throw datapackError(error, "validation");
      await cleanupPath(previousPath, warn);
      return null;
    }
    try {
      await this.beforeReplace?.();
      await replacePackRoot(rootPath, previousPath, false, warn);
    } catch (error) { throw datapackError(error, "replace"); }
    return { ref, rootPath, manifest, source: "recovered", warnings };
  }

  async installRelease(): Promise<ReadyDataPack> {
    const ref = this.targetRef;
    const downloadRoot = path.join(this.dataRoot, ".download");
    const workRoot = path.join(downloadRoot, `datapack-${ref.id}-${ref.version}-${randomUUID()}`);
    const archivePath = path.join(workRoot, "release.zip");
    const installingPath = path.join(
      workRoot,
      `datapack-${ref.id}-${ref.version}-installing`
    );
    const targetRoot = getPackRoot(
      this.dataRoot,
      ref.id,
      ref.version
    );
    const warnings: DataPackIssue[] = [];
    const warn = (issue: DataPackIssue) => warnings.push(issue);
    let stage: DataPackIssue["stage"] = "download";
    try {
      await fs.mkdir(workRoot, { recursive: true });
      await this.downloadFile(this.release.url, archivePath);
      stage = "validation";
      const actualChecksum = await sha256File(archivePath);
      if (
        actualChecksum.toLowerCase() !==
        this.release.sha256.toLowerCase()
      ) {
        throw invalidDatapack("Datapack release checksum mismatch");
      }
      stage = "extract";
      await this.extractArchive(archivePath, installingPath);
      stage = "validation";
      const manifest = await validateInstalledDatapack(
        installingPath,
        ref
      );
      await writeInstalledDatapackValidationCache(
        installingPath,
        manifest
      ).catch(() => undefined);
      await withDatapackLock(this.dataRoot, "access", async () => {
        stage = "replace";
        await fs.mkdir(path.dirname(targetRoot), { recursive: true });
        await this.beforeReplace?.();
        const previous = `${targetRoot}-previous`;
        if (await pathExists(previous)) {
          // A verified incoming pack supersedes an abandoned previous directory.
          // Do not displace the current target until this removal succeeds.
          await fs.rm(previous, { recursive: true, force: true });
        }
        const previousPath = await replacePackRoot(targetRoot, installingPath, true, warn);
        stage = "activate";
        try {
          await setActivePack(this.dataRoot, ref);
        } catch (error) {
          try {
            await fs.rename(targetRoot, installingPath);
            if (previousPath) await fs.rename(previousPath, targetRoot);
          } catch (rollbackError) {
            const failure = datapackError(error, "activate");
            throw new DataPackError({ ...failure.issue, message: `${failure.message}; rollback: ${String(rollbackError)}` }, error);
          }
          throw error;
        }
        if (previousPath) await cleanupPath(previousPath, warn);
      }, { onWarning: warn });
      return {
        ref,
        rootPath: targetRoot,
        manifest,
        source: "downloaded",
        warnings
      };
    } catch (error) {
      throw datapackError(error, stage);
    } finally {
      await cleanupPath(workRoot, warn);
    }
  }

  private get targetRef(): DataPackRef {
    return { id: this.release.id, version: this.release.version };
  }
}

async function cleanupPath(target: string, warn: (issue: DataPackIssue) => void): Promise<void> {
  try { await fs.rm(target, { recursive: true, force: true }); }
  catch (error) { warn(datapackError(error, "cleanup").issue); }
}
