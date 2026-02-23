import { app, BrowserWindow } from "electron";
import path from "path";
import { resolveDataRoot } from "../shared/paths";

function createMainWindow() {
  const preloadPath = path.join(app.getAppPath(), "dist", "main", "preload.js");
  const htmlPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  win.loadFile(htmlPath);

  // Initialize data root early so failures are visible on startup.
  resolveDataRoot();
}

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
