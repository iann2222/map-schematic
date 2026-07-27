import {
  app,
  BrowserWindow,
  Menu
} from "electron";

import { configureDataRoot } from "./data-root";
import {
  configureAboutPanel,
  registerAppInfoIpc
} from "./app-info-ipc";
import { buildAppMenu } from "./app-menu";
import { registerDatapackIpc } from "./datapack-ipc";
import { registerProjectIpc } from "./project-ipc";
import { RendererDialogService } from "./renderer-dialog";
import { MainWindowController } from "./window-controller";

const dialogs = new RendererDialogService();
const windows = new MainWindowController(dialogs);

void app.whenReady().then(() => {
  configureDataRoot();
  Menu.setApplicationMenu(buildAppMenu());

  dialogs.registerIpc();
  windows.registerIpc();
  registerAppInfoIpc();
  registerDatapackIpc(dialogs);
  registerProjectIpc(dialogs);
  configureAboutPanel();

  windows.create();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.create();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
