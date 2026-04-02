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
          nameAlt: string | null;
          latitude: number;
          longitude: number;
          featureClass: string | null;
          featureCode: string | null;
          countryCode: string | null;
          population: number | null;
        }>
      >;
      saveProject?: (payload: {
        project: MapProject;
        path?: string | null;
        saveAs?: boolean;
      }) => Promise<{ ok: boolean; path?: string; errors?: string[]; canceled?: boolean }>;
      exportProject?: (payload: {
        format: "png" | "svg" | "pdf";
        data: string;
        width: number;
        height: number;
      }) => Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }>;
      loadProject?: () => Promise<{
        ok: boolean;
        path?: string;
        project?: MapProject;
        validation?: { valid: boolean; errors: Array<{ path: string; message: string }> };
        error?: string;
        canceled?: boolean;
      }>;
      onMenuAction?: (handler: (action: string) => void) => () => void;
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
  textOffsetX: number;
  textOffsetY: number;
  fontFamily: string;
};

type Marker = {
  id: string;
  name: string;
  nameAlt?: string;
  displayName?: string;
  latitude: number;
  longitude: number;
  sourceId?: string;
  style: MarkerStyle;
  sourceType: "geonames" | "coords" | "manual";
  labelMode: "name" | "coords";
  labelName?: string;
  showLabel?: boolean;
  kind?: "label" | "point";
};

type ShapeStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  textColor: string;
  textSize: number;
  fontFamily: string;
};

