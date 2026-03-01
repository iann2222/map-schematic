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
      getRelief?: () => Promise<{ path: string; projection: string | null } | null>;
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
  nameAlt: string | null;
  latitude: number;
  longitude: number;
  featureClass: string | null;
  featureCode: string | null;
  countryCode: string | null;
  population: number | null;
};

type MarkerStyle = {
  dotSize: number;
  textSize: number;
  dotColor: string;
  textColor: string;
};

type Marker = {
  id: string;
  name: string;
  nameAlt?: string;
  latitude: number;
  longitude: number;
  sourceId?: string;
  style: MarkerStyle;
};

type SliderControl = {
  root: HTMLDivElement;
  track: HTMLDivElement;
  fill: HTMLDivElement;
  thumb: HTMLDivElement;
  marks: HTMLDivElement;
  min: number;
  max: number;
  step: number;
  value: number;
  dragging: boolean;
  rect: DOMRect | null;
  marksValues: number[] | null;
  marksPercents: number[] | null;
  onChange: (value: number) => void;
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

const statusEl = document.getElementById("status");
const svg = document.getElementById("map") as SVGSVGElement | null;
const canvas = document.getElementById("basemap") as HTMLCanvasElement | null;
const searchInput0 = document.getElementById("search0") as HTMLInputElement | null;
const searchButton0 = document.getElementById("searchBtn0") as HTMLButtonElement | null;
const searchInput3 = document.getElementById("search3") as HTMLInputElement | null;
const searchButton3 = document.getElementById("searchBtn3") as HTMLButtonElement | null;
const coordInput0 = document.getElementById("coord0") as HTMLInputElement | null;
const coordButton0 = document.getElementById("coordBtn0") as HTMLButtonElement | null;
const coordInput3 = document.getElementById("coord3") as HTMLInputElement | null;
const coordButton3 = document.getElementById("coordBtn3") as HTMLButtonElement | null;
const resultsEl0 = document.getElementById("results0") as HTMLUListElement | null;
const resultsEl3 = document.getElementById("results3") as HTMLUListElement | null;
const saveButton = document.getElementById("saveBtn") as HTMLButtonElement | null;
const loadButton = document.getElementById("loadBtn") as HTMLButtonElement | null;
const clearMarkersButton = document.getElementById("clearMarkers") as HTMLButtonElement | null;
const markerDotSize = document.getElementById("markerDotSize") as HTMLDivElement | null;
const markerTextSize = document.getElementById("markerTextSize") as HTMLDivElement | null;
const markerDotColor = document.getElementById("markerDotColor") as HTMLInputElement | null;
const markerTextColor = document.getElementById("markerTextColor") as HTMLInputElement | null;
const markerList = document.getElementById("markerList") as HTMLDivElement | null;
let dotSizeSlider: SliderControl | null = null;
let textSizeSlider: SliderControl | null = null;
const toolZoomIn = document.getElementById("toolZoomIn") as HTMLButtonElement | null;
const toolZoomOut = document.getElementById("toolZoomOut") as HTMLButtonElement | null;
const toolReset = document.getElementById("toolReset") as HTMLButtonElement | null;
const zoomIndicator = document.getElementById("zoomIndicator");
const stepPanels = Array.from(document.querySelectorAll<HTMLElement>(".step-panel"));
const stepProgress = document.getElementById("stepProgress");
const stepTitle = document.getElementById("stepTitle");
const stepSubtitle = document.getElementById("stepSubtitle");
const prevStepButton = document.getElementById("prevStep") as HTMLButtonElement | null;
const nextStepButton = document.getElementById("nextStep") as HTMLButtonElement | null;
const ratio169 = document.getElementById("ratio169") as HTMLButtonElement | null;
const ratioA4 = document.getElementById("ratioA4") as HTMLButtonElement | null;
const ratioSquare = document.getElementById("ratioSquare") as HTMLButtonElement | null;
const ratioFree = document.getElementById("ratioFree") as HTMLButtonElement | null;
const ratio43 = document.getElementById("ratio43") as HTMLButtonElement | null;
const ratio34 = document.getElementById("ratio34") as HTMLButtonElement | null;
const ratio916 = document.getElementById("ratio916") as HTMLButtonElement | null;
const ratioOriginal = document.getElementById("ratioOriginal") as HTMLButtonElement | null;
const ratioInputA = document.getElementById("ratioInputA") as HTMLInputElement | null;
const ratioInputB = document.getElementById("ratioInputB") as HTMLInputElement | null;
const ratioCustom = document.getElementById("ratioCustom") as HTMLButtonElement | null;
const mapWrap = document.querySelector(".map-wrap") as HTMLDivElement | null;
const ratioButtons = [
  ratioFree,
  ratioOriginal,
  ratioSquare,
  ratio34,
  ratio43,
  ratio169,
  ratio916,
  ratioA4,
  ratioCustom
].filter((btn): btn is HTMLButtonElement => Boolean(btn));
const styleOriginal = document.getElementById("styleOriginal") as HTMLButtonElement | null;
const styleDefault = document.getElementById("styleDefault") as HTMLButtonElement | null;
const styleMinimal = document.getElementById("styleMinimal") as HTMLButtonElement | null;
const styleDark = document.getElementById("styleDark") as HTMLButtonElement | null;
const styleOutline = document.getElementById("styleOutline") as HTMLButtonElement | null;
const styleSoft = document.getElementById("styleSoft") as HTMLButtonElement | null;
const reliefBlendButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-relief]")
);
const mapStage = document.querySelector(".map-stage") as HTMLDivElement | null;
const cropFrame = document.getElementById("cropFrame") as HTMLDivElement | null;
const cropOverlay = document.getElementById("cropOverlay") as HTMLDivElement | null;
const cropMaskTop = document.getElementById("cropMaskTop") as HTMLDivElement | null;
const cropMaskLeft = document.getElementById("cropMaskLeft") as HTMLDivElement | null;
const cropMaskRight = document.getElementById("cropMaskRight") as HTMLDivElement | null;
const cropMaskBottom = document.getElementById("cropMaskBottom") as HTMLDivElement | null;
const styleButtons = [
  styleOriginal,
  styleDefault,
  styleMinimal,
  styleDark,
  styleOutline,
  styleSoft
].filter((btn): btn is HTMLButtonElement => Boolean(btn));

const WORLD = {
  minLon: -180,
  maxLon: 180,
  minLat: -85,
  maxLat: 85
};

const RADIUS = 6378137;
const WRAPS = [-1, 0, 1] as const;
const MIN_SCALE = 0.4;
const MAX_SCALE = 12;
const MAX_SCALE_CROP = 50;
const ZOOM_LEVELS = [0.4, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12];
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;
let cropRatio = MAP_WIDTH / MAP_HEIGHT;
let activeStep = "0";
let ratioMode: "free" | "fixed" = "fixed";
let originalRatio = MAP_WIDTH / MAP_HEIGHT;
let activeRatioId: string | undefined = undefined;
let activeStyleId = "styleOriginal";
let mapLocked = false;
let cropBBox: { x: number; y: number; width: number; height: number } | null = null;
type CropBox = { left: number; top: number; width: number; height: number };
type CropDrag = {
  mode: "move" | "resize";
  handle?: string;
  startX: number;
  startY: number;
  startBox: CropBox;
};

let cropBox: CropBox | null = null;
let cropDrag: CropDrag | null = null;

const selectedMarkers: Marker[] = [];
let selectedMarkerId: string | null = null;
let currentPackVersion = "";
let currentPackId = "";
let currentProject: MapProject | null = null;

