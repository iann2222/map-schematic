import { contextBridge, ipcRenderer } from "electron";

import type { DataPackStatus } from "../shared/datapack/types";
import type { MapProject } from "../shared/schema/mapproj-contract";

type DatapackInfo = {
  id: string;
  version: string;
  basemap: {
    format: string;
    layers: Array<{ id: string; path: string }>;
  };
  geonames: {
    format: string;
    dbPath: string;
    languages: string[];
  };
  relief?: {
    format?: string;
    path?: string;
    projection?: string | null;
  } | null;
};

type BasemapLayerPayload = {
  id: string;
  geojson: string;
};

type GeonamesResult = {
  id: number;
  name: string;
  nameAlt: string | null;
  latitude: number;
  longitude: number;
  featureClass: string | null;
  featureCode: string | null;
  countryCode: string | null;
  population: number | null;
};

type AppDialogRequest = {
  id: string;
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  tone?: "info" | "warning" | "danger";
  buttons: Array<{
    label: string;
    value: number;
    variant?: "primary" | "ghost" | "danger" | "dangerGhost";
  }>;
  defaultValue: number;
  cancelValue: number;
};

contextBridge.exposeInMainWorld("mapSchematic", {
  ping: () => "pong",
  getDatapack: (): Promise<DatapackInfo> => ipcRenderer.invoke("datapack:get"),
  getDatapackStatus: (): Promise<DataPackStatus> => ipcRenderer.invoke("datapack:status"),
  updateDatapack: (): Promise<{
    ok: boolean;
    canceled?: boolean;
    status?: DataPackStatus;
    error?: string;
  }> => ipcRenderer.invoke("datapack:update"),
  getBasemapLayers: (): Promise<BasemapLayerPayload[]> =>
    ipcRenderer.invoke("basemap:get"),
  getRelief: (): Promise<{ path: string; projection: string | null } | null> =>
    ipcRenderer.invoke("relief:get"),
  searchGeonames: (query: string, limit = 10): Promise<GeonamesResult[]> =>
    ipcRenderer.invoke("geonames:search", query, limit),
  saveProject: (payload: { project: MapProject; path?: string | null; saveAs?: boolean }) =>
    ipcRenderer.invoke("project:save", payload),
  loadProject: () => ipcRenderer.invoke("project:load"),
  setProjectDirty: (dirty: boolean) => ipcRenderer.send("project:dirty-state", dirty),
  closeAfterSave: (): Promise<boolean> => ipcRenderer.invoke("project:close-after-save"),
  exportProject: (payload: {
    format: "png" | "svg" | "pdf";
    data: string;
    width: number;
    height: number;
  }) => ipcRenderer.invoke("project:export", payload),
  onMenuAction: (handler: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => handler(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },
  onAppDialogRequest: (handler: (request: AppDialogRequest) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: AppDialogRequest
    ) => handler(request);
    ipcRenderer.on("app-dialog:request", listener);
    return () => ipcRenderer.removeListener("app-dialog:request", listener);
  },
  respondToAppDialog: (id: string, response: number) => {
    ipcRenderer.send("app-dialog:response", { id, response });
  }
});