type ShapeItem = {
  id: string;
  type: "line" | "area" | "text" | "arrow";
  displayName?: string;
  longitude: number;
  latitude: number;
  width: number;
  height: number;
  text?: string;
  style: ShapeStyle;
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
  defaultIndex: number | null;
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

type BBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

type ViewTransform = {
  scale: number;
  tx: number;
  ty: number;
};

type DragMode = "pan" | "box" | null;
type LabelDrag = {
  markerId: string;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};
type MarkerDrag = {
  markerId: string;
  startX: number;
  startY: number;
  startLon: number;
  startLat: number;
};
type ShapeDrag = {
  shapeId: string;
  startX: number;
  startY: number;
  startLon: number;
  startLat: number;
};

const statusEl = document.getElementById("status");
const layoutEl = document.getElementById("layout");
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
const results3Block = document.getElementById("results3Block") as HTMLDivElement | null;
const saveButton = document.getElementById("saveBtn") as HTMLButtonElement | null;
const loadButton = document.getElementById("loadBtn") as HTMLButtonElement | null;
const loadButton0 = document.getElementById("loadBtn0") as HTMLButtonElement | null;
const saveAsButton = document.getElementById("saveAsBtn") as HTMLButtonElement | null;
const exportPngButton = document.getElementById("exportPngBtn") as HTMLButtonElement | null;
const exportSvgButton = document.getElementById("exportSvgBtn") as HTMLButtonElement | null;
const exportPdfButton = document.getElementById("exportPdfBtn") as HTMLButtonElement | null;
const clearMarkersButton = document.getElementById("clearMarkers") as HTMLButtonElement | null;
const markerDotSize = document.getElementById("markerDotSize") as HTMLDivElement | null;
const markerTextSize = document.getElementById("markerTextSize") as HTMLDivElement | null;
const markerDotColor = document.getElementById("markerDotColor") as HTMLInputElement | null;
const markerTextColor = document.getElementById("markerTextColor") as HTMLInputElement | null;
const markerDotHex = document.getElementById("markerDotHex") as HTMLInputElement | null;
const markerTextHex = document.getElementById("markerTextHex") as HTMLInputElement | null;
const dotColorChip = document.getElementById("dotColorChip") as HTMLSpanElement | null;
const textColorChip = document.getElementById("textColorChip") as HTMLSpanElement | null;
const markerFont = document.getElementById("markerFont") as HTMLSelectElement | null;
const markerLabelInput = document.getElementById("markerLabelInput") as HTMLInputElement | null;
const shapeTextInput = document.getElementById("shapeTextInput") as HTMLInputElement | null;
const shapeTextSize = document.getElementById("shapeTextSize") as HTMLDivElement | null;
const shapeTextColor = document.getElementById("shapeTextColor") as HTMLInputElement | null;
const shapeTextFont = document.getElementById("shapeTextFont") as HTMLSelectElement | null;
const shapeLineWidth = document.getElementById("shapeLineWidth") as HTMLDivElement | null;
const shapeLineColor = document.getElementById("shapeLineColor") as HTMLInputElement | null;
const shapeArrowWidth = document.getElementById("shapeArrowWidth") as HTMLDivElement | null;
const shapeArrowColor = document.getElementById("shapeArrowColor") as HTMLInputElement | null;
const shapeAreaFill = document.getElementById("shapeAreaFill") as HTMLInputElement | null;
const shapeAreaOpacity = document.getElementById("shapeAreaOpacity") as HTMLDivElement | null;
const shapeAreaStroke = document.getElementById("shapeAreaStroke") as HTMLInputElement | null;
const shapeAreaStrokeWidth = document.getElementById("shapeAreaStrokeWidth") as HTMLDivElement | null;
const markerList = document.getElementById("markerList") as HTMLDivElement | null;
const listOrderSettingsBtn = document.getElementById("listOrderSettingsBtn") as HTMLButtonElement | null;
const listOrderModal = document.getElementById("listOrderModal") as HTMLDivElement | null;
const listOrderList = document.getElementById("listOrderList") as HTMLUListElement | null;
const displayOrderList = document.getElementById("displayOrderList") as HTMLUListElement | null;
const listOrderClose = document.getElementById("listOrderClose") as HTMLButtonElement | null;
const coordEditModal = document.getElementById("coordEditModal") as HTMLDivElement | null;
const coordLabelInput = document.getElementById("coordLabelInput") as HTMLInputElement | null;
const coordEditCancel = document.getElementById("coordEditCancel") as HTMLButtonElement | null;
const coordEditSave = document.getElementById("coordEditSave") as HTMLButtonElement | null;
const settingsEmpty = document.getElementById("settingsEmpty");
const itemNameRow = document.getElementById("itemNameRow");
const itemNameInput = document.getElementById("itemNameInput") as HTMLInputElement | null;
const pointSettings = document.getElementById("pointSettings");
const pointTextControls = document.getElementById("pointTextControls");
const textSettings = document.getElementById("textSettings");
const lineSettings = document.getElementById("lineSettings");
const arrowSettings = document.getElementById("arrowSettings");
const areaSettings = document.getElementById("areaSettings");
let dotSizeSlider: SliderControl | null = null;
let textSizeSlider: SliderControl | null = null;
let shapeTextSizeSlider: SliderControl | null = null;
let shapeLineWidthSlider: SliderControl | null = null;
let shapeArrowWidthSlider: SliderControl | null = null;
let shapeAreaOpacitySlider: SliderControl | null = null;
let shapeAreaStrokeWidthSlider: SliderControl | null = null;
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
let previewMarker: Marker | null = null;
const shapes: ShapeItem[] = [];
let listOrderKeys: string[] = [];
let displayOrderKeys: string[] = [];
type DragPhase = "idle" | "pending" | "dragging" | "settling";
type OrderMode = "list" | "display";
type OrderDragSession = {
  phase: DragPhase;
  mode: OrderMode;
  pointerId: number;
  container: HTMLUListElement;
  sourceItem: HTMLLIElement;
  sourceKey: string;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  ghost: HTMLLIElement | null;
  placeholder: HTMLLIElement | null;
  cachedRows: HTMLLIElement[];
  rafId: number | null;
  queuedClientX: number;
  queuedClientY: number;
  orderChanged: boolean;
};
let orderDragSession: OrderDragSession | null = null;
let selectedShapeId: string | null = null;
let activeTool: "marker" | "line" | "area" | "text" | "arrow" = "marker";
let manualMarkerCount = 0;
let previewToolMarker: Marker | null = null;
let previewShape: ShapeItem | null = null;
let currentProjectPath: string | null = null;
let lastStageRect: DOMRect | null = null;
let lastScaleFit = 1;
let currentPackVersion = "";
let currentPackId = "";
let currentProject: MapProject | null = null;

const view: ViewTransform = { scale: 1, tx: 0, ty: 0 };
let isDragging = false;
let dragStartScreen: { x: number; y: number } | null = null;
let dragStartMap: { x: number; y: number } | null = null;
let dragMode: DragMode = null;
let dragRect: SVGRectElement | null = null;
let labelDrag: LabelDrag | null = null;
let markerDrag: MarkerDrag | null = null;
let shapeDrag: ShapeDrag | null = null;
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
let editingCoordMarker: Marker | null = null;

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

function ensureShapesContainer(root: SVGGElement): SVGGElement {
  let container = root.querySelector("g[data-layer=\"shapes-wrap\"]") as SVGGElement | null;
  if (!container) {
    container = document.createElementNS("http://www.w3.org/2000/svg", "g");
    container.setAttribute("data-layer", "shapes-wrap");
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
  if (layoutEl) {
    layoutEl.classList.toggle("step-3", stepId === "3");
  }
  if (layoutEl) {
    layoutEl.classList.toggle("step-3", stepId === "3");
  }
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
    if (!cropBox && !cropBBox) {
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
  if (stepId !== "0" && stepId !== "3" && previewMarker) {
    previewMarker = null;
    renderMarkers();
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
  if (lastStageRect && cropBox) {
    const scaleX = rect.width / Math.max(1, lastStageRect.width);
    const scaleY = rect.height / Math.max(1, lastStageRect.height);
    cropBox = {
      left: cropBox.left * scaleX,
      top: cropBox.top * scaleY,
      width: cropBox.width * scaleX,
      height: cropBox.height * scaleY
    };
    clampCropBox(cropBox);
  }
  lastStageRect = rect;
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

function syncStageSize(): void {
  if (!mapStage || !canvas || !svg) {
    return;
  }
  const center = viewCenterLonLat();
  const { scaleFit } = resizeCanvasToStage();
  if (lastScaleFit > 0 && scaleFit > 0) {
    view.scale = view.scale * (lastScaleFit / scaleFit);
  }
  lastScaleFit = scaleFit;
  const [centerX, centerY] = project(center[0], center[1], MAP_WIDTH, MAP_HEIGHT);
  view.tx = MAP_WIDTH / 2 - centerX * view.scale;
  view.ty = MAP_HEIGHT / 2 - centerY * view.scale;
  applyViewTransform();
  updateWrapTransforms(true);
  updateCropFrame();
  updateCropOverlay();
  applyMapClip();
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
  document.querySelectorAll<HTMLButtonElement>(".tool-select").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as typeof activeTool | undefined;
      if (tool) {
        setActiveTool(tool);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".tool-add").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const tool = button.dataset.addTool as typeof activeTool | undefined;
      if (!tool) {
        return;
      }
      addToolItem(tool);
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
  const shapeWrap = ensureShapesContainer(root);
  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  for (const i of WRAPS) {
    ensureWrapGroup(markerWrap, `marker-${i}`, (i + wrapShift) * width);
    ensureWrapGroup(shapeWrap, `shape-${i}`, (i + wrapShift) * width);
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

function setActiveTool(tool: typeof activeTool): void {
  activeTool = tool;
  document.querySelectorAll<HTMLButtonElement>(".tool-select").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  const [lon, lat] = viewCenterLonLat();
  if (tool === "marker") {
    previewShape = null;
    previewToolMarker = buildPreviewMarkerAt({ lon, lat });
  } else {
    previewToolMarker = null;
    previewShape = buildShapeAt(tool, { lon, lat });
  }
  renderMarkers();
}

function addToolItem(tool: typeof activeTool): void {
  if (activeStep !== "3") {
    return;
  }
  const [lon, lat] = viewCenterLonLat();
  if (tool === "marker") {
    const marker = buildManualMarkerAt({ lon, lat });
    if (hasDuplicateMarker(marker)) {
      return;
    }
    selectedMarkers.push(marker);
    previewMarker = null;
    previewToolMarker = null;
    selectMarker(marker.id);
    renderMarkers();
    renderMarkerList();
    return;
  }
  if (tool === "text" || tool === "line" || tool === "area" || tool === "arrow") {
    const shape = buildShapeAt(tool, { lon, lat });
    if (hasDuplicateShape(shape)) {
      return;
    }
    shapes.push(shape);
    previewShape = null;
    selectShape(shape.id);
    renderMarkerList();
    return;
  }
}

function syncManualMarkerCount(): void {
  let maxIndex = 0;
  selectedMarkers.forEach((marker) => {
    if (!marker.name.startsWith("點標示")) {
      return;
    }
    const match = marker.name.match(/點標示(\d+)/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxIndex = Math.max(maxIndex, value);
      }
    }
  });
  manualMarkerCount = maxIndex;
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
  const rankMap = getDisplayRankMap();
  const sortedMarkers = [...selectedMarkers].sort((a, b) => {
    const ra = rankMap.get(markerOverlayKey(a.id)) ?? Number.MAX_SAFE_INTEGER;
    const rb = rankMap.get(markerOverlayKey(b.id)) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) {
      return ra - rb;
    }
    return 0;
  });
  const renderItems: Array<{ marker: Marker; preview: boolean }> = [
    ...sortedMarkers.map((marker) => ({ marker, preview: false }))
  ];
  if (previewMarker) {
    renderItems.push({ marker: previewMarker, preview: true });
  }
  if (previewToolMarker) {
    renderItems.push({ marker: previewToolMarker, preview: true });
  }

  for (const i of WRAPS) {
    const wrap = ensureWrapGroup(markerWrap, `marker-${i}`, (i + worldShift) * width);
    wrap.innerHTML = "";
    for (const item of renderItems) {
      const marker = item.marker;
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
      if (item.preview) {
        circle.setAttribute("opacity", "0.7");
      }
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const hitRadius = Math.max(14, marker.style.dotSize * 3) / view.scale;
      hit.setAttribute("cx", x.toFixed(2));
      hit.setAttribute("cy", y.toFixed(2));
      hit.setAttribute("r", hitRadius.toFixed(2));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("data-marker", "dot-hit");
      hit.setAttribute("data-id", marker.id);
      hit.style.pointerEvents = "all";
      circle.addEventListener("click", (event) => {
        if (activeStep !== "3") {
          return;
        }
        event.stopPropagation();
        if (!item.preview) {
          selectMarker(marker.id);
        }
      });
      hit.addEventListener("mousedown", (event) => {
        if (activeStep !== "3" || item.preview) {
          return;
        }
        event.stopPropagation();
        selectMarker(marker.id);
        const start = mapPointFromEvent(event);
        markerDrag = {
          markerId: marker.id,
          startX: start.x,
          startY: start.y,
          startLon: marker.longitude,
          startLat: marker.latitude
        };
      });
      wrap.appendChild(hit);
      wrap.appendChild(circle);

      if (marker.showLabel === false) {
        continue;
      }
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const scale = Math.max(0.5, Math.min(1.6, Math.pow(view.scale, 0.35)));
      const offsetX = marker.style.textOffsetX;
      const offsetY = marker.style.textOffsetY;
      label.setAttribute("data-x", x.toFixed(2));
      label.setAttribute("data-y", y.toFixed(2));
      label.setAttribute("data-offset-x", offsetX.toFixed(2));
      label.setAttribute("data-offset-y", offsetY.toFixed(2));
      label.setAttribute("x", (x + offsetX).toFixed(2));
      label.setAttribute("y", (y + offsetY).toFixed(2));
      label.setAttribute("data-marker", "label");
      label.setAttribute("data-id", marker.id);
      label.setAttribute("data-base", String(marker.style.textSize));
      label.setAttribute("fill", marker.style.textColor);
      label.setAttribute("font-size", (marker.style.textSize * scale).toFixed(2));
      label.setAttribute("font-family", marker.style.fontFamily);
      label.textContent = markerLabelText(marker);
      if (labelDrag && labelDrag.markerId === marker.id) {
        label.setAttribute("data-dragging", "true");
      }
      label.addEventListener("click", (event) => {
        if (activeStep !== "3") {
          return;
        }
        event.stopPropagation();
        if (!item.preview) {
          selectMarker(marker.id);
        }
      });
      label.addEventListener("mousedown", (event) => {
        if (activeStep !== "3" || item.preview) {
          return;
        }
        event.stopPropagation();
        label.setAttribute("data-dragging", "true");
        const start = mapPointFromEvent(event);
        labelDrag = {
          markerId: marker.id,
          startX: start.x,
          startY: start.y,
          startOffsetX: marker.style.textOffsetX,
          startOffsetY: marker.style.textOffsetY
        };
      });
      wrap.appendChild(label);
    }
  }
  renderShapes();
}

function renderShapes(): void {
  if (!svg) {
    return;
  }
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;
  const root = ensureMapRoot(svg);
  const shapeWrap = ensureShapesContainer(root);
  const rankMap = getDisplayRankMap();
  const sortedShapes = [...shapes].sort((a, b) => {
    const ra = rankMap.get(shapeOverlayKey(a.id)) ?? Number.MAX_SAFE_INTEGER;
    const rb = rankMap.get(shapeOverlayKey(b.id)) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) {
      return ra - rb;
    }
    return 0;
  });
  const renderItems: Array<{ shape: ShapeItem; preview: boolean }> = [
    ...sortedShapes.map((shape) => ({ shape, preview: false }))
  ];
  if (previewShape) {
    renderItems.push({ shape: previewShape, preview: true });
  }
  for (const i of WRAPS) {
    const wrap = ensureWrapGroup(shapeWrap, `shape-${i}`, (i + worldShift) * width);
    wrap.innerHTML = "";
    for (const item of renderItems) {
      const shape = item.shape;
      const [x, y] = project(shape.longitude, shape.latitude, width, height);
      if (shape.type === "line") {
        const half = shape.width / 2;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (x - half).toFixed(2));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("x2", (x + half).toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("stroke", shape.style.strokeColor);
        line.setAttribute("stroke-width", (shape.style.strokeWidth / view.scale).toFixed(2));
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("data-shape", "line");
        line.setAttribute("data-id", shape.id);
        if (item.preview) {
          line.setAttribute("opacity", "0.6");
        }
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
        hit.setAttribute("x1", (x - half).toFixed(2));
        hit.setAttribute("y1", y.toFixed(2));
        hit.setAttribute("x2", (x + half).toFixed(2));
        hit.setAttribute("y2", y.toFixed(2));
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute("stroke-width", (Math.max(14, shape.style.strokeWidth * 4) / view.scale).toFixed(2));
        hit.setAttribute("stroke-linecap", "round");
        hit.setAttribute("data-shape", "line");
        hit.setAttribute("data-id", shape.id);
        line.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        const onDragStart = (event: MouseEvent) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        };
        line.addEventListener("mousedown", onDragStart);
        hit.addEventListener("mousedown", onDragStart);
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.appendChild(hit);
        wrap.appendChild(line);
      } else if (shape.type === "arrow") {
        const half = shape.width / 2;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (x - half).toFixed(2));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("x2", (x + half).toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("stroke", shape.style.strokeColor);
        line.setAttribute("stroke-width", (shape.style.strokeWidth / view.scale).toFixed(2));
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("data-shape", "arrow");
        line.setAttribute("data-id", shape.id);
        const headSize = Math.max(6, shape.style.strokeWidth * 2) / view.scale;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const x2 = x + half;
        const y2 = y;
        const d = `M ${x2.toFixed(2)} ${y2.toFixed(2)} L ${(x2 - headSize).toFixed(
          2
        )} ${(y2 - headSize * 0.6).toFixed(2)} L ${(x2 - headSize).toFixed(
          2
        )} ${(y2 + headSize * 0.6).toFixed(2)} Z`;
        path.setAttribute("d", d);
        path.setAttribute("fill", shape.style.strokeColor);
        path.setAttribute("data-shape", "arrow");
        path.setAttribute("data-id", shape.id);
        const onClick = (event: MouseEvent) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        };
        const onDragStart = (event: MouseEvent) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        };
        line.addEventListener("click", onClick);
        path.addEventListener("click", onClick);
        line.addEventListener("mousedown", onDragStart);
        path.addEventListener("mousedown", onDragStart);
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
        hit.setAttribute("x1", (x - half).toFixed(2));
        hit.setAttribute("y1", y.toFixed(2));
        hit.setAttribute("x2", (x + half).toFixed(2));
        hit.setAttribute("y2", y.toFixed(2));
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute("stroke-width", (Math.max(14, shape.style.strokeWidth * 4) / view.scale).toFixed(2));
        hit.setAttribute("stroke-linecap", "round");
        hit.setAttribute("data-shape", "arrow");
        hit.setAttribute("data-id", shape.id);
        if (!item.preview) {
          hit.addEventListener("mousedown", onDragStart);
          hit.addEventListener("click", onClick);
        }
        wrap.appendChild(hit);
        wrap.appendChild(line);
        wrap.appendChild(path);
      } else if (shape.type === "area") {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", (x - shape.width / 2).toFixed(2));
        rect.setAttribute("y", (y - shape.height / 2).toFixed(2));
        rect.setAttribute("width", shape.width.toFixed(2));
        rect.setAttribute("height", shape.height.toFixed(2));
        rect.setAttribute("fill", shape.style.fillColor);
        rect.setAttribute("fill-opacity", shape.style.fillOpacity.toFixed(2));
        rect.setAttribute("stroke", shape.style.strokeColor);
        rect.setAttribute("stroke-width", (shape.style.strokeWidth / view.scale).toFixed(2));
        rect.setAttribute("data-shape", "area");
        rect.setAttribute("data-id", shape.id);
        if (item.preview) {
          rect.setAttribute("opacity", "0.6");
        }
        rect.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        rect.addEventListener("mousedown", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        });
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.setAttribute("x", (x - shape.width / 2 - 6).toFixed(2));
        hit.setAttribute("y", (y - shape.height / 2 - 6).toFixed(2));
        hit.setAttribute("width", (shape.width + 12).toFixed(2));
        hit.setAttribute("height", (shape.height + 12).toFixed(2));
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("data-shape", "area");
        hit.setAttribute("data-id", shape.id);
        hit.addEventListener("mousedown", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        });
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.appendChild(hit);
        wrap.appendChild(rect);
      } else if (shape.type === "text") {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const scale = Math.max(0.6, Math.min(1.6, Math.pow(view.scale, 0.35)));
        label.setAttribute("x", x.toFixed(2));
        label.setAttribute("y", y.toFixed(2));
        label.setAttribute("fill", shape.style.textColor);
        label.setAttribute(
          "font-size",
          (shape.style.textSize * scale).toFixed(2)
        );
        label.setAttribute("font-family", shape.style.fontFamily);
        label.setAttribute("data-shape", "text");
        label.setAttribute("data-id", shape.id);
        label.textContent = shape.text ?? "文字標示";
        if (item.preview) {
          label.setAttribute("opacity", "0.6");
        }
        label.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        label.addEventListener("mousedown", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        });
        const approxWidth =
          Math.max(40, (shape.text ?? "文字標示").length * shape.style.textSize * 0.6) /
          view.scale;
        const approxHeight = Math.max(18, shape.style.textSize * 1.4) / view.scale;
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.setAttribute("x", (x - approxWidth / 2).toFixed(2));
        hit.setAttribute("y", (y - approxHeight).toFixed(2));
        hit.setAttribute("width", approxWidth.toFixed(2));
        hit.setAttribute("height", approxHeight.toFixed(2));
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("data-shape", "text");
        hit.setAttribute("data-id", shape.id);
        hit.addEventListener("mousedown", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (item.preview) {
            return;
          }
          const start = mapPointFromEvent(event);
          shapeDrag = {
            shapeId: shape.id,
            startX: start.x,
            startY: start.y,
            startLon: shape.longitude,
            startLat: shape.latitude
          };
        });
        hit.addEventListener("click", (event) => {
          if (activeStep !== "3") {
            return;
          }
          event.stopPropagation();
          if (!item.preview) {
            selectShape(shape.id);
          }
        });
        wrap.appendChild(hit);
        wrap.appendChild(label);
      }
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
    const offsetX = Number(label.getAttribute("data-offset-x") ?? "0");
    const offsetY = Number(label.getAttribute("data-offset-y") ?? "0");
    label.setAttribute("x", (baseX + offsetX).toFixed(2));
    label.setAttribute("y", (baseY + offsetY).toFixed(2));
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
    item.className = "result-item";
    const content = document.createElement("div");
    content.className = "result-content";
    const title = document.createElement("div");
    const displayName =
      result.nameAlt && result.nameAlt !== result.name
        ? `${result.nameAlt} / ${result.name}`
        : result.name;
    title.textContent = displayName;
    const meta = document.createElement("div");
    meta.className = "meta";
    const lat = result.latitude.toFixed(4);
    const lon = result.longitude.toFixed(4);
    const country = result.countryCode ?? "";
    meta.textContent = `${displayName} · ${country} (${lat}, ${lon})`;
    content.appendChild(title);
    content.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const addButton = document.createElement("button");
    addButton.className = "icon-btn";
    addButton.textContent = "+";
    addButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addMarkerFromGeonames(result);
      previewMarker = null;
      renderMarkers();
    });
    actions.appendChild(addButton);
    item.appendChild(content);
    item.appendChild(actions);
    item.addEventListener("click", () => {
      if (hasGeonamesMarker(result)) {
        previewMarker = null;
        renderMarkers();
        return;
      }
      setPreviewMarker(result);
    });
    target.appendChild(item);
  });
}