const view: ViewTransform = { scale: 1, tx: 0, ty: 0 };
let isDragging = false;
let dragStartScreen: { x: number; y: number } | null = null;
let dragStartMap: { x: number; y: number } | null = null;
let dragMode: DragMode = null;
let dragRect: SVGRectElement | null = null;
let cachedBasemapLayers: Array<{ id: string; paths: Path2D[] }> = [];
let basemapBuilt = false;
let worldShift = 0;
let basemapDrawPending = false;
let shiftLocked = false;
let shiftLockValue = 0;
let hillshadeEnabled = false;
let hillshadeBlend: GlobalCompositeOperation = "overlay";
let hillshadeImage: HTMLImageElement | null = null;
let hillshadeTexture: HTMLCanvasElement | null = null;
let hillshadeProjection: string | null = null;

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

type LayerStyle = { fill?: string; stroke?: string; strokeWidth?: number };

function layerStyleFor(layerId: string): LayerStyle {
  const presets: Record<string, Record<string, LayerStyle>> = {
    styleOriginal: {
      ocean: { fill: "#0f1c3f" },
      land: { fill: "#1f2937" },
      lakes: { fill: "#142247" },
      rivers: { stroke: "#3b82f6", strokeWidth: 0.6 },
      coastline: { stroke: "#cbd5f5", strokeWidth: 0.6 }
    },
    styleDefault: {
      ocean: { fill: "#dbeafe" },
      land: { fill: "#f1f5f9" },
      lakes: { fill: "#bfdbfe" },
      rivers: { stroke: "#60a5fa", strokeWidth: 0.6 },
      coastline: { stroke: "#94a3b8", strokeWidth: 0.6 },
      borders: { stroke: "#cbd5f5", strokeWidth: 0.4 }
    },
    styleMinimal: {
      ocean: { fill: "#f8fafc" },
      land: { fill: "#f8fafc" },
      lakes: { fill: "#f1f5f9" },
      rivers: { stroke: "none", strokeWidth: 0 },
      coastline: { stroke: "#e2e8f0", strokeWidth: 0.4 },
      borders: { stroke: "none", strokeWidth: 0 }
    },
    styleDark: {
      ocean: { fill: "#0b1020" },
      land: { fill: "#1f2a44" },
      lakes: { fill: "#101a33" },
      rivers: { stroke: "#3b82f6", strokeWidth: 0.6 },
      coastline: { stroke: "#cbd5f5", strokeWidth: 0.6 },
      borders: { stroke: "#64748b", strokeWidth: 0.4 }
    },
    styleOutline: {
      ocean: { fill: "none" },
      land: { fill: "none" },
      lakes: { fill: "none" },
      rivers: { stroke: "none", strokeWidth: 0 },
      coastline: { stroke: "#0f172a", strokeWidth: 0.8 },
      borders: { stroke: "#0f172a", strokeWidth: 0.5 }
    },
    styleSoft: {
      ocean: { fill: "#e0f2fe" },
      land: { fill: "#fef3c7" },
      lakes: { fill: "#bae6fd" },
      rivers: { stroke: "#7dd3fc", strokeWidth: 0.6 },
      coastline: { stroke: "#cbd5f5", strokeWidth: 0.5 },
      borders: { stroke: "#e5e7eb", strokeWidth: 0.3 }
    }
  };
  const styles = presets[activeStyleId] ?? presets.styleOriginal;
  return styles[layerId] ?? { stroke: "#64748b", strokeWidth: 0.4 };
}

function buildHillshadeTexture(image: HTMLImageElement): HTMLCanvasElement {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = MAP_WIDTH;
  canvasEl.height = MAP_HEIGHT;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return canvasEl;
  }
  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const [, lat] = unproject(0, y, MAP_WIDTH, MAP_HEIGHT);
    const clampedLat = Math.max(-85, Math.min(85, lat));
    const srcY = ((90 - clampedLat) / 180) * imgH;
    ctx.drawImage(image, 0, srcY, imgW, 1, 0, y, MAP_WIDTH, 1);
  }
  return canvasEl;
}

async function loadHillshadeTexture(
  path: string,
  projection: string | null
): Promise<HTMLCanvasElement | null> {
  try {
    if (projection === "EPSG:3857" && "createImageBitmap" in window) {
      const response = await fetch(path);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: MAP_WIDTH,
        resizeHeight: MAP_HEIGHT,
        resizeQuality: "high"
      });
      const canvasEl = document.createElement("canvas");
      canvasEl.width = MAP_WIDTH;
      canvasEl.height = MAP_HEIGHT;
      const ctx = canvasEl.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      }
      if ("close" in bitmap) {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
      }
      return canvasEl;
    }
  } catch {
    return null;
  }
  return null;
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
  updateZoomIndicator();
  updateMarkerStyles();
  requestBasemapDraw();
}

function updateZoomIndicator(): void {
  if (!zoomIndicator) {
    return;
  }
  const percent = Math.round(view.scale * 100);
  zoomIndicator.textContent = `${percent}%`;
}

function setActiveStep(stepId: string): void {
  const previousStep = activeStep;
  activeStep = stepId;
  stepPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.stepPanel === stepId);
  });
  if (stepProgress) {
    stepProgress.textContent = `步驟 ${stepId} / 3`;
  }
  if (stepTitle) {
    const titles: Record<string, string> = {
      "0": "大致定位",
      "1": "範圍與比例",
      "2": "底圖樣式",
      "3": "標示與繪製"
    };
    stepTitle.textContent = titles[stepId] ?? "";
  }
  if (stepSubtitle) {
    const subtitles: Record<string, string> = {
      "1": "使用右鍵拖曳框選範圍，確定示意圖的視窗。",
      "2": "決定底圖樣式結果。"
    };
    stepSubtitle.textContent = subtitles[stepId] ?? "";
  }
  if (cropFrame) {
    cropFrame.classList.toggle("hidden", stepId !== "1");
    cropFrame.classList.toggle("interactive", stepId === "1");
    cropFrame.classList.toggle("fixed", stepId === "1" && ratioMode === "fixed");
  }
  if (mapWrap) {
    mapWrap.classList.toggle("step-range", stepId === "1");
    mapWrap.classList.toggle("step-locked", stepId === "2" || stepId === "3");
  }
  mapLocked = stepId === "2" || stepId === "3";
  if (svg) {
    svg.classList.remove("dragging", "boxing");
    svg.style.cursor = mapLocked ? "default" : "grab";
  }
  if (stepId === "1") {
    updateCropFrame();
    if (!activeRatioId) {
      setActiveRatioButton("ratioOriginal");
    }
  } else {
    positionZoomIndicator();
  }
  if (stepId === "0") {
    updateWrapTransforms(true);
  }
  if (stepId === "2" || stepId === "3") {
    if (!cropBox) {
      updateCropFrame();
    } else if (!cropBBox) {
      updateCropBBox();
    }
    if (previousStep !== stepId) {
      zoomToCropBounds();
    }
  }
  applyMapClip();
  updateCropOverlay();
  if (stepId === "3") {
    syncMarkerControls(getSelectedMarker());
  }
  if (nextStepButton) {
    const nextLabel = stepId === "3" ? "完成" : "下一步";
    nextStepButton.textContent = nextLabel;
  }
}

function setActiveRatioButton(targetId?: string): void {
  activeRatioId = targetId;
  ratioButtons.forEach((button) => {
    button.classList.toggle("active", button.id === targetId);
  });
}

