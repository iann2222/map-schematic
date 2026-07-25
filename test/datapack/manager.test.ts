import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActivePath, getPackRoot } from "../../src/shared/datapack/layout";
import {
  DataPackManager,
  DatapackDownloadDeclinedError,
  readActivePack,
  setActivePack
} from "../../src/shared/datapack/manager";
import type { DataPackRef } from "../../src/shared/datapack/types";
import {
  createTestDatapack,
  createTestRelease
} from "../fixtures/datapacks";

describe("DataPackManager", () => {
  let tempDir = "";
  let dataRoot = "";
  let archivePath = "";
  let preparedPack = "";
  const targetRef: DataPackRef = { id: "standard", version: "2026.03" };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "map-schematic-datapack-"));
    dataRoot = path.join(tempDir, "geodata");
    archivePath = path.join(tempDir, "release.zip");
    preparedPack = path.join(tempDir, "prepared-pack");
    await createTestDatapack(preparedPack, targetRef);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createManager() {
    const release = await createTestRelease(archivePath, targetRef);
    const downloadFile = vi.fn(async (_url: string, destination: string) => {
      await fs.copyFile(archivePath, destination);
    });
    const extractArchive = vi.fn(async (_archive: string, destination: string) => {
      await fs.cp(preparedPack, destination, { recursive: true });
    });
    return {
      manager: new DataPackManager({ dataRoot, release, downloadFile, extractArchive }),
      downloadFile,
      extractArchive
    };
  }

  it("uses and activates an already valid target pack", async () => {
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    await createTestDatapack(targetRoot, targetRef);
    const { manager, downloadFile } = await createManager();

    const ready = await manager.ensureReady();

    expect(ready.source).toBe("installed");
    expect(ready.rootPath).toBe(targetRoot);
    expect(downloadFile).not.toHaveBeenCalled();
    expect((await readActivePack(dataRoot)).active).toEqual(targetRef);
  });

  it("treats a non-object active state as unset", async () => {
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(getActivePath(dataRoot), "null", "utf8");

    await expect(readActivePack(dataRoot)).resolves.toEqual({ active: null });
  });

  it("downloads the release during first initialization", async () => {
    const { manager, downloadFile, extractArchive } = await createManager();

    const ready = await manager.ensureReady();

    expect(ready.source).toBe("downloaded");
    expect(downloadFile).toHaveBeenCalledOnce();
    expect(extractArchive).toHaveBeenCalledOnce();
    expect((await readActivePack(dataRoot)).active).toEqual(targetRef);
  });

  it("keeps a valid active pack when the user declines an update", async () => {
    const oldRef = { id: "standard", version: "2026.02" };
    await createTestDatapack(getPackRoot(dataRoot, oldRef.id, oldRef.version), oldRef);
    await setActivePack(dataRoot, oldRef);
    const { manager, downloadFile } = await createManager();
    const confirmDownload = vi.fn(async () => false);

    const ready = await manager.ensureReady({ confirmDownload });

    expect(ready.ref).toEqual(oldRef);
    expect(ready.source).toBe("fallback");
    expect(confirmDownload).toHaveBeenCalledWith("update", expect.objectContaining(targetRef));
    expect(downloadFile).not.toHaveBeenCalled();
    expect((await readActivePack(dataRoot)).active).toEqual(oldRef);
  });

  it("does not repeatedly ask after a repair download is declined", async () => {
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    await createTestDatapack(targetRoot, targetRef);
    await fs.writeFile(path.join(targetRoot, "basemap", "land.geojson"), "damaged", "utf8");
    const { manager } = await createManager();
    const confirmDownload = vi.fn(async () => false);

    await expect(manager.ensureReady({ confirmDownload })).rejects.toBeInstanceOf(
      DatapackDownloadDeclinedError
    );
    await expect(manager.ensureReady({ confirmDownload })).rejects.toBeInstanceOf(
      DatapackDownloadDeclinedError
    );
    expect(confirmDownload).toHaveBeenCalledOnce();
  });

  it("can explicitly update after using a fallback pack", async () => {
    const oldRef = { id: "standard", version: "2026.02" };
    await createTestDatapack(getPackRoot(dataRoot, oldRef.id, oldRef.version), oldRef);
    await setActivePack(dataRoot, oldRef);
    const { manager, downloadFile } = await createManager();
    await manager.ensureReady({ confirmDownload: async () => false });

    const ready = await manager.update();

    expect(ready.ref).toEqual(targetRef);
    expect(ready.source).toBe("downloaded");
    expect(downloadFile).toHaveBeenCalledOnce();
  });

  it("downloads and activates the target after update confirmation", async () => {
    const oldRef = { id: "standard", version: "2026.02" };
    const oldRoot = getPackRoot(dataRoot, oldRef.id, oldRef.version);
    await createTestDatapack(oldRoot, oldRef);
    await setActivePack(dataRoot, oldRef);
    const { manager, downloadFile } = await createManager();

    const ready = await manager.ensureReady({ confirmDownload: async () => true });

    expect(ready.ref).toEqual(targetRef);
    expect(ready.source).toBe("downloaded");
    expect(downloadFile).toHaveBeenCalledOnce();
    expect((await readActivePack(dataRoot)).active).toEqual(targetRef);
    await expect(fs.access(oldRoot)).resolves.toBeUndefined();
  });

  it("requires confirmation before repairing a damaged installed pack", async () => {
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    await createTestDatapack(targetRoot, targetRef);
    await fs.writeFile(path.join(targetRoot, "basemap", "land.geojson"), "damaged", "utf8");
    const { manager, downloadFile } = await createManager();

    await expect(
      manager.ensureReady({ confirmDownload: async (reason) => reason !== "repair" })
    ).rejects.toEqual(expect.any(DatapackDownloadDeclinedError));
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("recovers an interrupted replacement before downloading", async () => {
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "datapack.json"), "{damaged", "utf8");
    await createTestDatapack(`${targetRoot}-previous`, targetRef);
    const { manager, downloadFile } = await createManager();

    const ready = await manager.ensureReady();

    expect(ready.source).toBe("recovered");
    expect(downloadFile).not.toHaveBeenCalled();
    await expect(fs.access(`${targetRoot}-previous`)).rejects.toThrow();
  });

  it("preserves a valid previous pack when recovery switching fails", async () => {
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    const previousRoot = `${targetRoot}-previous`;
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "datapack.json"), "{damaged", "utf8");
    await createTestDatapack(previousRoot, targetRef);
    const { manager } = await createManager();
    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (oldPath, newPath) => {
      if (String(oldPath) === previousRoot && String(newPath) === targetRoot) {
        throw new Error("simulated recovery switch failure");
      }
      return originalRename(oldPath, newPath);
    });

    await expect(manager.ensureReady()).rejects.toThrow("simulated recovery switch failure");
    await expect(fs.access(previousRoot)).resolves.toBeUndefined();
  });

  it("restores a damaged target when replacing it with a downloaded pack fails", async () => {
    const oldRef = { id: "standard", version: "2026.02" };
    const oldRoot = getPackRoot(dataRoot, oldRef.id, oldRef.version);
    const targetRoot = getPackRoot(dataRoot, targetRef.id, targetRef.version);
    await createTestDatapack(oldRoot, oldRef);
    await setActivePack(dataRoot, oldRef);
    await createTestDatapack(targetRoot, targetRef);
    const damagedFile = path.join(targetRoot, "basemap", "land.geojson");
    await fs.writeFile(damagedFile, "damaged", "utf8");
    const { manager } = await createManager();
    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (oldPath, newPath) => {
      if (
        String(oldPath).includes("-installing") &&
        String(newPath) === targetRoot
      ) {
        throw new Error("simulated install switch failure");
      }
      return originalRename(oldPath, newPath);
    });

    await expect(
      manager.ensureReady({ confirmDownload: async () => true })
    ).rejects.toThrow("simulated install switch failure");

    await expect(fs.readFile(damagedFile, "utf8")).resolves.toBe("damaged");
    await expect(fs.access(`${targetRoot}-previous`)).rejects.toThrow();
    expect((await readActivePack(dataRoot)).active).toEqual(oldRef);
  });

  it("keeps the previous active state when active.json replacement fails", async () => {
    const oldRef = { id: "standard", version: "2026.02" };
    await setActivePack(dataRoot, oldRef);
    const activePath = getActivePath(dataRoot);
    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (oldPath, newPath) => {
      if (String(newPath) === activePath) {
        throw new Error("simulated active switch failure");
      }
      return originalRename(oldPath, newPath);
    });

    await expect(setActivePack(dataRoot, targetRef)).rejects.toThrow("simulated active switch failure");
    expect((await readActivePack(dataRoot)).active).toEqual(oldRef);
  });

  it("rejects a downloaded archive with the wrong release checksum", async () => {
    const { manager } = await createManager();
    await fs.writeFile(archivePath, "changed-after-release-config", "utf8");

    await expect(manager.ensureReady()).rejects.toThrow("release checksum mismatch");
    await expect(fs.access(getPackRoot(dataRoot, targetRef.id, targetRef.version))).rejects.toThrow();
  });
});