function renderCoordResult(
  target: HTMLUListElement,
  marker: Marker,
  lat: number,
  lon: number
): void {
  target.innerHTML = "";
  const item = document.createElement("li");
  item.className = "result-item";
  const content = document.createElement("div");
  content.className = "result-content";
  const title = document.createElement("div");
  title.textContent = marker.name;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `座標 · (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  content.appendChild(title);
  content.appendChild(meta);
  const actions = document.createElement("div");
  actions.className = "result-actions";
  const addButton = document.createElement("button");
  addButton.className = "icon-btn";
  addButton.textContent = "+";
  addButton.addEventListener("click", (event) => {
    event.stopPropagation();
    addMarkerFromCoordsValue({ lat, lon });
  });
  actions.appendChild(addButton);
  item.appendChild(content);
  item.appendChild(actions);
  item.addEventListener("click", () => {
    previewMarker = marker;
    renderMarkers();
  });
  target.appendChild(item);
}

function setResults3Visible(visible: boolean): void {
  if (!results3Block) {
    return;
  }
  results3Block.classList.toggle("visible", visible);
}

function setPreviewMarker(result: GeonamesResult): void {
  previewMarker = {
    id: `preview-${result.id}`,
    name: result.nameAlt && result.nameAlt !== result.name ? result.nameAlt : result.name,
    nameAlt: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    sourceId: String(result.id),
    style: defaultMarkerStyle(),
    sourceType: "geonames",
    labelMode: "name",
    showLabel: true,
    kind: "label"
  };
  renderMarkers();
  syncMarkerControls(previewMarker);
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

function buildCoordMarker(parsed: { lat: number; lon: number }, idPrefix = "coord"): Marker {
  const coordsText = `(${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)})`;
  return {
    id: `${idPrefix}-${Date.now()}`,
    name: coordsText,
    nameAlt: coordsText,
    latitude: parsed.lat,
    longitude: parsed.lon,
    sourceId: undefined,
    style: defaultMarkerStyle(),
    sourceType: "coords",
    labelMode: "coords",
    showLabel: true,
    kind: "label"
  };
}

function addMarkerFromCoordsValue(parsed: { lat: number; lon: number }): void {
  const marker = buildCoordMarker(parsed);
  if (hasDuplicateMarker(marker)) {
    return;
  }
  selectedMarkers.push(marker);
  previewMarker = null;
  if (activeStep === "3") {
    selectMarker(marker.id);
  }
  renderMarkers();
  renderMarkerList();
  if (statusEl) {
    statusEl.textContent = `已新增座標：${marker.name}`;
  }
}

function handleCoordSearch(input: HTMLInputElement | null, target: HTMLUListElement | null): void {
  if (!input || !target) {
    return;
  }
  const value = input.value.trim();
  if (!value) {
    return;
  }
  if (target === resultsEl3) {
    setResults3Visible(true);
  }
  const parsed = parseLatLon(value);
  if (!parsed) {
    if (statusEl) {
      statusEl.textContent = "經緯度格式錯誤，請輸入「緯度, 經度」。";
    }
    return;
  }
  const marker = buildCoordMarker(parsed, "coord-preview");
  marker.labelMode = "coords";
  previewMarker = marker;
  renderMarkers();
  syncMarkerControls(previewMarker);
  renderCoordResult(target, marker, parsed.lat, parsed.lon);
}
function defaultMarkerStyle(): MarkerStyle {
  return {
    dotSize: 7,
    textSize: 7,
    dotColor: "#f97316",
    textColor: "#fde68a",
    textOffsetX: 8,
    textOffsetY: -6,
    fontFamily: "IBM Plex Sans, sans-serif"
  };
}

function defaultShapeStyle(type: ShapeItem["type"]): ShapeStyle {
  const base: ShapeStyle = {
    strokeColor: "#38bdf8",
    strokeWidth: 2,
    fillColor: "#38bdf8",
    fillOpacity: 0.35,
    textColor: "#fde68a",
    textSize: 16,
    fontFamily: "IBM Plex Sans, sans-serif"
  };
  if (type === "area") {
    base.fillOpacity = 0.4;
  }
  return base;
}

function buildManualMarkerAt(center: { lon: number; lat: number }): Marker {
  manualMarkerCount += 1;
  return {
    id: `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: `點標示${manualMarkerCount}`,
    latitude: center.lat,
    longitude: center.lon,
    style: defaultMarkerStyle(),
    sourceType: "manual",
    labelMode: "name",
    showLabel: false,
    kind: "point"
  };
}