function setActiveStyleButton(targetId: string): void {
  activeStyleId = targetId;
  styleButtons.forEach((button) => {
    button.classList.toggle("active", button.id === targetId);
  });
  requestBasemapDraw();
}

function applyCanvasRatio(ratio: number, targetId?: string): void {
  ratioMode = "fixed";
  cropRatio = ratio;
  cropBox = null;
  setActiveRatioButton(targetId);
  updateCropFrame();
}

function updateCropFrame(): void {
  if (!cropFrame || !mapStage) {
    return;
  }
  cropFrame.classList.toggle("fixed", ratioMode === "fixed");
  const rect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, rect.width);
  const stageHeight = Math.max(1, rect.height);
  const bottomPadding = 16;
  const availableHeight = Math.max(1, stageHeight - bottomPadding);
  if (!cropBox) {
    if (ratioMode === "free") {
      cropBox = { left: 0, top: 0, width: stageWidth, height: availableHeight };
    } else {
      let frameWidth = stageWidth;
      let frameHeight = frameWidth / cropRatio;
      if (frameHeight > availableHeight) {
        frameHeight = availableHeight;
        frameWidth = frameHeight * cropRatio;
      }
      const inset = 12;
      frameWidth = Math.max(1, frameWidth - inset * 2);
      frameHeight = Math.max(1, frameHeight - inset * 2);
      const left = (stageWidth - frameWidth) / 2;
      const top = (availableHeight - frameHeight) / 2;
      cropBox = { left, top, width: frameWidth, height: frameHeight };
    }
  } else if (ratioMode === "free") {
    cropBox.left = Math.min(Math.max(0, cropBox.left), stageWidth - cropBox.width);
    cropBox.top = Math.min(Math.max(0, cropBox.top), availableHeight - cropBox.height);
  }
  if (cropBox) {
    cropBox.left = Math.min(Math.max(0, cropBox.left), stageWidth - cropBox.width);
    cropBox.top = Math.min(Math.max(0, cropBox.top), availableHeight - cropBox.height);
  }
  cropFrame.style.left = `${cropBox.left}px`;
  cropFrame.style.top = `${cropBox.top}px`;
  cropFrame.style.width = `${cropBox.width}px`;
  cropFrame.style.height = `${cropBox.height}px`;
  updateCropBBox();
  positionZoomIndicator();
  requestBasemapDraw();
  applyMapClip();
  updateCropOverlay();
}

function updateCropBBox(): void {
  if (!cropBox || !mapStage) {
    cropBBox = null;
    return;
  }
  const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
  const mapX = (cropBox.left - offsetX) / scaleFit;
  const mapY = (cropBox.top - offsetY) / scaleFit;
  const mapW = cropBox.width / scaleFit;
  const mapH = cropBox.height / scaleFit;
  const x = (mapX - view.tx) / view.scale;
  const y = (mapY - view.ty) / view.scale;
  const width = mapW / view.scale;
  const height = mapH / view.scale;
  cropBBox = { x, y, width, height };
}

function zoomToCropBounds(): void {
  if (!cropBBox || !mapStage) {
    return;
  }
  const rect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, rect.width);
  const stageHeight = Math.max(1, rect.height);
  if (cropBBox.width <= 0 || cropBBox.height <= 0) {
    return;
  }
  const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
  const nextScale = Math.min(
    stageWidth / (cropBBox.width * scaleFit),
    stageHeight / (cropBBox.height * scaleFit)
  );
  const scaleCap = activeStep === "2" || activeStep === "3" ? MAX_SCALE_CROP : MAX_SCALE;
  view.scale = Math.max(MIN_SCALE, Math.min(scaleCap, nextScale));
  const cropScreenWidth = cropBBox.width * view.scale * scaleFit;
  const cropScreenHeight = cropBBox.height * view.scale * scaleFit;
  const desiredLeft = (stageWidth - cropScreenWidth) / 2;
  const desiredTop = (stageHeight - cropScreenHeight) / 2;
  view.tx = (desiredLeft - offsetX) / scaleFit - cropBBox.x * view.scale;
  view.ty = (desiredTop - offsetY) / scaleFit - cropBBox.y * view.scale;
  applyViewTransform();
  updateWrapTransforms(true);
}

function applyMapClip(): void {
  if (!svg || !mapStage) {
    return;
  }
  const defsId = "map-clip";
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);
  }
  let clip = defs.querySelector(`#${defsId}`) as SVGClipPathElement | null;
  if (!clip) {
    clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clip.setAttribute("id", defsId);
    defs.appendChild(clip);
  }
  clip.innerHTML = "";
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const stageRect = mapStage.getBoundingClientRect();
  const width = svg.viewBox.baseVal.width || MAP_WIDTH;
  const height = svg.viewBox.baseVal.height || MAP_HEIGHT;
  const scaleX = width / stageRect.width;
  const scaleY = height / stageRect.height;
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", width.toFixed(2));
  rect.setAttribute("height", height.toFixed(2));
  clip.appendChild(rect);
  const root = ensureMapRoot(svg);
  root.setAttribute("clip-path", `url(#${defsId})`);
}

function updateCropOverlay(): void {
  if (!mapStage || !cropOverlay) {
    return;
  }
  if ((activeStep !== "2" && activeStep !== "3") || (!cropBox && !cropBBox)) {
    cropOverlay.classList.add("hidden");
    return;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, stageRect.width);
  const stageHeight = Math.max(1, stageRect.height);
  let left = 0;
  let top = 0;
  let right = stageWidth;
  let bottom = stageHeight;
  if (cropBBox) {
    const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
    left = (cropBBox.x * view.scale + view.tx) * scaleFit + offsetX;
    top = (cropBBox.y * view.scale + view.ty) * scaleFit + offsetY;
    right = ((cropBBox.x + cropBBox.width) * view.scale + view.tx) * scaleFit + offsetX;
    bottom = ((cropBBox.y + cropBBox.height) * view.scale + view.ty) * scaleFit + offsetY;
  } else if (cropBox) {
    left = cropBox.left;
    top = cropBox.top;
    right = cropBox.left + cropBox.width;
    bottom = cropBox.top + cropBox.height;
  }
  left = Math.max(0, Math.min(left, stageWidth));
  top = Math.max(0, Math.min(top, stageHeight));
  right = Math.max(0, Math.min(right, stageWidth));
  bottom = Math.max(0, Math.min(bottom, stageHeight));

  if (!cropMaskTop || !cropMaskLeft || !cropMaskRight || !cropMaskBottom) {
    return;
  }

  cropMaskTop.style.left = "0px";
  cropMaskTop.style.top = "0px";
  cropMaskTop.style.width = `${stageWidth}px`;
  cropMaskTop.style.height = `${top}px`;

  cropMaskLeft.style.left = "0px";
  cropMaskLeft.style.top = `${top}px`;
  cropMaskLeft.style.width = `${left}px`;
  cropMaskLeft.style.height = `${Math.max(0, bottom - top)}px`;

  cropMaskRight.style.left = `${right}px`;
  cropMaskRight.style.top = `${top}px`;
  cropMaskRight.style.width = `${Math.max(0, stageWidth - right)}px`;
  cropMaskRight.style.height = `${Math.max(0, bottom - top)}px`;

  cropMaskBottom.style.left = "0px";
  cropMaskBottom.style.top = `${bottom}px`;
  cropMaskBottom.style.width = `${stageWidth}px`;
  cropMaskBottom.style.height = `${Math.max(0, stageHeight - bottom)}px`;

  cropOverlay.classList.remove("hidden");
}

