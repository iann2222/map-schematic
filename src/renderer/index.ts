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

type ViewTransform = {
  scale: number;
  tx: number;
  ty: number;
};

type DragMode = "pan" | "box" | null;

type TileRange = {
  min: number;
  max: number;
};

const statusEl = document.getElementById("status");
const svg = document.getElementById("map") as SVGSVGElement | null;
const searchInput = document.getElementById("search") as HTMLInputElement | null;
const searchButton = document.getElementById("searchBtn") as HTMLButtonElement | null;
const resultsEl = document.getElementById("results") as HTMLUListElement | null;
const saveButton = document.getElementById("saveBtn") as HTMLButtonElement | null;
const loadButton = document.getElementById("loadBtn") as HTMLButtonElement | null;
const toolZoomIn = document.getElementById("toolZoomIn") as HTMLButtonElement | null;
const toolZoomOut = document.getElementById("toolZoomOut") as HTMLButtonElement | null;
const toolReset = document.getElementById("toolReset") as HTMLButtonElement | null;

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

const view: ViewTransform = { scale: 1, tx: 0, ty: 0 };
let isDragging = false;
let dragStartScreen: { x: number; y: number } | null = null;
let dragStartMap: { x: number; y: number } | null = null;
let dragMode: DragMode = null;
let dragRect: SVGRectElement | null = null;
let cachedBasemapLayers: Array<{ id: string; geojson: any }> = [];
let currentTiles: TileRange | null = null;

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

