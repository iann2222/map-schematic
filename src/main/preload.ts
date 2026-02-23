import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("mapSchematic", {
  ping: () => "pong"
});