function handleRatioInput(): void {
  if (!ratioInputA || !ratioInputB) {
    return;
  }
  if (activeRatioId !== "ratioCustom") {
    return;
  }
  const a = Number(ratioInputA.value);
  const b = Number(ratioInputB.value);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return;
  }
  applyCanvasRatio(a / b, "ratioCustom");
}

function pointFromEvent(event: PointerEvent): { x: number; y: number } | null {
  if (!mapStage) {
    return null;
  }
  const rect = mapStage.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function clampCropBox(box: { left: number; top: number; width: number; height: number }): void {
  if (!mapStage) {
    return;
  }
  const rect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, rect.width);
  const stageHeight = Math.max(1, rect.height);
  const bottomPadding = 16;
  const availableHeight = Math.max(1, stageHeight - bottomPadding);
  box.width = Math.max(40, Math.min(box.width, stageWidth));
  box.height = Math.max(40, Math.min(box.height, availableHeight));
  box.left = Math.min(Math.max(0, box.left), stageWidth - box.width);
  box.top = Math.min(Math.max(0, box.top), availableHeight - box.height);
}

function attachCropInteractions(): void {
  if (!cropFrame) {
    return;
  }
  cropFrame.addEventListener("wheel", onWheel, { passive: false });
  cropFrame.addEventListener("pointerdown", (event) => {
    if (activeStep !== "1") {
      return;
    }
    const target = event.target as HTMLElement;
    const handle = target?.dataset?.handle;
    const point = pointFromEvent(event);
    if (!point || !cropBox) {
      return;
    }
    event.preventDefault();
    cropFrame.setPointerCapture(event.pointerId);
    if (handle) {
      const cursor = handleToCursor(handle);
      cropFrame.classList.add("resizing");
      cropFrame.style.cursor = cursor;
      cropDrag = { mode: "resize", handle, startX: point.x, startY: point.y, startBox: { ...cropBox } };
    } else {
      cropFrame.classList.remove("resizing");
      cropFrame.style.cursor = "move";
      cropDrag = { mode: "move", startX: point.x, startY: point.y, startBox: { ...cropBox } };
    }
  });
  cropFrame.addEventListener("pointermove", (event) => {
    if (!cropDrag || !cropBox) {
      return;
    }
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    const dx = point.x - cropDrag.startX;
    const dy = point.y - cropDrag.startY;
    const start = cropDrag.startBox;
    if (cropDrag.mode === "move") {
      cropBox.left = start.left + dx;
      cropBox.top = start.top + dy;
      clampCropBox(cropBox);
    } else if (cropDrag.mode === "resize") {
      const handle = cropDrag.handle ?? "";
      if (ratioMode === "fixed") {
        const widthFromDx = handle.includes("w") ? start.width - dx : start.width + dx;
        const heightFromDy = handle.includes("n") ? start.height - dy : start.height + dy;
        const widthFromDy = heightFromDy * cropRatio;
        const useWidth = Math.abs(dx) >= Math.abs(dy) ? widthFromDx : widthFromDy;
        const nextWidth = Math.max(40, useWidth);
        const nextHeight = nextWidth / cropRatio;
        if (handle.includes("w")) {
          cropBox.left = start.left + (start.width - nextWidth);
        }
        if (handle.includes("n")) {
          cropBox.top = start.top + (start.height - nextHeight);
        }
        cropBox.width = nextWidth;
        cropBox.height = nextHeight;
      } else {
        if (handle.includes("e")) {
          cropBox.width = start.width + dx;
        }
        if (handle.includes("s")) {
          cropBox.height = start.height + dy;
        }
        if (handle.includes("w")) {
          cropBox.width = start.width - dx;
          cropBox.left = start.left + dx;
        }
        if (handle.includes("n")) {
          cropBox.height = start.height - dy;
          cropBox.top = start.top + dy;
        }
      }
      clampCropBox(cropBox);
    }
    updateCropFrame();
  });
  cropFrame.addEventListener("pointerup", () => {
    cropDrag = null;
    cropFrame.classList.remove("resizing");
    cropFrame.style.cursor = "move";
  });
  cropFrame.addEventListener("pointercancel", () => {
    cropDrag = null;
    cropFrame.classList.remove("resizing");
    cropFrame.style.cursor = "move";
  });
}

function handleToCursor(handle: string): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "move";
  }
}

function resolveCropFrameBox():
  | { left: number; top: number; width: number; height: number }
  | undefined {
  if (!cropFrame || !mapStage || cropFrame.classList.contains("hidden")) {
    return undefined;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const cropRect = cropFrame.getBoundingClientRect();
  return {
    left: cropRect.left - stageRect.left,
    top: cropRect.top - stageRect.top,
    width: cropRect.width,
    height: cropRect.height
  };
}

function positionZoomIndicator(): void {
  return;
}

function hookSteps(): void {
  nextStepButton?.addEventListener("click", () => {
    const steps = ["0", "1", "2", "3"];
    const index = Math.max(0, steps.indexOf(activeStep));
    const next = steps[Math.min(steps.length - 1, index + 1)];
    setActiveStep(next);
  });
  prevStepButton?.addEventListener("click", () => {
    const steps = ["0", "1", "2", "3"];
    const index = Math.max(0, steps.indexOf(activeStep));
    const prev = steps[Math.max(0, index - 1)];
    setActiveStep(prev);
  });
  ratioFree?.addEventListener("click", () => {
    ratioMode = "free";
    if (!cropBox) {
      cropBox = null;
    }
    setActiveRatioButton("ratioFree");
    updateCropFrame();
  });
  ratioOriginal?.addEventListener("click", () => {
    applyCanvasRatio(originalRatio, "ratioOriginal");
  });
  ratioSquare?.addEventListener("click", () => {
    applyCanvasRatio(1, "ratioSquare");
  });
  ratio34?.addEventListener("click", () => {
    applyCanvasRatio(3 / 4, "ratio34");
  });
  ratio43?.addEventListener("click", () => {
    applyCanvasRatio(4 / 3, "ratio43");
  });
  ratio169?.addEventListener("click", () => {
    applyCanvasRatio(16 / 9, "ratio169");
  });
  ratio916?.addEventListener("click", () => {
    applyCanvasRatio(9 / 16, "ratio916");
  });
  ratioA4?.addEventListener("click", () => {
    applyCanvasRatio(210 / 297, "ratioA4");
  });
  ratioCustom?.addEventListener("click", () => {
    ratioMode = "fixed";
    setActiveRatioButton("ratioCustom");
    handleRatioInput();
  });
  ratioInputA?.addEventListener("input", handleRatioInput);
  ratioInputB?.addEventListener("input", handleRatioInput);
  ratioInputA?.addEventListener("focus", () => setActiveRatioButton("ratioCustom"));
  ratioInputB?.addEventListener("focus", () => setActiveRatioButton("ratioCustom"));
  styleOriginal?.addEventListener("click", () => setActiveStyleButton("styleOriginal"));
  styleDefault?.addEventListener("click", () => setActiveStyleButton("styleDefault"));
  styleMinimal?.addEventListener("click", () => setActiveStyleButton("styleMinimal"));
  styleDark?.addEventListener("click", () => setActiveStyleButton("styleDark"));
  styleOutline?.addEventListener("click", () => setActiveStyleButton("styleOutline"));
  styleSoft?.addEventListener("click", () => setActiveStyleButton("styleSoft"));
  reliefBlendButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.relief ?? "off";
      reliefBlendButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
      if (value === "off") {
        hillshadeEnabled = false;
        requestBasemapDraw();
        return;
      }
      hillshadeEnabled = true;
      hillshadeBlend = value as GlobalCompositeOperation;
      requestBasemapDraw();
    });
  });
}

