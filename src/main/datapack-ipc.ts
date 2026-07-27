import {
  BrowserWindow,
  ipcMain
} from "electron";
import fs from "fs/promises";
import { pathToFileURL } from "url";

import { resolveInsidePack } from "../shared/datapack/manifest";
import type {
  DataPackDownloadReason,
  DataPackManifest,
  DataPackRelease,
  DataPackStatus,
  ReadyDataPack
} from "../shared/datapack/types";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import {
  ensureDatapackReady,
  getDatapackStatus,
  updateDatapack
} from "./datapack-download";
import { searchGeonames } from "./geonames";
import type { RendererDialogService } from "./renderer-dialog";

export function registerDatapackIpc(
  dialogs: RendererDialogService
): void {
  const getReadyDatapack = (): Promise<ReadyDataPack> =>
    ensureDatapackReady((reason, release) =>
      confirmDatapackDownload(dialogs, reason, release)
    );

  ipcMain.handle(
    IPC_CHANNELS.datapackGet,
    async (): Promise<DataPackManifest> =>
      (await getReadyDatapack()).manifest
  );
  ipcMain.handle(
    IPC_CHANNELS.datapackStatus,
    async () => getDatapackStatus()
  );
  ipcMain.handle(IPC_CHANNELS.datapackUpdate, async () => {
    try {
      const ready = await updateDatapack(
        (reason, release) =>
          confirmDatapackDownload(dialogs, reason, release)
      );
      const status = await getDatapackStatus();
      return {
        ok: true,
        canceled: !isTargetPack(ready.ref, status),
        datapack: ready.manifest,
        status
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
  ipcMain.handle(IPC_CHANNELS.basemapGet, async () => {
    const ready = await getReadyDatapack();
    const payload: Array<{ id: string; geojson: string }> = [];
    for (const layer of ready.manifest.basemap.layers) {
      const filePath = resolveInsidePack(
        ready.rootPath,
        layer.path
      );
      payload.push({
        id: layer.id,
        geojson: await fs.readFile(filePath, "utf8")
      });
    }
    return payload;
  });
  ipcMain.handle(IPC_CHANNELS.reliefGet, async () => {
    const ready = await getReadyDatapack();
    const reliefPath = ready.manifest.relief?.path;
    if (!reliefPath) {
      return null;
    }
    const filePath = resolveInsidePack(
      ready.rootPath,
      reliefPath
    );
    return {
      path: pathToFileURL(filePath).toString(),
      projection:
        ready.manifest.relief?.projection ?? null
    };
  });
  ipcMain.handle(
    IPC_CHANNELS.geonamesSearch,
    async (_event, query: string, limit: number) => {
      const ready = await getReadyDatapack();
      const dbPath = resolveInsidePack(
        ready.rootPath,
        ready.manifest.geonames.dbPath
      );
      return searchGeonames(query, limit, dbPath);
    }
  );
}

function isTargetPack(
  ref: { id: string; version: string },
  status: DataPackStatus
): boolean {
  return (
    ref.id === status.target.id &&
    ref.version === status.target.version
  );
}

async function confirmDatapackDownload(
  dialogs: RendererDialogService,
  reason: DataPackDownloadReason,
  release: DataPackRelease
): Promise<boolean> {
  const isUpdate = reason === "update";
  const parent =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed()
    );
  if (!parent) {
    return false;
  }
  const response = await dialogs.request(parent, {
    eyebrow: isUpdate ? "資料更新" : "資料修復",
    title: isUpdate
      ? "官方資料包可更新"
      : "資料包需要修復",
    message: isUpdate
      ? `已設定新版官方資料包 ${release.id} ${release.version}。`
      : "偵測到已安裝的資料包遺失或損壞。",
    detail: isUpdate
      ? "是否連線至官方 GitHub Releases 下載並安裝？取消後會繼續使用目前有效的本機資料包。"
      : "是否連線至官方 GitHub Releases，重新下載並安裝資料包？取消後將維持離線，地圖資料暫時無法使用。",
    tone: "warning",
    buttons: [
      { label: "取消", value: 1, variant: "ghost" },
      {
        label: isUpdate ? "下載並更新" : "重新下載",
        value: 0,
        variant: "primary"
      }
    ],
    defaultValue: 0,
    cancelValue: 1
  });
  return response === 0;
}