function buildPreviewMarkerAt(center: { lon: number; lat: number }): Marker {
  return {
    id: "preview-tool-marker",
    name: "點標示",
    latitude: center.lat,
    longitude: center.lon,
    style: defaultMarkerStyle(),
    sourceType: "manual",
    labelMode: "name",
    showLabel: false,
    kind: "point"
  };
}

function buildShapeAt(
  type: ShapeItem["type"],
  center: { lon: number; lat: number }
): ShapeItem {
  const size = 140 / Math.max(0.4, view.scale);
  const height = type === "area" ? size * 0.7 : size * 0.4;
  return {
    id: `shape-${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type,
    longitude: center.lon,
    latitude: center.lat,
    width: size,
    height,
    text: type === "text" ? "文字標示" : undefined,
    style: defaultShapeStyle(type)
  };
}

function formatCoords(marker: { latitude: number; longitude: number }): string {
  return `(${marker.latitude.toFixed(4)}, ${marker.longitude.toFixed(4)})`;
}

function markerLabelText(marker: Marker): string {
  if (marker.labelMode === "coords") {
    return formatCoords(marker);
  }
  return marker.labelName && marker.labelName.trim().length > 0
    ? marker.labelName
    : marker.name;
}

function markerKey(marker: { name: string; latitude: number; longitude: number }): string {
  return `${marker.name}|${marker.latitude.toFixed(6)}|${marker.longitude.toFixed(6)}`;
}

function markerListName(marker: Marker): string {
  if (marker.displayName && marker.displayName.trim().length > 0) {
    return marker.displayName.trim();
  }
  const coordsText = formatCoords(marker);
  if (marker.sourceType === "coords" && marker.labelName) {
    return `${marker.labelName}/${coordsText}`;
  }
  if (marker.sourceType === "coords") {
    return coordsText;
  }
  if (marker.kind === "point") {
    return marker.name;
  }
  if (marker.nameAlt && marker.nameAlt !== marker.name) {
    return `${marker.name} / ${marker.nameAlt}`;
  }
  return marker.name;
}

function shapeDefaultName(shape: ShapeItem, index: number): string {
  const shapeTypeLabel: Record<ShapeItem["type"], string> = {
    line: "線段",
    area: "區域",
    text: "文字",
    arrow: "箭頭"
  };
  if (shape.type === "text" && shape.text && shape.text.trim().length > 0) {
    const rawText = shape.text.trim();
    if (!/^文字標示\d*$/.test(rawText)) {
      return rawText;
    }
  }
  return `${shapeTypeLabel[shape.type]}${index}`;
}

type OverlayObjectRef = {
  key: string;
  kind: "marker" | "shape";
  id: string;
  name: string;
};

function markerOverlayKey(markerId: string): string {
  return `marker:${markerId}`;
}

function shapeOverlayKey(shapeId: string): string {
  return `shape:${shapeId}`;
}

function shapeDisplayNameMap(): Map<string, string> {
  const names = new Map<string, string>();
  const shapeCounters: Record<ShapeItem["type"], number> = {
    line: 0,
    area: 0,
    text: 0,
    arrow: 0
  };
  shapes.forEach((shape) => {
    shapeCounters[shape.type] += 1;
    names.set(
      shape.id,
      shape.displayName && shape.displayName.trim().length > 0
        ? shape.displayName.trim()
        : shapeDefaultName(shape, shapeCounters[shape.type])
    );
  });
  return names;
}

function getOverlayRefs(): OverlayObjectRef[] {
  const refs: OverlayObjectRef[] = [];
  const shapeNames = shapeDisplayNameMap();
  const seen = new Set<string>();
  selectedMarkers.forEach((marker) => {
    const key = markerOverlayKey(marker.id);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    refs.push({
      key,
      kind: "marker",
      id: marker.id,
      name: markerListName(marker)
    });
  });
  shapes.forEach((shape) => {
    const key = shapeOverlayKey(shape.id);
    refs.push({
      key,
      kind: "shape",
      id: shape.id,
      name: shapeNames.get(shape.id) ?? "標示"
    });
  });
  return refs;
}

function syncOrderKeys(): void {
  const refs = getOverlayRefs();
  const valid = new Set(refs.map((item) => item.key));
  const normalize = (source: string[]) => source.filter((key, index) => valid.has(key) && source.indexOf(key) === index);
  const normalizedList = normalize(listOrderKeys);
  const normalizedDisplay = normalize(displayOrderKeys);
  refs.forEach((item) => {
    if (!normalizedList.includes(item.key)) {
      normalizedList.push(item.key);
    }
    if (!normalizedDisplay.includes(item.key)) {
      normalizedDisplay.push(item.key);
    }
  });
  listOrderKeys = normalizedList;
  displayOrderKeys = normalizedDisplay;
}

function getDisplayRankMap(): Map<string, number> {
  syncOrderKeys();
  const rank = new Map<string, number>();
  displayOrderKeys.forEach((key, index) => {
    rank.set(key, index);
  });
  return rank;
}

function shapeKey(shape: { type: ShapeItem["type"]; text?: string; latitude: number; longitude: number }): string {
  return `${shape.type}|${shape.text ?? ""}|${shape.latitude.toFixed(6)}|${shape.longitude.toFixed(6)}`;
}

function hasDuplicateShape(candidate: ShapeItem): boolean {
  const key = shapeKey(candidate);
  return shapes.some((shape) => shapeKey(shape) === key);
}

function hasDuplicateMarker(candidate: { name: string; latitude: number; longitude: number }): boolean {
  const key = markerKey(candidate);
  return selectedMarkers.some((marker) => markerKey(marker) === key);
}

function hasGeonamesMarker(result: GeonamesResult): boolean {
  const sourceId = String(result.id);
  return selectedMarkers.some(
    (marker) =>
      marker.sourceType === "geonames" &&
      marker.sourceId === sourceId &&
      marker.latitude === result.latitude &&
      marker.longitude === result.longitude
  );
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
    style: defaultMarkerStyle(),
    sourceType: "geonames",
    labelMode: "name",
    showLabel: true,
    kind: "label"
  };
  selectedMarkers.push(marker);
  previewMarker = null;
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

function getSelectedShape(): ShapeItem | null {
  if (!selectedShapeId) {
    return null;
  }
  return shapes.find((shape) => shape.id === selectedShapeId) ?? null;
}

function getEditableMarker(): Marker | null {
  const selected = getSelectedMarker();
  if (selected) {
    return selected;
  }
  return previewMarker;
}

function syncMarkerControls(marker: Marker | null): void {
  updateSettingsVisibility(marker, null);
  if (
    !markerDotSize ||
    !markerTextSize ||
    !markerDotColor ||
    !markerTextColor ||
    !markerFont
  ) {
    return;
  }
  if (!marker) {
    dotSizeSlider && setSliderValue(dotSizeSlider, 7, true);
    textSizeSlider && setSliderValue(textSizeSlider, 7, true);
    markerDotColor.value = "#f97316";
    markerTextColor.value = "#fde68a";
    markerFont.value = "IBM Plex Sans, sans-serif";
    syncColorInputs("dot", markerDotColor.value);
    syncColorInputs("text", markerTextColor.value);
    if (markerLabelInput) {
      markerLabelInput.value = "";
      markerLabelInput.disabled = true;
    }
    return;
  }
  dotSizeSlider && setSliderValue(dotSizeSlider, marker.style.dotSize, true);
  textSizeSlider && setSliderValue(textSizeSlider, marker.style.textSize, true);
  markerDotColor.value = marker.style.dotColor;
  markerTextColor.value = marker.style.textColor;
  markerFont.value = marker.style.fontFamily;
  syncColorInputs("dot", marker.style.dotColor);
  syncColorInputs("text", marker.style.textColor);
  if (markerLabelInput) {
    markerLabelInput.disabled = marker.sourceType !== "geonames";
    markerLabelInput.value =
      marker.sourceType === "geonames"
        ? marker.labelName ?? marker.name
        : "";
  }
}

function syncShapeControls(shape: ShapeItem | null): void {
  if (!shape) {
    if (!getSelectedMarker()) {
      updateSettingsVisibility(null, null);
    }
    if (shapeTextInput) {
      shapeTextInput.value = "";
    }
    return;
  }
  updateSettingsVisibility(null, shape);
  if (shape.type === "text") {
    if (shapeTextInput) {
      shapeTextInput.value = shape.text ?? "";
    }
    if (shapeTextColor) {
      shapeTextColor.value = shape.style.textColor;
    }
    if (shapeTextFont) {
      shapeTextFont.value = shape.style.fontFamily;
    }
    if (shapeTextSizeSlider) {
      setSliderValue(shapeTextSizeSlider, shape.style.textSize, true);
    }
  }
  if (shape.type === "line") {
    if (shapeLineColor) {
      shapeLineColor.value = shape.style.strokeColor;
    }
    if (shapeLineWidthSlider) {
      setSliderValue(shapeLineWidthSlider, shape.style.strokeWidth, true);
    }
  }
  if (shape.type === "arrow") {
    if (shapeArrowColor) {
      shapeArrowColor.value = shape.style.strokeColor;
    }
    if (shapeArrowWidthSlider) {
      setSliderValue(shapeArrowWidthSlider, shape.style.strokeWidth, true);
    }
  }
  if (shape.type === "area") {
    if (shapeAreaFill) {
      shapeAreaFill.value = shape.style.fillColor;
    }
    if (shapeAreaStroke) {
      shapeAreaStroke.value = shape.style.strokeColor;
    }
    if (shapeAreaOpacitySlider) {
      setSliderValue(shapeAreaOpacitySlider, shape.style.fillOpacity, true);
    }
    if (shapeAreaStrokeWidthSlider) {
      setSliderValue(shapeAreaStrokeWidthSlider, shape.style.strokeWidth, true);
    }
  }
  syncItemNameControl();
}

function syncItemNameControl(): void {
  if (!itemNameRow || !itemNameInput) {
    return;
  }
  const marker = getSelectedMarker();
  const shape = getSelectedShape();
  if (!marker && !shape) {
    itemNameRow.style.display = "none";
    itemNameInput.value = "";
    itemNameInput.disabled = true;
    return;
  }
  itemNameRow.style.display = "flex";
  itemNameInput.disabled = false;
  if (marker) {
    itemNameInput.value = marker.displayName ?? markerListName(marker);
    return;
  }
  if (shape) {
    const sameTypeShapes = shapes.filter((item) => item.type === shape.type);
    const index = Math.max(1, sameTypeShapes.findIndex((item) => item.id === shape.id) + 1);
    itemNameInput.value = shape.displayName ?? shapeDefaultName(shape, index);
  }
}

function updateItemNameFromControl(): void {
  if (!itemNameInput) {
    return;
  }
  const value = itemNameInput.value.trim();
  const marker = getSelectedMarker();
  const shape = getSelectedShape();
  if (marker) {
    marker.displayName = value.length > 0 ? value : undefined;
    renderMarkerList();
    return;
  }
  if (shape) {
    shape.displayName = value.length > 0 ? value : undefined;
    renderMarkerList();
  }
}

function updateSettingsVisibility(marker: Marker | null, shape: ShapeItem | null): void {
  if (
    !settingsEmpty ||
    !pointSettings ||
    !textSettings ||
    !lineSettings ||
    !arrowSettings ||
    !areaSettings
  ) {
    return;
  }
  const hasMarker = Boolean(marker);
  const hasShape = Boolean(shape);
  settingsEmpty.style.display = hasMarker || hasShape ? "none" : "block";
  pointSettings.style.display = hasMarker ? "block" : "none";
  textSettings.style.display = shape?.type === "text" ? "block" : "none";
  lineSettings.style.display = shape?.type === "line" ? "block" : "none";
  arrowSettings.style.display = shape?.type === "arrow" ? "block" : "none";
  areaSettings.style.display = shape?.type === "area" ? "block" : "none";
  if (pointTextControls) {
    const hideTextControls = marker?.kind === "point";
    pointTextControls.style.display = hideTextControls ? "none" : "flex";
  }
}

function syncColorInputs(target: "dot" | "text", color: string): void {
  if (target === "dot") {
    if (markerDotHex) {
      markerDotHex.value = color;
    }
    if (dotColorChip) {
      dotColorChip.style.background = color;
    }
    return;
  }
  if (markerTextHex) {
    markerTextHex.value = color;
  }
  if (textColorChip) {
    textColorChip.style.background = color;
  }
}

function normalizeHexColor(input: string): string | null {
  let value = input.trim();
  if (!value) {
    return null;
  }
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;
  if (short.test(value)) {
    const [r, g, b] = value.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (full.test(value)) {
    return value.toLowerCase();
  }
  return null;
}

function selectMarker(markerId: string | null): void {
  previewToolMarker = null;
  previewShape = null;
  selectedMarkerId = markerId;
  selectedShapeId = null;
  syncMarkerControls(getSelectedMarker());
  syncItemNameControl();
  updateMarkerStyles();
  if (markerId) {
    activeTool = "marker";
    document.querySelectorAll<HTMLButtonElement>(".tool-select").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === "marker");
    });
  }
}

function selectShape(shapeId: string | null): void {
  previewToolMarker = null;
  previewShape = null;
  selectedShapeId = shapeId;
  selectedMarkerId = null;
  previewMarker = null;
  const shape = getSelectedShape();
  syncMarkerControls(null);
  syncShapeControls(shape);
  syncItemNameControl();
  renderMarkers();
  if (shape) {
    activeTool = shape.type;
    document.querySelectorAll<HTMLButtonElement>(".tool-select").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === shape.type);
    });
  }
}

function renderMarkerList(): void {
  if (!markerList) {
    return;
  }
  syncOrderKeys();
  markerList.innerHTML = "";
  const markersById = new Map(selectedMarkers.map((item) => [item.id, item]));
  const shapesById = new Map(shapes.map((item) => [item.id, item]));
  const shapeNames = shapeDisplayNameMap();
  listOrderKeys.forEach((overlayKey) => {
    const row = document.createElement("div");
    row.className = "marker-item";
    const title = document.createElement("span");
    const actions = document.createElement("div");
    actions.className = "marker-actions";

    if (overlayKey.startsWith("marker:")) {
      const markerId = overlayKey.slice("marker:".length);
      const marker = markersById.get(markerId);
      if (!marker) {
        return;
      }
      title.textContent = markerListName(marker);
      if (marker.sourceType === "coords") {
        const editBtn = document.createElement("button");
        editBtn.className = "secondary";
        editBtn.textContent = "編輯";
        editBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openCoordEditor(marker);
        });
        actions.appendChild(editBtn);
      }
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = "清除";
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteMarker(marker.id);
      });
      actions.appendChild(btn);
      row.addEventListener("click", () => selectMarker(marker.id));
    } else if (overlayKey.startsWith("shape:")) {
      const shapeId = overlayKey.slice("shape:".length);
      const shape = shapesById.get(shapeId);
      if (!shape) {
        return;
      }
      title.textContent = shapeNames.get(shape.id) ?? "標示";
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = "清除";
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteShape(shape.id);
      });
      actions.appendChild(btn);
      row.addEventListener("click", () => selectShape(shape.id));
    } else {
      return;
    }

    row.appendChild(title);
    row.appendChild(actions);
    markerList.appendChild(row);
  });
}

const DRAG_START_THRESHOLD = 6;

function isReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function measurePositions(container: HTMLUListElement): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  container.querySelectorAll<HTMLLIElement>("li.order-item").forEach((row) => {
    const key = row.dataset.key;
    if (!key) {
      return;
    }
    map.set(key, row.getBoundingClientRect());
  });
  return map;
}

function animateRowsWithFLIP(
  container: HTMLUListElement,
  before: Map<string, DOMRect>,
  duration = 180
): void {
  if (isReducedMotion()) {
    return;
  }
  const rows = Array.from(container.querySelectorAll<HTMLLIElement>("li.order-item"));
  rows.forEach((row) => {
    const key = row.dataset.key;
    if (!key) {
      return;
    }
    const oldRect = before.get(key);
    if (!oldRect) {
      return;
    }
    const newRect = row.getBoundingClientRect();
    const deltaY = oldRect.top - newRect.top;
    if (Math.abs(deltaY) < 0.5) {
      return;
    }
    row.classList.add("order-item--animating");
    row.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    requestAnimationFrame(() => {
      row.style.transform = "translate3d(0, 0, 0)";
    });
    window.setTimeout(() => {
      row.classList.remove("order-item--animating");
      row.style.transform = "";
    }, duration + 40);
  });
}

function scheduleDragMove(session: OrderDragSession, clientX: number, clientY: number): void {
  session.queuedClientX = clientX;
  session.queuedClientY = clientY;
  if (session.rafId !== null) {
    return;
  }
  session.rafId = requestAnimationFrame(() => {
    session.rafId = null;
    runDragMoveFrame(session);
  });
}

function updateGhostTransform(session: OrderDragSession, clientX: number, clientY: number): void {
  if (!session.ghost) {
    return;
  }
  const x = clientX - session.offsetX;
  const y = clientY - session.offsetY;
  session.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${isReducedMotion() ? "1" : "1.03"})`;
}

function computeInsertReference(
  session: OrderDragSession,
  clientY: number
): { refNode: Node | null } {
  const rows = session.cachedRows.filter((row) => row !== session.sourceItem);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) {
      return { refNode: row };
    }
  }
  return { refNode: null };
}

