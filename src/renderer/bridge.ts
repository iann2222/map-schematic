import type { MapSchematicApi } from "../shared/ipc-contract.js";

export type {
  AppBuildInfo,
  AppDialogButton,
  AppDialogOptions,
  AppDialogRequest,
  DataPackStatus,
  ExportFormat,
  GeonamesResult,
  MapProject,
  MenuAction,
  ProjectExportPayload,
  ProjectExportResult,
  ProjectLoadResult,
  ProjectSavePayload,
  ProjectSaveResult,
} from "../shared/ipc-contract.js";

declare global {
  interface Window {
    mapSchematic?: MapSchematicApi;
  }
}