function resizeCanvasToStage(): {
  width: number;
  height: number;
  scaleFit: number;
  offsetX: number;
  offsetY: number;
} {
  if (!canvas || !mapStage) {
    return { width: MAP_WIDTH, height: MAP_HEIGHT, scaleFit: 1, offsetX: 0, offsetY: 0 };
  }
  const rect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, rect.width);
  const stageHeight = Math.max(1, rect.height);
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(stageWidth * dpr));
  const targetHeight = Math.max(1, Math.round(stageHeight * dpr));
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }
  const scaleFit = Math.min(stageWidth / MAP_WIDTH, stageHeight / MAP_HEIGHT);
  const offsetX = (stageWidth - MAP_WIDTH * scaleFit) / 2;
  const offsetY = (stageHeight - MAP_HEIGHT * scaleFit) / 2;
  return { width: stageWidth, height: stageHeight, scaleFit, offsetX, offsetY };
}

function requestBasemapDraw(): void {
  if (!basemapBuilt || !canvas) {
    return;
  }
  if (basemapDrawPending) {
    return;
  }
  basemapDrawPending = true;
  requestAnimationFrame(() => {
    basemapDrawPending = false;
    drawBasemap();
  });
}

function drawBasemap(): void {
  if (!canvas || !svg || cachedBasemapLayers.length === 0) {
    return;
  }
  const { width: stageWidth, height: stageHeight, scaleFit, offsetX, offsetY } =
    resizeCanvasToStage();
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(
    view.scale * scaleFit * dpr,
    0,
    0,
    view.scale * scaleFit * dpr,
    (offsetX + view.tx * scaleFit) * dpr,
    (offsetY + view.ty * scaleFit) * dpr
  );
  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  const viewWidthMap = stageWidth / Math.max(0.0001, scaleFit * view.scale);
  const wrapSpan = Math.min(5, Math.max(1, Math.ceil(viewWidthMap / MAP_WIDTH / 2) + 1));
  for (let i = -wrapSpan; i <= wrapSpan; i += 1) {
    ctx.save();
    ctx.translate((i + wrapShift) * MAP_WIDTH, 0);
    for (const layer of cachedBasemapLayers) {
      const style = layerStyleFor(layer.id);
      if (style.fill && style.fill !== "none") {
        ctx.fillStyle = style.fill;
        for (const path of layer.paths) {
          ctx.fill(path);
        }
      }
      if (style.stroke && style.stroke !== "none") {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = (style.strokeWidth ?? 0.4) / view.scale;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const path of layer.paths) {
          ctx.stroke(path);
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();
  if (hillshadeEnabled && hillshadeTexture) {
    ctx.save();
    ctx.setTransform(
      view.scale * scaleFit * dpr,
      0,
      0,
      view.scale * scaleFit * dpr,
      (offsetX + view.tx * scaleFit) * dpr,
      (offsetY + view.ty * scaleFit) * dpr
    );
    ctx.globalCompositeOperation = hillshadeBlend;
    ctx.globalAlpha = 0.45;
    const wrapShift = shiftLocked ? shiftLockValue : worldShift;
    const viewWidthMap = stageWidth / Math.max(0.0001, scaleFit * view.scale);
    const wrapSpan = Math.min(5, Math.max(1, Math.ceil(viewWidthMap / MAP_WIDTH / 2) + 1));
    for (let i = -wrapSpan; i <= wrapSpan; i += 1) {
      ctx.save();
      ctx.translate((i + wrapShift) * MAP_WIDTH, 0);
      ctx.drawImage(hillshadeTexture, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.restore();
    }
    ctx.restore();
  }
}

function updateWrapTransforms(forceRender = false): void {
  if (!svg) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  if (!shiftLocked) {
    const centerX = (width / 2 - view.tx) / view.scale;
    const nextShift = Math.round(centerX / width);
    if (nextShift !== worldShift) {
      worldShift = nextShift;
    }
  }
  const root = ensureMapRoot(svg);
  const markerWrap = ensureMarkersContainer(root);
  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  for (const i of WRAPS) {
    ensureWrapGroup(markerWrap, `marker-${i}`, (i + wrapShift) * width);
  }
  if (forceRender) {
    requestBasemapDraw();
  }
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
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const centerX = (width / 2 - view.tx) / view.scale;
  const centerY = (height / 2 - view.ty) / view.scale;
  return unproject(centerX, centerY, width, height);
}

async function renderBasemap() {
  if (!svg || !window.mapSchematic?.getBasemapLayers) {
    return;
  }
  if (basemapBuilt) {
    return;
  }
  basemapBuilt = true;
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;

  const rawLayers = await window.mapSchematic.getBasemapLayers();
  cachedBasemapLayers = rawLayers.map((layer) => {
    const geojson = JSON.parse(layer.geojson);
    const paths: Path2D[] = [];
    for (const feature of geojson.features ?? []) {
      const d = geometryToPath(feature.geometry, width, height);
      if (!d) {
        continue;
      }
      paths.push(new Path2D(d));
    }
    return { id: layer.id, paths };
  });
  drawBasemap();
}

function renderMarkers() {
  if (!svg) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const root = ensureMapRoot(svg);
  const markerWrap = ensureMarkersContainer(root);

  for (const i of WRAPS) {
    const wrap = ensureWrapGroup(markerWrap, `marker-${i}`, (i + worldShift) * width);
    wrap.innerHTML = "";
    for (const marker of selectedMarkers) {
      const [x, y] = project(marker.longitude, marker.latitude, width, height);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", (x).toFixed(2));
      circle.setAttribute("cy", (y).toFixed(2));
      circle.setAttribute("data-marker", "dot");
      circle.setAttribute("data-id", marker.id);
      circle.setAttribute("data-base", String(marker.style.dotSize));
      circle.setAttribute("r", (marker.style.dotSize / view.scale).toFixed(2));
      circle.setAttribute("fill", marker.style.dotColor);
      circle.setAttribute("stroke", marker.id === selectedMarkerId ? "#38bdf8" : "#fff7ed");
      circle.setAttribute("stroke-width", (1.2 / view.scale).toFixed(2));
      circle.addEventListener("click", (event) => {
        if (activeStep !== "3") {
          return;
        }
        event.stopPropagation();
        selectMarker(marker.id);
      });
      wrap.appendChild(circle);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const scale = Math.max(0.5, Math.min(1.6, Math.pow(view.scale, 0.35)));
      const offset = Math.max(3, 5 * scale);
      label.setAttribute("data-x", x.toFixed(2));
      label.setAttribute("data-y", y.toFixed(2));
      label.setAttribute("x", (x + offset).toFixed(2));
      label.setAttribute("y", (y - offset).toFixed(2));
      label.setAttribute("data-marker", "label");
      label.setAttribute("data-id", marker.id);
      label.setAttribute("data-base", String(marker.style.textSize));
      label.setAttribute("fill", marker.style.textColor);
      label.setAttribute("font-size", (marker.style.textSize * scale).toFixed(2));
      label.setAttribute("font-family", "IBM Plex Sans, sans-serif");
      label.textContent = marker.name;
      label.addEventListener("click", (event) => {
        if (activeStep !== "3") {
          return;
        }
        event.stopPropagation();
        selectMarker(marker.id);
      });
      wrap.appendChild(label);
    }
  }
}

function updateMarkerStyles(): void {
  if (!svg) {
    return;
  }
  const root = ensureMapRoot(svg);
  const markerWrap = ensureMarkersContainer(root);
  const dots = markerWrap.querySelectorAll<SVGCircleElement>("circle[data-marker=\"dot\"]");
  dots.forEach((dot) => {
    const base = Number(dot.getAttribute("data-base") ?? "4");
    dot.setAttribute("r", (base / view.scale).toFixed(2));
    dot.setAttribute("stroke-width", (1.2 / view.scale).toFixed(2));
    const id = dot.getAttribute("data-id");
    dot.setAttribute("stroke", id && id === selectedMarkerId ? "#38bdf8" : "#fff7ed");
  });
  const labels = markerWrap.querySelectorAll<SVGTextElement>("text[data-marker=\"label\"]");
  labels.forEach((label) => {
    const base = Number(label.getAttribute("data-base") ?? "13");
    const scale = Math.max(0.5, Math.min(1.6, Math.pow(view.scale, 0.35)));
    label.setAttribute("font-size", (base * scale).toFixed(2));
    const baseX = Number(label.getAttribute("data-x") ?? "0");
    const baseY = Number(label.getAttribute("data-y") ?? "0");
    const offset = Math.max(3, 5 * scale);
    label.setAttribute("x", (baseX + offset).toFixed(2));
    label.setAttribute("y", (baseY - offset).toFixed(2));
  });
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

function renderResults(results: GeonamesResult[], target: HTMLUListElement) {
  target.innerHTML = "";
  const sorted = sortResults(results);
  sorted.forEach((result) => {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.textContent = result.nameAlt && result.nameAlt !== result.name
      ? `${result.nameAlt} / ${result.name}`
      : result.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    const lat = result.latitude.toFixed(4);
    const lon = result.longitude.toFixed(4);
    const country = result.countryCode ?? "";
    meta.textContent = `${title.textContent} · ${country} (${lat}, ${lon})`;
    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      addMarkerFromGeonames(result);
    });
    target.appendChild(item);
  });
}

function parseLatLon(value: string): { lat: number; lon: number } | null {
  const normalized = value
    .trim()
    .replace(/[，；]/g, ",")
    .replace(/，/g, ",")
    .replace(/　/g, " ");
  const dd = normalized
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  if (dd.length >= 2) {
    const lat = Number(dd[0]);
    const lon = Number(dd[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }
  }
  const dmsMatches = normalized
    .replace(/º/g, "°")
    .replace(/″/g, "\"")
    .replace(/′/g, "'")
    .match(
      /([NS])?\s*(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*\"?\s*([NS])?.*?([EW])?\s*(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*\"?\s*([EW])?/i
    );
  if (!dmsMatches) {
    return null;
  }
  const latDir = (dmsMatches[1] || dmsMatches[5] || "").toUpperCase();
  const latDeg = Number(dmsMatches[2]);
  const latMin = Number(dmsMatches[3] || "0");
  const latSec = Number(dmsMatches[4] || "0");
  const lonDir = (dmsMatches[6] || dmsMatches[10] || "").toUpperCase();
  const lonDeg = Number(dmsMatches[7]);
  const lonMin = Number(dmsMatches[8] || "0");
  const lonSec = Number(dmsMatches[9] || "0");
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) {
    return null;
  }
  let lat = latDeg + latMin / 60 + latSec / 3600;
  let lon = lonDeg + lonMin / 60 + lonSec / 3600;
  if (latDir === "S") {
    lat = -lat;
  }
  if (lonDir === "W") {
    lon = -lon;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

function addMarkerFromCoords(input: HTMLInputElement | null): void {
  if (!input) {
    return;
  }
  const value = input.value.trim();
  if (!value) {
    return;
  }
  const parsed = parseLatLon(value);
  if (!parsed) {
    if (statusEl) {
      statusEl.textContent = "經緯度格式錯誤，請輸入「緯度, 經度」。";
    }
    return;
  }
  const marker: Marker = {
    id: `coord-${Date.now()}`,
    name: `(${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)})`,
    nameAlt: `(${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)})`,
    latitude: parsed.lat,
    longitude: parsed.lon,
    sourceId: undefined,
    style: defaultMarkerStyle()
  };
  if (hasDuplicateMarker(marker)) {
    return;
  }
  selectedMarkers.push(marker);
  if (activeStep === "3") {
    selectMarker(marker.id);
  }
  renderMarkers();
  renderMarkerList();
  input.value = "";
  if (statusEl) {
    statusEl.textContent = `已新增座標：${marker.name}`;
  }
}
function defaultMarkerStyle(): MarkerStyle {
  return {
    dotSize: 4,
    textSize: 14,
    dotColor: "#f97316",
    textColor: "#fde68a"
  };
}

function markerKey(marker: { name: string; latitude: number; longitude: number }): string {
  return `${marker.name}|${marker.latitude.toFixed(6)}|${marker.longitude.toFixed(6)}`;
}

function hasDuplicateMarker(candidate: { name: string; latitude: number; longitude: number }): boolean {
  const key = markerKey(candidate);
  return selectedMarkers.some((marker) => markerKey(marker) === key);
}

function addMarkerFromGeonames(result: GeonamesResult): void {
  if (hasDuplicateMarker(result)) {
    return;
  }
  const nameLocal = result.nameAlt ?? result.name;
  const nameOriginal = result.name;
  const marker: Marker = {
    id: `geo-${result.id}-${Date.now()}`,
    name: nameLocal,
    nameAlt: nameOriginal,
    latitude: result.latitude,
    longitude: result.longitude,
    sourceId: String(result.id),
    style: defaultMarkerStyle()
  };
  selectedMarkers.push(marker);
  if (activeStep === "3") {
    selectMarker(marker.id);
  }
  renderMarkers();
  renderMarkerList();
}

function getSelectedMarker(): Marker | null {
  if (!selectedMarkerId) {
    return null;
  }
  return selectedMarkers.find((marker) => marker.id === selectedMarkerId) ?? null;
}

function syncMarkerControls(marker: Marker | null): void {
  if (!markerDotSize || !markerTextSize || !markerDotColor || !markerTextColor) {
    return;
  }
  if (!marker) {
    dotSizeSlider && setSliderValue(dotSizeSlider, 4, true);
    textSizeSlider && setSliderValue(textSizeSlider, 12, true);
    markerDotColor.value = "#f97316";
    markerTextColor.value = "#fde68a";
    return;
  }
  dotSizeSlider && setSliderValue(dotSizeSlider, marker.style.dotSize, true);
  textSizeSlider && setSliderValue(textSizeSlider, marker.style.textSize, true);
  markerDotColor.value = marker.style.dotColor;
  markerTextColor.value = marker.style.textColor;
}

function selectMarker(markerId: string | null): void {
  selectedMarkerId = markerId;
  syncMarkerControls(getSelectedMarker());
  updateMarkerStyles();
}

function renderMarkerList(): void {
  if (!markerList) {
    return;
  }
  markerList.innerHTML = "";
  const seen = new Set<string>();
  selectedMarkers.forEach((marker) => {
    const key = markerKey(marker);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const row = document.createElement("div");
    row.className = "marker-item";
    const title = document.createElement("span");
    const alt = marker.nameAlt && marker.nameAlt !== marker.name ? marker.nameAlt : marker.name;
    title.textContent = `${marker.name} / ${alt}`;
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = "清除";
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMarker(marker.id);
    });
    row.appendChild(title);
    row.appendChild(btn);
    row.addEventListener("click", () => selectMarker(marker.id));
    markerList.appendChild(row);
  });
}

function deleteMarker(markerId: string): void {
  const index = selectedMarkers.findIndex((marker) => marker.id === markerId);
  if (index >= 0) {
    selectedMarkers.splice(index, 1);
  }
  if (selectedMarkerId === markerId) {
    selectedMarkerId = null;
    syncMarkerControls(null);
  }
  renderMarkers();
  renderMarkerList();
}

async function handleSearch(input: HTMLInputElement, button: HTMLButtonElement) {
  const query = input.value.trim();
  if (!query) {
    return;
  }
  button.disabled = true;
  try {
    const results = await window.mapSchematic?.searchGeonames?.(query, 10);
    if (resultsEl0) {
      renderResults((results ?? []) as GeonamesResult[], resultsEl0);
    }
    if (resultsEl3) {
      renderResults((results ?? []) as GeonamesResult[], resultsEl3);
    }
  } finally {
    button.disabled = false;
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
      id: marker.id || `obj-${index + 1}`,
      type: "pointLabel",
      layerId: "layer-1",
      style: {
        dotColor: marker.style.dotColor,
        textColor: marker.style.textColor,
        dotSize: marker.style.dotSize,
        textSize: marker.style.textSize
      },
      geometry: { kind: "point", lon: marker.longitude, lat: marker.latitude },
      text: marker.name,
      provenance: { source: "geonames", sourceId: marker.sourceId ?? String(marker.id) }
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
      const style = (obj.style ?? {}) as Record<string, unknown>;
      selectedMarkers.push({
        id: obj.id ?? `obj-${selectedMarkers.length + 1}`,
        name: obj.text ?? "",
        latitude: obj.geometry.lat,
        longitude: obj.geometry.lon,
        sourceId: obj.provenance?.sourceId,
        style: {
          dotColor: String(style.dotColor ?? "#f97316"),
          textColor: String(style.textColor ?? "#fde68a"),
          dotSize: Number(style.dotSize ?? 4),
          textSize: Number(style.textSize ?? 12)
        }
      });
    }
  }
  renderMarkers();
  renderMarkerList();
  if (statusEl) {
    statusEl.textContent = `專案已載入：${result.path}`;
  }
}

function handleClearMarkers(): void {
  selectedMarkers.splice(0, selectedMarkers.length);
  selectedMarkerId = null;
  syncMarkerControls(null);
  renderMarkers();
  renderMarkerList();
}

function attachMarkerControls(): void {
  const update = () => {
    updateMarkerFromControls();
  };

  markerDotColor?.addEventListener("input", update);
  markerTextColor?.addEventListener("input", update);

  document.querySelectorAll<HTMLButtonElement>(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color ?? "";
      const target = swatch.dataset.colorTarget ?? "";
      const marker = getSelectedMarker();
      if (!marker || !color) {
        return;
      }
      if (target === "dot" && markerDotColor) {
        marker.style.dotColor = color;
        markerDotColor.value = color;
      }
      if (target === "text" && markerTextColor) {
        marker.style.textColor = color;
        markerTextColor.value = color;
      }
      renderMarkers();
    });
  });
}

