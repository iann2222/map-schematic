import {
  BrowserWindow,
  Menu,
  screen
} from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import type { MenuAction } from "../shared/ipc-contract";

function sendMenuAction(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(
    IPC_CHANNELS.menuAction,
    action
  );
}

export function buildAppMenu(): Menu {
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
          accelerator:
            process.platform === "darwin"
              ? "Command+Shift+Z"
              : "Control+Y",
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
          click: () => BrowserWindow.getFocusedWindow()?.maximize()
        },
        { role: "togglefullscreen", label: "全螢幕" },
        {
          label: "回到預設視窗",
          click: resetFocusedWindow
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

function resetFocusedWindow(): void {
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
  const x = Math.round(
    display.bounds.x +
      (display.bounds.width - 1200) / 2
  );
  const y = Math.round(
    display.bounds.y +
      (display.bounds.height - 860) / 2
  );
  win.setBounds({ x, y, width: 1200, height: 860 });
}
