import path from "path";

import { getPackRoot } from "./layout";
import {
  parseRelease
} from "./manifest";
import { validateInstalledDatapackCached } from "./validation-cache";
import {
  ensureDataRootExists,
  listLocalPacks,
  pathExists,
  readActivePack,
  setActivePack
} from "./local-store";
import { DataPackInstaller } from "./installer";
import { withDatapackLock } from "./data-root-lock";
import { datapackError, isInvalidOrMissingDatapack } from "./errors";
import {
  DataPackDownloadReason,
  DataPackIssue,
  DataPackRef,
  DataPackRelease,
  DataPackStatus,
  ReadyDataPack
} from "./types";

export {
  ensureDataRootExists,
  listLocalPacks,
  loadLocalPacksWithManifest,
  readActivePack,
  setActivePack
} from "./local-store";
export type {
  ActivePackState,
  LocalPackInfo
} from "./local-store";

export type DataPackManagerOptions = {
  dataRoot: string;
  release: unknown;
  downloadFile: (url: string, destination: string) => Promise<void>;
  extractArchive: (archivePath: string, destination: string) => Promise<void>;
  beforeReplace?: () => void | Promise<void>;
};

export type EnsureDataPackOptions = {
  confirmDownload?: (reason: DataPackDownloadReason, release: DataPackRelease) => Promise<boolean>;
  allowUpdateDownload?: boolean;
};

export class DatapackDownloadDeclinedError extends Error {
  readonly reason: DataPackDownloadReason;

  constructor(reason: DataPackDownloadReason) {
    super(`Datapack ${reason} download was declined`);
    this.name = "DatapackDownloadDeclinedError";
    this.reason = reason;
  }
}

export class DataPackManager {
  private readonly dataRoot: string;
  private readonly release: DataPackRelease;
  private readonly installer: DataPackInstaller;
  private readyPromise: Promise<ReadyDataPack> | null = null;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(options: DataPackManagerOptions) {
    this.dataRoot = path.resolve(options.dataRoot);
    this.release = parseRelease(options.release);
    this.installer = new DataPackInstaller({
      dataRoot: this.dataRoot,
      release: this.release,
      downloadFile: options.downloadFile,
      extractArchive: options.extractArchive,
      beforeReplace: options.beforeReplace
    });
  }

  get targetRef(): DataPackRef {
    return { id: this.release.id, version: this.release.version };
  }

  ensureReady(options: EnsureDataPackOptions = {}): Promise<ReadyDataPack> {
    if (!this.readyPromise) {
      this.readyPromise = this.queueReadyOperation(options);
    }
    return this.readyPromise;
  }

  update(options: EnsureDataPackOptions = {}): Promise<ReadyDataPack> {
    const operation = this.queueReadyOperation({
      ...options,
      allowUpdateDownload: true,
      confirmDownload: options.confirmDownload ?? (async () => true)
    });
    this.readyPromise = operation;
    return operation;
  }

  invalidate(): void {
    this.readyPromise = null;
  }

  private async validatePack(ref: DataPackRef): Promise<ReadyDataPack | null> {
    return withDatapackLock(this.dataRoot, "access", () => this.validatePackUnlocked(ref));
  }

  private async validatePackUnlocked(ref: DataPackRef): Promise<ReadyDataPack | null> {
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    try {
      const manifest = await validateInstalledDatapackCached(rootPath, ref);
      return { ref, rootPath, manifest, source: "installed" };
    } catch (error) {
      if (isInvalidOrMissingDatapack(error)) return null;
      throw datapackError(error, "validation");
    }
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

  private async activatePack(ref: DataPackRef): Promise<void> {
    try { await setActivePack(this.dataRoot, ref); }
    catch (error) { throw datapackError(error, "activate"); }
  }

  async getStatus(): Promise<DataPackStatus> {
    return this.runExclusive(() => this.getStatusOnce());
  }

  private queueReadyOperation(
    options: EnsureDataPackOptions
  ): Promise<ReadyDataPack> {
    let operation: Promise<ReadyDataPack>;
    const warnings: DataPackIssue[] = [];
    operation = this.runExclusive(async () => {
      const ready = await this.ensureReadyOnce(options);
      warnings.push(...(ready.warnings ?? []));
      return { ...ready, warnings };
    }, warnings).catch(
      (error) => {
        if (
          this.readyPromise === operation &&
          !(error instanceof DatapackDownloadDeclinedError)
        ) {
          this.readyPromise = null;
        }
        throw error;
      }
    );
    return operation;
  }

  private runExclusive<T>(operation: () => Promise<T>, warnings?: DataPackIssue[]): Promise<T> {
    const result = this.operationTail.then(() => withDatapackLock(this.dataRoot, "install", operation, {
      onWarning: (issue) => {
        if (warnings) warnings.push(issue);
        else console.warn("Datapack cleanup:", issue.message);
      },
    })).catch((error) => {
      if (error instanceof DatapackDownloadDeclinedError) throw error;
      throw datapackError(error, "validation");
    });
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async getStatusOnce(): Promise<DataPackStatus> {
    await ensureDataRootExists(this.dataRoot);
    const target = await this.validatePack(this.targetRef);
    if (target) {
      return {
        target: this.targetRef,
        active: target.ref,
        availability: "ready"
      };
    }

    const fallback = await this.findFallback();
    const targetRoot = getPackRoot(
      this.dataRoot,
      this.release.id,
      this.release.version
    );
    const hasTargetRoot = await pathExists(targetRoot);
    if (fallback) {
      return {
        target: this.targetRef,
        active: fallback.ref,
        availability: hasTargetRoot ? "repairRequired" : "updateAvailable"
      };
    }

    const localPacks = await listLocalPacks(this.dataRoot);
    return {
      target: this.targetRef,
      active: null,
      availability: hasTargetRoot || localPacks.length > 0 ? "repairRequired" : "missing"
    };
  }

  private async ensureReadyOnce(options: EnsureDataPackOptions): Promise<ReadyDataPack> {
    await ensureDataRootExists(this.dataRoot);
    const recovered = await withDatapackLock(this.dataRoot, "access", () =>
      this.installer.recoverInterruptedTarget((ref) => this.validatePackUnlocked(ref))
    );
    if (recovered) {
      await this.activatePack(recovered.ref);
      return recovered;
    }
    const target = await this.validatePack(this.targetRef);
    if (target) {
      await this.activatePack(target.ref);
      return target;
    }

    const fallback = await this.findFallback();
    const targetRoot = getPackRoot(this.dataRoot, this.release.id, this.release.version);
    const localPacks = await listLocalPacks(this.dataRoot);
    const hasTargetRoot = await pathExists(targetRoot);
    const reason: DataPackDownloadReason = fallback
      ? hasTargetRoot
        ? "repair"
        : "update"
      : hasTargetRoot || localPacks.length > 0
        ? "repair"
        : "initialization";

    if (reason === "update" && !options.allowUpdateDownload) {
      await this.activatePack(fallback!.ref);
      return fallback!;
    }

    if (reason !== "initialization") {
      const approved = options.confirmDownload
        ? await options.confirmDownload(reason, this.release)
        : false;
      if (!approved) {
        if (fallback) {
          await this.activatePack(fallback.ref);
          return fallback;
        }
        throw new DatapackDownloadDeclinedError(reason);
      }
    }
    return this.installer.installRelease();
  }
}