function movePlaceholderWithFLIP(session: OrderDragSession, clientY: number): void {
  if (!session.placeholder) {
    return;
  }
  const { container, placeholder } = session;
  const before = measurePositions(container);
  const { refNode } = computeInsertReference(session, clientY);
  const currentNext = placeholder.nextSibling;
  if (refNode === null) {
    if (currentNext === null) {
      return;
    }
    container.appendChild(placeholder);
  } else if (currentNext === refNode) {
    return;
  } else {
    container.insertBefore(placeholder, refNode);
  }
  animateRowsWithFLIP(container, before, 180);
  session.orderChanged = true;
}

function runDragMoveFrame(session: OrderDragSession): void {
  if (orderDragSession !== session) {
    return;
  }
  updateGhostTransform(session, session.queuedClientX, session.queuedClientY);
  movePlaceholderWithFLIP(session, session.queuedClientY);
}

function startDragging(session: OrderDragSession): void {
  session.phase = "dragging";
  const { sourceItem, container, startClientX, startClientY } = session;
  const sourceRect = sourceItem.getBoundingClientRect();
  sourceItem.classList.add("order-item--drag-source");
  const placeholder = document.createElement("li");
  placeholder.className = "order-placeholder";
  placeholder.style.minHeight = `${Math.max(32, sourceRect.height)}px`;
  container.replaceChild(placeholder, sourceItem);
  session.placeholder = placeholder;
  const ghost = sourceItem.cloneNode(true) as HTMLLIElement;
  ghost.classList.add("order-ghost");
  ghost.style.width = `${sourceRect.width}px`;
  ghost.style.height = `${sourceRect.height}px`;
  document.body.appendChild(ghost);
  session.ghost = ghost;
  session.cachedRows = Array.from(container.querySelectorAll<HTMLLIElement>("li.order-item"));
  updateGhostTransform(session, startClientX, startClientY);
}

