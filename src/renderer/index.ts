export {};

declare global {
  interface Window {
    mapSchematic?: {
      ping?: () => string;
      getDatapack?: () => Promise<{
        id: string;
        version: string;
        basemap: { format: string; layers: Array<{ id: string; path: string }> };
      }>;
      getBasemapLayers?: () => Promise<Array<{ id: string; geojson: string }>>;
      searchGeonames?: (
        query: string,
        limit?: number
      ) => Promise<
        Array<{
          id: number;
          name: string;
          latitude: number;
          longitude: number;
          featureClass: string | null;
          featureCode: string | null;
          countryCode: string | null;
          population: number | null;
        }>
      >;
      saveProject?: (project: MapProject) => Promise<{ ok: boolean; path?: string; errors?: string[] }>;
      loadProject?: () => Promise<{
        ok: boolean;
        path?: string;
        project?: MapProject;
        validation?: { valid: boolean; errors: Array<{ path: string; message: string }> };
        error?: string;
      }>;
    };
  }
}

type GeonamesResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  featureClass: string | null;
  featureCode: string | null;
  countryCode: string | null;
  population: number | null;
};

type MapProject = {
  schemaVersion: "0.1";
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
};

const statusEl = document.getElementById("status");
const svg = document.getElementById("map") as SVGSVGElement | null;
const searchInput = document.getElementById("search") as HTMLInputElement | null;
const searchButton = document.getElementById("searchBtn") as HTMLButtonElement | null;
const resultsEl = document.getElementById("results") as HTMLUListElement | null;
const saveButton = document.getElementById("saveBtn") as HTMLButtonElement | null;
const loadButton = document.getElementById("loadBtn") as HTMLButtonElement | null;

const WORLD = {
  minLon: -180,
  maxLon: 180,
  minLat: -85,
  maxLat: 85
};

const RADIUS = 6378137;

const selectedMarkers: GeonamesResult[] = [];
let currentPackVersion = "";
let currentPackId = "";
let currentProject: MapProject | null = null;

function mercatorX(lon: number): number {
  return (RADIUS * lon * Math.PI) / 180;
}

