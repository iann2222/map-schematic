import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  AppDialogRequest,
  MapSchematicApi,
  MenuAction,
} from "../shared/ipc-contract";

const api: MapSchematicApi = {
  ping: () => "pong",
  getAttributions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.appGetAttributions),
  getBuildInfo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.appGetBuildInfo),
  getDatapack: () =>
    ipcRenderer.invoke(IPC_CHANNELS.datapackGet),
  getDatapackStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.datapackStatus),
  updateDatapack: () =>
    ipcRenderer.invoke(IPC_CHANNELS.datapackUpdate),
  getBasemapLayers: () =>
    ipcRenderer.invoke(IPC_CHANNELS.basemapGet),
  getRelief: () =>
    ipcRenderer.invoke(IPC_CHANNELS.reliefGet),
  searchGeonames: (query, limit = 10) =>
    ipcRenderer.invoke(IPC_CHANNELS.geonamesSearch, query, limit),
  saveProject: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.projectSave, payload),
  loadProject: () =>
    ipcRenderer.invoke(IPC_CHANNELS.projectLoad),
  setProjectDirty: (dirty) =>
    ipcRenderer.send(IPC_CHANNELS.projectDirtyState, dirty),
  closeAfterSave: () =>
    ipcRenderer.invoke(IPC_CHANNELS.projectCloseAfterSave),
  exportProject: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.projectExport, payload),
  onMenuAction: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) =>
      handler(action);
    ipcRenderer.on(IPC_CHANNELS.menuAction, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.menuAction, listener);
  },
  onAppDialogRequest: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: AppDialogRequest,
    ) => handler(request);
    ipcRenderer.on(IPC_CHANNELS.appDialogRequest, listener);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.appDialogRequest, listener);
  },
  respondToAppDialog: (id, response) => {
    ipcRenderer.send(IPC_CHANNELS.appDialogResponse, { id, response });
  },
};

contextBridge.exposeInMainWorld("mapSchematic", api);
