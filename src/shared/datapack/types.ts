export type DataPackRef = {
  id: string;
  version: string;
};

export type DataPackManifest = {
  id: string;
  version: string;
  createdAt: string;
  sources?: string[];
  layers?: string[];
  geonames?: {
    languages?: string[];
  };
};
