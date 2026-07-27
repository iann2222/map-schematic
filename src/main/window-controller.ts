import {
  app,
  BrowserWindow,
  ipcMain
} from "electron";
import path from "path";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AppDialogOptions,
  MenuAction
} from "../shared/ipc-contract";
import { resolveDataRoot } from "../shared/paths";
import type { RendererDialogService } from "./renderer-dialog";

type WindowCloseState = {
  dirty: boolean;
  allowClose: boolean;
  promptOpen: boolean;
};

export class MainWindowController {
  private readonly dialogs: RendererDialogService;
  private readonly closeStates = new WeakMap<
    BrowserWindow,
    WindowCloseState
  >();

  constructor(dialogs: RendererDialogService) {
    this.dialogs = dialogs;
  }

  registerIpc(): void {
    ipcMain.on(
      IPC_CHANNELS.projectDirtyState,
      (event, dirty: unknown) => {
        if (typeof dirty !== "boolean") {
          return;
        }
        const win = BrowserWindow.fromWebContents(event.sender);
        const state = win ? this.closeStates.get(win) : undefined;
        if (state) {
          state.dirty = dirty;
        }
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.projectCloseAfterSave,
      (event): boolean => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          return false;
        }
        this.closeWithoutPrompt(win);
        return true;
      }
    );
  }

  create(): BrowserWindow {
    const preloadPath = path.join(
      app.getAppPath(),
      "out",
      "main",
      "preload.js"
    );
    const htmlPath = path.join(
      app.getAppPath(),
      "out",
      "renderer",
      "index.html"
    );
    const win = new BrowserWindow({
      icon: this.developmentWindowIcon(),
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

    this.attachUnsavedChangesGuard(win);
    const webContentsId = win.webContents.id;
    win.webContents.on(
      "did-start-navigation",
      (_event, _url, _isInPlace, isMainFrame) => {
        if (isMainFrame) {
          this.dialogs.releaseWebContents(webContentsId);
        }
      }
    );
    win.webContents.on("render-process-gone", () => {
      this.dialogs.releaseWebContents(webContentsId);
    });
    win.on("closed", () => {
      this.dialogs.releaseWebContents(webContentsId);
    });
    void win.loadFile(htmlPath);

    // Initialize data root early so failures are visible on startup.
    resolveDataRoot();
    return win;
  }

  closeWithoutPrompt(win: BrowserWindow): void {
    const state = this.closeStates.get(win);
    if (state) {
      state.dirty = false;
      state.allowClose = true;
    }
    if (!win.isDestroyed()) {
      win.close();
    }
  }

  private attachUnsavedChangesGuard(win: BrowserWindow): void {
    const state: WindowCloseState = {
      dirty: false,
      allowClose: false,
      promptOpen: false
    };
    this.closeStates.set(win, state);
    win.on("close", (event) => {
      if (state.allowClose || !state.dirty) {
        return;
      }
      event.preventDefault();
      if (state.promptOpen) {
        return;
      }
      state.promptOpen = true;
      void this.dialogs
        .request(win, this.unsavedChangesDialog())
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
            this.closeWithoutPrompt(win);
          }
        })
        .finally(() => {
          state.promptOpen = false;
        });
    });
  }

  private unsavedChangesDialog(): AppDialogOptions {
    return {
      eyebrow: "未儲存變更",
      title: "尚未儲存變更",
      message: "目前專案還有尚未儲存的變更。",
      detail: "關閉前要先儲存專案嗎？",
      tone: "warning",
      buttons: [
        { label: "取消", value: 2, variant: "ghost" },
        { label: "不儲存", value: 1, variant: "dangerGhost" },
        {
          label: "儲存並關閉",
          value: 0,
          variant: "primary"
        }
      ],
      defaultValue: 0,
      cancelValue: 2
    };
  }

  private developmentWindowIcon(): string | undefined {
    return app.isPackaged
      ? undefined
      : path.join(
          app.getAppPath(),
          "packaging",
          "icon.ico"
        );
  }
}