function updateMarkerFromControls(): void {
  const marker = getSelectedMarker();
  if (!marker) {
    return;
  }
  if (dotSizeSlider) {
    marker.style.dotSize = dotSizeSlider.value;
  }
  if (textSizeSlider) {
    marker.style.textSize = textSizeSlider.value;
  }
  if (markerDotColor) {
    marker.style.dotColor = markerDotColor.value;
  }
  if (markerTextColor) {
    marker.style.textColor = markerTextColor.value;
  }
  renderMarkers();
}

function initSlider(root: HTMLDivElement | null, initialValue: number, onChange: (value: number) => void): SliderControl | null {
  if (!root) {
    return null;
  }
  const track = root.querySelector(".slider-track") as HTMLDivElement | null;
  const fill = root.querySelector(".slider-fill") as HTMLDivElement | null;
  const thumb = root.querySelector(".slider-thumb") as HTMLDivElement | null;
  const marks = root.querySelector(".slider-marks") as HTMLDivElement | null;
  if (!track || !fill || !thumb || !marks) {
    return null;
  }
  const min = Number(root.dataset.min || "0");
  const max = Number(root.dataset.max || "100");
  const step = Number(root.dataset.step || "1");
  const control: SliderControl = {
    root,
    track,
    fill,
    thumb,
    marks,
    min,
    max,
    step,
    value: initialValue,
    dragging: false,
    rect: null,
    marksValues: null,
    marksPercents: null,
    onChange
  };
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    control.dragging = true;
    control.rect = control.track.getBoundingClientRect();
    control.root.classList.add("dragging");
    control.root.setPointerCapture(event.pointerId);
    updateSliderFromPointer(control, event.clientX);
  });
  root.addEventListener("pointermove", (event) => {
    if (!control.dragging) {
      return;
    }
    updateSliderFromPointer(control, event.clientX);
  });
  root.addEventListener("pointerup", (event) => {
    if (!control.dragging) {
      return;
    }
    control.dragging = false;
    control.root.classList.remove("dragging");
    control.root.releasePointerCapture(event.pointerId);
  });
  root.addEventListener("pointercancel", () => {
    control.dragging = false;
    control.root.classList.remove("dragging");
  });
  thumb.addEventListener("keydown", (event) => {
    let nextValue = control.value;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextValue += control.step;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextValue -= control.step;
    } else if (event.key === "Home") {
      nextValue = control.min;
    } else if (event.key === "End") {
      nextValue = control.max;
    } else {
      return;
    }
    event.preventDefault();
    setSliderValue(control, nextValue);
  });
  renderSliderMarks(control);
  setSliderValue(control, initialValue, true);
  return control;
}