function finalizeOrderCommit(session: OrderDragSession): void {
  const { mode, container } = session;
  const nextOrder = Array.from(container.querySelectorAll<HTMLLIElement>("li.order-item"))
    .map((row) => row.dataset.key ?? "")
    .filter((key) => key.length > 0);
  const currentOrder = mode === "list" ? listOrderKeys : displayOrderKeys;
  const changed =
    currentOrder.length !== nextOrder.length ||
    currentOrder.some((key, index) => key !== nextOrder[index]);
  if (!changed) {
    return;
  }
  if (mode === "list") {
    listOrderKeys = nextOrder;
  } else {
    displayOrderKeys = nextOrder;
  }
  renderOrderDialog();
  renderMarkers();
  renderMarkerList();
}

function cleanupOrderSession(reason: "commit" | "cancel"): void {
  const session = orderDragSession;
  if (!session) {
    return;
  }
  const wasDragging = session.phase === "dragging";
  session.phase = "settling";
  session.handle.releasePointerCapture?.(session.pointerId);
  if (session.rafId !== null) {
    cancelAnimationFrame(session.rafId);
    session.rafId = null;
  }
  if (session.ghost) {
    if (isReducedMotion()) {
      session.ghost.remove();
    } else {
      session.ghost.style.transition = "transform 120ms ease-out, opacity 120ms ease-out";
      session.ghost.style.opacity = "0";
      window.setTimeout(() => session.ghost?.remove(), 130);
    }
  }
  if (session.placeholder && session.placeholder.parentElement) {
    session.container.replaceChild(session.sourceItem, session.placeholder);
  }
  session.sourceItem.classList.remove("order-item--drag-source");
  if (reason === "commit" && wasDragging && session.orderChanged) {
    finalizeOrderCommit(session);
  }
  orderDragSession = null;
}

function onOrderPointerMove(event: PointerEvent): void {
  const session = orderDragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }
  if (session.phase === "pending") {
    const dx = event.clientX - session.startClientX;
    const dy = event.clientY - session.startClientY;
    if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD) {
      startDragging(session);
      scheduleDragMove(session, event.clientX, event.clientY);
    }
    return;
  }
  if (session.phase !== "dragging") {
    return;
  }
  scheduleDragMove(session, event.clientX, event.clientY);
}

function onOrderPointerUp(event: PointerEvent): void {
  const session = orderDragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }
  if (session.phase === "dragging") {
    cleanupOrderSession("commit");
    return;
  }
  cleanupOrderSession("cancel");
}

function onOrderPointerCancel(event: PointerEvent): void {
  const session = orderDragSession;
  if (!session || event.pointerId !== session.pointerId) {
    return;
  }
  cleanupOrderSession("cancel");
}

function startOrderPending(
  event: PointerEvent,
  mode: OrderMode,
  sourceItem: HTMLLIElement,
  handle: HTMLElement
): void {
  if (orderDragSession) {
    cleanupOrderSession("cancel");
  }
  const container = mode === "list" ? listOrderList : displayOrderList;
  const sourceKey = sourceItem.dataset.key;
  if (!container || !sourceKey) {
    return;
  }
  const rect = sourceItem.getBoundingClientRect();
  orderDragSession = {
    phase: "pending",
    mode,
    pointerId: event.pointerId,
    container,
    sourceItem,
    sourceKey,
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    ghost: null,
    placeholder: null,
    cachedRows: [],
    rafId: null,
    queuedClientX: event.clientX,
    queuedClientY: event.clientY,
    orderChanged: false
  };
  handle.setPointerCapture(event.pointerId);
}

function createOrderItem(item: OverlayObjectRef, mode: OrderMode): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "order-item";
  li.dataset.key = item.key;
  li.dataset.mode = mode;
  const handle = document.createElement("span");
  handle.className = "order-handle";
  handle.textContent = "⋮⋮";
  const name = document.createElement("span");
  name.className = "order-name";
  name.textContent = item.name;
  li.appendChild(handle);
  li.appendChild(name);

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    startOrderPending(event, mode, li, handle);
  });
  return li;
}

function renderOrderDialog(): void {
  if (!listOrderList || !displayOrderList) {
    return;
  }
  syncOrderKeys();
  const refs = getOverlayRefs();
  const refMap = new Map(refs.map((item) => [item.key, item]));
  const renderList = (
    container: HTMLUListElement,
    keys: string[],
    mode: "list" | "display"
  ) => {
    container.innerHTML = "";
    keys.forEach((key) => {
      const ref = refMap.get(key);
      if (!ref) {
        return;
      }
      const row = createOrderItem(ref, mode);
      container.appendChild(row);
    });
  };
  renderList(listOrderList, listOrderKeys, "list");
  renderList(displayOrderList, displayOrderKeys, "display");
}

function openOrderDialog(): void {
  if (!listOrderModal) {
    return;
  }
  renderOrderDialog();
  listOrderModal.classList.add("active");
}

function closeOrderDialog(): void {
  cleanupOrderSession("cancel");
  listOrderModal?.classList.remove("active");
}

function attachOrderDragGlobalEvents(): void {
  window.addEventListener("pointermove", onOrderPointerMove, { passive: true });
  window.addEventListener("pointerup", onOrderPointerUp);
  window.addEventListener("pointercancel", onOrderPointerCancel);
  window.addEventListener("blur", () => {
    if (orderDragSession) {
      cleanupOrderSession("cancel");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" && orderDragSession) {
      cleanupOrderSession("cancel");
    }
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
    syncItemNameControl();
  }
  renderMarkers();
  renderMarkerList();
}

async function handleSearch(input: HTMLInputElement, button: HTMLButtonElement) {
  const query = input.value.trim();
  if (!query) {
    return;
  }
  previewMarker = null;
  renderMarkers();
  button.disabled = true;
  try {
    const results = await window.mapSchematic?.searchGeonames?.(query, 10);
    if (resultsEl0) {
      renderResults((results ?? []) as GeonamesResult[], resultsEl0);
    }
    if (resultsEl3) {
      renderResults((results ?? []) as GeonamesResult[], resultsEl3);
    }
    if (input === searchInput3) {
      setResults3Visible(true);
    }
  } finally {
    button.disabled = false;
  }
}

function unprojectBBox(box: { x: number; y: number; width: number; height: number }): BBox {
  const [minLon, minLat] = unproject(box.x, box.y + box.height, MAP_WIDTH, MAP_HEIGHT);
  const [maxLon, maxLat] = unproject(box.x + box.width, box.y, MAP_WIDTH, MAP_HEIGHT);
  return {
    minLon: Math.min(minLon, maxLon),
    minLat: Math.min(minLat, maxLat),
    maxLon: Math.max(minLon, maxLon),
    maxLat: Math.max(minLat, maxLat)
  };
}

function currentSelectionBBox(): BBox {
  if (!cropBBox && cropBox) {
    updateCropBBox();
  }
  if (cropBBox) {
    return unprojectBBox(cropBBox);
  }
  return { ...WORLD };
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
      bbox: currentSelectionBBox(),
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
        textSize: marker.style.textSize,
        fontFamily: marker.style.fontFamily,
        textOffsetX: marker.style.textOffsetX,
        textOffsetY: marker.style.textOffsetY,
        labelMode: marker.labelMode,
        labelName: marker.labelName
      },
      geometry: { kind: "point", lon: marker.longitude, lat: marker.latitude },
      text: markerLabelText(marker),
      provenance:
        marker.sourceType === "geonames"
          ? { source: "geonames", sourceId: marker.sourceId ?? String(marker.id) }
          : { source: "manual", query: marker.sourceType }
    }))
  };
}

async function handleSave(saveAs = false) {
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
  const result = await window.mapSchematic.saveProject({
    project,
    path: currentProjectPath,
    saveAs
  });
  if (result?.path) {
    currentProjectPath = result.path;
  }
  if (statusEl) {
    if (result.canceled) {
      statusEl.textContent = "已取消儲存。";
    } else {
      statusEl.textContent = result.ok
        ? `專案已儲存：${result.path}`
        : "專案儲存失敗";
    }
  }
}

async function handleLoad() {
  if (!window.mapSchematic?.loadProject) {
    return;
  }
  const result = await window.mapSchematic.loadProject();
  if (!result.ok || !result.project) {
    if (statusEl) {
      statusEl.textContent = result.canceled
        ? "已取消載入。"
        : `載入失敗：${result.error ?? "未知錯誤"}`;
    }
    return;
  }
  const loadedProject = result.project;
  currentProject = loadedProject;
  currentProjectPath = result.path ?? null;
  selectedMarkers.splice(0, selectedMarkers.length);
  selectedMarkerId = null;
  previewMarker = null;
  cropBox = null;
  if (loadedProject.viewport?.bbox) {
    const bbox = loadedProject.viewport.bbox;
    const min = project(bbox.minLon, bbox.minLat, MAP_WIDTH, MAP_HEIGHT);
    const max = project(bbox.maxLon, bbox.maxLat, MAP_WIDTH, MAP_HEIGHT);
    cropBBox = {
      x: Math.min(min[0], max[0]),
      y: Math.min(min[1], max[1]),
      width: Math.abs(max[0] - min[0]),
      height: Math.abs(max[1] - min[1])
    };
  }
  for (const obj of loadedProject.objects ?? []) {
    if (obj.geometry?.kind === "point" && obj.geometry.lon != null && obj.geometry.lat != null) {
      const style = (obj.style ?? {}) as Record<string, unknown>;
      const sourceType =
        obj.provenance?.source === "manual" ? "coords" : ("geonames" as const);
      const coordsText = formatCoords({ latitude: obj.geometry.lat, longitude: obj.geometry.lon });
      const labelName = typeof style.labelName === "string" ? style.labelName : undefined;
      const labelMode =
        style.labelMode === "name" || style.labelMode === "coords"
          ? (style.labelMode as "name" | "coords")
          : sourceType === "coords"
          ? "coords"
          : "name";
      selectedMarkers.push({
        id: obj.id ?? `obj-${selectedMarkers.length + 1}`,
        name: sourceType === "coords" ? coordsText : obj.text ?? "",
        nameAlt: sourceType === "coords" ? coordsText : undefined,
        latitude: obj.geometry.lat,
        longitude: obj.geometry.lon,
        sourceId: obj.provenance?.sourceId,
        style: {
          dotColor: String(style.dotColor ?? "#f97316"),
          textColor: String(style.textColor ?? "#fde68a"),
          dotSize: Number(style.dotSize ?? 4),
          textSize: Number(style.textSize ?? 12),
          fontFamily: String(style.fontFamily ?? "IBM Plex Sans, sans-serif"),
          textOffsetX: Number(style.textOffsetX ?? 8),
          textOffsetY: Number(style.textOffsetY ?? -6)
        },
        sourceType,
        labelMode,
        labelName: labelMode === "name" ? labelName ?? (obj.text ?? undefined) : labelName,
        showLabel: true,
        kind: "label"
      });
    }
  }
  syncManualMarkerCount();
  renderMarkers();
  renderMarkerList();
  syncMarkerControls(getSelectedMarker());
  setActiveStep("3");
  if (cropBBox) {
    zoomToCropBounds();
    updateCropOverlay();
    applyMapClip();
  }
  if (statusEl) {
    statusEl.textContent = `專案已載入：${result.path}`;
  }
}

