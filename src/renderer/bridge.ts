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

export type MapProject = {
  schemaVersion: "0.2";
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  dataPackVersion: string;
  dataPackId?: string;
  canvas: {
    width: number;
    height: number;
    unit: "px" | "mm";
  };
  viewport: {
    bbox: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    };
    projection: "EPSG:3857" | "EPSG:4326";
  };
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    zIndex: number;
  }>;
  objects: Array<{
    id: string;
    type: "pointLabel" | "areaLabel" | "textOnly" | "arrow" | "polyline";
    layerId: string;
    style: Record<string, unknown>;
    geometry: {
      kind: "point" | "polygon" | "none";
      lon?: number;
      lat?: number;
      rings?: Array<Array<[number, number]>>;
    };
    text?: string;
    provenance?: {
      source: "geonames" | "manual";
      sourceId?: string;
      query?: string;
    };
  }>;
  ui: {
    listOrderKeys?: string[];
    displayOrderKeys?: string[];
    activeStyleId?: string;
    hillshadeEnabled?: boolean;
    hillshadeBlend?: string;
    ratioMode?: "free" | "fixed";
    activeRatioId?: string;
    cropRatio?: number;
    customRatioA?: number;
    customRatioB?: number;
  };
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
