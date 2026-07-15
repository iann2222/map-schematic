import type { MapProject } from "../shared/schema/mapproj-contract.js";

export type { MapProject } from "../shared/schema/mapproj-contract.js";

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

declare global {
  interface Window {
    mapSchematic?: {
      ping?: () => string;
      getDatapack?: () => Promise<{
        id: string;
        version: string;
        basemap: {
          format: string;
          layers: Array<{ id: string; path: string }>;
        };
      }>;
      getBasemapLayers?: () => Promise<Array<{ id: string; geojson: string }>>;
      getRelief?: () => Promise<{
        path: string;
        projection: string | null;
      } | null>;
      searchGeonames?: (
        query: string,
        limit?: number
      ) => Promise<GeonamesResult[]>;
      saveProject?: (payload: {
        project: MapProject;
        path?: string | null;
        saveAs?: boolean;
      }) => Promise<{
        ok: boolean;
        path?: string;
        errors?: string[];
        canceled?: boolean;
      }>;
      exportProject?: (payload: {
        format: "png" | "svg" | "pdf";
        data: string;
        width: number;
        height: number;
      }) => Promise<{
        ok: boolean;
        path?: string;
        error?: string;
        canceled?: boolean;
      }>;
      loadProject?: () => Promise<{
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
      }>;
      setProjectDirty?: (dirty: boolean) => void;
      closeAfterSave?: () => Promise<boolean>;
      onMenuAction?: (handler: (action: string) => void) => () => void;
    };
  }
}
