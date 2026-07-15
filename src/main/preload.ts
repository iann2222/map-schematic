import { contextBridge, ipcRenderer } from "electron";

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

contextBridge.exposeInMainWorld("mapSchematic", {
  ping: () => "pong",
  getDatapack: (): Promise<DatapackInfo> => ipcRenderer.invoke("datapack:get"),
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
  }
});
