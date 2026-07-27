import {
  BrowserWindow,
  ipcMain
} from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AppDialogOptions,
  AppDialogResponse
} from "../shared/ipc-contract";

type PendingRendererDialog = {
  webContentsId: number;
  allowedValues: Set<number>;
  cancelValue: number;
  resolve: (response: number) => void;
};

export class RendererDialogService {
  private readonly pending = new Map<string, PendingRendererDialog>();
  private sequence = 0;

  registerIpc(): void {
    ipcMain.on(
      IPC_CHANNELS.appDialogResponse,
      (event, payload: unknown) => {
        if (!this.isDialogResponse(payload)) {
          return;
        }
        const request = this.pending.get(payload.id);
        if (
          !request ||
          request.webContentsId !== event.sender.id
        ) {
          return;
        }
        this.pending.delete(payload.id);
        request.resolve(
          request.allowedValues.has(payload.response)
            ? payload.response
            : request.cancelValue
        );
      }
    );
  }

  request(
    win: BrowserWindow,
    options: AppDialogOptions
  ): Promise<number> {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      return Promise.resolve(options.cancelValue);
    }
    const id = `dialog-${Date.now()}-${this.sequence++}`;
    return new Promise((resolve) => {
      this.pending.set(id, {
        webContentsId: win.webContents.id,
        allowedValues: new Set(
          options.buttons.map((button) => button.value)
        ),
        cancelValue: options.cancelValue,
        resolve
      });
      win.webContents.send(
        IPC_CHANNELS.appDialogRequest,
        { id, ...options }
      );
    });
  }

  releaseWebContents(webContentsId: number): void {
    for (const [id, pending] of this.pending) {
      if (pending.webContentsId !== webContentsId) {
        continue;
      }
      this.pending.delete(id);
      pending.resolve(pending.cancelValue);
    }
  }

  private isDialogResponse(
    payload: unknown
  ): payload is AppDialogResponse {
    return Boolean(
      payload &&
      typeof payload === "object" &&
      "id" in payload &&
      "response" in payload &&
      typeof payload.id === "string" &&
      typeof payload.response === "number"
    );
  }
}
