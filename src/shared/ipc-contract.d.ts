import type {
  DataPackManifest,
  DataPackStatus,
} from "./datapack/contract";
import type { MapProject } from "./schema/mapproj-contract";

export type {
  DataPackManifest,
  DataPackStatus,
  MapProject,
};

export type AppBuildInfo = {
  version: string;
  commitSha: string;
  shortCommitSha: string;
  dirty: boolean | null;
};

export type GeonamesResult = {
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

export type AppDialogButton = {
  label: string;
  value: number;
  variant?: "primary" | "ghost" | "danger" | "dangerGhost";
};

export type AppDialogRequest = {
  id: string;
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  tone?: "info" | "warning" | "danger";
  buttons: AppDialogButton[];
  defaultValue: number;
  cancelValue: number;
};

export type AppDialogOptions = Omit<AppDialogRequest, "id">;

export type AppDialogResponse = {
  id: string;
  response: number;
};

export type MenuAction =
  | "project:open"
  | "project:save"
  | "project:saveAs"
  | "project:saveBeforeClose"
  | "edit:undo"
  | "edit:redo"
  | "export:png"
  | "export:svg"
  | "export:pdf"
  | "app:about"
  | "app:attributions";

export type AttributionsResult = {
  ok: boolean;
  content?: string;
  error?: string;
};

export type DatapackUpdateResult = {
  ok: boolean;
  canceled?: boolean;
  datapack?: DataPackManifest;
  status?: DataPackStatus;
  error?: string;
};

export type BasemapLayerPayload = {
  id: string;
  geojson: string;
};

export type ReliefPayload = {
  path: string;
  projection: string | null;
};

export type ProjectSavePayload = {
  project: MapProject;
  path?: string | null;
  saveAs?: boolean;
};

export type ProjectSaveResult = {
  ok: boolean;
  path?: string;
  error?: string;
  errors?: string[];
  canceled?: boolean;
};

export type ProjectLoadResult = {
  ok: boolean;
  path?: string;
  project?: MapProject;
  validation?: {
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
  };
  error?: string;
  canceled?: boolean;
  migratedFromVersion?: string;
  recoveredFromBackup?: boolean;
};

export type ExportFormat = "png" | "svg" | "pdf";

export type ProjectExportPayload = {
  format: ExportFormat;
  data: string;
  width: number;
  height: number;
};

export type ProjectExportResult = {
  ok: boolean;
  path?: string;
  error?: string;
  canceled?: boolean;
};

export type MapSchematicApi = {
  ping: () => string;
  getAttributions: () => Promise<AttributionsResult>;
  getBuildInfo: () => Promise<AppBuildInfo>;
  getDatapack: () => Promise<DataPackManifest>;
  getDatapackStatus: () => Promise<DataPackStatus>;
  updateDatapack: () => Promise<DatapackUpdateResult>;
  getBasemapLayers: () => Promise<BasemapLayerPayload[]>;
  getRelief: () => Promise<ReliefPayload | null>;
  searchGeonames: (query: string, limit?: number) => Promise<GeonamesResult[]>;
  saveProject: (payload: ProjectSavePayload) => Promise<ProjectSaveResult>;
  loadProject: () => Promise<ProjectLoadResult>;
  setProjectDirty: (dirty: boolean) => void;
  closeAfterSave: () => Promise<boolean>;
  exportProject: (payload: ProjectExportPayload) => Promise<ProjectExportResult>;
  onMenuAction: (handler: (action: MenuAction) => void) => () => void;
  onAppDialogRequest: (
    handler: (request: AppDialogRequest) => void,
  ) => () => void;
  respondToAppDialog: (id: string, response: number) => void;
};
