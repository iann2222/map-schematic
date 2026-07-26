export type DataPackRef = {
  id: string;
  version: string;
};

export type DataPackFileEntry = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

export type DataPackManifest = DataPackRef & {
  createdAt: string;
  projection: "EPSG:4326";
  buildEnvironment?: {
    python: string;
    geopandas: string;
    pyogrio: string;
    pyproj: string;
    pillow: string;
    gdal: string;
    condaPlatform: "win-64";
    condaLockSha256: string;
  };
  basemap: {
    format: "geojson";
    layers: Array<{ id: string; path: string }>;
  };
  geonames: {
    format: "sqlite+fts";
    dbPath: string;
    languages: string[];
  };
  relief?: {
    format: string;
    path: string;
    source?: string;
    projection?: string | null;
  } | null;
  files: DataPackFileEntry[];
};

export type DataPackRelease = DataPackRef & {
  url: string;
  sha256: string;
  sourceFiles?: string[];
};

export type DataPackDownloadReason = "initialization" | "update" | "repair";

export type DataPackAvailability =
  | "ready"
  | "updateAvailable"
  | "repairRequired"
  | "missing";

export type DataPackStatus = {
  target: DataPackRef;
  active: DataPackRef | null;
  availability: DataPackAvailability;
};

export type ReadyDataPack = {
  ref: DataPackRef;
  rootPath: string;
  manifest: DataPackManifest;
  source: "installed" | "downloaded" | "recovered" | "fallback";
};