async function renderExportCanvas(): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  if (!canvas || !svg || !mapStage) {
    return null;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const scaleX = canvas.width / stageRect.width;
  const scaleY = canvas.height / stageRect.height;
  const crop = cropBox ?? {
    left: 0,
    top: 0,
    width: stageRect.width,
    height: stageRect.height
  };
  const outWidth = Math.max(1, Math.round(crop.width * scaleX));
  const outHeight = Math.max(1, Math.round(crop.height * scaleY));
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(canvas, -crop.left * scaleX, -crop.top * scaleY);
  const serializer = new XMLSerializer();
  const svgClone = svg.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("width", String(canvas.width));
  svgClone.setAttribute("height", String(canvas.height));
  const svgString = serializer.serializeToString(svgClone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = url;
  });
  ctx.drawImage(img, -crop.left * scaleX, -crop.top * scaleY, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return { canvas: outCanvas, width: outWidth, height: outHeight };
}

async function handleExport(format: "png" | "svg" | "pdf"): Promise<void> {
  if (!window.mapSchematic?.exportProject) {
    return;
  }
  const rendered = await renderExportCanvas();
  if (!rendered) {
    return;
  }
  const { canvas: exportCanvas, width, height } = rendered;
  let data = "";
  if (format === "png" || format === "pdf") {
    data = exportCanvas.toDataURL("image/png");
  } else {
    const pngData = exportCanvas.toDataURL("image/png");
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${pngData}" width="${width}" height="${height}"/></svg>`;
    const encoded = btoa(unescape(encodeURIComponent(svgContent)));
    data = `data:image/svg+xml;base64,${encoded}`;
  }
  const result = await window.mapSchematic.exportProject({ format, data, width, height });
  if (statusEl) {
    if (result.canceled) {
      statusEl.textContent = "已取消匯出。";
    } else {
      statusEl.textContent = result.ok ? `已匯出：${result.path}` : `匯出失敗：${result.error ?? ""}`;
    }
  }
}

function handleClearMarkers(): void {
  selectedMarkers.splice(0, selectedMarkers.length);
  shapes.splice(0, shapes.length);
  selectedMarkerId = null;
  selectedShapeId = null;
  previewMarker = null;
  previewToolMarker = null;
  previewShape = null;
  manualMarkerCount = 0;
  syncMarkerControls(null);
  syncShapeControls(null);
  syncItemNameControl();
  renderMarkers();
  renderMarkerList();
}

function deleteShape(shapeId: string): void {
  const index = shapes.findIndex((shape) => shape.id === shapeId);
  if (index >= 0) {
    shapes.splice(index, 1);
  }
  if (selectedShapeId === shapeId) {
    selectedShapeId = null;
    syncShapeControls(null);
    syncItemNameControl();
  }
  renderMarkers();
  renderMarkerList();
}

function openCoordEditor(marker: Marker): void {
  if (!coordEditModal || !coordLabelInput || !coordEditSave || !coordEditCancel) {
    return;
  }
  editingCoordMarker = marker;
  coordEditModal.classList.add("active");
  coordLabelInput.value = marker.labelName ?? "";
  const radios = coordEditModal.querySelectorAll<HTMLInputElement>("input[name=\"coordLabelMode\"]");
  radios.forEach((radio) => {
    radio.checked = radio.value === marker.labelMode;
  });
  coordEditSave.onclick = () => {
    marker.labelName = coordLabelInput.value.trim() || undefined;
    const selected = coordEditModal.querySelector<HTMLInputElement>(
      "input[name=\"coordLabelMode\"]:checked"
    );
    marker.labelMode = selected?.value === "name" ? "name" : "coords";
    editingCoordMarker = null;
    coordEditModal.classList.remove("active");
    renderMarkers();
    renderMarkerList();
  };
  coordEditCancel.onclick = () => {
    editingCoordMarker = null;
    coordEditModal.classList.remove("active");
  };
}

function attachMarkerControls(): void {
  const update = () => {
    updateMarkerFromControls();
  };

  markerLabelInput?.addEventListener("input", update);
  markerDotColor?.addEventListener("input", () => {
    syncColorInputs("dot", markerDotColor.value);
    update();
  });
  markerTextColor?.addEventListener("input", () => {
    syncColorInputs("text", markerTextColor.value);
    update();
  });
  markerDotHex?.addEventListener("input", () => {
    const next = normalizeHexColor(markerDotHex.value);
    if (!next || !markerDotColor) {
      return;
    }
    markerDotColor.value = next;
    syncColorInputs("dot", next);
    update();
  });
  markerTextHex?.addEventListener("input", () => {
    const next = normalizeHexColor(markerTextHex.value);
    if (!next || !markerTextColor) {
      return;
    }
    markerTextColor.value = next;
    syncColorInputs("text", next);
    update();
  });
  markerFont?.addEventListener("change", update);

  document.querySelectorAll<HTMLButtonElement>(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color ?? "";
      const target = swatch.dataset.colorTarget ?? "";
      const marker = getEditableMarker();
      if (!marker || !color) {
        return;
      }
      if (target === "dot" && markerDotColor) {
        markerDotColor.value = color;
        syncColorInputs("dot", color);
      }
      if (target === "text" && markerTextColor) {
        markerTextColor.value = color;
        syncColorInputs("text", color);
      }
      updateMarkerFromControls();
    });
  });
}

function attachShapeControls(): void {
  shapeTextInput?.addEventListener("input", updateShapeFromControls);
  shapeTextColor?.addEventListener("input", updateShapeFromControls);
  shapeTextFont?.addEventListener("change", updateShapeFromControls);
  shapeLineColor?.addEventListener("input", updateShapeFromControls);
  shapeArrowColor?.addEventListener("input", updateShapeFromControls);
  shapeAreaFill?.addEventListener("input", updateShapeFromControls);
  shapeAreaStroke?.addEventListener("input", updateShapeFromControls);
  document.querySelectorAll<HTMLButtonElement>("[data-shape-color]").forEach((button) => {
    button.addEventListener("click", () => {
      const color = button.dataset.shapeColor;
      const shape = getSelectedShape();
      if (!color || !shape) {
        return;
      }
      if (shape.type === "text" && shapeTextColor) {
        shapeTextColor.value = color;
      }
      if (shape.type === "line" && shapeLineColor) {
        shapeLineColor.value = color;
      }
      if (shape.type === "arrow" && shapeArrowColor) {
        shapeArrowColor.value = color;
      }
      if (shape.type === "area") {
        if (shapeAreaFill) {
          shapeAreaFill.value = color;
        }
        if (shapeAreaStroke) {
          shapeAreaStroke.value = color;
        }
      }
      updateShapeFromControls();
    });
  });
}

itemNameInput?.addEventListener("input", updateItemNameFromControl);

function bindFirstClickSelect(
  input: HTMLInputElement | null,
  isDefault: () => boolean
): void {
  if (!input) {
    return;
  }
  let consumedInFocus = false;
  input.addEventListener("blur", () => {
    consumedInFocus = false;
  });
  input.addEventListener("focus", () => {
    if (!isDefault() || consumedInFocus) {
      return;
    }
    consumedInFocus = true;
    requestAnimationFrame(() => {
      input.select();
    });
  });
  input.addEventListener("mousedown", (event) => {
    if (!isDefault() || consumedInFocus) {
      return;
    }
    event.preventDefault();
    consumedInFocus = true;
    input.focus();
    requestAnimationFrame(() => {
      input.select();
    });
  });
}

function isItemNameDefault(): boolean {
  const marker = getSelectedMarker();
  if (marker) {
    return !marker.displayName || marker.displayName.trim().length === 0;
  }
  const shape = getSelectedShape();
  if (shape) {
    return !shape.displayName || shape.displayName.trim().length === 0;
  }
  return false;
}

function isMarkerLabelDefault(): boolean {
  const marker = getEditableMarker();
  if (!marker || marker.sourceType !== "geonames") {
    return false;
  }
  return !marker.labelName || marker.labelName.trim().length === 0;
}

function isShapeTextDefault(): boolean {
  const shape = getSelectedShape();
  if (!shape || shape.type !== "text") {
    return false;
  }
  const text = (shape.text ?? "").trim();
  return text.length === 0 || /^文字標示\d*$/.test(text);
}

function isCoordLabelDefault(): boolean {
  if (!editingCoordMarker) {
    return false;
  }
  return !editingCoordMarker.labelName || editingCoordMarker.labelName.trim().length === 0;
}

