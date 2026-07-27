import path from "path";

import { getPackRoot } from "./layout";
import {
  parseRelease,
  validateInstalledDatapack
} from "./manifest";
import {
  ensureDataRootExists,
  listLocalPacks,
  pathExists,
  readActivePack,
  setActivePack
} from "./local-store";
import { DataPackInstaller } from "./installer";
import {
  DataPackDownloadReason,
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
    const rootPath = getPackRoot(this.dataRoot, ref.id, ref.version);
    try {
      const manifest = await validateInstalledDatapack(rootPath, ref);
      return { ref, rootPath, manifest, source: "installed" };
    } catch {
      return null;
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

  async getStatus(): Promise<DataPackStatus> {
    return this.runExclusive(() => this.getStatusOnce());
  }

  private queueReadyOperation(
    options: EnsureDataPackOptions
  ): Promise<ReadyDataPack> {
    let operation: Promise<ReadyDataPack>;
    operation = this.runExclusive(() => this.ensureReadyOnce(options)).catch(
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

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
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
    const recovered = await this.installer.recoverInterruptedTarget(
      (ref) => this.validatePack(ref)
    );
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
    const hasTargetRoot = await pathExists(targetRoot);
    const reason: DataPackDownloadReason = fallback
      ? hasTargetRoot
        ? "repair"
        : "update"
      : hasTargetRoot || localPacks.length > 0
        ? "repair"
        : "initialization";

    if (reason === "update" && !options.allowUpdateDownload) {
      await setActivePack(this.dataRoot, fallback!.ref);
      return fallback!;
    }

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
    return this.installer.installRelease();
  }
}
