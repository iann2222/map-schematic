import { app, BrowserWindow, Menu, ipcMain, dialog, screen } from "electron";
import fs from "fs/promises";
import path from "path";
import {
  loadProjectFromFile,
  loadValidProjectBackup,
  restoreProjectFromBackup,
  saveProjectToFile
} from "../shared/schema/io";
import { validateProject } from "../shared/schema/validate";
import type { MapProject } from "../shared/schema/mapproj";
import { parseBuildInfo, type AppBuildInfo } from "../shared/build-info";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AppDialogOptions,
  AppDialogResponse,
  MenuAction,
  ProjectExportPayload,
  ProjectExportResult,
  ProjectLoadResult,
  ProjectSaveResult
} from "../shared/ipc-contract";
import { resolveInsidePack } from "../shared/datapack/manifest";
import type {
  DataPackDownloadReason,
  DataPackManifest,
  DataPackRelease,
  DataPackStatus,
  ReadyDataPack
} from "../shared/datapack/types";
import { resolveDataRoot } from "../shared/paths";
import { configureDataRoot } from "./data-root";
import { searchGeonames } from "./geonames";
import {
  ensureDatapackReady,
  getDatapackStatus,
  updateDatapack
} from "./datapack-download";

type WindowCloseState = {
  dirty: boolean;
  allowClose: boolean;
  promptOpen: boolean;
};

type PendingRendererDialog = {
  webContentsId: number;
  allowedValues: Set<number>;
  cancelValue: number;
  resolve: (response: number) => void;
};

let projectSaveQueue: Promise<void> = Promise.resolve();
const windowCloseStates = new WeakMap<BrowserWindow, WindowCloseState>();
const pendingRendererDialogs = new Map<string, PendingRendererDialog>();
let rendererDialogSequence = 0;

function enqueueProjectSave(operation: () => Promise<void>): Promise<void> {
  const queued = projectSaveQueue.then(operation, operation);
  projectSaveQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

function closeWindowWithoutPrompt(win: BrowserWindow): void {
  const state = windowCloseStates.get(win);
  if (state) {
    state.dirty = false;
    state.allowClose = true;
  }
  if (!win.isDestroyed()) {
    win.close();
  }
}

function requestRendererDialog(
  win: BrowserWindow,
  options: AppDialogOptions
): Promise<number> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.resolve(options.cancelValue);
  }
  const id = `dialog-${Date.now()}-${rendererDialogSequence++}`;
  return new Promise((resolve) => {
    pendingRendererDialogs.set(id, {
      webContentsId: win.webContents.id,
      allowedValues: new Set(options.buttons.map((button) => button.value)),
      cancelValue: options.cancelValue,
      resolve
    });
    win.webContents.send(IPC_CHANNELS.appDialogRequest, { id, ...options });
  });
}

function resolvePendingRendererDialogs(webContentsId: number): void {
  for (const [id, pending] of pendingRendererDialogs) {
    if (pending.webContentsId !== webContentsId) {
      continue;
    }
    pendingRendererDialogs.delete(id);
    pending.resolve(pending.cancelValue);
  }
}

function attachUnsavedChangesGuard(win: BrowserWindow): void {
  const state: WindowCloseState = {
    dirty: false,
    allowClose: false,
    promptOpen: false
  };
  windowCloseStates.set(win, state);

  win.on("close", (event) => {
    if (state.allowClose || !state.dirty) {
      return;
    }
    event.preventDefault();
    if (state.promptOpen) {
      return;
    }
    state.promptOpen = true;
    void requestRendererDialog(win, {
      eyebrow: "未儲存變更",
      title: "尚未儲存變更",
      message: "目前專案還有尚未儲存的變更。",
      detail: "關閉前要先儲存專案嗎？",
      tone: "warning",
      buttons: [
        { label: "取消", value: 2, variant: "ghost" },
        { label: "不儲存", value: 1, variant: "dangerGhost" },
        { label: "儲存並關閉", value: 0, variant: "primary" }
      ],
      defaultValue: 0,
      cancelValue: 2
    })
      .then((response) => {
        if (win.isDestroyed()) {
          return;
        }
        if (response === 0) {
          win.webContents.send(
            IPC_CHANNELS.menuAction,
            "project:saveBeforeClose" satisfies MenuAction
          );
        } else if (response === 1) {
          closeWindowWithoutPrompt(win);
        }
      })
      .finally(() => {
        state.promptOpen = false;
      });
  });
}

