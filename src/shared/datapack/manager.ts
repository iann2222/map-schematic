import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import { getActivePath, getManifestPath, getPacksRoot, getPackRoot } from "./layout";
import {
  isSafePackSegment,
  parseRelease,
  sha256File,
  validateInstalledDatapack
} from "./manifest";
import {
  DataPackDownloadReason,
  DataPackManifest,
  DataPackRef,
  DataPackRelease,
  ReadyDataPack
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

export type DataPackManagerOptions = {
  dataRoot: string;
  release: unknown;
  downloadFile: (url: string, destination: string) => Promise<void>;
  extractArchive: (archivePath: string, destination: string) => Promise<void>;
};

export type EnsureDataPackOptions = {
  confirmDownload?: (reason: DataPackDownloadReason, release: DataPackRelease) => Promise<boolean>;
};

export class DatapackDownloadDeclinedError extends Error {
  readonly reason: DataPackDownloadReason;

  constructor(reason: DataPackDownloadReason) {
    super(`Datapack ${reason} download was declined`);
    this.name = "DatapackDownloadDeclinedError";
    this.reason = reason;
  }
}

async function pathExists(target: string): Promise<boolean> {
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

export async function listLocalPacks(dataRoot: string): Promise<LocalPackInfo[]> {
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
      if (!versionEntry.isDirectory() || !isSafePackSegment(versionEntry.name)) {
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

export async function loadLocalPacksWithManifest(dataRoot: string): Promise<LocalPackInfo[]> {
  const packs = await listLocalPacks(dataRoot);
  return Promise.all(
    packs.map(async (pack) => {
      try {
        const manifest = await validateInstalledDatapack(pack.rootPath, pack.ref);
        return { ...pack, manifest };
      } catch {
        return pack;
      }
    })
  );
}

export async function readActivePack(dataRoot: string): Promise<ActivePackState> {
  try {
    const raw = await fs.readFile(getActivePath(dataRoot), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { active: null };
    }
    const active = (parsed as { active?: unknown }).active;
    if (typeof active !== "object" || active === null || Array.isArray(active)) {
      return { active: null };
    }
    const ref = active as { id?: unknown; version?: unknown };
    if (!isSafePackSegment(ref.id) || !isSafePackSegment(ref.version)) {
      return { active: null };
    }
    return { active: { id: ref.id, version: ref.version } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) {
      return { active: null };
    }
    throw error;
  }
}

export async function setActivePack(dataRoot: string, ref: DataPackRef): Promise<void> {
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

export class DataPackManager {
  private readonly dataRoot: string;
  private readonly release: DataPackRelease;
  private readonly downloadFile: DataPackManagerOptions["downloadFile"];
  private readonly extractArchive: DataPackManagerOptions["extractArchive"];
  private readyPromise: Promise<ReadyDataPack> | null = null;

  constructor(options: DataPackManagerOptions) {
    this.dataRoot = path.resolve(options.dataRoot);
    this.release = parseRelease(options.release);
    this.downloadFile = options.downloadFile;
    this.extractArchive = options.extractArchive;
  }

  get targetRef(): DataPackRef {
    return { id: this.release.id, version: this.release.version };
  }

  ensureReady(options: EnsureDataPackOptions = {}): Promise<ReadyDataPack> {
    if (!this.readyPromise) {
      this.readyPromise = this.ensureReadyOnce(options).catch((error) => {
        if (!(error instanceof DatapackDownloadDeclinedError)) {
          this.readyPromise = null;
        }
        throw error;
      });
    }
    return this.readyPromise;
  }

  update(): Promise<ReadyDataPack> {
    this.readyPromise = null;
    return this.ensureReady({ confirmDownload: async () => true });
  }

  invalidate(): void {
    this.readyPromise = null;
  }

  private async validatePack(ref: DataPackRef): Promise<ReadyDataPack | null> {
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    try {
      const manifest = await validateInstalledDatapack(rootPath, ref);
      return { ref, rootPath, manifest, source: "installed" };
    } catch {
      return null;
    }
  }

  private async recoverInterruptedTarget(): Promise<ReadyDataPack | null> {
    const ref = this.targetRef;
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    const previousPath = `${rootPath}-previous`;
    if (!(await pathExists(previousPath))) {
      return null;
    }
    const current = await this.validatePack(ref);
    if (current) {
      await fs.rm(previousPath, { recursive: true, force: true });
      return current;
    }
    let manifest: DataPackManifest;
    try {
      manifest = await validateInstalledDatapack(previousPath, ref);
    } catch {
      await fs.rm(previousPath, { recursive: true, force: true });
      return null;
    }
    await fs.rm(rootPath, { recursive: true, force: true });
    await fs.rename(previousPath, rootPath);
    return { ref, rootPath, manifest, source: "recovered" };
  }

  private async findFallback(): Promise<ReadyDataPack | null> {
    const active = (await readActivePack(this.dataRoot)).active;
    if (active && (active.id !== this.release.id || active.version !== this.release.version)) {
      const ready = await this.validatePack(active);
      if (ready) {
        return { ...ready, source: "fallback" };
      }
    }
    const packs = await listLocalPacks(this.dataRoot);
    for (const pack of packs) {
      if (pack.ref.id === this.release.id && pack.ref.version === this.release.version) {
        continue;
      }
      const ready = await this.validatePack(pack.ref);
      if (ready) {
        return { ...ready, source: "fallback" };
      }
    }
    return null;
  }

  private async ensureReadyOnce(options: EnsureDataPackOptions): Promise<ReadyDataPack> {
    await ensureDataRootExists(this.dataRoot);
    const recovered = await this.recoverInterruptedTarget();
    if (recovered) {
      await setActivePack(this.dataRoot, recovered.ref);
      return recovered;
    }
    const target = await this.validatePack(this.targetRef);
    if (target) {
      await setActivePack(this.dataRoot, target.ref);
      return target;
    }

    const fallback = await this.findFallback();
    const targetRoot = getPackRoot(this.dataRoot, this.release.id, this.release.version);
    const localPacks = await listLocalPacks(this.dataRoot);
    const reason: DataPackDownloadReason = fallback
      ? "update"
      : (await pathExists(targetRoot)) || localPacks.length > 0
        ? "repair"
        : "initialization";

    if (reason !== "initialization") {
      const approved = options.confirmDownload
        ? await options.confirmDownload(reason, this.release)
        : false;
      if (!approved) {
        if (fallback) {
          await setActivePack(this.dataRoot, fallback.ref);
          return fallback;
        }
        throw new DatapackDownloadDeclinedError(reason);
      }
    }
    return this.installRelease();
  }

  private async installRelease(): Promise<ReadyDataPack> {
    const ref = this.targetRef;
    const downloadRoot = path.join(this.dataRoot, ".download");
    const archivePath = path.join(downloadRoot, `datapack-${ref.id}-${ref.version}.zip`);
    const installingPath = path.join(
      downloadRoot,
      `datapack-${ref.id}-${ref.version}-installing`
    );
    const targetRoot = getPackRoot(this.dataRoot, ref.id, ref.version);
    await fs.mkdir(downloadRoot, { recursive: true });
    try {
      await fs.rm(installingPath, { recursive: true, force: true });
      await this.downloadFile(this.release.url, archivePath);
      const actualChecksum = await sha256File(archivePath);
      if (actualChecksum.toLowerCase() !== this.release.sha256.toLowerCase()) {
        throw new Error("Datapack release checksum mismatch");
      }
      await this.extractArchive(archivePath, installingPath);
      const manifest = await validateInstalledDatapack(installingPath, ref);
      await fs.mkdir(path.dirname(targetRoot), { recursive: true });
      await fs.rm(targetRoot, { recursive: true, force: true });
      await fs.rename(installingPath, targetRoot);
      await setActivePack(this.dataRoot, ref);
      return { ref, rootPath: targetRoot, manifest, source: "downloaded" };
    } finally {
      await fs.rm(installingPath, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });
    }
  }
}