function mercatorY(lat: number): number {
  const clamped = Math.max(Math.min(lat, 85), -85);
  const rad = (clamped * Math.PI) / 180;
  return RADIUS * Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

const WORLD_X_MIN = mercatorX(WORLD.minLon);
const WORLD_X_MAX = mercatorX(WORLD.maxLon);
const WORLD_Y_MIN = mercatorY(WORLD.minLat);
const WORLD_Y_MAX = mercatorY(WORLD.maxLat);

function project(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = mercatorX(lon);
  const y = mercatorY(lat);
  const sx = (x - WORLD_X_MIN) / (WORLD_X_MAX - WORLD_X_MIN);
  const sy = (y - WORLD_Y_MIN) / (WORLD_Y_MAX - WORLD_Y_MIN);
  return [sx * width, (1 - sy) * height];
}

function pathFromCoords(
  coords: Array<[number, number]>,
  width: number,
  height: number
): string {
  if (coords.length === 0) {
    return "";
  }
  const [firstLon, firstLat] = coords[0];
  const [x0, y0] = project(firstLon, firstLat, width, height);
  let d = `M ${x0.toFixed(2)} ${y0.toFixed(2)}`;
  for (let i = 1; i < coords.length; i += 1) {
    const [lon, lat] = coords[i];
    const [x, y] = project(lon, lat, width, height);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

function geometryToPath(geometry: any, width: number, height: number): string {
  if (!geometry) {
    return "";
  }
  const type = geometry.type;
  if (type === "Polygon") {
    return geometry.coordinates
      .map((ring: Array<[number, number]>) => pathFromCoords(ring, width, height) + " Z")
      .join(" ");
  }
  if (type === "MultiPolygon") {
    return geometry.coordinates
      .map((poly: Array<Array<[number, number]>>) =>
        poly.map((ring) => pathFromCoords(ring, width, height) + " Z").join(" ")
      )
      .join(" ");
  }
  if (type === "LineString") {
    return pathFromCoords(geometry.coordinates, width, height);
  }
  if (type === "MultiLineString") {
    return geometry.coordinates
      .map((line: Array<[number, number]>) => pathFromCoords(line, width, height))
      .join(" ");
  }
  return "";
}

function applyLayerStyle(path: SVGPathElement, layerId: string): void {
  const styles: Record<string, { fill?: string; stroke?: string; strokeWidth?: number }> = {
    ocean: { fill: "#0f1c3f" },
    land: { fill: "#1f2937" },
    lakes: { fill: "#142247" },
    rivers: { stroke: "#3b82f6", strokeWidth: 0.6 },
    coastline: { stroke: "#cbd5f5", strokeWidth: 0.6 }
  };
  const style = styles[layerId] ?? { stroke: "#64748b", strokeWidth: 0.4 };
  if (style.fill) {
    path.setAttribute("fill", style.fill);
  } else {
    path.setAttribute("fill", "none");
  }
  if (style.stroke) {
    path.setAttribute("stroke", style.stroke);
  }
  if (style.strokeWidth) {
    path.setAttribute("stroke-width", style.strokeWidth.toString());
  }
  path.setAttribute("vector-effect", "non-scaling-stroke");
}

function ensureLayer(svgEl: SVGSVGElement, id: string): SVGGElement {
  let group = svgEl.querySelector(`g[data-layer="${id}"]`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-layer", id);
    svgEl.appendChild(group);
  }
  return group;
}

async function renderBasemap() {
  if (!svg || !window.mapSchematic?.getBasemapLayers) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;

  const layers = await window.mapSchematic.getBasemapLayers();
  const basemapLayer = ensureLayer(svg, "basemap");
  basemapLayer.innerHTML = "";

  for (const layer of layers) {
    const geojson = JSON.parse(layer.geojson);
    const features = geojson.features ?? [];
    for (const feature of features) {
      const d = geometryToPath(feature.geometry, width, height);
      if (!d) {
        continue;
      }
      const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("d", d);
      applyLayerStyle(pathEl, layer.id);
      basemapLayer.appendChild(pathEl);
    }
  }
}

function renderMarkers() {
  if (!svg) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const markerLayer = ensureLayer(svg, "markers");
  markerLayer.innerHTML = "";

  for (const marker of selectedMarkers) {
    const [x, y] = project(marker.longitude, marker.latitude, width, height);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x.toFixed(2));
    circle.setAttribute("cy", y.toFixed(2));
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "#f97316");
    circle.setAttribute("stroke", "#fff7ed");
    circle.setAttribute("stroke-width", "1.2");
    markerLayer.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", (x + 6).toFixed(2));
    label.setAttribute("y", (y - 6).toFixed(2));
    label.setAttribute("fill", "#fde68a");
    label.setAttribute("font-size", "12");
    label.setAttribute("font-family", "IBM Plex Sans, sans-serif");
    label.textContent = marker.name;
    markerLayer.appendChild(label);
  }
}

function renderResults(results: GeonamesResult[]) {
  if (!resultsEl) {
    return;
  }
  resultsEl.innerHTML = "";
  results.forEach((result) => {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.textContent = result.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${result.featureClass ?? ""}${result.featureCode ?? ""} · ${result.countryCode ?? ""} · pop ${result.population ?? 0}`;
    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      selectedMarkers.push(result);
      renderMarkers();
    });
    resultsEl.appendChild(item);
  });
}

async function handleSearch() {
  if (!searchInput || !searchButton) {
    return;
  }
  const query = searchInput.value.trim();
  if (!query) {
    return;
  }
  searchButton.disabled = true;
  try {
    const results = await window.mapSchematic?.searchGeonames?.(query, 10);
    renderResults(results ?? []);
  } finally {
    searchButton.disabled = false;
  }
}

function buildProject(): MapProject | null {
  if (!currentPackVersion || !currentPackId) {
    return null;
  }
  const now = new Date().toISOString();
  const base = currentProject?.createdAt ?? now;
  return {
    schemaVersion: "0.1",
    createdAt: base,
    updatedAt: now,
    dataPackVersion: currentPackVersion,
    dataPackId: currentPackId,
    canvas: { width: 1200, height: 800, unit: "px" },
    viewport: {
      bbox: { ...WORLD },
      projection: "EPSG:4326"
    },
    layers: [
      {
        id: "layer-1",
        name: "Default",
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 0
      }
    ],
    objects: selectedMarkers.map((marker, index) => ({
      id: `obj-${index + 1}`,
      type: "pointLabel",
      layerId: "layer-1",
      style: { fill: "#f97316" },
      geometry: { kind: "point", lon: marker.longitude, lat: marker.latitude },
      text: marker.name,
      provenance: { source: "geonames", sourceId: String(marker.id) }
    }))
  };
}

async function handleSave() {
  if (!window.mapSchematic?.saveProject) {
    return;
  }
  const project = buildProject();
  if (!project) {
    if (statusEl) {
      statusEl.textContent = "資料包未載入，無法儲存。";
    }
    return;
  }
  const result = await window.mapSchematic.saveProject(project);
  if (statusEl) {
    statusEl.textContent = result.ok
      ? `專案已儲存：${result.path}`
      : "專案儲存失敗";
  }
}

async function handleLoad() {
  if (!window.mapSchematic?.loadProject) {
    return;
  }
  const result = await window.mapSchematic.loadProject();
  if (!result.ok || !result.project) {
    if (statusEl) {
      statusEl.textContent = `載入失敗：${result.error ?? "未知錯誤"}`;
    }
    return;
  }
  const project = result.project;
  currentProject = project;
  selectedMarkers.splice(0, selectedMarkers.length);
  for (const obj of project.objects ?? []) {
    if (obj.geometry?.kind === "point" && obj.geometry.lon != null && obj.geometry.lat != null) {
      selectedMarkers.push({
        id: Number(obj.provenance?.sourceId ?? 0),
        name: obj.text ?? "",
        latitude: obj.geometry.lat,
        longitude: obj.geometry.lon,
        featureClass: null,
        featureCode: null,
        countryCode: null,
        population: null
      });
    }
  }
  renderMarkers();
  if (statusEl) {
    statusEl.textContent = `專案已載入：${result.path}`;
  }
}

async function boot() {
  if (!statusEl) {
    return;
  }
  const ping = window.mapSchematic?.ping?.() ?? "no-bridge";
  statusEl.textContent = `橋接：${ping}。載入資料包中...`;
  try {
    const datapack = await window.mapSchematic?.getDatapack?.();
    await renderBasemap();
    renderMarkers();
    if (datapack) {
      currentPackId = datapack.id;
      currentPackVersion = datapack.version;
      statusEl.textContent = `資料包 ${datapack.id} ${datapack.version} 已載入。`;
    } else {
      statusEl.textContent = "資料包不可用。";
    }
  } catch (err) {
    statusEl.textContent = `載入資料包失敗：${String(err)}`;
  }
}

searchButton?.addEventListener("click", handleSearch);
searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSearch();
  }
});
saveButton?.addEventListener("click", handleSave);
loadButton?.addEventListener("click", handleLoad);

boot();