function updateSliderFromPointer(control: SliderControl, clientX: number): void {
  if (!control.rect) {
    control.rect = control.track.getBoundingClientRect();
  }
  const rect = control.rect;
  const ratio = (clientX - rect.left) / rect.width;
  const clamped = Math.max(0, Math.min(1, ratio));
  const raw = control.min + clamped * (control.max - control.min);
  const snapped = snapSliderValue(control, raw);
  setSliderValue(control, snapped);
}

function snapSliderValue(control: SliderControl, raw: number): number {
  if (!Number.isFinite(raw)) {
    return control.value;
  }
  if (control.marksValues && control.marksValues.length > 1) {
    let nearest = control.marksValues[0];
    let best = Math.abs(raw - nearest);
    for (const value of control.marksValues) {
      const dist = Math.abs(raw - value);
      if (dist < best) {
        best = dist;
        nearest = value;
      }
    }
    return Math.max(control.min, Math.min(control.max, nearest));
  }
  const index = Math.round((raw - control.min) / control.step);
  const snapped = control.min + index * control.step;
  return Math.max(control.min, Math.min(control.max, snapped));
}

function setSliderValue(control: SliderControl, value: number, silent = false): void {
  const next = Math.max(control.min, Math.min(control.max, value));
  if (next === control.value && !silent) {
    return;
  }
  control.value = next;
  updateSliderUI(control);
  if (!silent) {
    control.onChange(next);
  }
}

