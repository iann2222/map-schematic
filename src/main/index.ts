import { app, BrowserWindow, Menu, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import { loadProjectFromFile, saveProjectToFile } from "../shared/schema/io";
import { resolvePackRoot } from "../shared/datapack/resolve";
import { resolveDataRoot } from "../shared/paths";
import { searchGeonames } from "./geonames";

type Datapack = {
  basemap?: {
    layers?: Array<{ id: string; path: string }>;
  };
};

type SaveResult = {
  ok: boolean;
  errors?: string[];
  path?: string;
};

type LoadResult = {
  ok: boolean;
  path?: string;
  project?: unknown;
  validation?: { valid: boolean; errors: Array<{ path: string; message: string }> };
  error?: string;
};

function createMainWindow() {
  const preloadPath = path.join(app.getAppPath(), "dist", "main", "preload.js");
  const htmlPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: preloadPath
    }
  });

  win.loadFile(htmlPath);

  // Initialize data root early so failures are visible on startup.
  resolveDataRoot();
}

async function loadDatapack(): Promise<Datapack> {
  const packRoot = resolvePackRoot();
  const datapackPath = path.join(packRoot, "datapack.json");
  const raw = await fs.readFile(datapackPath, "utf8");
  return JSON.parse(raw) as Datapack;
}

function buildAppMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "檔案",
      submenu: [
        { role: "close", label: "關閉視窗" },
        { role: "quit", label: "結束程式" }
      ]
    },
    {
      label: "編輯",
      submenu: [
        { role: "undo", label: "復原" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪下" },
        { role: "copy", label: "複製" },
        { role: "paste", label: "貼上" },
        { role: "selectAll", label: "全選" }
      ]
    },
    {
      label: "檢視",
      submenu: [
        { role: "reload", label: "重新載入" },
        { role: "forceReload", label: "強制重新載入" },
        { role: "toggleDevTools", label: "開發者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "重設縮放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "縮小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全螢幕" }
      ]
    },
    {
      label: "視窗",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "縮放" },
        { role: "close", label: "關閉" }
      ]
    },
    {
      label: "說明",
      submenu: [{ role: "about", label: "關於" }]
    }
  ]);
}

function projectFilePath(): string {
  const dataRoot = resolveDataRoot();
  return path.join(dataRoot, "projects", "demo.mapproj");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu());

  ipcMain.handle("datapack:get", async () => loadDatapack());
  ipcMain.handle("basemap:get", async () => {
    const datapack = await loadDatapack();
    const packRoot = resolvePackRoot();
    const layers = datapack?.basemap?.layers ?? [];
    const payload = [] as Array<{ id: string; geojson: string }>;
    for (const layer of layers) {
      const filePath = path.join(packRoot, layer.path);
      const geojson = await fs.readFile(filePath, "utf8");
      payload.push({ id: layer.id, geojson });
    }
    return payload;
  });
  ipcMain.handle("geonames:search", async (_event, query: string, limit: number) =>
    searchGeonames(query, limit)
  );
  ipcMain.handle("project:save", async (_event, project: unknown): Promise<SaveResult> => {
    const filePath = projectFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await saveProjectToFile(filePath, project as any);
    return { ok: true, path: filePath };
  });
  ipcMain.handle("project:load", async (): Promise<LoadResult> => {
    const filePath = projectFilePath();
    try {
      const { project, validation } = await loadProjectFromFile(filePath);
      return { ok: true, path: filePath, project, validation };
    } catch (err) {
      return { ok: false, error: String(err), path: filePath };
    }
  });
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
