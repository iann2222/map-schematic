import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import { getPackRoot } from "./layout";
import {
  sha256File,
  validateInstalledDatapack
} from "./manifest";
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
};

export type ValidateReadyPack = (
  ref: DataPackRef
) => Promise<ReadyDataPack | null>;

export async function replacePackRoot(
  targetRoot: string,
  incomingRoot: string,
  preserveCurrent: boolean
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
    await fs.rm(displacedPath, { recursive: true, force: true });
  }
  return preserveCurrent && displacedCurrent ? previousPath : null;
}

export class DataPackInstaller {
  private readonly dataRoot: string;
  private readonly release: DataPackRelease;
  private readonly downloadFile: DataPackInstallerOptions["downloadFile"];
  private readonly extractArchive: DataPackInstallerOptions["extractArchive"];

  constructor(options: DataPackInstallerOptions) {
    this.dataRoot = options.dataRoot;
    this.release = options.release;
    this.downloadFile = options.downloadFile;
    this.extractArchive = options.extractArchive;
  }

  async recoverInterruptedTarget(
    validatePack: ValidateReadyPack
  ): Promise<ReadyDataPack | null> {
    const ref = this.targetRef;
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    const previousPath = `${rootPath}-previous`;
    if (!(await pathExists(previousPath))) {
      return null;
    }
    const current = await validatePack(ref);
    if (current) {
      await fs.rm(previousPath, { recursive: true, force: true });
      return current;
    }
    let manifest;
    try {
      manifest = await validateInstalledDatapack(previousPath, ref);
    } catch {
      await fs.rm(previousPath, { recursive: true, force: true });
      return null;
    }
    await replacePackRoot(rootPath, previousPath, false);
    return { ref, rootPath, manifest, source: "recovered" };
  }

  async installRelease(): Promise<ReadyDataPack> {
    const ref = this.targetRef;
    const downloadRoot = path.join(this.dataRoot, ".download");
    const archivePath = path.join(
      downloadRoot,
      `datapack-${ref.id}-${ref.version}.zip`
    );
    const installingPath = path.join(
      downloadRoot,
      `datapack-${ref.id}-${ref.version}-installing`
    );
    const targetRoot = getPackRoot(
      this.dataRoot,
      ref.id,
      ref.version
    );
    await fs.mkdir(downloadRoot, { recursive: true });
    try {
      await fs.rm(installingPath, { recursive: true, force: true });
      await this.downloadFile(this.release.url, archivePath);
      const actualChecksum = await sha256File(archivePath);
      if (
        actualChecksum.toLowerCase() !==
        this.release.sha256.toLowerCase()
      ) {
        throw new Error("Datapack release checksum mismatch");
      }
      await this.extractArchive(archivePath, installingPath);
      const manifest = await validateInstalledDatapack(
        installingPath,
        ref
      );
      await fs.mkdir(path.dirname(targetRoot), { recursive: true });
      const previousPath = await replacePackRoot(
        targetRoot,
        installingPath,
        true
      );
      await setActivePack(this.dataRoot, ref);
      if (previousPath) {
        await fs.rm(previousPath, { recursive: true, force: true });
      }
      return {
        ref,
        rootPath: targetRoot,
        manifest,
        source: "downloaded"
      };
    } finally {
      await fs.rm(installingPath, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });
    }
  }

  private get targetRef(): DataPackRef {
    return { id: this.release.id, version: this.release.version };
  }
}
