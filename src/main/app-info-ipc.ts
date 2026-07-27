import {
  app,
  ipcMain
} from "electron";
import fs from "fs/promises";
import path from "path";

import {
  parseBuildInfo,
  type AppBuildInfo
} from "../shared/build-info";
import { IPC_CHANNELS } from "../shared/ipc-channels";

export function registerAppInfoIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.appGetAttributions,
    async () => {
      try {
        return {
          ok: true,
          content: await fs.readFile(
            attributionsPath(),
            "utf8"
          )
        };
      } catch (error) {
        return {
          ok: false,
          error:
            "Unable to read attribution information: " +
            String(error)
        };
      }
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.appGetBuildInfo,
    async () => loadBuildInfo()
  );
}

export function configureAboutPanel(): void {
  const version = app.getVersion();
  app.setAboutPanelOptions({
    applicationName: "map-schematic",
    applicationVersion: version,
    version,
    credits:
      "資料包：未載入\n" +
      "資料來源：Natural Earth / GeoNames / " +
      "Natural Earth Shaded Relief\n" +
      "完整授權資訊請見「說明 > 資料來源與授權」。",
    copyright: ""
  });
}

function attributionsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "ATTRIBUTIONS.md")
    : path.join(app.getAppPath(), "ATTRIBUTIONS.md");
}

async function loadBuildInfo(): Promise<AppBuildInfo> {
  const fallbackVersion = app.getVersion();
  try {
    const buildInfoPath = path.join(
      app.getAppPath(),
      "out",
      "build-info.json"
    );
    const raw = await fs.readFile(buildInfoPath, "utf8");
    return parseBuildInfo(
      JSON.parse(raw) as unknown,
      fallbackVersion
    );
  } catch {
    return parseBuildInfo(null, fallbackVersion);
  }
}