function unproject(x: number, y: number, width: number, height: number): [number, number] {
  const sx = x / width;
  const sy = 1 - y / height;
  const mx = WORLD_X_MIN + sx * (WORLD_X_MAX - WORLD_X_MIN);
  const my = WORLD_Y_MIN + sy * (WORLD_Y_MAX - WORLD_Y_MIN);
  const lon = (mx / RADIUS) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(my / RADIUS)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
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

function ensureLayer(parent: SVGElement, id: string): SVGGElement {
  let group = parent.querySelector(`g[data-layer="${id}"]`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-layer", id);
    parent.appendChild(group);
  }
  return group;
}

function ensureMapRoot(svgEl: SVGSVGElement): SVGGElement {
  let root = svgEl.querySelector("g[data-layer=\"map-root\"]") as SVGGElement | null;
  if (!root) {
    root = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.setAttribute("data-layer", "map-root");
    svgEl.appendChild(root);
  }
  return root;
}

function ensureBasemapContainer(root: SVGGElement): SVGGElement {
  let container = root.querySelector("g[data-layer=\"basemap-wrap\"]") as SVGGElement | null;
  if (!container) {
    container = document.createElementNS("http://www.w3.org/2000/svg", "g");
    container.setAttribute("data-layer", "basemap-wrap");
    root.appendChild(container);
  }
  return container;
}

function ensureMarkersContainer(root: SVGGElement): SVGGElement {
  let container = root.querySelector("g[data-layer=\"markers-wrap\"]") as SVGGElement | null;
  if (!container) {
    container = document.createElementNS("http://www.w3.org/2000/svg", "g");
    container.setAttribute("data-layer", "markers-wrap");
    root.appendChild(container);
  }
  return container;
}

function ensureWrapGroup(container: SVGGElement, id: string, offsetX: number): SVGGElement {
  let group = container.querySelector(`g[data-wrap=\"${id}\"]`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-wrap", id);
    container.appendChild(group);
  }
  group.setAttribute("transform", `translate(${offsetX} 0)`);
  return group;
}

function applyViewTransform(): void {
  if (!svg) {
    return;
  }
  const root = ensureMapRoot(svg);
  root.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.scale})`);
}

function clampVertical(): void {
  if (!svg) {
    return;
  }
  const height = svg.viewBox.baseVal.height || 800;
  const scaledHeight = height * view.scale;
  const minTy = height - scaledHeight;
  const maxTy = 0;
  view.ty = Math.min(maxTy, Math.max(minTy, view.ty));
}

function viewCenterLonLat(): [number, number] {
  if (!svg) {
    return [0, 0];
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const centerX = (width / 2 - view.tx) / view.scale;
  const centerY = (height / 2 - view.ty) / view.scale;
  return unproject(centerX, centerY, width, height);
}

function tileRange(): TileRange {
  if (!svg) {
    return { min: -1, max: 1 };
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const minX = (-view.tx) / view.scale;
  const maxX = (width - view.tx) / view.scale;
  let minTile = Math.floor(minX / width) - 1;
  let maxTile = Math.ceil(maxX / width) + 1;
  const maxSpan = 5;
  if (maxTile - minTile > maxSpan) {
    const mid = Math.floor((minTile + maxTile) / 2);
    minTile = mid - Math.floor(maxSpan / 2);
    maxTile = minTile + maxSpan;
  }
  return { min: minTile, max: maxTile };
}

async function renderBasemap() {
  if (!svg || !window.mapSchematic?.getBasemapLayers) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;

  const root = ensureMapRoot(svg);
  const basemapWrap = ensureBasemapContainer(root);
  basemapWrap.innerHTML = "";

  const rawLayers = await window.mapSchematic.getBasemapLayers();
  cachedBasemapLayers = rawLayers.map((layer) => ({
    id: layer.id,
    geojson: JSON.parse(layer.geojson)
  }));

  const range = tileRange();
  currentTiles = range;
  for (let i = range.min; i <= range.max; i += 1) {
    const wrap = ensureWrapGroup(basemapWrap, `wrap-${i}`, i * width);
    const basemapLayer = ensureLayer(wrap, "basemap");
    basemapLayer.innerHTML = "";
    for (const layer of cachedBasemapLayers) {
      const features = layer.geojson.features ?? [];
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
}

function renderMarkers() {
  if (!svg) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const root = ensureMapRoot(svg);
  const markerWrap = ensureMarkersContainer(root);
  markerWrap.innerHTML = "";

  const range = currentTiles ?? tileRange();
  for (let i = range.min; i <= range.max; i += 1) {
    const wrap = ensureWrapGroup(markerWrap, `marker-${i}`, i * width);
    wrap.innerHTML = "";
    for (const marker of selectedMarkers) {
      const [x, y] = project(marker.longitude, marker.latitude, width, height);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", (x).toFixed(2));
      circle.setAttribute("cy", (y).toFixed(2));
      circle.setAttribute("r", "4");
      circle.setAttribute("fill", "#f97316");
      circle.setAttribute("stroke", "#fff7ed");
      circle.setAttribute("stroke-width", "1.2");
      wrap.appendChild(circle);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", (x + 6).toFixed(2));
      label.setAttribute("y", (y - 6).toFixed(2));
      label.setAttribute("fill", "#fde68a");
      label.setAttribute("font-size", "12");
      label.setAttribute("font-family", "IBM Plex Sans, sans-serif");
      label.textContent = marker.name;
      wrap.appendChild(label);
    }
  }
}

function refreshWraps(): void {
  if (!svg) {
    return;
  }
  if (cachedBasemapLayers.length === 0) {
    return;
  }
  const range = tileRange();
  if (currentTiles && currentTiles.min === range.min && currentTiles.max === range.max) {
    return;
  }
  currentTiles = range;
  const root = ensureMapRoot(svg);
  const basemapWrap = ensureBasemapContainer(root);
  basemapWrap.innerHTML = "";
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  for (let i = range.min; i <= range.max; i += 1) {
    const wrap = ensureWrapGroup(basemapWrap, `wrap-${i}`, i * width);
    const basemapLayer = ensureLayer(wrap, "basemap");
    basemapLayer.innerHTML = "";
    for (const layer of cachedBasemapLayers) {
      const features = layer.geojson.features ?? [];
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
  renderMarkers();
}

function haversineDistance(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const h = sinDlat * sinDlat + Math.cos(rLat1) * Math.cos(rLat2) * sinDlon * sinDlon;
  return 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sortResults(results: GeonamesResult[]): GeonamesResult[] {
  const center = viewCenterLonLat();
  return [...results].sort((a, b) => {
    const da = haversineDistance(center, [a.longitude, a.latitude]);
    const db = haversineDistance(center, [b.longitude, b.latitude]);
    if (da !== db) {
      return da - db;
    }
    return (b.population ?? 0) - (a.population ?? 0);
  });
}

function renderResults(results: GeonamesResult[]) {
  if (!resultsEl) {
    return;
  }
  resultsEl.innerHTML = "";
  const sorted = sortResults(results);
  sorted.forEach((result) => {
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

function svgPointFromEvent(event: MouseEvent): { x: number; y: number } {
  if (!svg) {
    return { x: 0, y: 0 };
  }
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const svgPoint = point.matrixTransform(ctm.inverse());
  return { x: svgPoint.x, y: svgPoint.y };
}

function mapPointFromEvent(event: MouseEvent): { x: number; y: number } {
  const screen = svgPointFromEvent(event);
  return {
    x: (screen.x - view.tx) / view.scale,
    y: (screen.y - view.ty) / view.scale
  };
}

function zoomAt(point: { x: number; y: number }, delta: number): void {
  const prevScale = view.scale;
  const nextScale = Math.max(0.4, Math.min(6, view.scale * delta));
  const scaleRatio = nextScale / prevScale;

  view.tx = point.x - scaleRatio * (point.x - view.tx);
  view.ty = point.y - scaleRatio * (point.y - view.ty);
  view.scale = nextScale;

  clampVertical();
  applyViewTransform();
  refreshWraps();
}

function resetView(): void {
  view.scale = 1;
  view.tx = 0;
  view.ty = 0;
  applyViewTransform();
  refreshWraps();
}

function onWheel(event: WheelEvent): void {
  if (!svg) {
    return;
  }
  event.preventDefault();
  const delta = Math.sign(event.deltaY);
  const zoomFactor = delta > 0 ? 0.9 : 1.1;
  const point = svgPointFromEvent(event);
  zoomAt(point, zoomFactor);
}

function ensureDragRect(): SVGRectElement | null {
  if (!svg) {
    return null;
  }
  if (!dragRect) {
    dragRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    dragRect.setAttribute("fill", "rgba(56, 189, 248, 0.12)");
    dragRect.setAttribute("stroke", "#38bdf8");
    dragRect.setAttribute("stroke-width", "1");
    svg.appendChild(dragRect);
  }
  return dragRect;
}

function clearDragRect(): void {
  if (dragRect && dragRect.parentNode) {
    dragRect.parentNode.removeChild(dragRect);
  }
  dragRect = null;
}

function onMouseDown(event: MouseEvent): void {
  if (!svg) {
    return;
  }
  if (event.button !== 0 && event.button !== 2) {
    return;
  }
  isDragging = true;
  svg.classList.add("dragging");
  dragStartScreen = svgPointFromEvent(event);
  dragStartMap = mapPointFromEvent(event);
  dragMode = event.button === 2 ? "box" : "pan";
  svg.classList.toggle("boxing", dragMode === "box");
  if (dragMode === "box") {
    const rect = ensureDragRect();
    if (rect && dragStartScreen) {
      rect.setAttribute("x", dragStartScreen.x.toFixed(2));
      rect.setAttribute("y", dragStartScreen.y.toFixed(2));
      rect.setAttribute("width", "0");
      rect.setAttribute("height", "0");
    }
  }
}

function onMouseMove(event: MouseEvent): void {
  if (!isDragging || !dragStartScreen || !svg) {
    return;
  }
  const currentScreen = svgPointFromEvent(event);
  if (dragMode === "pan") {
    const dx = currentScreen.x - dragStartScreen.x;
    const dy = currentScreen.y - dragStartScreen.y;
    view.tx += dx;
    view.ty += dy;
    dragStartScreen = currentScreen;
    clampVertical();
    applyViewTransform();
    return;
  }
  if (dragMode === "box") {
    const rect = ensureDragRect();
    if (!rect) {
      return;
    }
    const x = Math.min(dragStartScreen.x, currentScreen.x);
    const y = Math.min(dragStartScreen.y, currentScreen.y);
    const w = Math.abs(currentScreen.x - dragStartScreen.x);
    const h = Math.abs(currentScreen.y - dragStartScreen.y);
    rect.setAttribute("x", x.toFixed(2));
    rect.setAttribute("y", y.toFixed(2));
    rect.setAttribute("width", w.toFixed(2));
    rect.setAttribute("height", h.toFixed(2));
  }
}

function onMouseUp(event: MouseEvent): void {
  if (!svg || !isDragging || !dragStartScreen) {
    isDragging = false;
    dragMode = null;
    svg?.classList.remove("dragging");
    return;
  }
  const endMap = mapPointFromEvent(event);
  if (dragMode === "box") {
    const startMap = dragStartMap ?? { x: 0, y: 0 };
    const x = Math.min(startMap.x, endMap.x);
    const y = Math.min(startMap.y, endMap.y);
    const w = Math.abs(endMap.x - startMap.x);
    const h = Math.abs(endMap.y - startMap.y);
    if (w > 10 && h > 10) {
      const width = svg.viewBox.baseVal.width || 1200;
      const height = svg.viewBox.baseVal.height || 800;
      const scaleX = width / w;
      const scaleY = height / h;
      const nextScale = Math.min(6, Math.max(0.4, Math.min(scaleX, scaleY)));
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      view.tx = width / 2 - centerX * nextScale;
      view.ty = height / 2 - centerY * nextScale;
      view.scale = nextScale;
      clampVertical();
      applyViewTransform();
      refreshWraps();
    }
  }
  if (dragMode === "pan") {
    refreshWraps();
  }
  clearDragRect();
  isDragging = false;
  dragMode = null;
  svg.classList.remove("dragging");
  svg.classList.remove("boxing");
}

function attachMapInteractions(): void {
  if (!svg) {
    return;
  }
  svg.addEventListener("contextmenu", (event) => event.preventDefault());
  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("mousedown", onMouseDown);
  svg.addEventListener("mousemove", onMouseMove);
  svg.addEventListener("mouseup", onMouseUp);
  svg.addEventListener("mouseleave", () => {
    if (isDragging) {
      isDragging = false;
      dragMode = null;
      clearDragRect();
      svg.classList.remove("dragging");
      svg.classList.remove("boxing");
    }
  });
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
    applyViewTransform();
    attachMapInteractions();
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

function hookToolbar(): void {
  toolZoomIn?.addEventListener("click", () => {
    if (!svg) {
      return;
    }
    const width = svg.viewBox.baseVal.width || 1200;
    const height = svg.viewBox.baseVal.height || 800;
    zoomAt({ x: width / 2, y: height / 2 }, 1.2);
  });
  toolZoomOut?.addEventListener("click", () => {
    if (!svg) {
      return;
    }
    const width = svg.viewBox.baseVal.width || 1200;
    const height = svg.viewBox.baseVal.height || 800;
    zoomAt({ x: width / 2, y: height / 2 }, 0.8);
  });
  toolReset?.addEventListener("click", () => resetView());
}

searchButton?.addEventListener("click", handleSearch);
searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSearch();
  }
});
saveButton?.addEventListener("click", handleSave);
loadButton?.addEventListener("click", handleLoad);

hookToolbar();
boot();