bindFirstClickSelect(itemNameInput, isItemNameDefault);
bindFirstClickSelect(markerLabelInput, isMarkerLabelDefault);
bindFirstClickSelect(shapeTextInput, isShapeTextDefault);
bindFirstClickSelect(coordLabelInput, isCoordLabelDefault);
bindFirstClickSelect(ratioInputA, () => true);
bindFirstClickSelect(ratioInputB, () => true);

function updateMarkerFromControls(): void {
  const marker = getEditableMarker();
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
  if (markerFont) {
    marker.style.fontFamily = markerFont.value;
  }
  if (markerLabelInput && marker.sourceType === "geonames") {
    const value = markerLabelInput.value.trim();
    marker.labelName = value.length > 0 ? value : undefined;
    marker.labelMode = "name";
  }
  renderMarkers();
}

function updateShapeFromControls(): void {
  const shape = getSelectedShape();
  if (!shape) {
    return;
  }
  if (shape.type === "text") {
    if (shapeTextInput) {
      shape.text = shapeTextInput.value.trim() || "文字標示";
    }
    if (shapeTextColor) {
      shape.style.textColor = shapeTextColor.value;
    }
    if (shapeTextFont) {
      shape.style.fontFamily = shapeTextFont.value;
    }
    if (shapeTextSizeSlider) {
      shape.style.textSize = shapeTextSizeSlider.value;
    }
  }
  if (shape.type === "line") {
    if (shapeLineColor) {
      shape.style.strokeColor = shapeLineColor.value;
    }
    if (shapeLineWidthSlider) {
      shape.style.strokeWidth = shapeLineWidthSlider.value;
    }
  }
  if (shape.type === "arrow") {
    if (shapeArrowColor) {
      shape.style.strokeColor = shapeArrowColor.value;
    }
    if (shapeArrowWidthSlider) {
      shape.style.strokeWidth = shapeArrowWidthSlider.value;
    }
  }
  if (shape.type === "area") {
    if (shapeAreaFill) {
      shape.style.fillColor = shapeAreaFill.value;
    }
    if (shapeAreaStroke) {
      shape.style.strokeColor = shapeAreaStroke.value;
    }
    if (shapeAreaOpacitySlider) {
      shape.style.fillOpacity = shapeAreaOpacitySlider.value;
    }
    if (shapeAreaStrokeWidthSlider) {
      shape.style.strokeWidth = shapeAreaStrokeWidthSlider.value;
    }
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
  const defaultIndex = root.dataset.defaultIndex
    ? Math.max(0, Number(root.dataset.defaultIndex))
    : null;
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
    defaultIndex,
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
  if (control.marksValues && control.defaultIndex != null) {
    const idx = Math.min(control.marksValues.length - 1, Math.max(0, control.defaultIndex));
    control.value = control.marksValues[idx];
  } else {
    control.value = initialValue;
  }
  updateSliderUI(control);
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
  if (labelDrag) {
    const marker = selectedMarkers.find((item) => item.id === labelDrag?.markerId);
    if (marker) {
      const current = mapPointFromEvent(event);
      const dx = current.x - labelDrag.startX;
      const dy = current.y - labelDrag.startY;
      marker.style.textOffsetX = labelDrag.startOffsetX + dx;
      marker.style.textOffsetY = labelDrag.startOffsetY + dy;
      renderMarkers();
    }
    return;
  }
  if (markerDrag) {
    const marker = selectedMarkers.find((item) => item.id === markerDrag?.markerId);
    if (marker) {
      const current = mapPointFromEvent(event);
      const dx = current.x - markerDrag.startX;
      const dy = current.y - markerDrag.startY;
      const width = svg?.viewBox.baseVal.width || 1200;
      const height = svg?.viewBox.baseVal.height || 800;
      const [startX, startY] = project(markerDrag.startLon, markerDrag.startLat, width, height);
      const nextX = startX + dx;
      const nextY = startY + dy;
      const [lon, lat] = unproject(nextX, nextY, width, height);
      marker.longitude = lon;
      marker.latitude = lat;
      renderMarkers();
    }
    return;
  }
  if (shapeDrag) {
    const shape = shapes.find((item) => item.id === shapeDrag?.shapeId);
    if (shape) {
      const current = mapPointFromEvent(event);
      const dx = current.x - shapeDrag.startX;
      const dy = current.y - shapeDrag.startY;
      const width = svg?.viewBox.baseVal.width || 1200;
      const height = svg?.viewBox.baseVal.height || 800;
      const [startX, startY] = project(shapeDrag.startLon, shapeDrag.startLat, width, height);
      const nextX = startX + dx;
      const nextY = startY + dy;
      const [lon, lat] = unproject(nextX, nextY, width, height);
      shape.longitude = lon;
      shape.latitude = lat;
      renderMarkers();
    }
    return;
  }
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
  if (labelDrag) {
    if (svg) {
      const draggingLabels = svg.querySelectorAll("text[data-marker=\"label\"][data-dragging=\"true\"]");
      draggingLabels.forEach((label) => label.removeAttribute("data-dragging"));
    }
    labelDrag = null;
    return;
  }
  if (markerDrag) {
    markerDrag = null;
    return;
  }
  if (shapeDrag) {
    shapeDrag = null;
    return;
  }
  if (shapeDrag) {
    shapeDrag = null;
    return;
  }
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
  if (labelDrag) {
    if (svg) {
      const draggingLabels = svg.querySelectorAll("text[data-marker=\"label\"][data-dragging=\"true\"]");
      draggingLabels.forEach((label) => label.removeAttribute("data-dragging"));
    }
    labelDrag = null;
    return;
  }
  if (markerDrag) {
    markerDrag = null;
    return;
  }
  if (shapeDrag) {
    shapeDrag = null;
    return;
  }
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
    lastScaleFit = resizeCanvasToStage().scaleFit;
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
coordButton0?.addEventListener("click", () => handleCoordSearch(coordInput0, resultsEl0));
coordInput0?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleCoordSearch(coordInput0, resultsEl0);
  }
});
coordButton3?.addEventListener("click", () => handleCoordSearch(coordInput3, resultsEl3));
coordInput3?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleCoordSearch(coordInput3, resultsEl3);
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-clear]").forEach((button) => {
  const targetId = button.dataset.clear;
  if (!targetId) {
    return;
  }
  const target = document.getElementById(targetId) as HTMLInputElement | null;
  if (!target) {
    return;
  }
  const syncVisibility = () => {
    const hasValue = target.value.trim().length > 0;
    button.style.visibility = hasValue ? "visible" : "hidden";
    button.style.pointerEvents = hasValue ? "auto" : "none";
    button.tabIndex = hasValue ? 0 : -1;
  };
  syncVisibility();
  target.addEventListener("input", syncVisibility);
  button.addEventListener("click", () => {
    target.value = "";
    target.focus();
    syncVisibility();
  });
});
saveButton?.addEventListener("click", () => handleSave(false));
saveAsButton?.addEventListener("click", () => handleSave(true));
loadButton?.addEventListener("click", handleLoad);
loadButton0?.addEventListener("click", handleLoad);
exportPngButton?.addEventListener("click", () => handleExport("png"));
exportSvgButton?.addEventListener("click", () => handleExport("svg"));
exportPdfButton?.addEventListener("click", () => handleExport("pdf"));
clearMarkersButton?.addEventListener("click", handleClearMarkers);
listOrderSettingsBtn?.addEventListener("mousedown", (event) => {
  event.preventDefault();
  event.stopPropagation();
});
listOrderSettingsBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openOrderDialog();
});
listOrderClose?.addEventListener("click", () => {
  closeOrderDialog();
});
listOrderModal?.addEventListener("click", (event) => {
  if (event.target === listOrderModal) {
    closeOrderDialog();
  }
});

window.mapSchematic?.onMenuAction?.((action) => {
  switch (action) {
    case "project:open":
      handleLoad();
      break;
    case "project:save":
      handleSave(false);
      break;
    case "project:saveAs":
      handleSave(true);
      break;
    case "export:png":
      handleExport("png");
      break;
    case "export:svg":
      handleExport("svg");
      break;
    case "export:pdf":
      handleExport("pdf");
      break;
    default:
      break;
  }
});

hookToolbar();
hookSteps();
attachOrderDragGlobalEvents();
  attachCropInteractions();
  attachMarkerControls();
  attachShapeControls();
  dotSizeSlider = initSlider(markerDotSize, 7, () => {
    updateMarkerFromControls();
  });
  textSizeSlider = initSlider(markerTextSize, 7, () => {
    updateMarkerFromControls();
  });
  shapeTextSizeSlider = initSlider(shapeTextSize, 16, () => {
    updateShapeFromControls();
  });
  shapeLineWidthSlider = initSlider(shapeLineWidth, 2, () => {
    updateShapeFromControls();
  });
  shapeArrowWidthSlider = initSlider(shapeArrowWidth, 2, () => {
    updateShapeFromControls();
  });
  shapeAreaOpacitySlider = initSlider(shapeAreaOpacity, 0.4, () => {
    updateShapeFromControls();
  });
  shapeAreaStrokeWidthSlider = initSlider(shapeAreaStrokeWidth, 2, () => {
    updateShapeFromControls();
  });
  boot();

window.addEventListener("resize", () => {
  syncStageSize();
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
  if (shapeTextSizeSlider) {
    shapeTextSizeSlider.rect = null;
    updateSliderUI(shapeTextSizeSlider);
  }
  if (shapeLineWidthSlider) {
    shapeLineWidthSlider.rect = null;
    updateSliderUI(shapeLineWidthSlider);
  }
  if (shapeArrowWidthSlider) {
    shapeArrowWidthSlider.rect = null;
    updateSliderUI(shapeArrowWidthSlider);
  }
  if (shapeAreaOpacitySlider) {
    shapeAreaOpacitySlider.rect = null;
    updateSliderUI(shapeAreaOpacitySlider);
  }
  if (shapeAreaStrokeWidthSlider) {
    shapeAreaStrokeWidthSlider.rect = null;
    updateSliderUI(shapeAreaStrokeWidthSlider);
  }
});