function developmentWindowIcon(): string | undefined {
  return app.isPackaged
    ? undefined
    : path.join(app.getAppPath(), "packaging", "icon.ico");
}

function createMainWindow() {
  const preloadPath = path.join(app.getAppPath(), "out", "main", "preload.js");
  const htmlPath = path.join(app.getAppPath(), "out", "renderer", "index.html");

  const win = new BrowserWindow({
    icon: developmentWindowIcon(),
    width: 1200,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Sandboxed preloads cannot resolve the local CommonJS IPC contract.
      sandbox: false,
      preload: preloadPath
    }
  });

  attachUnsavedChangesGuard(win);
  const webContentsId = win.webContents.id;
  win.webContents.on(
    "did-start-navigation",
    (_event, _url, _isInPlace, isMainFrame) => {
      if (isMainFrame) {
        resolvePendingRendererDialogs(webContentsId);
      }
    }
  );
  win.webContents.on("render-process-gone", () => {
    resolvePendingRendererDialogs(webContentsId);
  });
  win.on("closed", () => resolvePendingRendererDialogs(webContentsId));

  win.loadFile(htmlPath);

  // Initialize data root early so failures are visible on startup.
  resolveDataRoot();
}

async function confirmDatapackDownload(
  reason: DataPackDownloadReason,
  release: DataPackRelease
): Promise<boolean> {
  const isUpdate = reason === "update";
  const options: AppDialogOptions = {
    eyebrow: isUpdate ? "資料更新" : "資料修復",
    title: isUpdate ? "官方資料包可更新" : "資料包需要修復",
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
  };
  const parent =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
  if (!parent) {
    return false;
  }
  return (await requestRendererDialog(parent, options)) === 0;
}

async function getReadyDatapack(): Promise<ReadyDataPack> {
  return ensureDatapackReady(confirmDatapackDownload);
}

async function loadDatapack(): Promise<DataPackManifest> {
  return (await getReadyDatapack()).manifest;
}

function isTargetPack(ref: { id: string; version: string }, status: DataPackStatus): boolean {
  return ref.id === status.target.id && ref.version === status.target.version;
}

function sendMenuAction(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(
    IPC_CHANNELS.menuAction,
    action
  );
}

function buildAppMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "檔案",
      submenu: [
        {
          label: "載入專案",
          accelerator: "CommandOrControl+O",
          click: () => sendMenuAction("project:open")
        },
        {
          label: "儲存專案",
          accelerator: "CommandOrControl+S",
          click: () => sendMenuAction("project:save")
        },
        {
          label: "另存新檔",
          accelerator: "CommandOrControl+Shift+S",
          click: () => sendMenuAction("project:saveAs")
        },
        { type: "separator" },
        {
          label: "匯出 PNG",
          click: () => sendMenuAction("export:png")
        },
        {
          label: "匯出 SVG",
          click: () => sendMenuAction("export:svg")
        },
        {
          label: "匯出 PDF",
          click: () => sendMenuAction("export:pdf")
        },
        { type: "separator" },
        { role: "close", label: "關閉視窗" },
        { role: "quit", label: "結束程式" }
      ]
    },
    {
      label: "編輯",
      submenu: [
        {
          label: "復原",
          accelerator: "CommandOrControl+Z",
          click: () => sendMenuAction("edit:undo")
        },
        {
          label: "重做",
          accelerator: process.platform === "darwin" ? "Command+Shift+Z" : "Control+Y",
          click: () => sendMenuAction("edit:redo")
        }
      ]
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
            const y = Math.round(display.bounds.y + (display.bounds.height - 860) / 2);
            win.setBounds({ x, y, width: 1200, height: 860 });
          }
        },
        { role: "close", label: "關閉" }
      ]
    },
    {
      label: "說明",
      submenu: [
        {
          label: "關於",
          click: () => sendMenuAction("app:about")
        },
        {
          label: "資料來源與授權",
          click: () => sendMenuAction("app:attributions")
        }
      ]
    }
  ]);
}

function attributionsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "ATTRIBUTIONS.md")
    : path.join(app.getAppPath(), "ATTRIBUTIONS.md");
}

async function loadBuildInfo(): Promise<AppBuildInfo> {
  const fallbackVersion = app.getVersion();
  try {
    const buildInfoPath = path.join(app.getAppPath(), "out", "build-info.json");
    const raw = await fs.readFile(buildInfoPath, "utf8");
    return parseBuildInfo(JSON.parse(raw) as unknown, fallbackVersion);
  } catch {
    return parseBuildInfo(null, fallbackVersion);
  }
}

function projectFilesRoot(): string {
  return app.isPackaged
    ? path.join(app.getPath("documents"), "map-schematic")
    : path.join(app.getAppPath(), "project_files");
}

function defaultProjectPath(): string {
  return path.join(projectFilesRoot(), "untitled.mapproj");
}

app.whenReady().then(() => {
  configureDataRoot();
  Menu.setApplicationMenu(buildAppMenu());

  ipcMain.handle(IPC_CHANNELS.appGetAttributions, async () => {
    try {
      return {
        ok: true,
        content: await fs.readFile(attributionsPath(), "utf8")
      };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read attribution information: ${String(error)}`
      };
    }
  });
  ipcMain.handle(IPC_CHANNELS.appGetBuildInfo, async () => loadBuildInfo());

  ipcMain.on(IPC_CHANNELS.appDialogResponse, (event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      !("response" in payload) ||
      typeof payload.id !== "string" ||
      typeof payload.response !== "number"
    ) {
      return;
    }
    const response = payload as AppDialogResponse;
    const pending = pendingRendererDialogs.get(response.id);
    if (!pending || pending.webContentsId !== event.sender.id) {
      return;
    }
    pendingRendererDialogs.delete(response.id);
    pending.resolve(
      pending.allowedValues.has(response.response)
        ? response.response
        : pending.cancelValue
    );
  });

  ipcMain.handle(IPC_CHANNELS.datapackGet, async () => loadDatapack());
  ipcMain.handle(IPC_CHANNELS.datapackStatus, async () => getDatapackStatus());
  ipcMain.handle(IPC_CHANNELS.datapackUpdate, async () => {
    try {
      const ready = await updateDatapack(confirmDatapackDownload);
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
  ipcMain.on(IPC_CHANNELS.projectDirtyState, (event, dirty: unknown) => {
    if (typeof dirty !== "boolean") {
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const state = win ? windowCloseStates.get(win) : undefined;
    if (state) {
      state.dirty = dirty;
    }
  });
  ipcMain.handle(IPC_CHANNELS.projectCloseAfterSave, (event): boolean => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return false;
    }
    closeWindowWithoutPrompt(win);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.basemapGet, async () => {
    const ready = await getReadyDatapack();
    const layers = ready.manifest.basemap.layers;
    const payload = [] as Array<{ id: string; geojson: string }>;
    for (const layer of layers) {
      const filePath = resolveInsidePack(ready.rootPath, layer.path);
      const geojson = await fs.readFile(filePath, "utf8");
      payload.push({ id: layer.id, geojson });
    }
    return payload;
  });
  ipcMain.handle(IPC_CHANNELS.reliefGet, async () => {
    const ready = await getReadyDatapack();
    const reliefPath = ready.manifest.relief?.path;
    if (!reliefPath) {
      return null;
    }
    const filePath = resolveInsidePack(ready.rootPath, reliefPath);
    const { pathToFileURL } = await import("url");
    return {
      path: pathToFileURL(filePath).toString(),
      projection: ready.manifest.relief?.projection ?? null
    };
  });
  ipcMain.handle(IPC_CHANNELS.geonamesSearch, async (_event, query: string, limit: number) => {
    const ready = await getReadyDatapack();
    const dbPath = resolveInsidePack(ready.rootPath, ready.manifest.geonames.dbPath);
    return searchGeonames(query, limit, dbPath);
  });
  ipcMain.handle(
    IPC_CHANNELS.projectSave,
    async (_event, payload: unknown): Promise<ProjectSaveResult> => {
      try {
        const data = payload as {
          project?: unknown;
          path?: string | null;
          saveAs?: boolean;
        };
        const validation = validateProject(data?.project);
        if (!validation.valid) {
          return {
            ok: false,
            errors: validation.errors.map(
              (error) => `${error.path}: ${error.message}`
            )
          };
        }
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
        await enqueueProjectSave(() =>
          saveProjectToFile(filePath, data.project as MapProject)
        );
        return { ok: true, path: filePath };
      } catch (err) {
        return { ok: false, errors: [String(err)] };
      }
    }
  );
  ipcMain.handle(IPC_CHANNELS.projectLoad, async (event): Promise<ProjectLoadResult> => {
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
      let primaryError: string | null = null;
      try {
        const loaded = await loadProjectFromFile(filePath);
        if (loaded.validation.valid) {
          return {
            ok: true,
            path: filePath,
            project: loaded.project,
            validation: loaded.validation,
            migratedFromVersion: loaded.migration.migrated
              ? loaded.migration.fromVersion
              : undefined
          };
        }
        primaryError = loaded.validation.errors
          .map((error) => `${error.path}: ${error.message}`)
          .join("; ");
      } catch (err) {
        primaryError = String(err);
      }

      const backup = await loadValidProjectBackup(filePath);
      if (!backup) {
        return {
          ok: false,
          path: filePath,
          error: primaryError ?? "專案檔無法載入"
        };
      }

      const options: AppDialogOptions = {
        eyebrow: "備份恢復",
        title: "專案檔需要恢復",
        message: "選取的專案檔已損壞或格式無效，但找到上一份有效備份。",
        detail: `是否使用備份恢復 ${path.basename(filePath)}？恢復後會覆蓋目前損壞的專案檔。`,
        tone: "warning",
        buttons: [
          { label: "取消", value: 1, variant: "ghost" },
          { label: "從備份恢復", value: 0, variant: "primary" }
        ],
        defaultValue: 0,
        cancelValue: 1
      };
      const parent =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow();
      if (!parent || (await requestRendererDialog(parent, options)) !== 0) {
        return { ok: false, path: filePath, canceled: true };
      }

      try {
        const restored = await restoreProjectFromBackup(filePath);
        return {
          ok: true,
          path: filePath,
          project: restored.project,
          validation: restored.validation,
          migratedFromVersion: backup.migration.migrated
            ? backup.migration.fromVersion
            : undefined,
          recoveredFromBackup: true
        };
      } catch (err) {
        return {
          ok: false,
          path: filePath,
          error: `備份恢復失敗：${String(err)}`
        };
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle(
    IPC_CHANNELS.projectExport,
    async (
      _event,
      payload: ProjectExportPayload
    ): Promise<ProjectExportResult> => {
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
          try {
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
          } finally {
            win.destroy();
          }
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
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    credits:
      "資料包：未載入\n資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief\n完整授權資訊請見「說明 > 資料來源與授權」。",
    copyright: ""
  };
  app.setAboutPanelOptions(aboutBase);
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

