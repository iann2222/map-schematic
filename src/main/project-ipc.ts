import {
  app,
  BrowserWindow,
  dialog,
  ipcMain
} from "electron";
import fs from "fs/promises";
import path from "path";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AppDialogOptions,
  ProjectExportPayload,
  ProjectExportResult,
  ProjectLoadResult,
  ProjectSaveResult
} from "../shared/ipc-contract";
import type { MapProject } from "../shared/schema/mapproj";
import {
  loadProjectFromFile,
  loadValidProjectBackup,
  restoreProjectFromBackup,
  saveProjectToFile
} from "../shared/schema/io";
import { validateProject } from "../shared/schema/validate";
import type { RendererDialogService } from "./renderer-dialog";

let projectSaveQueue: Promise<void> = Promise.resolve();

export function registerProjectIpc(
  dialogs: RendererDialogService
): void {
  ipcMain.handle(
    IPC_CHANNELS.projectSave,
    async (
      _event,
      payload: unknown
    ): Promise<ProjectSaveResult> => saveProject(payload)
  );
  ipcMain.handle(
    IPC_CHANNELS.projectLoad,
    async (event): Promise<ProjectLoadResult> =>
      loadProject(event.sender, dialogs)
  );
  ipcMain.handle(
    IPC_CHANNELS.projectExport,
    async (
      _event,
      payload: ProjectExportPayload
    ): Promise<ProjectExportResult> => exportProject(payload)
  );
}

function enqueueProjectSave(
  operation: () => Promise<void>
): Promise<void> {
  const queued = projectSaveQueue.then(operation, operation);
  projectSaveQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

async function saveProject(
  payload: unknown
): Promise<ProjectSaveResult> {
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
        filters: [
          {
            name: "Map Project",
            extensions: ["mapproj"]
          }
        ]
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      filePath = result.filePath;
    }
    await enqueueProjectSave(() =>
      saveProjectToFile(
        filePath,
        data.project as MapProject
      )
    );
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, errors: [String(error)] };
  }
}

async function loadProject(
  sender: Electron.WebContents,
  dialogs: RendererDialogService
): Promise<ProjectLoadResult> {
  try {
    const root = projectFilesRoot();
    await fs.mkdir(root, { recursive: true });
    const result = await dialog.showOpenDialog({
      title: "載入專案",
      defaultPath: root,
      filters: [
        {
          name: "Map Project",
          extensions: ["mapproj"]
        }
      ],
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
    } catch (error) {
      primaryError = String(error);
    }

    const backup = await loadValidProjectBackup(filePath);
    if (!backup) {
      return {
        ok: false,
        path: filePath,
        error: primaryError ?? "專案檔無法載入"
      };
    }
    const parent =
      BrowserWindow.fromWebContents(sender) ??
      BrowserWindow.getFocusedWindow();
    if (
      !parent ||
      (await dialogs.request(
        parent,
        backupRecoveryDialog(filePath)
      )) !== 0
    ) {
      return {
        ok: false,
        path: filePath,
        canceled: true
      };
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
    } catch (error) {
      return {
        ok: false,
        path: filePath,
        error: `備份恢復失敗：${String(error)}`
      };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function backupRecoveryDialog(
  filePath: string
): AppDialogOptions {
  return {
    eyebrow: "備份恢復",
    title: "專案檔需要恢復",
    message:
      "選取的專案檔已損壞或格式無效，但找到上一份有效備份。",
    detail:
      `是否使用備份恢復 ${path.basename(filePath)}？` +
      "恢復後會覆蓋目前損壞的專案檔。",
    tone: "warning",
    buttons: [
      { label: "取消", value: 1, variant: "ghost" },
      {
        label: "從備份恢復",
        value: 0,
        variant: "primary"
      }
    ],
    defaultValue: 0,
    cancelValue: 1
  };
}

async function exportProject(
  payload: ProjectExportPayload
): Promise<ProjectExportResult> {
  try {
    const root = projectFilesRoot();
    await fs.mkdir(root, { recursive: true });
    const extension = payload.format;
    const result = await dialog.showSaveDialog({
      title: "匯出檔案",
      defaultPath: path.join(root, `export.${extension}`),
      filters: [
        {
          name: payload.format.toUpperCase(),
          extensions: [extension]
        }
      ]
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    if (payload.format === "pdf") {
      await writePdf(result.filePath, payload);
    } else {
      await fs.writeFile(
        result.filePath,
        decodeExportPayload(payload.data)
      );
    }
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function writePdf(
  filePath: string,
  payload: ProjectExportPayload
): Promise<void> {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: { contextIsolation: true }
  });
  try {
    const html =
      '<html><body style="margin:0;background:#000;">' +
      `<img src="${payload.data}" ` +
      'style="width:100%;height:100%;object-fit:contain"/>' +
      "</body></html>";
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );
    const micronsPerPx = 25400 / 96;
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: {
        width: Math.round(payload.width * micronsPerPx),
        height: Math.round(payload.height * micronsPerPx)
      }
    });
    await fs.writeFile(filePath, pdfData);
  } finally {
    win.destroy();
  }
}

function decodeExportPayload(data: string): Buffer {
  if (!data.startsWith("data:")) {
    return Buffer.from(data, "utf8");
  }
  const base64 = data.split(",")[1] ?? "";
  return Buffer.from(base64, "base64");
}

function projectFilesRoot(): string {
  return app.isPackaged
    ? path.join(
        app.getPath("documents"),
        "map-schematic"
      )
    : path.join(app.getAppPath(), "project_files");
}

function defaultProjectPath(): string {
  return path.join(
    projectFilesRoot(),
    "untitled.mapproj"
  );
}