function updateSliderUI(control: SliderControl): void {
  let percent = 0;
  if (control.marksValues && control.marksPercents) {
    let nearestIndex = 0;
    let best = Math.abs(control.value - control.marksValues[0]);
    control.marksValues.forEach((value, index) => {
      const dist = Math.abs(control.value - value);
      if (dist < best) {
        best = dist;
        nearestIndex = index;
      }
    });
    percent = (control.marksPercents[nearestIndex] ?? 0) * 100;
  } else {
    const ratio = (control.value - control.min) / (control.max - control.min);
    percent = Math.max(0, Math.min(1, ratio)) * 100;
  }
  control.thumb.style.left = `${percent}%`;
  control.fill.style.width = `${percent}%`;
  control.thumb.setAttribute("role", "slider");
  control.thumb.setAttribute("aria-valuemin", String(control.min));
  control.thumb.setAttribute("aria-valuemax", String(control.max));
  control.thumb.setAttribute("aria-valuenow", String(control.value));
  const marks = Array.from(control.marks.children) as HTMLDivElement[];
  marks.forEach((mark) => {
    const markValue = Number(mark.dataset.value || "0");
    mark.classList.toggle("active", markValue <= control.value);
  });
}

function renderSliderMarks(control: SliderControl): void {
  control.marks.innerHTML = "";
  control.marksValues = null;
  control.marksPercents = null;
  const marksCountRaw = control.root.dataset.marks;
  const marksCount = marksCountRaw ? Math.max(2, Number(marksCountRaw)) : 0;
  const count = marksCount ? marksCount - 1 : Math.max(1, Math.round((control.max - control.min) / control.step));
  const values: number[] = [];
  const percents: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    const ratio = count === 0 ? 0 : i / count;
    const value = control.min + ratio * (control.max - control.min);
    const snapped = snapSliderValue(control, value);
    values.push(snapped);
    percents.push(ratio);
    const mark = document.createElement("div");
    mark.className = "slider-mark";
    mark.dataset.value = String(snapped);
    mark.style.left = `${ratio * 100}%`;
    const tick = document.createElement("div");
    tick.className = "tick";
    mark.appendChild(tick);
    control.marks.appendChild(mark);
  }
  control.marksValues = values;
  control.marksPercents = percents;
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
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * delta));
  const scaleRatio = nextScale / prevScale;

  view.tx = point.x - scaleRatio * (point.x - view.tx);
  view.ty = point.y - scaleRatio * (point.y - view.ty);
  view.scale = nextScale;

  clampVertical();
  applyViewTransform();
  updateWrapTransforms(true);
}

function resetView(): void {
  view.scale = 1;
  view.tx = 0;
  view.ty = 0;
  worldShift = 0;
  shiftLocked = false;
  applyViewTransform();
  updateWrapTransforms(true);
}

function onWheel(event: WheelEvent): void {
  if (!svg) {
    return;
  }
  if (mapLocked) {
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
  if (mapLocked) {
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
    shiftLocked = true;
    shiftLockValue = worldShift;
  }
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
  if (mapLocked) {
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
    updateWrapTransforms(true);
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
  if (mapLocked) {
    clearDragRect();
    isDragging = false;
    dragMode = null;
    svg.classList.remove("dragging");
    svg.classList.remove("boxing");
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
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(scaleX, scaleY)));
      const padX = (width - w * nextScale) / 2;
      const padY = (height - h * nextScale) / 2;
      view.tx = padX - x * nextScale;
      view.ty = padY - y * nextScale;
      view.scale = nextScale;
      applyViewTransform();
      updateWrapTransforms(true);
    }
  }
  if (dragMode === "box") {
    shiftLocked = false;
    updateWrapTransforms(true);
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
    const relief = await window.mapSchematic?.getRelief?.();
    if (relief?.path) {
      hillshadeProjection = relief.projection ?? null;
      const texture = await loadHillshadeTexture(relief.path, hillshadeProjection);
      if (texture) {
        hillshadeTexture = texture;
        requestBasemapDraw();
      } else {
        hillshadeImage = new Image();
        hillshadeImage.src = relief.path;
        hillshadeImage.onload = () => {
          if (hillshadeImage) {
            hillshadeTexture = buildHillshadeTexture(hillshadeImage);
            requestBasemapDraw();
          }
        };
      }
    }
    await renderBasemap();
    renderMarkers();
    setActiveStyleButton("styleOriginal");
    applyViewTransform();
    updateWrapTransforms(true);
    updateCropFrame();
    positionZoomIndicator();
    setActiveStep("0");
    attachMapInteractions();
    if (datapack) {
      currentPackId = datapack.id;
      currentPackVersion = datapack.version;
      statusEl.textContent = `載入資料包 ${datapack.id} ${datapack.version}使用`;
    } else {
      statusEl.textContent = "資料包不可用。";
    }
  } catch (err) {
    statusEl.textContent = `載入資料包失敗：${String(err)}`;
  }
}

function hookToolbar(): void {
  function nextZoom(target: number, dir: 1 | -1): number {
    const levels = ZOOM_LEVELS.filter((level) => level >= MIN_SCALE && level <= MAX_SCALE);
    let nearestIndex = 0;
    let nearestDelta = Infinity;
    for (let i = 0; i < levels.length; i += 1) {
      const delta = Math.abs(levels[i] - target);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestIndex = i;
      }
    }
    let nextIndex = dir > 0 ? nearestIndex + 1 : nearestIndex - 1;
    nextIndex = Math.max(0, Math.min(levels.length - 1, nextIndex));
    return levels[nextIndex];
  }

  function zoomToScale(targetScale: number): void {
    if (!svg) {
      return;
    }
    const width = svg.viewBox.baseVal.width || 1200;
    const height = svg.viewBox.baseVal.height || 800;
    const ratio = targetScale / view.scale;
    zoomAt({ x: width / 2, y: height / 2 }, ratio);
  }

  toolZoomIn?.addEventListener("click", () => {
    const target = nextZoom(view.scale, 1);
    zoomToScale(target);
  });
  toolZoomOut?.addEventListener("click", () => {
    const target = nextZoom(view.scale, -1);
    zoomToScale(target);
  });
  toolReset?.addEventListener("click", () => resetView());
}

searchButton0?.addEventListener("click", () => {
  if (searchInput0 && searchButton0) {
    handleSearch(searchInput0, searchButton0);
  }
});
searchInput0?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && searchInput0 && searchButton0) {
    handleSearch(searchInput0, searchButton0);
  }
});
searchButton3?.addEventListener("click", () => {
  if (searchInput3 && searchButton3) {
    handleSearch(searchInput3, searchButton3);
  }
});
searchInput3?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && searchInput3 && searchButton3) {
    handleSearch(searchInput3, searchButton3);
  }
});
coordButton0?.addEventListener("click", () => addMarkerFromCoords(coordInput0));
coordInput0?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addMarkerFromCoords(coordInput0);
  }
});
coordButton3?.addEventListener("click", () => addMarkerFromCoords(coordInput3));
coordInput3?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addMarkerFromCoords(coordInput3);
  }
});
saveButton?.addEventListener("click", handleSave);
loadButton?.addEventListener("click", handleLoad);
clearMarkersButton?.addEventListener("click", handleClearMarkers);

hookToolbar();
hookSteps();
  attachCropInteractions();
  attachMarkerControls();
  dotSizeSlider = initSlider(markerDotSize, 4, () => {
    updateMarkerFromControls();
  });
  textSizeSlider = initSlider(markerTextSize, 12, () => {
    updateMarkerFromControls();
  });
  boot();

window.addEventListener("resize", () => {
  updateCropFrame();
  requestBasemapDraw();
  positionZoomIndicator();
  if (dotSizeSlider) {
    dotSizeSlider.rect = null;
    updateSliderUI(dotSizeSlider);
  }
  if (textSizeSlider) {
    textSizeSlider.rect = null;
    updateSliderUI(textSizeSlider);
  }
});
