import { app, BrowserWindow, Menu, ipcMain, dialog, screen } from "electron";
import fs from "fs/promises";
import path from "path";
import { loadProjectFromFile, saveProjectToFile } from "../shared/schema/io";
import { resolvePackRoot } from "../shared/datapack/resolve";
import { resolveDataRoot } from "../shared/paths";
import { searchGeonames } from "./geonames";

type Datapack = {
  id?: string;
  version?: string;
  basemap?: {
    layers?: Array<{ id: string; path: string }>;
  };
  relief?: {
    format?: string;
    path?: string;
    projection?: string | null;
  } | null;
};

type SaveResult = {
  ok: boolean;
  errors?: string[];
  path?: string;
  canceled?: boolean;
};

type LoadResult = {
  ok: boolean;
  path?: string;
  project?: unknown;
  validation?: { valid: boolean; errors: Array<{ path: string; message: string }> };
  error?: string;
  canceled?: boolean;
};

type ExportResult = {
  ok: boolean;
  path?: string;
  error?: string;
  canceled?: boolean;
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
        {
          label: "載入專案",
          accelerator: "CommandOrControl+O",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "project:open")
        },
        {
          label: "儲存專案",
          accelerator: "CommandOrControl+S",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "project:save")
        },
        {
          label: "另存新檔",
          accelerator: "CommandOrControl+Shift+S",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "project:saveAs")
        },
        { type: "separator" },
        {
          label: "匯出 PNG",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "export:png")
        },
        {
          label: "匯出 SVG",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "export:svg")
        },
        {
          label: "匯出 PDF",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", "export:pdf")
        },
        { type: "separator" },
        { role: "close", label: "關閉視窗" },
        { role: "quit", label: "結束程式" }
      ]
    },
    {
      label: "編輯",
      submenu: [{ role: "undo", label: "復原" }, { role: "redo", label: "取消復原" }]
    },
    {
      label: "檢視",
      submenu: [
        { role: "reload", label: "重新載入" },
        { role: "forceReload", label: "強制重新載入" },
        { role: "toggleDevTools", label: "開發者工具" }
      ]
    },
    {
      label: "視窗",
      submenu: [
        { role: "minimize", label: "最小化" },
        {
          label: "最大化",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) {
              return;
            }
            win.maximize();
          }
        },
        { role: "togglefullscreen", label: "全螢幕" },
        {
          label: "回到預設視窗",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) {
              return;
            }
            if (win.isFullScreen()) {
              win.setFullScreen(false);
            }
            if (win.isMaximized()) {
              win.unmaximize();
            }
            const display = screen.getDisplayNearestPoint(win.getBounds());
            const x = Math.round(display.bounds.x + (display.bounds.width - 1200) / 2);
            const y = Math.round(display.bounds.y + (display.bounds.height - 800) / 2);
            win.setBounds({ x, y, width: 1200, height: 800 });
          }
        },
        { role: "close", label: "關閉" }
      ]
    },
    {
      label: "說明",
      submenu: [{ role: "about", label: "關於" }]
    }
  ]);
}

function projectFilesRoot(): string {
  return path.join(app.getAppPath(), "project_files");
}

function defaultProjectPath(): string {
  return path.join(projectFilesRoot(), "untitled.mapproj");
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
  ipcMain.handle("relief:get", async () => {
    const datapack = await loadDatapack();
    const packRoot = resolvePackRoot();
    const reliefPath = datapack?.relief?.path;
    if (!reliefPath) {
      return null;
    }
    const filePath = path.join(packRoot, reliefPath);
    const { pathToFileURL } = await import("url");
    return {
      path: pathToFileURL(filePath).toString(),
      projection: datapack?.relief?.projection ?? null
    };
  });
  ipcMain.handle("geonames:search", async (_event, query: string, limit: number) =>
    searchGeonames(query, limit)
  );
  ipcMain.handle("project:save", async (_event, payload: unknown): Promise<SaveResult> => {
    const data = payload as { project: unknown; path?: string | null; saveAs?: boolean };
    const root = projectFilesRoot();
    await fs.mkdir(root, { recursive: true });
    let filePath = data.path ?? null;
    if (!filePath || data.saveAs) {
      const result = await dialog.showSaveDialog({
        title: "儲存專案",
        defaultPath: filePath ?? defaultProjectPath(),
        filters: [{ name: "Map Project", extensions: ["mapproj"] }]
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      filePath = result.filePath;
    }
    await saveProjectToFile(filePath, data.project as any);
    return { ok: true, path: filePath };
  });
  ipcMain.handle("project:load", async (): Promise<LoadResult> => {
    try {
      const root = projectFilesRoot();
      await fs.mkdir(root, { recursive: true });
      const result = await dialog.showOpenDialog({
        title: "載入專案",
        defaultPath: root,
        filters: [{ name: "Map Project", extensions: ["mapproj"] }],
        properties: ["openFile"]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      const filePath = result.filePaths[0];
      const { project, validation } = await loadProjectFromFile(filePath);
      return { ok: true, path: filePath, project, validation };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle(
    "project:export",
    async (
      _event,
      payload: { format: "png" | "svg" | "pdf"; data: string; width: number; height: number }
    ): Promise<ExportResult> => {
      try {
        const root = projectFilesRoot();
        await fs.mkdir(root, { recursive: true });
        const extension = payload.format;
        const result = await dialog.showSaveDialog({
          title: "匯出檔案",
          defaultPath: path.join(root, `export.${extension}`),
          filters: [{ name: payload.format.toUpperCase(), extensions: [extension] }]
        });
        if (result.canceled || !result.filePath) {
          return { ok: false, canceled: true };
        }
        if (payload.format === "pdf") {
          const win = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: { contextIsolation: true }
          });
          const html = `<html><body style="margin:0;background:#000;"><img src="${payload.data}" style="width:100%;height:100%;object-fit:contain"/></body></html>`;
          await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
          const micronsPerPx = 25400 / 96;
          const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: {
              width: Math.round(payload.width * micronsPerPx),
              height: Math.round(payload.height * micronsPerPx)
            }
          });
          await fs.writeFile(result.filePath, pdfData);
          win.destroy();
        } else {
          let buffer: Buffer;
          if (payload.data.startsWith("data:")) {
            const base64 = payload.data.split(",")[1] ?? "";
            buffer = Buffer.from(base64, "base64");
          } else {
            buffer = Buffer.from(payload.data, "utf8");
          }
          await fs.writeFile(result.filePath, buffer);
        }
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );

  const aboutBase = {
    applicationName: "map-schematic",
    applicationVersion: "",
    version: "",
    credits:
      "資料包：未載入\n資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief",
    copyright: ""
  };
  app.setAboutPanelOptions(aboutBase);
  loadDatapack()
    .then((datapack) => {
      const id = datapack?.id ?? "unknown";
      const version = datapack?.version ?? "unknown";
      app.setAboutPanelOptions({
        ...aboutBase,
        version: "",
        credits: `資料包：${id} ${version}\n資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief`
      });
    })
    .catch(() => {
      app.setAboutPanelOptions(aboutBase);
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

