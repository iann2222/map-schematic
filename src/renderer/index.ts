export {};

import type { DataPackStatus, GeonamesResult, MapProject } from "./bridge.js";
import {
  createAddObjectCommand,
  createClearObjectsCommand,
  createRemoveObjectCommand,
  createReorderCommand,
  createUpdateObjectCommand,
} from "./editor/commands.js";
import type { EditorCommand } from "./editor/commands.js";
import { EditorCore } from "./editor/editor-core.js";
import { cloneEditorObject } from "./editor/document.js";
import type { EditorDocument, Marker, ShapeItem } from "./editor/types.js";
import { isMarker, isShape } from "./editor/types.js";
import {
  WORLD_BBOX,
  geographicBBoxFromUnwrappedBounds,
  geometryToPath,
  normalizeLongitude,
  project,
  unproject,
  unwrappedLongitudeBounds,
} from "./map/geometry.js";
import {
  buildHillshadeTexture,
  ensureBasemapContainer,
  ensureMapRoot,
  ensureMarkersContainer,
  ensureShapesContainer,
  ensureWrapGroup,
  layerStyleFor,
  loadHillshadeTexture,
} from "./map/rendering-utils.js";
import {
  DEFAULT_PROJECT_CANVAS,
  canvasPixelDimensions,
  fitCanvasToAspectRatio,
} from "./project/canvas.js";
import {
  defaultMarkerStyle,
  defaultShapeStyle,
  labelOffsetScale,
  labelZoomScale,
  shapeStrokeScale,
} from "./overlay/overlay-presentation.js";
import { renderObjectList } from "./overlay/object-list.js";
import { createOverlayRenderer } from "./overlay/overlay-renderer.js";
import { updateMarkerStyles as updateOverlayMarkerStyles } from "./overlay/marker-style-updater.js";
import {
  editorDocumentToProjectObjects,
  mapProjectToEditorDocument,
} from "./project/project-adapter.js";
import { initSlider, setSliderValue, updateSliderUI } from "./ui/slider.js";
import type { SliderControl } from "./ui/slider.js";
import {
  createAppDialogService,
  type AppDialogOptions,
} from "./ui/app-dialog.js";
import { initializeThemePreferences } from "./ui/theme-preferences.js";
import { createAppState, type WorkflowStep } from "./app-state.js";
import { WorkflowController } from "./controllers/workflow-controller.js";
import {
  ProjectController,
  type AppliedProjectSummary,
  type ProjectSaveResult,
} from "./controllers/project-controller.js";
import {
  SearchController,
  type ParsedCoordinates,
} from "./controllers/search-controller.js";
import {
  ExportController,
  type ExportFormat,
} from "./controllers/export-controller.js";
import { AppCommandController } from "./controllers/app-command-controller.js";

type BBox = MapProject["viewport"]["bbox"];
const appState = createAppState();

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
const workspaceStatusIcon = document.querySelector<SVGElement>(
  ".workspace-status-icon",
);
const layoutEl = document.getElementById("layout");
const projectNameEl = document.getElementById("projectName");
const projectStateEl = document.getElementById("projectState");
const projectStateTextEl = document.getElementById("projectStateText");
const workflowStepButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-step-jump]"),
);
const editorWorkspaceTabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-editor-tab]"),
);
const editorTabPanels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-editor-tab-panel]"),
);
const topExportButton = document.getElementById(
  "topExportBtn",
) as HTMLButtonElement | null;
const preferencesButton = document.getElementById(
  "preferencesBtn",
) as HTMLButtonElement | null;
const preferencesModal = document.getElementById(
  "preferencesModal",
) as HTMLDivElement | null;
const preferencesClose = document.getElementById(
  "preferencesClose",
) as HTMLButtonElement | null;
const preferencesDone = document.getElementById(
  "preferencesDone",
) as HTMLButtonElement | null;
const themePreferenceButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-theme-preference]"),
);
const datapackPreferenceState = document.getElementById("datapackPreferenceState");
const datapackPreferenceDetail = document.getElementById("datapackPreferenceDetail");
const datapackUpdateButton = document.getElementById(
  "datapackUpdateBtn",
) as HTMLButtonElement | null;
const datapackUpdateLabel = document.getElementById("datapackUpdateLabel");
const reliefToggle = document.getElementById(
  "reliefToggle",
) as HTMLInputElement | null;
const reliefEffectButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-relief-effect]"),
);
const reliefModeField = document.getElementById("reliefModeField");
const ratioSwapButton = document.getElementById(
  "ratioSwap",
) as HTMLButtonElement | null;
const appToast = document.getElementById("appToast");
const appToastText = document.getElementById("appToastText");
const appDialogModal = document.getElementById(
  "appDialogModal",
) as HTMLDivElement | null;
const appDialogElement = appDialogModal?.querySelector(
  ".app-dialog",
) as HTMLDivElement | null;
const appDialogIcon = document.getElementById("appDialogIcon");
const appDialogEyebrow = document.getElementById("appDialogEyebrow");
const appDialogTitle = document.getElementById("appDialogTitle");
const appDialogMessage = document.getElementById("appDialogMessage");
const appDialogDetail = document.getElementById("appDialogDetail");
const appDialogActions = document.getElementById("appDialogActions");
const appDialog = createAppDialogService({
  modal: appDialogModal,
  dialog: appDialogElement,
  icon: appDialogIcon,
  eyebrow: appDialogEyebrow,
  title: appDialogTitle,
  message: appDialogMessage,
  detail: appDialogDetail,
  actions: appDialogActions,
});
const showAppDialog = (options: AppDialogOptions): Promise<number> =>
  appDialog.show(options);
const showAppNotice = (options: {
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  tone?: "info" | "warning" | "danger";
}): Promise<void> => appDialog.notice(options);
const svg = document.getElementById("map") as SVGSVGElement | null;
const canvas = document.getElementById("basemap") as HTMLCanvasElement | null;
const searchInput0 = document.getElementById(
  "search0",
) as HTMLInputElement | null;
const searchButton0 = document.getElementById(
  "searchBtn0",
) as HTMLButtonElement | null;
const searchInput3 = document.getElementById(
  "search3",
) as HTMLInputElement | null;
const searchButton3 = document.getElementById(
  "searchBtn3",
) as HTMLButtonElement | null;
const coordInput0 = document.getElementById(
  "coord0",
) as HTMLInputElement | null;
const coordButton0 = document.getElementById(
  "coordBtn0",
) as HTMLButtonElement | null;
const coordInput3 = document.getElementById(
  "coord3",
) as HTMLInputElement | null;
const coordButton3 = document.getElementById(
  "coordBtn3",
) as HTMLButtonElement | null;
const resultsEl0 = document.getElementById(
  "results0",
) as HTMLUListElement | null;
const resultsEl3 = document.getElementById(
  "results3",
) as HTMLUListElement | null;
const results3Block = document.getElementById(
  "results3Block",
) as HTMLDivElement | null;
const saveButton = document.getElementById(
  "saveBtn",
) as HTMLButtonElement | null;
const loadButton = document.getElementById(
  "loadBtn",
) as HTMLButtonElement | null;
const saveAsButton = document.getElementById(
  "saveAsBtn",
) as HTMLButtonElement | null;
const clearMarkersButton = document.getElementById(
  "clearMarkers",
) as HTMLButtonElement | null;
const markerDotSize = document.getElementById(
  "markerDotSize",
) as HTMLDivElement | null;
const markerTextSize = document.getElementById(
  "markerTextSize",
) as HTMLDivElement | null;
const markerDotColor = document.getElementById(
  "markerDotColor",
) as HTMLInputElement | null;
const markerTextColor = document.getElementById(
  "markerTextColor",
) as HTMLInputElement | null;
const markerDotHex = document.getElementById(
  "markerDotHex",
) as HTMLInputElement | null;
const markerTextHex = document.getElementById(
  "markerTextHex",
) as HTMLInputElement | null;
const dotColorChip = document.getElementById(
  "dotColorChip",
) as HTMLSpanElement | null;
const textColorChip = document.getElementById(
  "textColorChip",
) as HTMLSpanElement | null;
const markerFont = document.getElementById(
  "markerFont",
) as HTMLSelectElement | null;
const markerLabelInput = document.getElementById(
  "markerLabelInput",
) as HTMLInputElement | null;
const markerCoordsInput = document.getElementById(
  "markerCoordsInput",
) as HTMLInputElement | null;
const shapeTextInput = document.getElementById(
  "shapeTextInput",
) as HTMLInputElement | null;
const shapeTextSize = document.getElementById(
  "shapeTextSize",
) as HTMLDivElement | null;
const shapeTextColor = document.getElementById(
  "shapeTextColor",
) as HTMLInputElement | null;
const shapeTextFont = document.getElementById(
  "shapeTextFont",
) as HTMLSelectElement | null;
const shapeLineWidth = document.getElementById(
  "shapeLineWidth",
) as HTMLDivElement | null;
const shapeLineRotation = document.getElementById(
  "shapeLineRotation",
) as HTMLInputElement | null;
const shapeLineColor = document.getElementById(
  "shapeLineColor",
) as HTMLInputElement | null;
const shapeArrowWidth = document.getElementById(
  "shapeArrowWidth",
) as HTMLDivElement | null;
const shapeArrowRotation = document.getElementById(
  "shapeArrowRotation",
) as HTMLInputElement | null;
const shapeArrowColor = document.getElementById(
  "shapeArrowColor",
) as HTMLInputElement | null;
const shapeAreaFill = document.getElementById(
  "shapeAreaFill",
) as HTMLInputElement | null;
const shapeAreaOpacity = document.getElementById(
  "shapeAreaOpacity",
) as HTMLDivElement | null;
const shapeAreaStroke = document.getElementById(
  "shapeAreaStroke",
) as HTMLInputElement | null;
const shapeAreaStrokeWidth = document.getElementById(
  "shapeAreaStrokeWidth",
) as HTMLDivElement | null;
const markerList = document.getElementById(
  "markerList",
) as HTMLDivElement | null;
const listOrderSettingsBtn = document.getElementById(
  "listOrderSettingsBtn",
) as HTMLButtonElement | null;
const listOrderModal = document.getElementById(
  "listOrderModal",
) as HTMLDivElement | null;
const listOrderList = document.getElementById(
  "listOrderList",
) as HTMLUListElement | null;
const displayOrderList = document.getElementById(
  "displayOrderList",
) as HTMLUListElement | null;
const listOrderClose = document.getElementById(
  "listOrderClose",
) as HTMLButtonElement | null;
const completeModal = document.getElementById(
  "completeModal",
) as HTMLDivElement | null;
const completeExportPng = document.getElementById(
  "completeExportPng",
) as HTMLButtonElement | null;
const completeExportSvg = document.getElementById(
  "completeExportSvg",
) as HTMLButtonElement | null;
const completeExportPdf = document.getElementById(
  "completeExportPdf",
) as HTMLButtonElement | null;
const completeContinue = document.getElementById(
  "completeContinue",
) as HTMLButtonElement | null;
const completeClose = document.getElementById(
  "completeClose",
) as HTMLButtonElement | null;
const exportFrameModal = document.getElementById(
  "exportFrameModal",
) as HTMLDivElement | null;
const exportFrameOptions = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-export-frame]"),
);
const exportFrameClose = document.getElementById(
  "exportFrameClose",
) as HTMLButtonElement | null;
const exportFrameCancel = document.getElementById(
  "exportFrameCancel",
) as HTMLButtonElement | null;
const exportFrameApply = document.getElementById(
  "exportFrameApply",
) as HTMLButtonElement | null;
const coordEditModal = document.getElementById(
  "coordEditModal",
) as HTMLDivElement | null;
const coordLabelInput = document.getElementById(
  "coordLabelInput",
) as HTMLInputElement | null;
const coordEditCancel = document.getElementById(
  "coordEditCancel",
) as HTMLButtonElement | null;
const coordEditSave = document.getElementById(
  "coordEditSave",
) as HTMLButtonElement | null;
const settingsEmpty = document.getElementById("settingsEmpty");
const itemNameRow = document.getElementById("itemNameRow");
const markerDisplayTextRow = document.getElementById("markerDisplayTextRow");
const itemNameInput = document.getElementById(
  "itemNameInput",
) as HTMLInputElement | null;
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
let appToastTimer: number | null = null;
let preferencesPreviousFocus: HTMLElement | null = null;
const toolZoomIn = document.getElementById(
  "toolZoomIn",
) as HTMLButtonElement | null;
const toolZoomOut = document.getElementById(
  "toolZoomOut",
) as HTMLButtonElement | null;
const toolReset = document.getElementById(
  "toolReset",
) as HTMLButtonElement | null;
const undoButton = document.getElementById(
  "undoBtn",
) as HTMLButtonElement | null;
const redoButton = document.getElementById(
  "redoBtn",
) as HTMLButtonElement | null;
const zoomIndicator = document.getElementById("zoomIndicator");
const stepPanels = Array.from(
  document.querySelectorAll<HTMLElement>(".step-panel"),
);
const stepProgress = document.getElementById("stepProgress");
const stepTitle = document.getElementById("stepTitle");
const stepSubtitle = document.getElementById("stepSubtitle");
const prevStepButton = document.getElementById(
  "prevStep",
) as HTMLButtonElement | null;
const nextStepButton = document.getElementById(
  "nextStep",
) as HTMLButtonElement | null;
const ratio169 = document.getElementById(
  "ratio169",
) as HTMLButtonElement | null;
const ratioA4 = document.getElementById("ratioA4") as HTMLButtonElement | null;
const ratioSquare = document.getElementById(
  "ratioSquare",
) as HTMLButtonElement | null;
const ratioFree = document.getElementById(
  "ratioFree",
) as HTMLButtonElement | null;
const ratio43 = document.getElementById("ratio43") as HTMLButtonElement | null;
const ratio34 = document.getElementById("ratio34") as HTMLButtonElement | null;
const ratio916 = document.getElementById(
  "ratio916",
) as HTMLButtonElement | null;
const ratioOriginal = document.getElementById(
  "ratioOriginal",
) as HTMLButtonElement | null;
const ratioInputA = document.getElementById(
  "ratioInputA",
) as HTMLInputElement | null;
const ratioInputB = document.getElementById(
  "ratioInputB",
) as HTMLInputElement | null;
const ratioCustom = document.getElementById(
  "ratioCustom",
) as HTMLButtonElement | null;
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
  ratioCustom,
].filter((btn): btn is HTMLButtonElement => Boolean(btn));
const styleOriginal = document.getElementById(
  "styleOriginal",
) as HTMLButtonElement | null;
const styleDefault = document.getElementById(
  "styleDefault",
) as HTMLButtonElement | null;
const styleMinimal = document.getElementById(
  "styleMinimal",
) as HTMLButtonElement | null;
const styleDark = document.getElementById(
  "styleDark",
) as HTMLButtonElement | null;
const styleOutline = document.getElementById(
  "styleOutline",
) as HTMLButtonElement | null;
const styleSoft = document.getElementById(
  "styleSoft",
) as HTMLButtonElement | null;
const mapStyleHoverPreview = document.getElementById(
  "mapStyleHoverPreview",
) as HTMLDivElement | null;
const mapStyleHoverCanvas = document.getElementById(
  "mapStyleHoverCanvas",
) as HTMLCanvasElement | null;
const mapStage = document.querySelector(".map-stage") as HTMLDivElement | null;
const cropFrame = document.getElementById("cropFrame") as HTMLDivElement | null;
const cropOverlay = document.getElementById(
  "cropOverlay",
) as HTMLDivElement | null;
const cropMaskTop = document.getElementById(
  "cropMaskTop",
) as HTMLDivElement | null;
const cropMaskLeft = document.getElementById(
  "cropMaskLeft",
) as HTMLDivElement | null;
const cropMaskRight = document.getElementById(
  "cropMaskRight",
) as HTMLDivElement | null;
const cropMaskBottom = document.getElementById(
  "cropMaskBottom",
) as HTMLDivElement | null;
const styleButtons = [
  styleOriginal,
  styleDefault,
  styleMinimal,
  styleDark,
  styleOutline,
  styleSoft,
].filter((btn): btn is HTMLButtonElement => Boolean(btn));

const WRAPS = [-1, 0, 1] as const;
const MIN_SCALE = 0.4;
const MAX_SCALE = 12;
const MAX_SCALE_CROP = 50;
const ZOOM_LEVELS = [0.4, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12];
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;
const PNG_EXPORT_SCALE = 2;
const EDITOR_HISTORY_LIMIT = 300;
let cropRatio = MAP_WIDTH / MAP_HEIGHT;
let projectCanvas = { ...DEFAULT_PROJECT_CANVAS };
let ratioMode: "free" | "fixed" = "fixed";
let originalRatio = MAP_WIDTH / MAP_HEIGHT;
let activeRatioId: string | undefined = undefined;
let activeStyleId = "styleOriginal";
let mapLocked = false;
let cropBBox: CropBBox | null = null;
type CropBox = { left: number; top: number; width: number; height: number };
type CropBBox = { x: number; y: number; width: number; height: number };
type CropDrag = {
  mode: "move" | "resize";
  handle?: string;
  startX: number;
  startY: number;
  startBox: CropBox;
};

let cropBox: CropBox | null = null;
let cropDrag: CropDrag | null = null;
let stepOneCropSnapshot: {
  cropBox: CropBox | null;
  cropBBox: CropBBox | null;
  view: { scale: number; tx: number; ty: number };
  lastStageRect: { width: number; height: number } | null;
} | null = null;

const editorCore = new EditorCore(
  { objects: [], listOrderKeys: [], displayOrderKeys: [] },
  { limit: EDITOR_HISTORY_LIMIT, mergeWindowMs: 750 },
);
const editorDocument: EditorDocument = editorCore.document;

function markerObjects(): Marker[] {
  return editorDocument.objects.filter(isMarker);
}

function shapeObjects(): ShapeItem[] {
  return editorDocument.objects.filter(isShape);
}

let selectedMarkerId: string | null = null;
let previewMarker: Marker | null = null;
const preservedProjectObjects: MapProject["objects"] = [];
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
const orderRowAnimations = new WeakMap<HTMLLIElement, Animation>();
let selectedShapeId: string | null = null;
let activeTool: "marker" | "line" | "area" | "text" | "arrow" = "marker";
let hasActiveToolSelection = false;
let manualMarkerCount = 0;
let previewToolMarker: Marker | null = null;
let previewShape: ShapeItem | null = null;
let lastStageRect: { width: number; height: number } | null = null;
let lastScaleFit = 1;
let currentPackVersion = "";
let currentPackId = "";

const view: ViewTransform = { scale: 1, tx: 0, ty: 0 };
let isDragging = false;
let dragStartScreen: { x: number; y: number } | null = null;
let dragStartMap: { x: number; y: number } | null = null;
let dragMode: DragMode = null;
let dragRect: SVGRectElement | null = null;
let labelDrag: LabelDrag | null = null;
let selectedLabelMarkerId: string | null = null;
let markerDrag: MarkerDrag | null = null;
let shapeDrag: ShapeDrag | null = null;
let cachedBasemapLayers: Array<{
  id: string;
  paths: Path2D[];
  pathData: string[];
}> = [];
let basemapBuilt = false;
let worldShift = 0;
let basemapDrawPending = false;
let shiftLocked = false;
let shiftLockValue = 0;
let hillshadeEnabled = false;
type ReliefEffect = "relief-soft" | "relief-natural" | "relief-strong";
const reliefEffectSettings: Record<ReliefEffect, { alpha: number }> = {
  "relief-soft": { alpha: 0.3 },
  "relief-natural": { alpha: 0.46 },
  "relief-strong": { alpha: 0.62 },
};
let hillshadeBlend: ReliefEffect = "relief-natural";
let hillshadeImage: HTMLImageElement | null = null;
let hillshadeTexture: HTMLCanvasElement | null = null;
let hillshadeProjection: string | null = null;
let stylePreviewTimer: number | null = null;
let stylePreviewPointer = { x: 0, y: 0 };
let editingCoordMarker: Marker | null = null;

function syncHistoryControls(): void {
  if (undoButton) {
    undoButton.disabled = !editorCore.canUndo;
  }
  if (redoButton) {
    redoButton.disabled = !editorCore.canRedo;
  }
}

function dispatchEditorCommand(
  command: EditorCommand | null,
  mergeKey?: string,
): boolean {
  const changed = editorCore.dispatch(command, { mergeKey });
  if (!changed) {
    return false;
  }
  syncHistoryControls();
  scheduleProjectDirtyCheck();
  return true;
}

function beginEditorTransaction(): void {
  editorCore.beginTransaction();
}

function commitEditorTransaction(): void {
  if (editorCore.commitTransaction()) {
    syncHistoryControls();
    scheduleProjectDirtyCheck();
  }
}

function cancelEditorTransaction(): void {
  editorCore.cancelTransaction();
}

function refreshEditorAfterHistoryChange(): void {
  if (orderDragSession) {
    cleanupOrderSession("cancel");
  }
  if (!markerObjects().some((marker) => marker.id === selectedMarkerId)) {
    selectedMarkerId = null;
  }
  if (!shapeObjects().some((shape) => shape.id === selectedShapeId)) {
    selectedShapeId = null;
  }
  selectedLabelMarkerId = null;
  previewMarker = null;
  previewToolMarker = null;
  previewShape = null;
  editingCoordMarker = null;
  coordEditModal?.classList.remove("active");
  labelDrag = null;
  markerDrag = null;
  shapeDrag = null;
  svg?.classList.remove("shape-moving");
  cancelEditorTransaction();
  syncOrderKeys();
  syncManualMarkerCount();
  renderMarkers();
  renderMarkerList();
  if (listOrderModal?.classList.contains("active")) {
    renderOrderDialog();
  }
  syncMarkerControls(getSelectedMarker());
  syncShapeControls(getSelectedShape());
  syncItemNameControl();
}

function undoEditorChange(): void {
  if (!editorCore.undo()) {
    return;
  }
  refreshEditorAfterHistoryChange();
  syncHistoryControls();
  scheduleProjectDirtyCheck();
}

function redoEditorChange(): void {
  if (!editorCore.redo()) {
    return;
  }
  refreshEditorAfterHistoryChange();
  syncHistoryControls();
  scheduleProjectDirtyCheck();
}

function resetEditorHistory(): void {
  cancelEditorTransaction();
  editorCore.clearHistory();
  syncHistoryControls();
}

function applyViewTransform(): void {
  if (!svg) {
    return;
  }
  const root = ensureMapRoot(svg);
  root.setAttribute(
    "transform",
    `translate(${view.tx} ${view.ty}) scale(${view.scale})`,
  );
  updateZoomIndicator();
  updateMarkerStyles();
  if (appState.workflow.activeStep === "1" && cropBox) {
    updateCropBBox();
  }
  requestBasemapDraw();
}

function updateZoomIndicator(): void {
  if (!zoomIndicator) {
    return;
  }
  const percent = Math.round(view.scale * 100);
  zoomIndicator.textContent = `${percent}%`;
}

function saveStepOneCropSnapshot(): void {
  if (!mapStage) {
    return;
  }
  if (cropBox) {
    updateCropBBox();
  }
  const rect = mapStage.getBoundingClientRect();
  stepOneCropSnapshot = {
    cropBox: cropBox ? { ...cropBox } : null,
    cropBBox: cropBBox ? { ...cropBBox } : null,
    view: { scale: view.scale, tx: view.tx, ty: view.ty },
    lastStageRect: { width: rect.width, height: rect.height },
  };
}

function restoreStepOneCropSnapshot(): void {
  if (!stepOneCropSnapshot) {
    return;
  }
  cropBox = stepOneCropSnapshot.cropBox
    ? { ...stepOneCropSnapshot.cropBox }
    : null;
  cropBBox = stepOneCropSnapshot.cropBBox
    ? { ...stepOneCropSnapshot.cropBBox }
    : null;
  view.scale = stepOneCropSnapshot.view.scale;
  view.tx = stepOneCropSnapshot.view.tx;
  view.ty = stepOneCropSnapshot.view.ty;
  lastStageRect = stepOneCropSnapshot.lastStageRect
    ? { ...stepOneCropSnapshot.lastStageRect }
    : null;
  applyViewTransform();
  updateWrapTransforms(true);
}

function beforeWorkflowStepChange(
  previousStep: WorkflowStep,
  stepId: WorkflowStep,
): void {
  hideMapStylePreview();
  if (previousStep === "1" && (stepId === "2" || stepId === "3")) {
    saveStepOneCropSnapshot();
  }
  if (
    stepId === "1" &&
    (previousStep === "2" || previousStep === "3") &&
    stepOneCropSnapshot
  ) {
    restoreStepOneCropSnapshot();
  }
  if (stepId === "1" && previousStep === "0") {
    cropBBox = null;
    stepOneCropSnapshot = null;
  }
}

function afterWorkflowStepChange(
  previousStep: WorkflowStep,
  stepId: WorkflowStep,
): void {
  if (cropFrame) {
    cropFrame.classList.toggle("hidden", stepId !== "1");
    cropFrame.classList.toggle("interactive", stepId === "1");
    cropFrame.classList.toggle(
      "fixed",
      stepId === "1" && ratioMode === "fixed",
    );
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
  if (stepId !== "3") {
    labelDrag = null;
    selectedLabelMarkerId = null;
    markerDrag = null;
    shapeDrag = null;
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
  if (previousStep !== stepId && (previousStep === "3" || stepId === "3")) {
    renderMarkers();
  }
}

const workflowController = new WorkflowController({
  state: appState.workflow,
  elements: {
    layout: layoutEl,
    stepButtons: workflowStepButtons,
    stepPanels,
    progress: stepProgress,
    title: stepTitle,
    subtitle: stepSubtitle,
    previousButton: prevStepButton,
    nextButton: nextStepButton,
    editorTabs: editorWorkspaceTabs,
    editorPanels: editorTabPanels,
  },
  beforeStepChange: beforeWorkflowStepChange,
  afterStepChange: afterWorkflowStepChange,
  onComplete: openCompleteDialog,
});

function setActiveStep(stepId: WorkflowStep): void {
  workflowController.setActiveStep(stepId);
}

function setActiveRatioButton(targetId?: string): void {
  activeRatioId = targetId;
  ratioButtons.forEach((button) => {
    button.classList.toggle("active", button.id === targetId);
  });
  if (ratioSwapButton) {
    ratioSwapButton.disabled = targetId === "ratioFree";
  }
}

function setActiveStyleButton(targetId: string): void {
  hideMapStylePreview();
  activeStyleId = targetId;
  styleButtons.forEach((button) => {
    button.classList.toggle("active", button.id === targetId);
  });
  requestBasemapDraw();
}

function normalizeReliefEffect(value?: string): ReliefEffect {
  if (
    value === "relief-soft" ||
    value === "relief-natural" ||
    value === "relief-strong"
  ) {
    return value;
  }
  if (value === "soft-light") {
    return "relief-soft";
  }
  if (value === "multiply") {
    return "relief-strong";
  }
  return "relief-natural";
}

function setReliefMode(enabled: boolean, effect?: string): void {
  hillshadeEnabled = enabled;
  if (enabled) {
    hillshadeBlend = normalizeReliefEffect(effect ?? hillshadeBlend);
  }
  if (reliefToggle) {
    reliefToggle.checked = enabled;
  }
  reliefModeField?.classList.toggle("disabled", !enabled);
  reliefEffectButtons.forEach((button) => {
    const active = enabled && button.dataset.reliefEffect === hillshadeBlend;
    button.disabled = !enabled;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  requestBasemapDraw();
}

function applyCanvasRatio(ratio: number, targetId?: string): void {
  ratioMode = "fixed";
  cropRatio = ratio;
  projectCanvas = fitCanvasToAspectRatio(projectCanvas, ratio);
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
      height: cropBox.height * scaleY,
    };
    clampCropBox(cropBox);
  }
  lastStageRect = rect;
  const stageWidth = Math.max(1, mapStage.clientWidth);
  const stageHeight = Math.max(1, mapStage.clientHeight);
  if (!cropBox) {
    if (ratioMode === "free") {
      cropBox = { left: 0, top: 0, width: stageWidth, height: stageHeight };
    } else {
      let frameWidth = stageWidth;
      let frameHeight = frameWidth / cropRatio;
      if (frameHeight > stageHeight) {
        frameHeight = stageHeight;
        frameWidth = frameHeight * cropRatio;
      }
      const inset = 12;
      frameWidth = Math.max(1, frameWidth - inset * 2);
      frameHeight = Math.max(1, frameHeight - inset * 2);
      const left = (stageWidth - frameWidth) / 2;
      const top = (stageHeight - frameHeight) / 2;
      cropBox = { left, top, width: frameWidth, height: frameHeight };
    }
  } else if (ratioMode === "free") {
    cropBox.left = Math.min(
      Math.max(0, cropBox.left),
      stageWidth - cropBox.width,
    );
    cropBox.top = Math.min(
      Math.max(0, cropBox.top),
      stageHeight - cropBox.height,
    );
  }
  if (cropBox) {
    cropBox.left = Math.min(
      Math.max(0, cropBox.left),
      stageWidth - cropBox.width,
    );
    cropBox.top = Math.min(
      Math.max(0, cropBox.top),
      stageHeight - cropBox.height,
    );
  }
  cropFrame.style.left = `${cropBox.left}px`;
  cropFrame.style.top = `${cropBox.top}px`;
  cropFrame.style.width = `${cropBox.width}px`;
  cropFrame.style.height = `${cropBox.height}px`;
  const minDim = Math.max(36, Math.min(cropBox.width, cropBox.height));
  const stroke = Math.max(0.9, Math.min(1.35, minDim / 260));
  const handleSize = Math.max(6, Math.min(8, minDim / 70));
  cropFrame.style.setProperty("--crop-stroke", `${stroke.toFixed(2)}px`);
  cropFrame.style.setProperty(
    "--crop-handle-size",
    `${handleSize.toFixed(2)}px`,
  );
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
  if (ratioMode === "free" && cropBox.height > 0) {
    cropRatio = cropBox.width / cropBox.height;
    projectCanvas = fitCanvasToAspectRatio(projectCanvas, cropRatio);
  }
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
  const [centerX, centerY] = project(
    center[0],
    center[1],
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  view.tx = MAP_WIDTH / 2 - centerX * view.scale;
  view.ty = MAP_HEIGHT / 2 - centerY * view.scale;
  clampVertical();
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
    stageHeight / (cropBBox.height * scaleFit),
  );
  const scaleCap =
    appState.workflow.activeStep === "2" ||
    appState.workflow.activeStep === "3"
      ? MAX_SCALE_CROP
      : MAX_SCALE;
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
  if (
    (appState.workflow.activeStep !== "2" &&
      appState.workflow.activeStep !== "3") ||
    (!cropBox && !cropBBox)
  ) {
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
    right =
      ((cropBBox.x + cropBBox.width) * view.scale + view.tx) * scaleFit +
      offsetX;
    bottom =
      ((cropBBox.y + cropBBox.height) * view.scale + view.ty) * scaleFit +
      offsetY;
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

function currentExportCropRect(): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  if (!mapStage) {
    return null;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, stageRect.width);
  const stageHeight = Math.max(1, stageRect.height);
  if (cropBBox) {
    const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
    const left = (cropBBox.x * view.scale + view.tx) * scaleFit + offsetX;
    const top = (cropBBox.y * view.scale + view.ty) * scaleFit + offsetY;
    const right =
      ((cropBBox.x + cropBBox.width) * view.scale + view.tx) * scaleFit +
      offsetX;
    const bottom =
      ((cropBBox.y + cropBBox.height) * view.scale + view.ty) * scaleFit +
      offsetY;
    const clampedLeft = Math.max(0, Math.min(left, stageWidth));
    const clampedTop = Math.max(0, Math.min(top, stageHeight));
    const clampedRight = Math.max(0, Math.min(right, stageWidth));
    const clampedBottom = Math.max(0, Math.min(bottom, stageHeight));
    return {
      left: clampedLeft,
      top: clampedTop,
      width: Math.max(1, clampedRight - clampedLeft),
      height: Math.max(1, clampedBottom - clampedTop),
    };
  }
  if (cropBox) {
    return { ...cropBox };
  }
  return {
    left: 0,
    top: 0,
    width: stageWidth,
    height: stageHeight,
  };
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
    y: event.clientY - rect.top,
  };
}

function clampCropBox(box: {
  left: number;
  top: number;
  width: number;
  height: number;
}): void {
  if (!mapStage) {
    return;
  }
  const stageWidth = Math.max(1, mapStage.clientWidth);
  const stageHeight = Math.max(1, mapStage.clientHeight);
  box.width = Math.max(40, Math.min(box.width, stageWidth));
  box.height = Math.max(40, Math.min(box.height, stageHeight));
  box.left = Math.min(Math.max(0, box.left), stageWidth - box.width);
  box.top = Math.min(Math.max(0, box.top), stageHeight - box.height);
}

function attachCropInteractions(): void {
  if (!cropFrame) {
    return;
  }
  cropFrame.addEventListener("wheel", onWheel, { passive: false });
  cropFrame.addEventListener("pointerdown", (event) => {
    if (appState.workflow.activeStep !== "1") {
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
      cropDrag = {
        mode: "resize",
        handle,
        startX: point.x,
        startY: point.y,
        startBox: { ...cropBox },
      };
    } else {
      cropFrame.classList.remove("resizing");
      cropFrame.style.cursor = "move";
      cropDrag = {
        mode: "move",
        startX: point.x,
        startY: point.y,
        startBox: { ...cropBox },
      };
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
        const widthFromDx = handle.includes("w")
          ? start.width - dx
          : start.width + dx;
        const heightFromDy = handle.includes("n")
          ? start.height - dy
          : start.height + dy;
        const widthFromDy = heightFromDy * cropRatio;
        const useWidth =
          Math.abs(dx) >= Math.abs(dy) ? widthFromDx : widthFromDy;
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
    height: cropRect.height,
  };
}

function positionZoomIndicator(): void {
  return;
}

function projectDisplayName(path: string | null): string {
  if (!path) {
    return "未命名地圖";
  }
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || "未命名地圖";
}

function renderProjectHeader(state: {
  path: string | null;
  dirty: boolean;
}): void {
  const hasProjectPath = Boolean(state.path);
  if (projectNameEl) {
    projectNameEl.textContent = projectDisplayName(state.path);
    projectNameEl.setAttribute("title", state.path ?? "未命名地圖");
  }
  projectStateEl?.classList.toggle("dirty", state.dirty);
  projectStateEl?.classList.toggle("new", !hasProjectPath && !state.dirty);
  if (projectStateTextEl) {
    projectStateTextEl.textContent =
      state.dirty || !hasProjectPath ? "尚未儲存" : "已儲存";
  }
}

function showAppToast(
  message: string,
  state: "loading" | "success" | "error" = "success",
  autoHideMs = 2200,
): void {
  if (!appToast || !appToastText) {
    return;
  }
  if (appToastTimer !== null) {
    window.clearTimeout(appToastTimer);
    appToastTimer = null;
  }
  appToastText.textContent = message;
  appToast.classList.remove("loading", "success", "error");
  appToast.classList.add("show", state);
  if (autoHideMs > 0) {
    appToastTimer = window.setTimeout(() => {
      appToast.classList.remove("show");
      appToastTimer = null;
    }, autoHideMs);
  }
}

function syncDatapackPreferences(status: DataPackStatus): void {
  if (!datapackPreferenceState || !datapackPreferenceDetail || !datapackUpdateButton) {
    return;
  }
  const targetLabel = `${status.target.id} ${status.target.version}`;
  const activeLabel = status.active
    ? `${status.active.id} ${status.active.version}`
    : null;
  let buttonLabel = "已是最新版本";
  let enabled = false;

  if (status.availability === "ready") {
    datapackPreferenceState.textContent = "官方資料包已就緒";
    datapackPreferenceDetail.textContent = `${targetLabel} 已安裝，可離線使用。`;
  } else if (status.availability === "updateAvailable") {
    datapackPreferenceState.textContent = "有新版官方資料包可用";
    datapackPreferenceDetail.textContent = `目前使用 ${activeLabel}，可更新至 ${targetLabel}。`;
    buttonLabel = "下載並更新";
    enabled = true;
  } else if (status.availability === "repairRequired") {
    datapackPreferenceState.textContent = "資料包需要修復";
    datapackPreferenceDetail.textContent = activeLabel
      ? `目前可使用 ${activeLabel}；重新下載後會修復 ${targetLabel}。`
      : `${targetLabel} 無法使用，請重新下載官方資料包。`;
    buttonLabel = "重新下載";
    enabled = true;
  } else {
    datapackPreferenceState.textContent = "尚未安裝官方資料包";
    datapackPreferenceDetail.textContent = `首次使用需要下載 ${targetLabel}，完成後即可離線使用。`;
    buttonLabel = "下載資料包";
    enabled = true;
  }

  datapackUpdateButton.disabled = !enabled;
  if (datapackUpdateLabel) {
    datapackUpdateLabel.textContent = buttonLabel;
  }
}

async function refreshDatapackPreferences(): Promise<DataPackStatus | null> {
  if (!window.mapSchematic?.getDatapackStatus) {
    return null;
  }
  try {
    const status = await window.mapSchematic.getDatapackStatus();
    syncDatapackPreferences(status);
    return status;
  } catch {
    if (datapackPreferenceState) {
      datapackPreferenceState.textContent = "無法檢查資料包狀態";
    }
    if (datapackPreferenceDetail) {
      datapackPreferenceDetail.textContent = "請稍後再試，或重新啟動應用程式。";
    }
    if (datapackUpdateButton) {
      datapackUpdateButton.disabled = true;
    }
    if (datapackUpdateLabel) {
      datapackUpdateLabel.textContent = "暫時無法使用";
    }
    return null;
  }
}

async function handleDatapackUpdate(): Promise<void> {
  if (!window.mapSchematic?.updateDatapack || !datapackUpdateButton) {
    return;
  }
  datapackUpdateButton.disabled = true;
  if (datapackUpdateLabel) {
    datapackUpdateLabel.textContent = "正在處理";
  }
  showAppToast("正在下載、驗證並安裝官方資料包…", "loading", 0);
  const result = await window.mapSchematic.updateDatapack();
  if (!result.ok) {
    await refreshDatapackPreferences();
    await showAppDialog({
      eyebrow: "資料包更新失敗",
      title: "無法完成官方資料包更新",
      message: "目前資料包沒有被替換，仍可繼續離線使用。",
      detail: result.error ?? "請確認網路連線後再試一次。",
      tone: "danger",
      buttons: [{ label: "知道了", value: 0, variant: "primary" }],
      defaultValue: 0,
      cancelValue: 0,
    });
    showAppToast("資料包更新失敗", "error");
    return;
  }
  if (result.canceled) {
    if (result.status) {
      syncDatapackPreferences(result.status);
    } else {
      await refreshDatapackPreferences();
    }
    showAppToast("已取消資料包更新", "success");
    return;
  }
  try {
    await reloadDatapackAssets();
  } catch (error) {
    await refreshDatapackPreferences();
    await showAppDialog({
      eyebrow: "資料包已更新",
      title: "資料包已安裝，但畫面重新載入失敗",
      message: "請重新啟動應用程式後再繼續使用。",
      detail: String(error),
      tone: "warning",
      buttons: [{ label: "知道了", value: 0, variant: "primary" }],
      defaultValue: 0,
      cancelValue: 0,
    });
    showAppToast("資料包已更新，請重新啟動應用程式", "error");
    return;
  }
  if (result.status) {
    syncDatapackPreferences(result.status);
  } else {
    await refreshDatapackPreferences();
  }
  showAppToast("官方資料包已更新並套用", "success");
}

function openPreferencesDialog(): void {
  if (!preferencesModal) {
    return;
  }
  preferencesPreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  preferencesModal.classList.add("active");
  void refreshDatapackPreferences();
  window.requestAnimationFrame(() => {
    themePreferenceButtons
      .find((button) => button.classList.contains("active"))
      ?.focus();
  });
}

function closePreferencesDialog(): void {
  if (!preferencesModal?.classList.contains("active")) {
    return;
  }
  preferencesModal.classList.remove("active");
  const previousFocus = preferencesPreviousFocus;
  preferencesPreviousFocus = null;
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
}

function hookSteps(): void {
  workflowController.bind();
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
  ratioSwapButton?.addEventListener("click", () => {
    if (activeRatioId === "ratioFree") {
      return;
    }
    if (activeRatioId === "ratioCustom") {
      if (!ratioInputA || !ratioInputB) {
        return;
      }
      const previousA = ratioInputA.value;
      ratioInputA.value = ratioInputB.value;
      ratioInputB.value = previousA;
      handleRatioInput();
      return;
    }
    const swappedPresetIds: Record<string, string> = {
      ratio43: "ratio34",
      ratio34: "ratio43",
      ratio169: "ratio916",
      ratio916: "ratio169",
    };
    const nextRatio = cropRatio > 0 ? 1 / cropRatio : 1 / originalRatio;
    const nextPresetId = activeRatioId
      ? (swappedPresetIds[activeRatioId] ?? activeRatioId)
      : undefined;
    applyCanvasRatio(nextRatio, nextPresetId);
  });
  ratioInputA?.addEventListener("input", handleRatioInput);
  ratioInputB?.addEventListener("input", handleRatioInput);
  ratioInputA?.addEventListener("focus", () =>
    setActiveRatioButton("ratioCustom"),
  );
  ratioInputB?.addEventListener("focus", () =>
    setActiveRatioButton("ratioCustom"),
  );
  styleButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveStyleButton(button.id));
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      stylePreviewPointer = { x: event.clientX, y: event.clientY };
      scheduleMapStylePreview(button.id);
    });
    button.addEventListener("pointermove", (event) => {
      stylePreviewPointer = { x: event.clientX, y: event.clientY };
      if (mapStyleHoverPreview?.classList.contains("visible")) {
        positionMapStylePreview(event.clientX, event.clientY);
      }
    });
    button.addEventListener("pointerleave", hideMapStylePreview);
    button.addEventListener("focus", () => {
      const rect = button.getBoundingClientRect();
      stylePreviewPointer = { x: rect.right, y: rect.top + rect.height / 2 };
      scheduleMapStylePreview(button.id, 120);
    });
    button.addEventListener("blur", hideMapStylePreview);
  });
  window.addEventListener("blur", hideMapStylePreview);
  window.addEventListener("resize", hideMapStylePreview);
  reliefToggle?.addEventListener("change", () => {
    setReliefMode(reliefToggle.checked, hillshadeBlend);
  });
  reliefEffectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.reliefEffect;
      if (!value) {
        return;
      }
      setReliefMode(true, value);
    });
  });
  document
    .querySelectorAll<HTMLButtonElement>(".tool-select")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool as typeof activeTool | undefined;
        if (tool) {
          setActiveTool(tool);
        }
      });
    });
  document
    .querySelectorAll<HTMLButtonElement>(".tool-add")
    .forEach((button) => {
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
    return {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      scaleFit: 1,
      offsetX: 0,
      offsetY: 0,
    };
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

function paintCachedBasemap(
  ctx: CanvasRenderingContext2D,
  styleId: string,
  wrapShift: number,
  wrapSpan: number,
): void {
  for (let i = -wrapSpan; i <= wrapSpan; i += 1) {
    ctx.save();
    ctx.translate((i + wrapShift) * MAP_WIDTH, 0);
    for (const layer of cachedBasemapLayers) {
      const style = layerStyleFor(styleId, layer.id);
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
}

function paintHillshade(
  ctx: CanvasRenderingContext2D,
  wrapShift: number,
  wrapSpan: number,
): void {
  if (!hillshadeEnabled || !hillshadeTexture) {
    return;
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = reliefEffectSettings[hillshadeBlend].alpha;
  for (let i = -wrapSpan; i <= wrapSpan; i += 1) {
    ctx.save();
    ctx.translate((i + wrapShift) * MAP_WIDTH, 0);
    ctx.drawImage(hillshadeTexture, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.restore();
  }
}

function hideMapStylePreview(): void {
  if (stylePreviewTimer !== null) {
    window.clearTimeout(stylePreviewTimer);
    stylePreviewTimer = null;
  }
  mapStyleHoverPreview?.classList.remove("visible");
  if (mapStyleHoverPreview) {
    mapStyleHoverPreview.hidden = true;
  }
}

function positionMapStylePreview(clientX: number, clientY: number): void {
  if (!mapStyleHoverPreview || mapStyleHoverPreview.hidden) {
    return;
  }
  const gap = 14;
  const edge = 10;
  const rect = mapStyleHoverPreview.getBoundingClientRect();
  let left = clientX + gap;
  let top = clientY - rect.height - gap;
  if (left + rect.width > window.innerWidth - edge) {
    left = clientX - rect.width - gap;
  }
  if (top < edge) {
    top = clientY + gap;
  }
  mapStyleHoverPreview.style.left = `${Math.min(
    window.innerWidth - rect.width - edge,
    Math.max(edge, left),
  )}px`;
  mapStyleHoverPreview.style.top = `${Math.min(
    window.innerHeight - rect.height - edge,
    Math.max(edge, top),
  )}px`;
}

function drawMapStylePreview(styleId: string): boolean {
  if (
    !mapStyleHoverCanvas ||
    !mapStage ||
    cachedBasemapLayers.length === 0
  ) {
    return false;
  }
  const previewWidth = 196;
  const previewHeight = 122;
  const dpr = window.devicePixelRatio || 1;
  mapStyleHoverCanvas.width = Math.round(previewWidth * dpr);
  mapStyleHoverCanvas.height = Math.round(previewHeight * dpr);
  const ctx = mapStyleHoverCanvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const stageWidth = Math.max(1, stageRect.width);
  const stageHeight = Math.max(1, stageRect.height);
  const scaleFit = Math.min(stageWidth / MAP_WIDTH, stageHeight / MAP_HEIGHT);
  const offsetX = (stageWidth - MAP_WIDTH * scaleFit) / 2;
  const offsetY = (stageHeight - MAP_HEIGHT * scaleFit) / 2;
  const previewScale = Math.min(
    previewWidth / stageWidth,
    previewHeight / stageHeight,
  );
  const previewOffsetX = (previewWidth - stageWidth * previewScale) / 2;
  const previewOffsetY = (previewHeight - stageHeight * previewScale) / 2;
  const transformScale = view.scale * scaleFit * previewScale * dpr;
  const transformX =
    (previewOffsetX + (offsetX + view.tx * scaleFit) * previewScale) * dpr;
  const transformY =
    (previewOffsetY + (offsetY + view.ty * scaleFit) * previewScale) * dpr;
  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  const viewWidthMap = stageWidth / Math.max(0.0001, scaleFit * view.scale);
  const wrapSpan = Math.min(
    5,
    Math.max(1, Math.ceil(viewWidthMap / MAP_WIDTH / 2) + 1),
  );

  ctx.clearRect(0, 0, mapStyleHoverCanvas.width, mapStyleHoverCanvas.height);
  ctx.save();
  ctx.setTransform(
    transformScale,
    0,
    0,
    transformScale,
    transformX,
    transformY,
  );
  paintCachedBasemap(ctx, styleId, wrapShift, wrapSpan);
  ctx.restore();
  if (hillshadeEnabled && hillshadeTexture) {
    ctx.save();
    ctx.setTransform(
      transformScale,
      0,
      0,
      transformScale,
      transformX,
      transformY,
    );
    paintHillshade(ctx, wrapShift, wrapSpan);
    ctx.restore();
  }
  return true;
}

function scheduleMapStylePreview(styleId: string, delay = 260): void {
  hideMapStylePreview();
  if (appState.workflow.activeStep !== "2" || !mapStyleHoverPreview) {
    return;
  }
  stylePreviewTimer = window.setTimeout(() => {
    stylePreviewTimer = null;
    if (!drawMapStylePreview(styleId)) {
      return;
    }
    mapStyleHoverPreview.hidden = false;
    positionMapStylePreview(stylePreviewPointer.x, stylePreviewPointer.y);
    requestAnimationFrame(() => {
      mapStyleHoverPreview.classList.add("visible");
    });
  }, delay);
}

function drawBasemap(): void {
  if (!canvas || !svg || cachedBasemapLayers.length === 0) {
    return;
  }
  const {
    width: stageWidth,
    height: stageHeight,
    scaleFit,
    offsetX,
    offsetY,
  } = resizeCanvasToStage();
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
    (offsetY + view.ty * scaleFit) * dpr,
  );
  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  const viewWidthMap = stageWidth / Math.max(0.0001, scaleFit * view.scale);
  const wrapSpan = Math.min(
    5,
    Math.max(1, Math.ceil(viewWidthMap / MAP_WIDTH / 2) + 1),
  );
  paintCachedBasemap(ctx, activeStyleId, wrapShift, wrapSpan);
  ctx.restore();
  if (hillshadeEnabled && hillshadeTexture) {
    ctx.save();
    ctx.setTransform(
      view.scale * scaleFit * dpr,
      0,
      0,
      view.scale * scaleFit * dpr,
      (offsetX + view.tx * scaleFit) * dpr,
      (offsetY + view.ty * scaleFit) * dpr,
    );
    paintHillshade(ctx, wrapShift, wrapSpan);
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
  if (scaledHeight <= height) {
    view.ty = (height - scaledHeight) / 2;
    return;
  }
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

function visibleMapBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (
    cropBBox &&
    (appState.workflow.activeStep === "2" ||
      appState.workflow.activeStep === "3")
  ) {
    return { ...cropBBox };
  }
  if (!mapStage) {
    return null;
  }
  const rect = mapStage.getBoundingClientRect();
  const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
  const left = ((0 - offsetX) / scaleFit - view.tx) / view.scale;
  const top = ((0 - offsetY) / scaleFit - view.ty) / view.scale;
  const right = ((rect.width - offsetX) / scaleFit - view.tx) / view.scale;
  const bottom = ((rect.height - offsetY) / scaleFit - view.ty) / view.scale;
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  };
}

function placeMarkerLabelInsideView(marker: Marker): void {
  const bounds = visibleMapBounds();
  if (!bounds) {
    return;
  }
  const [baseX, y] = project(
    marker.longitude,
    marker.latitude,
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  const centerX = bounds.x + bounds.width / 2;
  const x = baseX + Math.round((centerX - baseX) / MAP_WIDTH) * MAP_WIDTH;
  const leftEdge = bounds.x + bounds.width * 0.22;
  const rightEdge = bounds.x + bounds.width * 0.78;
  const topEdge = bounds.y + bounds.height * 0.22;
  const bottomEdge = bounds.y + bounds.height * 0.78;
  const placeLeft = x > rightEdge;
  marker.style.textOffsetX = placeLeft ? -8 : 8;
  marker.style.textOffsetY = y < topEdge ? 10 : y > bottomEdge ? -6 : -6;
  marker.style.textAnchor = placeLeft ? "end" : "start";
}

function setActiveTool(tool: typeof activeTool): void {
  activeTool = tool;
  hasActiveToolSelection = true;
  document
    .querySelectorAll<HTMLButtonElement>(".tool-select")
    .forEach((button) => {
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
  if (appState.workflow.activeStep !== "3") {
    return;
  }
  activeTool = tool;
  hasActiveToolSelection = true;
  document
    .querySelectorAll<HTMLButtonElement>(".tool-select")
    .forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
  const [lon, lat] = viewCenterLonLat();
  if (tool === "marker") {
    const marker = buildManualMarkerAt({ lon, lat });
    if (hasDuplicateMarker(marker)) {
      return;
    }
    if (
      !dispatchEditorCommand(createAddObjectCommand(editorDocument, marker))
    ) {
      return;
    }
    previewMarker = null;
    previewToolMarker = null;
    selectMarker(marker.id);
    renderMarkers();
    renderMarkerList();
    return;
  }
  if (
    tool === "text" ||
    tool === "line" ||
    tool === "area" ||
    tool === "arrow"
  ) {
    const shape = buildShapeAt(tool, { lon, lat });
    if (hasDuplicateShape(shape)) {
      return;
    }
    if (!dispatchEditorCommand(createAddObjectCommand(editorDocument, shape))) {
      return;
    }
    previewShape = null;
    selectShape(shape.id);
    renderMarkerList();
    return;
  }
}

function syncManualMarkerCount(): void {
  let maxIndex = 0;
  markerObjects().forEach((marker) => {
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
  const width = svg.viewBox.baseVal.width || 1200;
  const height = svg.viewBox.baseVal.height || 800;

  const rawLayers = await window.mapSchematic.getBasemapLayers();
  cachedBasemapLayers = rawLayers.map((layer) => {
    const geojson = JSON.parse(layer.geojson);
    const paths: Path2D[] = [];
    const pathData: string[] = [];
    for (const feature of geojson.features ?? []) {
      const d = geometryToPath(feature.geometry, width, height);
      if (!d) {
        continue;
      }
      paths.push(new Path2D(d));
      pathData.push(d);
    }
    return { id: layer.id, paths, pathData };
  });
  basemapBuilt = true;
  drawBasemap();
}

const overlayRenderer = createOverlayRenderer({
  getState: () => ({
    svg,
    view,
    WRAPS,
    worldShift,
    activeStep: appState.workflow.activeStep,
    selectedMarkerId,
    selectedShapeId,
    selectedLabelMarkerId,
    previewMarker,
    previewToolMarker,
    previewShape,
    labelDrag,
    shapeDrag,
    lastScaleFit,
  }),
  markerObjects,
  shapeObjects,
  getDisplayRankMap,
  markerOverlayKey,
  shapeOverlayKey,
  markerLabelText,
  selectMarker,
  selectShape,
  mapPointFromEvent,
  beginEditorTransaction,
  setSelectedLabelMarkerId: (id: string) => {
    selectedLabelMarkerId = id;
  },
  setMarkerDrag: (drag: MarkerDrag | null) => {
    markerDrag = drag;
  },
  setLabelDrag: (drag: LabelDrag | null) => {
    labelDrag = drag;
  },
  setShapeDrag: (drag: ShapeDrag | null) => {
    shapeDrag = drag;
  },
});
function renderMarkers(): void {
  overlayRenderer.renderMarkers();
}
function renderShapes(): void {
  overlayRenderer.renderShapes();
}
function updateMarkerStyles(): void {
  updateOverlayMarkerStyles({
    svg,
    scale: view.scale,
    activeStep: appState.workflow.activeStep,
    selectedMarkerId,
    labelZoomScale,
    labelOffsetScale,
  });
}

function setPreviewMarker(result: GeonamesResult): void {
  previewMarker = {
    objectKind: "marker",
    id: `preview-${result.id}`,
    layerId: defaultObjectLayerId(),
    name:
      result.nameAlt && result.nameAlt !== result.name
        ? result.nameAlt
        : result.name,
    nameAlt: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    sourceId: String(result.id),
    style: defaultMarkerStyle(),
    sourceType: "geonames",
    labelMode: "name",
    showLabel: true,
    kind: "label",
  };
  placeMarkerLabelInsideView(previewMarker);
  renderMarkers();
  syncMarkerControls(previewMarker);
}

function buildCoordMarker(
  parsed: { lat: number; lon: number },
  idPrefix = "coord",
): Marker {
  const coordsText = `(${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)})`;
  return {
    objectKind: "marker",
    id: `${idPrefix}-${Date.now()}`,
    layerId: defaultObjectLayerId(),
    name: "座標標示",
    nameAlt: coordsText,
    latitude: parsed.lat,
    longitude: parsed.lon,
    sourceId: undefined,
    style: defaultMarkerStyle(),
    sourceType: "coords",
    labelMode: "coords",
    showLabel: true,
    kind: "label",
  };
}

function addMarkerFromCoordsValue(parsed: { lat: number; lon: number }): void {
  const marker = buildCoordMarker(parsed);
  if (hasDuplicateMarker(marker)) {
    return;
  }
  placeMarkerLabelInsideView(marker);
  if (!dispatchEditorCommand(createAddObjectCommand(editorDocument, marker))) {
    return;
  }
  previewMarker = null;
  if (appState.workflow.activeStep === "3") {
    selectMarker(marker.id);
  }
  renderMarkers();
  renderMarkerList();
  if (statusEl) {
    statusEl.textContent = `已新增座標：${marker.name}`;
  }
}

function buildManualMarkerAt(center: { lon: number; lat: number }): Marker {
  manualMarkerCount += 1;
  return {
    objectKind: "marker",
    id: `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    layerId: defaultObjectLayerId(),
    name: `點標示${manualMarkerCount}`,
    latitude: center.lat,
    longitude: normalizeLongitude(center.lon),
    style: defaultMarkerStyle(),
    sourceType: "manual",
    labelMode: "name",
    showLabel: false,
    kind: "point",
  };
}

function buildPreviewMarkerAt(center: { lon: number; lat: number }): Marker {
  return {
    objectKind: "marker",
    id: "preview-tool-marker",
    layerId: defaultObjectLayerId(),
    name: "點標示",
    latitude: center.lat,
    longitude: normalizeLongitude(center.lon),
    style: defaultMarkerStyle(),
    sourceType: "manual",
    labelMode: "name",
    showLabel: false,
    kind: "point",
  };
}

function buildShapeAt(
  type: ShapeItem["type"],
  center: { lon: number; lat: number },
): ShapeItem {
  const size = 140 / Math.max(0.4, view.scale);
  const height = type === "area" ? size * 0.7 : size * 0.4;
  return {
    objectKind: "shape",
    id: `shape-${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    layerId: defaultObjectLayerId(),
    type,
    longitude: normalizeLongitude(center.lon),
    latitude: center.lat,
    width: size,
    height,
    rotation: 0,
    text: type === "text" ? "文字標示" : undefined,
    style: defaultShapeStyle(type),
  };
}

function formatCoords(marker: { latitude: number; longitude: number }): string {
  return `(${marker.latitude.toFixed(4)}, ${marker.longitude.toFixed(4)})`;
}

function markerLabelText(marker: Marker): string {
  const customLabel = marker.labelName?.trim();
  if (customLabel) {
    return customLabel;
  }
  if (marker.sourceType === "coords") {
    return marker.displayName?.trim() || marker.name;
  }
  if (marker.labelMode === "coords") {
    return formatCoords(marker);
  }
  return marker.name;
}

function markerKey(marker: {
  name: string;
  latitude: number;
  longitude: number;
}): string {
  return `${marker.name}|${marker.latitude.toFixed(6)}|${marker.longitude.toFixed(6)}`;
}

function markerListName(marker: Marker): string {
  if (marker.displayName && marker.displayName.trim().length > 0) {
    return marker.displayName.trim();
  }
  if (marker.sourceType === "coords") {
    return marker.labelName?.trim() || marker.name || "座標標示";
  }
  if (marker.kind === "point") {
    return marker.name;
  }
  if (marker.nameAlt && marker.nameAlt !== marker.name) {
    return `${marker.name} / ${marker.nameAlt}`;
  }
  return marker.name;
}

function uniqueNameMap(
  entries: Array<{ key: string; name: string }>,
): Map<string, string> {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  entries.forEach((entry) => {
    const baseName = entry.name.trim() || "標示";
    const next = (counts.get(baseName) ?? 0) + 1;
    counts.set(baseName, next);
    names.set(entry.key, next === 1 ? baseName : `${baseName} (${next})`);
  });
  return names;
}

function uniqueOverlayNameMap(): Map<string, string> {
  const shapeNames = shapeDisplayNameMap();
  return uniqueNameMap([
    ...markerObjects().map((marker) => ({
      key: markerOverlayKey(marker.id),
      name: markerListName(marker),
    })),
    ...shapeObjects().map((shape) => ({
      key: shapeOverlayKey(shape.id),
      name: shapeNames.get(shape.id) ?? "標示",
    })),
  ]);
}

function shapeDefaultName(shape: ShapeItem, index: number): string {
  const shapeTypeLabel: Record<ShapeItem["type"], string> = {
    line: "線段",
    area: "區域",
    text: "文字",
    arrow: "箭頭",
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
    arrow: 0,
  };
  shapeObjects().forEach((shape) => {
    shapeCounters[shape.type] += 1;
    names.set(
      shape.id,
      shape.displayName && shape.displayName.trim().length > 0
        ? shape.displayName.trim()
        : shapeDefaultName(shape, shapeCounters[shape.type]),
    );
  });
  return names;
}

function getOverlayRefs(): OverlayObjectRef[] {
  const refs: OverlayObjectRef[] = [];
  const uniqueNames = uniqueOverlayNameMap();
  const seen = new Set<string>();
  markerObjects().forEach((marker) => {
    const key = markerOverlayKey(marker.id);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    refs.push({
      key,
      kind: "marker",
      id: marker.id,
      name: uniqueNames.get(key) ?? markerListName(marker),
    });
  });
  shapeObjects().forEach((shape) => {
    const key = shapeOverlayKey(shape.id);
    refs.push({
      key,
      kind: "shape",
      id: shape.id,
      name: uniqueNames.get(key) ?? "標示",
    });
  });
  return refs;
}

function syncOrderKeys(): void {
  const refs = getOverlayRefs();
  const valid = new Set(refs.map((item) => item.key));
  const normalize = (source: string[]) =>
    source.filter(
      (key, index) => valid.has(key) && source.indexOf(key) === index,
    );
  const normalizedList = normalize(editorDocument.listOrderKeys);
  const normalizedDisplay = normalize(editorDocument.displayOrderKeys);
  refs.forEach((item) => {
    if (!normalizedList.includes(item.key)) {
      normalizedList.push(item.key);
    }
    if (!normalizedDisplay.includes(item.key)) {
      normalizedDisplay.push(item.key);
    }
  });
  editorDocument.listOrderKeys = normalizedList;
  editorDocument.displayOrderKeys = normalizedDisplay;
}

function getDisplayRankMap(): Map<string, number> {
  syncOrderKeys();
  const rank = new Map<string, number>();
  editorDocument.displayOrderKeys.forEach((key, index) => {
    rank.set(key, index);
  });
  return rank;
}

function shapeKey(shape: {
  type: ShapeItem["type"];
  text?: string;
  latitude: number;
  longitude: number;
}): string {
  return `${shape.type}|${shape.text ?? ""}|${shape.latitude.toFixed(6)}|${shape.longitude.toFixed(6)}`;
}

function hasDuplicateShape(candidate: ShapeItem): boolean {
  const key = shapeKey(candidate);
  return shapeObjects().some((shape) => shapeKey(shape) === key);
}

function hasDuplicateMarker(candidate: {
  name: string;
  latitude: number;
  longitude: number;
}): boolean {
  const key = markerKey(candidate);
  return markerObjects().some((marker) => markerKey(marker) === key);
}

function hasGeonamesMarker(result: GeonamesResult): boolean {
  const sourceId = String(result.id);
  return markerObjects().some(
    (marker) =>
      marker.sourceType === "geonames" &&
      marker.sourceId === sourceId &&
      marker.latitude === result.latitude &&
      marker.longitude === result.longitude,
  );
}

function addMarkerFromGeonames(result: GeonamesResult): void {
  if (hasDuplicateMarker(result)) {
    return;
  }
  const nameLocal = result.nameAlt ?? result.name;
  const nameOriginal = result.name;
  const marker: Marker = {
    objectKind: "marker",
    id: `geo-${result.id}-${Date.now()}`,
    layerId: defaultObjectLayerId(),
    name: nameLocal,
    nameAlt: nameOriginal,
    latitude: result.latitude,
    longitude: result.longitude,
    sourceId: String(result.id),
    style: defaultMarkerStyle(),
    sourceType: "geonames",
    labelMode: "name",
    showLabel: true,
    kind: "label",
  };
  placeMarkerLabelInsideView(marker);
  if (!dispatchEditorCommand(createAddObjectCommand(editorDocument, marker))) {
    return;
  }
  previewMarker = null;
  if (appState.workflow.activeStep === "3") {
    selectMarker(marker.id);
  }
  renderMarkers();
  renderMarkerList();
}

function getSelectedMarker(): Marker | null {
  if (!selectedMarkerId) {
    return null;
  }
  return (
    markerObjects().find((marker) => marker.id === selectedMarkerId) ?? null
  );
}

function getSelectedShape(): ShapeItem | null {
  if (!selectedShapeId) {
    return null;
  }
  return shapeObjects().find((shape) => shape.id === selectedShapeId) ?? null;
}

function getEditableMarker(): Marker | null {
  const selected = getSelectedMarker();
  if (selected) {
    return selected;
  }
  return previewMarker;
}

function updateMarkerObject(
  marker: Marker,
  update: (draft: Marker) => void,
  mergeKey?: string,
): boolean {
  const stored = editorDocument.objects.find(
    (object): object is Marker => isMarker(object) && object.id === marker.id,
  );
  if (!stored) {
    update(marker);
    return true;
  }
  const next = cloneEditorObject(stored) as Marker;
  update(next);
  return dispatchEditorCommand(
    createUpdateObjectCommand(stored, next),
    mergeKey,
  );
}

function updateShapeObject(
  shape: ShapeItem,
  update: (draft: ShapeItem) => void,
  mergeKey?: string,
): boolean {
  const stored = editorDocument.objects.find(
    (object): object is ShapeItem => isShape(object) && object.id === shape.id,
  );
  if (!stored) {
    update(shape);
    return true;
  }
  const next = cloneEditorObject(stored) as ShapeItem;
  update(next);
  return dispatchEditorCommand(
    createUpdateObjectCommand(stored, next),
    mergeKey,
  );
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
    if (markerCoordsInput) {
      markerCoordsInput.value = "";
      markerCoordsInput.disabled = true;
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
    const canEditLabel =
      marker.sourceType === "geonames" || marker.sourceType === "coords";
    markerLabelInput.disabled = !canEditLabel;
    markerLabelInput.value =
      marker.sourceType === "geonames"
        ? (marker.labelName ?? marker.name)
        : marker.sourceType === "coords"
          ? (marker.labelName ?? marker.displayName ?? marker.name)
          : "";
  }
  if (markerCoordsInput) {
    markerCoordsInput.disabled = false;
    markerCoordsInput.value = formatCoords(marker);
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
    if (shapeLineRotation) {
      shapeLineRotation.value = String(shape.rotation ?? 0);
    }
  }
  if (shape.type === "arrow") {
    if (shapeArrowColor) {
      shapeArrowColor.value = shape.style.strokeColor;
    }
    if (shapeArrowWidthSlider) {
      setSliderValue(shapeArrowWidthSlider, shape.style.strokeWidth, true);
    }
    if (shapeArrowRotation) {
      shapeArrowRotation.value = String(shape.rotation ?? 0);
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
  syncShapeColorPalettes();
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
  itemNameRow.style.display = "grid";
  itemNameInput.disabled = false;
  if (marker) {
    itemNameInput.value = marker.displayName ?? markerListName(marker);
    return;
  }
  if (shape) {
    const sameTypeShapes = shapeObjects().filter(
      (item) => item.type === shape.type,
    );
    const index = Math.max(
      1,
      sameTypeShapes.findIndex((item) => item.id === shape.id) + 1,
    );
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
    updateMarkerObject(
      marker,
      (draft) => {
        draft.displayName = value.length > 0 ? value : undefined;
      },
      `item:${marker.id}:name`,
    );
    renderMarkerList();
    return;
  }
  if (shape) {
    updateShapeObject(
      shape,
      (draft) => {
        draft.displayName = value.length > 0 ? value : undefined;
      },
      `item:${shape.id}:name`,
    );
    renderMarkerList();
  }
}

function updateSettingsVisibility(
  marker: Marker | null,
  shape: ShapeItem | null,
): void {
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
  settingsEmpty.style.display = hasMarker || hasShape ? "none" : "flex";
  if (markerDisplayTextRow) {
    const canEditDisplayText =
      marker?.sourceType === "geonames" || marker?.sourceType === "coords";
    markerDisplayTextRow.style.display = canEditDisplayText ? "grid" : "none";
  }
  pointSettings.style.display = hasMarker ? "flex" : "none";
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
  document
    .querySelectorAll<HTMLButtonElement>(
      `.color-swatch[data-color-target="${target}"]`,
    )
    .forEach((swatch) => syncColorSwatch(swatch, color));
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

function syncColorSwatch(swatch: HTMLButtonElement, color: string): void {
  const swatchColor = swatch.dataset.color ?? swatch.dataset.shapeColor ?? "";
  const active = swatchColor.toLowerCase() === color.toLowerCase();
  swatch.classList.toggle("active", active);
  swatch.setAttribute("aria-pressed", String(active));
  swatch.setAttribute(
    "aria-label",
    active ? `目前顏色 ${swatchColor}` : `選擇顏色 ${swatchColor}`,
  );
  swatch.title = swatchColor;
}

function syncWorkspaceStatusIcon(): void {
  const statusText = statusEl?.textContent ?? "";
  const datapackReady =
    statusText.includes("資料包") && statusText.includes("已就緒");
  workspaceStatusIcon?.classList.toggle("ready", datapackReady);
}

function syncPaletteSelection(paletteId: string, color: string): void {
  document
    .querySelectorAll<HTMLButtonElement>(`#${paletteId} .color-swatch`)
    .forEach((swatch) => syncColorSwatch(swatch, color));
}

function syncShapeColorPalettes(): void {
  if (shapeTextColor) {
    syncPaletteSelection("shapeTextPalette", shapeTextColor.value);
  }
  if (shapeLineColor) {
    syncPaletteSelection("shapeLinePalette", shapeLineColor.value);
  }
  if (shapeArrowColor) {
    syncPaletteSelection("shapeArrowPalette", shapeArrowColor.value);
  }
  if (shapeAreaFill) {
    syncPaletteSelection("shapeAreaFillPalette", shapeAreaFill.value);
  }
  if (shapeAreaStroke) {
    syncPaletteSelection("shapeAreaStrokePalette", shapeAreaStroke.value);
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
  if (selectedLabelMarkerId && selectedLabelMarkerId !== markerId) {
    selectedLabelMarkerId = null;
  }
  syncMarkerControls(getSelectedMarker());
  syncItemNameControl();
  updateMarkerStyles();
  renderMarkerList();
  if (markerId) {
    activeTool = "marker";
    hasActiveToolSelection = true;
    document
      .querySelectorAll<HTMLButtonElement>(".tool-select")
      .forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === "marker");
      });
  }
}

function selectShape(shapeId: string | null): void {
  previewToolMarker = null;
  previewShape = null;
  selectedShapeId = shapeId;
  selectedMarkerId = null;
  selectedLabelMarkerId = null;
  previewMarker = null;
  const shape = getSelectedShape();
  syncMarkerControls(null);
  syncShapeControls(shape);
  syncItemNameControl();
  renderMarkers();
  renderMarkerList();
  if (shape) {
    activeTool = shape.type;
    hasActiveToolSelection = true;
    document
      .querySelectorAll<HTMLButtonElement>(".tool-select")
      .forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === shape.type);
      });
  }
}

function clearStepThreeSelection(): void {
  labelDrag = null;
  selectedLabelMarkerId = null;
  selectMarker(null);
  selectShape(null);
  renderMarkers();
}

function isStepThreeBlankTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGSVGElement)) {
    return false;
  }
  if (target === svg) {
    return true;
  }
  return target.matches(
    [
      ".layout",
      ".panel",
      ".panel.card",
      ".step-panel",
      ".tool-panel",
      ".right-panel",
      ".settings-stack",
      ".tool-list",
      ".marker-list",
      ".editor-tab-view",
      ".layers-view",
      ".inspector-header",
      ".inspector-empty",
      ".map-list-panel",
      ".map-wrap",
      ".map-stage",
      ".map-footer",
    ].join(","),
  );
}

function handleStepThreeBlankMouseDown(event: MouseEvent): void {
  if (
    appState.workflow.activeStep !== "3" ||
    event.button !== 0 ||
    (!selectedMarkerId && !selectedShapeId && !selectedLabelMarkerId)
  ) {
    return;
  }
  if (
    event.target instanceof Element &&
    event.target.closest(".inspector-panel")
  ) {
    return;
  }
  if (isStepThreeBlankTarget(event.target)) {
    clearStepThreeSelection();
  }
}

function renderMarkerList(): void {
  if (!markerList) {
    return;
  }
  syncOrderKeys();
  const uniqueNames = uniqueOverlayNameMap();
  const renderedCount = renderObjectList({
    container: markerList,
    orderKeys: editorDocument.listOrderKeys,
    markers: markerObjects(),
    shapes: shapeObjects(),
    selectedMarkerId,
    selectedShapeId,
    displayName: (key, object) =>
      uniqueNames.get(key) ??
      (isMarker(object) ? markerListName(object) : "標示"),
    onSelectMarker: selectMarker,
    onSelectShape: selectShape,
    onDeleteMarker: deleteMarker,
    onDeleteShape: deleteShape,
  });
  if (clearMarkersButton) {
    clearMarkersButton.disabled = renderedCount === 0;
  }
}

const DRAG_START_THRESHOLD = 4;

function isReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function measureOrderRows(
  session: OrderDragSession,
  clientY: number,
): { positions: Map<string, DOMRect>; refNode: Node | null } {
  const positions = new Map<string, DOMRect>();
  let refNode: Node | null = null;
  session.cachedRows.forEach((row) => {
    if (!row.isConnected) {
      return;
    }
    const key = row.dataset.key;
    if (!key) {
      return;
    }
    const rect = row.getBoundingClientRect();
    positions.set(key, rect);
    if (refNode === null && clientY < rect.top + rect.height / 2) {
      refNode = row;
    }
  });
  return { positions, refNode };
}

function animateRowsWithFLIP(
  container: HTMLUListElement,
  before: Map<string, DOMRect>,
  duration = 115,
): void {
  const rows = Array.from(
    container.querySelectorAll<HTMLLIElement>("li.order-item"),
  );
  rows.forEach((row) => {
    orderRowAnimations.get(row)?.cancel();
    if (isReducedMotion()) {
      return;
    }
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
    const animation = row.animate(
      [
        { transform: `translate3d(0, ${deltaY}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
    orderRowAnimations.set(row, animation);
    const clearAnimation = () => {
      if (orderRowAnimations.get(row) === animation) {
        orderRowAnimations.delete(row);
      }
    };
    animation.addEventListener("finish", clearAnimation, { once: true });
    animation.addEventListener("cancel", clearAnimation, { once: true });
  });
}

function latestPointerPosition(event: PointerEvent): {
  clientX: number;
  clientY: number;
} {
  const samples = event.getCoalescedEvents?.() ?? [];
  const latest = samples[samples.length - 1] ?? event;
  return {
    clientX: latest.clientX,
    clientY: latest.clientY,
  };
}

function cancelOrderRowAnimations(container: HTMLUListElement): void {
  container.querySelectorAll<HTMLLIElement>("li.order-item").forEach((row) => {
    orderRowAnimations.get(row)?.cancel();
  });
}

function scheduleDragMove(
  session: OrderDragSession,
  clientX: number,
  clientY: number,
): void {
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

function updateGhostTransform(
  session: OrderDragSession,
  clientX: number,
  clientY: number,
): void {
  if (!session.ghost) {
    return;
  }
  const x = clientX - session.offsetX;
  const y = clientY - session.offsetY;
  session.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function movePlaceholderWithFLIP(
  session: OrderDragSession,
  clientY: number,
): void {
  if (!session.placeholder) {
    return;
  }
  const { container, placeholder } = session;
  const { positions, refNode } = measureOrderRows(session, clientY);
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
  animateRowsWithFLIP(container, positions);
  session.orderChanged = true;
}

function runDragMoveFrame(session: OrderDragSession): void {
  if (orderDragSession !== session) {
    return;
  }
  updateGhostTransform(session, session.queuedClientX, session.queuedClientY);
  movePlaceholderWithFLIP(session, session.queuedClientY);
}

function startDragging(
  session: OrderDragSession,
  clientX: number,
  clientY: number,
): void {
  session.phase = "dragging";
  const { sourceItem, container } = session;
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
  session.cachedRows = Array.from(
    container.querySelectorAll<HTMLLIElement>("li.order-item"),
  );
  updateGhostTransform(session, clientX, clientY);
}

function finalizeOrderCommit(session: OrderDragSession): void {
  const { mode, container } = session;
  const nextOrder = Array.from(
    container.querySelectorAll<HTMLLIElement>("li.order-item"),
  )
    .map((row) => row.dataset.key ?? "")
    .filter((key) => key.length > 0);
  const currentOrder =
    mode === "list"
      ? editorDocument.listOrderKeys
      : editorDocument.displayOrderKeys;
  if (
    !dispatchEditorCommand(createReorderCommand(mode, currentOrder, nextOrder))
  ) {
    return;
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
  cancelOrderRowAnimations(session.container);
  if (session.ghost) {
    if (isReducedMotion()) {
      session.ghost.remove();
    } else {
      session.ghost.style.transition =
        "transform 100ms ease-out, opacity 100ms ease-out";
      session.ghost.style.opacity = "0";
      window.setTimeout(() => session.ghost?.remove(), 110);
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
  const pointer = latestPointerPosition(event);
  if (session.phase === "pending") {
    const dx = pointer.clientX - session.startClientX;
    const dy = pointer.clientY - session.startClientY;
    if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD) {
      startDragging(session, pointer.clientX, pointer.clientY);
      scheduleDragMove(session, pointer.clientX, pointer.clientY);
    }
    return;
  }
  if (session.phase !== "dragging") {
    return;
  }
  scheduleDragMove(session, pointer.clientX, pointer.clientY);
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
  handle: HTMLElement,
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
    orderChanged: false,
  };
  handle.setPointerCapture(event.pointerId);
}

function createOrderItem(
  item: OverlayObjectRef,
  mode: OrderMode,
): HTMLLIElement {
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
  const actions = document.createElement("span");
  actions.className = "order-actions";
  const moveTop = document.createElement("button");
  moveTop.className = "order-jump";
  moveTop.type = "button";
  moveTop.title = "移到最上";
  moveTop.setAttribute("aria-label", "移到最上");
  moveTop.innerHTML =
    '<svg class="icon-double-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"></path><path d="M18 9l-6-6-6 6"></path></svg>';
  const moveBottom = document.createElement("button");
  moveBottom.className = "order-jump";
  moveBottom.type = "button";
  moveBottom.title = "移到最下";
  moveBottom.setAttribute("aria-label", "移到最下");
  moveBottom.innerHTML =
    '<svg class="icon-double-down" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path><path d="M6 15l6 6 6-6"></path></svg>';
  actions.appendChild(moveTop);
  actions.appendChild(moveBottom);
  li.appendChild(handle);
  li.appendChild(name);
  li.appendChild(actions);

  const moveToEdge = (edge: "top" | "bottom") => {
    const current =
      mode === "list"
        ? editorDocument.listOrderKeys
        : editorDocument.displayOrderKeys;
    const base = current.filter((key) => key !== item.key);
    const next = edge === "top" ? [item.key, ...base] : [...base, item.key];
    dispatchEditorCommand(createReorderCommand(mode, current, next));
    renderOrderDialog();
    renderMarkers();
    renderMarkerList();
  };
  moveTop.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    moveToEdge("top");
  });
  moveBottom.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    moveToEdge("bottom");
  });

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
    mode: "list" | "display",
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
  renderList(listOrderList, editorDocument.listOrderKeys, "list");
  renderList(displayOrderList, editorDocument.displayOrderKeys, "display");
}

function openOrderDialog(): void {
  if (!listOrderModal) {
    return;
  }
  renderOrderDialog();
  listOrderModal.classList.add("active");
  window.requestAnimationFrame(() => {
    listOrderModal.querySelector<HTMLElement>("button, [tabindex]")?.focus();
  });
}

function closeOrderDialog(): void {
  cleanupOrderSession("cancel");
  listOrderModal?.classList.remove("active");
}

function openCompleteDialog(): void {
  exportController.openCompleteDialog();
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
  if (
    !dispatchEditorCommand(createRemoveObjectCommand(editorDocument, markerId))
  ) {
    return;
  }
  if (selectedMarkerId === markerId) {
    selectedMarkerId = null;
    syncMarkerControls(null);
    syncItemNameControl();
  }
  renderMarkers();
  renderMarkerList();
}

function unprojectBBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BBox {
  const [minLon, minLat] = unproject(
    box.x,
    box.y + box.height,
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  const [maxLon, maxLat] = unproject(
    box.x + box.width,
    box.y,
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  return geographicBBoxFromUnwrappedBounds(
    Math.min(minLon, maxLon),
    Math.min(minLat, maxLat),
    Math.max(minLon, maxLon),
    Math.max(minLat, maxLat),
  );
}

function clearSearchPreview(): void {
  previewMarker = null;
  renderMarkers();
}

function previewCoordinateMarker(marker: Marker): void {
  placeMarkerLabelInsideView(marker);
  previewMarker = marker;
  renderMarkers();
  syncMarkerControls(marker);
}

const searchController = new SearchController({
  state: appState.search,
  elements: {
    placeInputs: [searchInput0, searchInput3],
    placeButtons: [searchButton0, searchButton3],
    coordinateInputs: [coordInput0, coordInput3],
    coordinateButtons: [coordButton0, coordButton3],
    resultLists: [resultsEl0, resultsEl3],
    stepThreeResultBlock: results3Block,
  },
  getViewCenter: viewCenterLonLat,
  searchGeonames: async (query, limit) =>
    (await window.mapSchematic?.searchGeonames?.(query, limit)) ?? [],
  clearPreview: clearSearchPreview,
  previewGeonames: setPreviewMarker,
  addGeonames: addMarkerFromGeonames,
  hasGeonamesMarker,
  createCoordinatePreview: (coordinates: ParsedCoordinates) => {
    const marker = buildCoordMarker(coordinates, "coord-preview");
    marker.labelMode = "coords";
    return marker;
  },
  previewCoordinate: previewCoordinateMarker,
  addCoordinate: addMarkerFromCoordsValue,
  setStatus,
});

function currentSelectionBBox(): BBox {
  if (!cropBBox && cropBox) {
    updateCropBBox();
  }
  if (cropBBox) {
    return unprojectBBox(cropBBox);
  }
  return {
    west: WORLD_BBOX.minLon,
    south: WORLD_BBOX.minLat,
    east: WORLD_BBOX.maxLon,
    north: WORLD_BBOX.maxLat,
    crossesAntimeridian: false,
  };
}

function defaultObjectLayerId(): string {
  return appState.project.current?.layers[0]?.id ?? "layer-1";
}

function buildProject(): MapProject | null {
  if (!currentPackVersion || !currentPackId) {
    return null;
  }
  syncOrderKeys();
  const now = new Date().toISOString();
  const base = appState.project.current?.createdAt ?? now;
  const currentLayer = appState.project.current?.layers[0];
  const layers = [
    currentLayer
      ? { id: currentLayer.id, name: currentLayer.name }
      : { id: "layer-1", name: "Default" },
  ];
  return {
    ...(appState.project.current ?? {}),
    schemaVersion: "0.7",
    createdAt: base,
    updatedAt: now,
    dataPackVersion: currentPackVersion,
    dataPackId: currentPackId,
    canvas: { ...projectCanvas },
    viewport: {
      bbox: currentSelectionBBox(),
      projection: "EPSG:4326",
    },
    layers,
    objects: editorDocumentToProjectObjects(
      editorDocument,
      preservedProjectObjects,
      defaultObjectLayerId(),
    ),
    history: editorCore.exportHistory(),
    ui: {
      ...(appState.project.current?.ui ?? {}),
      listOrderKeys: [...editorDocument.listOrderKeys],
      displayOrderKeys: [...editorDocument.displayOrderKeys],
      activeStyleId,
      hillshadeEnabled,
      hillshadeBlend,
      ratioMode,
      activeRatioId,
      cropRatio,
      customRatioA: ratioInputA
        ? Number(ratioInputA.value) || undefined
        : undefined,
      customRatioB: ratioInputB
        ? Number(ratioInputB.value) || undefined
        : undefined,
    },
  };
}

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function syncProjectHeader(): void {
  projectController.renderHeader();
}

function syncProjectDirtyState(): void {
  projectController.syncDirtyState();
}

function scheduleProjectDirtyCheck(): void {
  projectController.scheduleDirtyCheck();
}

function setProjectBaseline(project?: MapProject | null): void {
  projectController.setBaseline(project);
}

function applyLoadedProject(loadedProject: MapProject): AppliedProjectSummary {
  projectCanvas = { ...loadedProject.canvas };
  const loadedEditor = mapProjectToEditorDocument(loadedProject);
  editorCore.replaceDocument(loadedEditor.document);
  selectedMarkerId = null;
  selectedShapeId = null;
  selectedLabelMarkerId = null;
  previewMarker = null;
  previewShape = null;
  previewToolMarker = null;
  cropBox = null;
  preservedProjectObjects.splice(
    0,
    preservedProjectObjects.length,
    ...loadedEditor.preservedObjects,
  );
  if (loadedProject.viewport?.bbox) {
    const bbox = loadedProject.viewport.bbox;
    const longitudeBounds = unwrappedLongitudeBounds(bbox);
    const min = project(
      longitudeBounds.west,
      bbox.south,
      MAP_WIDTH,
      MAP_HEIGHT,
    );
    const max = project(
      longitudeBounds.east,
      bbox.north,
      MAP_WIDTH,
      MAP_HEIGHT,
    );
    cropBBox = {
      x: Math.min(min[0], max[0]),
      y: Math.min(min[1], max[1]),
      width: Math.abs(max[0] - min[0]),
      height: Math.abs(max[1] - min[1]),
    };
  }
  const loadedStyleId = loadedProject.ui?.activeStyleId;
  if (
    typeof loadedStyleId === "string" &&
    styleButtons.some((button) => button.id === loadedStyleId)
  ) {
    setActiveStyleButton(loadedStyleId);
  }
  const loadedBlend = loadedProject.ui?.hillshadeBlend;
  setReliefMode(
    loadedProject.ui?.hillshadeEnabled === true,
    typeof loadedBlend === "string" ? loadedBlend : undefined,
  );
  if (
    loadedProject.ui?.ratioMode === "free" ||
    loadedProject.ui?.ratioMode === "fixed"
  ) {
    ratioMode = loadedProject.ui.ratioMode;
  }
  if (
    typeof loadedProject.ui?.cropRatio === "number" &&
    loadedProject.ui.cropRatio > 0
  ) {
    cropRatio = loadedProject.ui.cropRatio;
  }
  if (ratioInputA && typeof loadedProject.ui?.customRatioA === "number") {
    ratioInputA.value = String(loadedProject.ui.customRatioA);
  }
  if (ratioInputB && typeof loadedProject.ui?.customRatioB === "number") {
    ratioInputB.value = String(loadedProject.ui.customRatioB);
  }
  if (
    typeof loadedProject.ui?.activeRatioId === "string" &&
    ratioButtons.some((button) => button.id === loadedProject.ui?.activeRatioId)
  ) {
    setActiveRatioButton(loadedProject.ui.activeRatioId);
  }
  const historyRestored = editorCore.restoreHistory(loadedProject.history);
  if (!historyRestored) {
    resetEditorHistory();
  } else {
    syncHistoryControls();
  }
  syncOrderKeys();
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
  return {
    historyRestored,
    preservedObjectCount: preservedProjectObjects.length,
  };
}

const projectController = new ProjectController({
  state: appState.project,
  buildProject,
  applyLoadedProject,
  getDatapack: () => ({
    id: currentPackId,
    version: currentPackVersion,
  }),
  setStatus,
  renderHeader: renderProjectHeader,
  showDialog: showAppDialog,
  showNotice: showAppNotice,
});

function handleSave(saveAs = false): Promise<ProjectSaveResult | null> {
  return projectController.save(saveAs);
}

function handleSaveBeforeClose(): Promise<void> {
  return projectController.saveBeforeClose();
}

function handleLoad(): Promise<void> {
  return projectController.load();
}

async function renderExportCanvas(exportScale = 1): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} | null> {
  if (!canvas || !svg || !mapStage) {
    return null;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const scaleX = canvas.width / stageRect.width;
  const scaleY = canvas.height / stageRect.height;
  const crop = currentExportCropRect();
  if (!crop) {
    return null;
  }
  const outputSize = canvasPixelDimensions(projectCanvas, exportScale);
  const outWidth = outputSize.width;
  const outHeight = outputSize.height;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const sourceX = crop.left * scaleX;
  const sourceY = crop.top * scaleY;
  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    canvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outWidth,
    outHeight,
  );
  const serializer = new XMLSerializer();
  const svgClone = svg.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("width", String(canvas.width));
  svgClone.setAttribute("height", String(canvas.height));
  const svgString = serializer.serializeToString(svgClone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = url;
    });
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outWidth,
      outHeight,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
  return { canvas: outCanvas, width: outWidth, height: outHeight };
}

function renderExportSvg(): {
  data: string;
  width: number;
  height: number;
} | null {
  if (!svg || !mapStage || cachedBasemapLayers.length === 0) {
    return null;
  }
  const crop = currentExportCropRect();
  if (!crop) {
    return null;
  }
  const stageRect = mapStage.getBoundingClientRect();
  const { scaleFit, offsetX, offsetY } = resizeCanvasToStage();
  if (scaleFit <= 0) {
    return null;
  }

  const viewBoxX = (crop.left - offsetX) / scaleFit;
  const viewBoxY = (crop.top - offsetY) / scaleFit;
  const viewBoxWidth = crop.width / scaleFit;
  const viewBoxHeight = crop.height / scaleFit;
  const outputSize = canvasPixelDimensions(projectCanvas);
  const outputWidth = outputSize.width;
  const outputHeight = outputSize.height;
  const svgNs = "http://www.w3.org/2000/svg";
  const xlinkNs = "http://www.w3.org/1999/xlink";
  const xmlnsNs = "http://www.w3.org/2000/xmlns/";
  const svgClone = svg.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("xmlns", svgNs);
  svgClone.setAttributeNS(xmlnsNs, "xmlns:xlink", xlinkNs);
  svgClone.setAttribute(
    "width",
    projectCanvas.unit === "mm"
      ? `${projectCanvas.width}mm`
      : String(outputWidth),
  );
  svgClone.setAttribute(
    "height",
    projectCanvas.unit === "mm"
      ? `${projectCanvas.height}mm`
      : String(outputHeight),
  );
  svgClone.setAttribute(
    "viewBox",
    `${viewBoxX.toFixed(4)} ${viewBoxY.toFixed(4)} ${viewBoxWidth.toFixed(4)} ${viewBoxHeight.toFixed(4)}`,
  );
  svgClone.setAttribute("preserveAspectRatio", "none");
  svgClone.removeAttribute("class");

  svgClone
    .querySelectorAll('[data-export-ignore="true"], [data-preview="true"]')
    .forEach((element) => element.remove());
  svgClone.querySelectorAll("[data-dragging]").forEach((element) => {
    element.removeAttribute("data-dragging");
  });
  svgClone
    .querySelectorAll<SVGCircleElement>('circle[data-marker="dot"]')
    .forEach((dot) => dot.setAttribute("stroke", "#fff7ed"));

  let defs = svgClone.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(svgNs, "defs");
    svgClone.insertBefore(defs, svgClone.firstChild);
  }
  defs.querySelector("#map-clip")?.remove();
  defs.querySelector("#export-basemap-world")?.remove();

  const root = ensureMapRoot(svgClone);
  root.removeAttribute("clip-path");
  const basemapContainer = ensureBasemapContainer(root);
  basemapContainer.innerHTML = "";
  root.insertBefore(basemapContainer, root.firstChild);

  const worldDefinition = document.createElementNS(svgNs, "g");
  worldDefinition.setAttribute("id", "export-basemap-world");
  for (const layer of cachedBasemapLayers) {
    if (layer.pathData.length === 0) {
      continue;
    }
    const style = layerStyleFor(activeStyleId, layer.id);
    const pathElement = document.createElementNS(svgNs, "path");
    pathElement.setAttribute("d", layer.pathData.join(" "));
    pathElement.setAttribute("fill", style.fill ?? "none");
    pathElement.setAttribute("fill-rule", "evenodd");
    pathElement.setAttribute("stroke", style.stroke ?? "none");
    if (style.stroke && style.stroke !== "none") {
      pathElement.setAttribute(
        "stroke-width",
        String((style.strokeWidth ?? 0.4) / view.scale),
      );
      pathElement.setAttribute("stroke-linejoin", "round");
      pathElement.setAttribute("stroke-linecap", "round");
    }
    worldDefinition.appendChild(pathElement);
  }

  if (hillshadeEnabled && hillshadeTexture) {
    const image = document.createElementNS(svgNs, "image");
    const imageData = hillshadeTexture.toDataURL("image/png");
    image.setAttribute("href", imageData);
    image.setAttributeNS(xlinkNs, "xlink:href", imageData);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", String(MAP_WIDTH));
    image.setAttribute("height", String(MAP_HEIGHT));
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute(
      "opacity",
      String(reliefEffectSettings[hillshadeBlend].alpha),
    );
    image.setAttribute("style", "mix-blend-mode:multiply");
    worldDefinition.appendChild(image);
  }
  defs.appendChild(worldDefinition);

  const wrapShift = shiftLocked ? shiftLockValue : worldShift;
  const viewWidthMap =
    stageRect.width / Math.max(0.0001, scaleFit * view.scale);
  const wrapSpan = Math.min(
    5,
    Math.max(1, Math.ceil(viewWidthMap / MAP_WIDTH / 2) + 1),
  );
  for (let i = -wrapSpan; i <= wrapSpan; i += 1) {
    const use = document.createElementNS(svgNs, "use");
    use.setAttribute("href", "#export-basemap-world");
    use.setAttributeNS(xlinkNs, "xlink:href", "#export-basemap-world");
    use.setAttribute(
      "transform",
      `translate(${(i + wrapShift) * MAP_WIDTH} 0)`,
    );
    basemapContainer.appendChild(use);
  }

  const background = document.createElementNS(svgNs, "rect");
  background.setAttribute("x", viewBoxX.toFixed(4));
  background.setAttribute("y", viewBoxY.toFixed(4));
  background.setAttribute("width", viewBoxWidth.toFixed(4));
  background.setAttribute("height", viewBoxHeight.toFixed(4));
  background.setAttribute("fill", "#0a1020");
  svgClone.insertBefore(background, svgClone.firstChild);

  const serializer = new XMLSerializer();
  const data = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(svgClone)}`;
  return { data, width: outputWidth, height: outputHeight };
}

const exportController = new ExportController({
  state: appState.export,
  elements: {
    completeModal,
    completePngButton: completeExportPng,
    completeSvgButton: completeExportSvg,
    completePdfButton: completeExportPdf,
    completeContinueButton: completeContinue,
    completeCloseButton: completeClose,
    frameModal: exportFrameModal,
    frameOptions: exportFrameOptions,
    frameCloseButton: exportFrameClose,
    frameCancelButton: exportFrameCancel,
    frameApplyButton: exportFrameApply,
  },
  pngScale: PNG_EXPORT_SCALE,
  renderCanvas: renderExportCanvas,
  renderSvg: renderExportSvg,
  setStatus,
  showToast: showAppToast,
  hideToast: () => appToast?.classList.remove("show"),
});

function handleExport(format: ExportFormat): Promise<void> {
  return exportController.export(format);
}

function handleClearMarkers(): void {
  if (!dispatchEditorCommand(createClearObjectsCommand(editorDocument))) {
    return;
  }
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
  if (
    !dispatchEditorCommand(createRemoveObjectCommand(editorDocument, shapeId))
  ) {
    return;
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
  if (
    !coordEditModal ||
    !coordLabelInput ||
    !coordEditSave ||
    !coordEditCancel
  ) {
    return;
  }
  editingCoordMarker = marker;
  coordEditModal.classList.add("active");
  coordLabelInput.value = marker.labelName ?? "";
  window.requestAnimationFrame(() => {
    coordLabelInput.focus();
    coordLabelInput.select();
  });
  const radios = coordEditModal.querySelectorAll<HTMLInputElement>(
    'input[name="coordLabelMode"]',
  );
  radios.forEach((radio) => {
    radio.checked = radio.value === marker.labelMode;
  });
  coordEditSave.onclick = () => {
    const selected = coordEditModal.querySelector<HTMLInputElement>(
      'input[name="coordLabelMode"]:checked',
    );
    updateMarkerObject(marker, (draft) => {
      draft.labelName = coordLabelInput.value.trim() || undefined;
      draft.labelMode = selected?.value === "name" ? "name" : "coords";
    });
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
  const update = (property: string) => {
    const markerId = getEditableMarker()?.id ?? "none";
    updateMarkerFromControls(`marker:${markerId}:${property}`);
  };

  markerLabelInput?.addEventListener("input", () => update("label"));
  markerDotColor?.addEventListener("input", () => {
    syncColorInputs("dot", markerDotColor.value);
    update("dot-color");
  });
  markerTextColor?.addEventListener("input", () => {
    syncColorInputs("text", markerTextColor.value);
    update("text-color");
  });
  markerDotHex?.addEventListener("input", () => {
    const next = normalizeHexColor(markerDotHex.value);
    if (!next || !markerDotColor) {
      return;
    }
    markerDotColor.value = next;
    syncColorInputs("dot", next);
    update("dot-color");
  });
  markerTextHex?.addEventListener("input", () => {
    const next = normalizeHexColor(markerTextHex.value);
    if (!next || !markerTextColor) {
      return;
    }
    markerTextColor.value = next;
    syncColorInputs("text", next);
    update("text-color");
  });
  markerFont?.addEventListener("change", () => update("font"));

  document
    .querySelectorAll<HTMLButtonElement>(".color-swatch")
    .forEach((swatch) => {
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
  const update = (property: string) => {
    const shapeId = getSelectedShape()?.id ?? "none";
    updateShapeFromControls(`shape:${shapeId}:${property}`);
  };
  const bindRotationInput = (input: HTMLInputElement | null): void => {
    input?.addEventListener("input", () => {
      if (!Number.isFinite(input.valueAsNumber)) {
        return;
      }
      const rotation = Math.max(0, Math.min(360, input.valueAsNumber));
      if (rotation !== input.valueAsNumber) {
        input.value = String(rotation);
      }
      update("rotation");
    });
    input?.addEventListener("change", () => {
      if (!Number.isFinite(input.valueAsNumber)) {
        input.value = String(getSelectedShape()?.rotation ?? 0);
      }
    });
  };
  bindRotationInput(shapeLineRotation);
  bindRotationInput(shapeArrowRotation);
  document
    .querySelectorAll<HTMLButtonElement>("[data-rotation-target]")
    .forEach((button) => {
      const targetId = button.dataset.rotationTarget;
      const step = Number(button.dataset.rotationStep);
      const input = targetId
        ? (document.getElementById(targetId) as HTMLInputElement | null)
        : null;
      if (!input || !Number.isFinite(step)) {
        return;
      }
      let repeatDelay: number | null = null;
      let repeatInterval: number | null = null;
      const stopRepeating = (): void => {
        if (repeatDelay !== null) {
          window.clearTimeout(repeatDelay);
          repeatDelay = null;
        }
        if (repeatInterval !== null) {
          window.clearInterval(repeatInterval);
          repeatInterval = null;
        }
      };
      const applyStep = (): void => {
        const current = Number.isFinite(input.valueAsNumber)
          ? input.valueAsNumber
          : (getSelectedShape()?.rotation ?? 0);
        input.value = String(Math.max(0, Math.min(360, current + step)));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        applyStep();
        button.setPointerCapture(event.pointerId);
        repeatDelay = window.setTimeout(() => {
          repeatDelay = null;
          repeatInterval = window.setInterval(applyStep, 75);
        }, 380);
      });
      button.addEventListener("pointerup", stopRepeating);
      button.addEventListener("pointercancel", stopRepeating);
      button.addEventListener("lostpointercapture", stopRepeating);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        if (!event.repeat) {
          applyStep();
        }
      });
    });
  shapeTextInput?.addEventListener("input", () => update("text"));
  shapeTextColor?.addEventListener("input", () => {
    syncShapeColorPalettes();
    update("text-color");
  });
  shapeTextFont?.addEventListener("change", () => update("font"));
  shapeLineColor?.addEventListener("input", () => {
    syncShapeColorPalettes();
    update("line-color");
  });
  shapeArrowColor?.addEventListener("input", () => {
    syncShapeColorPalettes();
    update("arrow-color");
  });
  shapeAreaFill?.addEventListener("input", () => {
    syncShapeColorPalettes();
    update("area-fill");
  });
  shapeAreaStroke?.addEventListener("input", () => {
    syncShapeColorPalettes();
    update("area-stroke");
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-shape-color]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const color = button.dataset.shapeColor;
        const shape = getSelectedShape();
        if (!color || !shape) {
          return;
        }
        const paletteId = button.closest<HTMLElement>(".color-palette")?.id;
        let property: string | null = null;
        if (
          shape.type === "text" &&
          paletteId === "shapeTextPalette" &&
          shapeTextColor
        ) {
          shapeTextColor.value = color;
          property = "text-color";
        }
        if (
          shape.type === "line" &&
          paletteId === "shapeLinePalette" &&
          shapeLineColor
        ) {
          shapeLineColor.value = color;
          property = "line-color";
        }
        if (
          shape.type === "arrow" &&
          paletteId === "shapeArrowPalette" &&
          shapeArrowColor
        ) {
          shapeArrowColor.value = color;
          property = "arrow-color";
        }
        if (shape.type === "area") {
          if (paletteId === "shapeAreaFillPalette" && shapeAreaFill) {
            shapeAreaFill.value = color;
            property = "area-fill";
          }
          if (paletteId === "shapeAreaStrokePalette" && shapeAreaStroke) {
            shapeAreaStroke.value = color;
            property = "area-stroke";
          }
        }
        if (!property) {
          return;
        }
        syncShapeColorPalettes();
        update(property);
      });
    });
}

itemNameInput?.addEventListener("input", () => {
  updateItemNameFromControl();
});

function bindFirstClickSelect(
  input: HTMLInputElement | null,
  isDefault: () => boolean,
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
  return (
    !editingCoordMarker.labelName ||
    editingCoordMarker.labelName.trim().length === 0
  );
}

bindFirstClickSelect(itemNameInput, () => true);
bindFirstClickSelect(markerLabelInput, () => true);
bindFirstClickSelect(shapeTextInput, isShapeTextDefault);
bindFirstClickSelect(shapeLineRotation, () => true);
bindFirstClickSelect(shapeArrowRotation, () => true);
bindFirstClickSelect(coordLabelInput, isCoordLabelDefault);
bindFirstClickSelect(ratioInputA, () => true);
bindFirstClickSelect(ratioInputB, () => true);

function updateMarkerFromControls(mergeKey?: string): void {
  const marker = getEditableMarker();
  if (!marker) {
    return;
  }
  updateMarkerObject(
    marker,
    (draft) => {
      if (dotSizeSlider) {
        draft.style.dotSize = dotSizeSlider.value;
      }
      if (textSizeSlider) {
        draft.style.textSize = textSizeSlider.value;
      }
      if (markerDotColor) {
        draft.style.dotColor = markerDotColor.value;
      }
      if (markerTextColor) {
        draft.style.textColor = markerTextColor.value;
      }
      if (markerFont) {
        draft.style.fontFamily = markerFont.value;
      }
      if (
        markerLabelInput &&
        (draft.sourceType === "geonames" || draft.sourceType === "coords")
      ) {
        const value = markerLabelInput.value.trim();
        draft.labelName = value.length > 0 ? value : undefined;
        draft.labelMode = "name";
      }
    },
    mergeKey,
  );
  renderMarkers();
}

function updateShapeFromControls(mergeKey?: string): void {
  const shape = getSelectedShape();
  if (!shape) {
    return;
  }
  updateShapeObject(
    shape,
    (draft) => {
      if (draft.type === "text") {
        if (shapeTextInput) {
          draft.text = shapeTextInput.value.trim() || "文字標示";
        }
        if (shapeTextColor) {
          draft.style.textColor = shapeTextColor.value;
        }
        if (shapeTextFont) {
          draft.style.fontFamily = shapeTextFont.value;
        }
        if (shapeTextSizeSlider) {
          draft.style.textSize = shapeTextSizeSlider.value;
        }
      }
      if (draft.type === "line") {
        if (shapeLineColor) {
          draft.style.strokeColor = shapeLineColor.value;
        }
        if (shapeLineWidthSlider) {
          draft.style.strokeWidth = shapeLineWidthSlider.value;
        }
        if (
          shapeLineRotation &&
          Number.isFinite(shapeLineRotation.valueAsNumber)
        ) {
          draft.rotation = shapeLineRotation.valueAsNumber;
        }
      }
      if (draft.type === "arrow") {
        if (shapeArrowColor) {
          draft.style.strokeColor = shapeArrowColor.value;
        }
        if (shapeArrowWidthSlider) {
          draft.style.strokeWidth = shapeArrowWidthSlider.value;
        }
        if (
          shapeArrowRotation &&
          Number.isFinite(shapeArrowRotation.valueAsNumber)
        ) {
          draft.rotation = shapeArrowRotation.valueAsNumber;
        }
      }
      if (draft.type === "area") {
        if (shapeAreaFill) {
          draft.style.fillColor = shapeAreaFill.value;
        }
        if (shapeAreaStroke) {
          draft.style.strokeColor = shapeAreaStroke.value;
        }
        if (shapeAreaOpacitySlider) {
          draft.style.fillOpacity = shapeAreaOpacitySlider.value;
        }
        if (shapeAreaStrokeWidthSlider) {
          draft.style.strokeWidth = shapeAreaStrokeWidthSlider.value;
        }
      }
    },
    mergeKey,
  );
  renderMarkers();
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
    y: (screen.y - view.ty) / view.scale,
  };
}

function zoomAt(point: { x: number; y: number }, delta: number): void {
  const prevScale = view.scale;
  const nextScale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, view.scale * delta),
  );
  const scaleRatio = nextScale / prevScale;

  view.tx = point.x - scaleRatio * (point.x - view.tx);
  view.ty = point.y - scaleRatio * (point.y - view.ty);
  view.scale = nextScale;

  clampVertical();
  applyViewTransform();
  updateWrapTransforms(true);
  if (selectedLabelMarkerId) {
    renderMarkers();
  }
  scheduleProjectDirtyCheck();
}

function resetView(): void {
  view.scale = 1;
  view.tx = 0;
  view.ty = 0;
  worldShift = 0;
  shiftLocked = false;
  applyViewTransform();
  updateWrapTransforms(true);
  if (selectedLabelMarkerId) {
    renderMarkers();
  }
  scheduleProjectDirtyCheck();
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
  if (
    appState.workflow.activeStep === "3" &&
    event.button === 0 &&
    event.target === svg
  ) {
    clearStepThreeSelection();
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
    const marker = markerObjects().find(
      (item) => item.id === labelDrag?.markerId,
    );
    if (marker) {
      const current = mapPointFromEvent(event);
      const dx = current.x - labelDrag.startX;
      const dy = current.y - labelDrag.startY;
      const offsetScale = labelOffsetScale(view.scale);
      marker.style.textOffsetX = labelDrag.startOffsetX + dx / offsetScale;
      marker.style.textOffsetY = labelDrag.startOffsetY + dy / offsetScale;
      renderMarkers();
    }
    return;
  }
  if (markerDrag) {
    const marker = markerObjects().find(
      (item) => item.id === markerDrag?.markerId,
    );
    if (marker) {
      const current = mapPointFromEvent(event);
      const dx = current.x - markerDrag.startX;
      const dy = current.y - markerDrag.startY;
      const width = svg?.viewBox.baseVal.width || 1200;
      const height = svg?.viewBox.baseVal.height || 800;
      const [startX, startY] = project(
        markerDrag.startLon,
        markerDrag.startLat,
        width,
        height,
      );
      const nextX = startX + dx;
      const nextY = startY + dy;
      const [lon, lat] = unproject(nextX, nextY, width, height);
      marker.longitude = normalizeLongitude(lon);
      marker.latitude = lat;
      renderMarkers();
    }
    return;
  }
  if (shapeDrag) {
    const shape = shapeObjects().find((item) => item.id === shapeDrag?.shapeId);
    if (shape) {
      const current = mapPointFromEvent(event);
      const dx = current.x - shapeDrag.startX;
      const dy = current.y - shapeDrag.startY;
      const width = svg?.viewBox.baseVal.width || 1200;
      const height = svg?.viewBox.baseVal.height || 800;
      const [startX, startY] = project(
        shapeDrag.startLon,
        shapeDrag.startLat,
        width,
        height,
      );
      const nextX = startX + dx;
      const nextY = startY + dy;
      const [lon, lat] = unproject(nextX, nextY, width, height);
      shape.longitude = normalizeLongitude(lon);
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
    labelDrag = null;
    renderMarkers();
    commitEditorTransaction();
    return;
  }
  if (markerDrag) {
    markerDrag = null;
    commitEditorTransaction();
    return;
  }
  if (shapeDrag) {
    shapeDrag = null;
    svg?.classList.remove("shape-moving");
    commitEditorTransaction();
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
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Math.min(scaleX, scaleY)),
      );
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
      labelDrag = null;
      renderMarkers();
      commitEditorTransaction();
      return;
    }
    if (markerDrag) {
      markerDrag = null;
      commitEditorTransaction();
      return;
    }
    if (shapeDrag) {
      shapeDrag = null;
      svg.classList.remove("shape-moving");
      commitEditorTransaction();
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

async function loadDatapackRelief(): Promise<void> {
  hillshadeTexture = null;
  hillshadeImage = null;
  const relief = await window.mapSchematic?.getRelief?.();
  if (!relief?.path) {
    requestBasemapDraw();
    return;
  }
  hillshadeProjection = relief.projection ?? null;
  const texture = await loadHillshadeTexture(
    relief.path,
    hillshadeProjection,
    MAP_WIDTH,
    MAP_HEIGHT,
  );
  if (texture) {
    hillshadeTexture = texture;
    requestBasemapDraw();
    return;
  }
  const image = new Image();
  hillshadeImage = image;
  image.src = relief.path;
  image.onload = () => {
    if (hillshadeImage !== image) {
      return;
    }
    hillshadeTexture = buildHillshadeTexture({
      image,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      unproject,
    });
    requestBasemapDraw();
  };
  image.onerror = () => {
    if (hillshadeImage === image) {
      hillshadeImage = null;
      requestBasemapDraw();
    }
  };
}

async function reloadDatapackAssets(): Promise<void> {
  const datapack = await window.mapSchematic?.getDatapack?.();
  await loadDatapackRelief();
  basemapBuilt = false;
  cachedBasemapLayers = [];
  await renderBasemap();
  if (!datapack) {
    return;
  }
  currentPackId = datapack.id;
  currentPackVersion = datapack.version;
  scheduleProjectDirtyCheck();
  if (statusEl) {
    statusEl.textContent = `資料包 ${datapack.id} ${datapack.version} 已就緒`;
  }
}

async function boot() {
  if (!statusEl) {
    return;
  }
  syncProjectHeader();
  const ping = window.mapSchematic?.ping?.() ?? "no-bridge";
  statusEl.textContent = `橋接：${ping}。載入資料包中...`;
  try {
    await reloadDatapackAssets();
    renderMarkers();
    renderMarkerList();
    setActiveStyleButton("styleOriginal");
    applyViewTransform();
    updateWrapTransforms(true);
    updateCropFrame();
    positionZoomIndicator();
    setActiveStep("0");
    attachMapInteractions();
    lastScaleFit = resizeCanvasToStage().scaleFit;
    if (currentPackId && currentPackVersion) {
      setProjectBaseline();
    } else {
      statusEl.textContent = "資料包不可用。";
    }
  } catch (err) {
    statusEl.textContent = `載入資料包失敗：${String(err)}`;
  }
}

function hookToolbar(): void {
  function nextZoom(target: number, dir: 1 | -1): number {
    const levels = ZOOM_LEVELS.filter(
      (level) => level >= MIN_SCALE && level <= MAX_SCALE,
    );
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

searchController.bind();
document.addEventListener("mousedown", handleStepThreeBlankMouseDown);
document
  .querySelectorAll<HTMLButtonElement>("[data-clear]")
  .forEach((button) => {
    const targetId = button.dataset.clear;
    if (!targetId) {
      return;
    }
    const target = document.getElementById(targetId) as HTMLInputElement | null;
    const field = button.closest(".search-field") as HTMLElement | null;
    if (!target) {
      return;
    }
    const syncVisibility = () => {
      const hasValue = target.value.trim().length > 0;
      if (field) {
        field.classList.toggle("has-value", hasValue);
      }
      button.style.pointerEvents = hasValue ? "auto" : "none";
      button.tabIndex = hasValue ? 0 : -1;
      button.setAttribute("aria-hidden", hasValue ? "false" : "true");
    };
    syncVisibility();
    target.addEventListener("input", syncVisibility);
    button.addEventListener("click", () => {
      target.value = "";
      target.focus();
      syncVisibility();
    });
  });
saveButton?.addEventListener("click", async () => {
  showAppToast("正在儲存專案…", "loading", 0);
  const result = await handleSave(false);
  if (!result || result.canceled) {
    appToast?.classList.remove("show");
    return;
  }
  showAppToast(
    result.ok ? "專案已儲存" : "專案儲存失敗",
    result.ok ? "success" : "error",
  );
});
saveAsButton?.addEventListener("click", async () => {
  showAppToast("正在另存專案…", "loading", 0);
  const result = await handleSave(true);
  if (!result || result.canceled) {
    appToast?.classList.remove("show");
    return;
  }
  showAppToast(
    result.ok ? "專案已另存" : "專案另存失敗",
    result.ok ? "success" : "error",
  );
});
loadButton?.addEventListener("click", handleLoad);
topExportButton?.addEventListener("click", openCompleteDialog);
preferencesButton?.addEventListener("click", openPreferencesDialog);
preferencesClose?.addEventListener("click", closePreferencesDialog);
preferencesDone?.addEventListener("click", closePreferencesDialog);
datapackUpdateButton?.addEventListener("click", () => {
  void handleDatapackUpdate();
});
preferencesModal?.addEventListener("click", (event) => {
  if (event.target === preferencesModal) {
    closePreferencesDialog();
  }
});
clearMarkersButton?.addEventListener("click", async () => {
  if (editorDocument.objects.length === 0) {
    return;
  }
  const response = await showAppDialog({
    eyebrow: "清除項目",
    title: "清除全部地圖項目？",
    message: `將移除目前的 ${editorDocument.objects.length} 個地圖項目。`,
    detail: "此操作可以使用復原功能還原。",
    tone: "warning",
    buttons: [
      { label: "取消", value: 0, variant: "ghost" },
      { label: "清除全部", value: 1, variant: "danger" },
    ],
    defaultValue: 0,
    cancelValue: 0,
  });
  if (response === 1) {
    handleClearMarkers();
  }
});
undoButton?.addEventListener("click", undoEditorChange);
redoButton?.addEventListener("click", redoEditorChange);
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
appDialogModal?.addEventListener("click", (event) => {
  if (event.target === appDialogModal) {
    appDialog.closeCancel();
  }
});
coordEditModal?.addEventListener("click", (event) => {
  if (event.target === coordEditModal) {
    coordEditCancel?.click();
  }
});
exportController.bind();

function nudgeSelectedObject(event: KeyboardEvent): boolean {
  if (
    appState.workflow.activeStep !== "3" ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    document.querySelector(".modal-backdrop.active")
  ) {
    return false;
  }
  const directions: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const direction = directions[event.key];
  if (!direction || (!selectedMarkerId && !selectedShapeId)) {
    return false;
  }
  const screenStep = event.shiftKey ? 10 : 1;
  const mapStep = screenStep / Math.max(0.001, lastScaleFit * view.scale);
  const width = svg?.viewBox.baseVal.width || MAP_WIDTH;
  const height = svg?.viewBox.baseVal.height || MAP_HEIGHT;
  const move = (longitude: number, latitude: number): [number, number] => {
    const [x, y] = project(longitude, latitude, width, height);
    const [nextLongitude, nextLatitude] = unproject(
      x + direction.x * mapStep,
      y + direction.y * mapStep,
      width,
      height,
    );
    return [
      normalizeLongitude(nextLongitude),
      Math.max(WORLD_BBOX.minLat, Math.min(WORLD_BBOX.maxLat, nextLatitude)),
    ];
  };

  const marker = getSelectedMarker();
  if (marker) {
    const changed = updateMarkerObject(
      marker,
      (draft) => {
        [draft.longitude, draft.latitude] = move(
          draft.longitude,
          draft.latitude,
        );
      },
      `marker:${marker.id}:nudge`,
    );
    if (changed) {
      renderMarkers();
      syncMarkerControls(getSelectedMarker());
    }
    return changed;
  }
  const shape = getSelectedShape();
  if (!shape) {
    return false;
  }
  const changed = updateShapeObject(
    shape,
    (draft) => {
      [draft.longitude, draft.latitude] = move(
        draft.longitude,
        draft.latitude,
      );
    },
    `shape:${shape.id}:nudge`,
  );
  if (changed) {
    renderMarkers();
  }
  return changed;
}

const appCommandController = new AppCommandController({
  getActiveStep: () => appState.workflow.activeStep,
  handleAppDialogKeyDown: (event) => appDialog.handleKeyDown(event),
  isPreferencesOpen: () =>
    preferencesModal?.classList.contains("active") === true,
  closePreferences: closePreferencesDialog,
  handleExportEscape: () => exportController.handleEscape(),
  isOrderDialogOpen: () =>
    listOrderModal?.classList.contains("active") === true,
  closeOrderDialog,
  isCoordinateDialogOpen: () =>
    coordEditModal?.classList.contains("active") === true,
  cancelCoordinateDialog: () => coordEditCancel?.click(),
  isCompletionDialogOpen: () =>
    completeModal?.classList.contains("active") === true,
  undo: undoEditorChange,
  redo: redoEditorChange,
  nudgeSelection: nudgeSelectedObject,
  clearSelection: clearStepThreeSelection,
  deleteSelection: () => {
    if (selectedMarkerId) {
      deleteMarker(selectedMarkerId);
    } else if (selectedShapeId) {
      deleteShape(selectedShapeId);
    }
  },
  loadProject: () => {
    void handleLoad();
  },
  saveProject: (saveAs) => {
    void handleSave(saveAs);
  },
  saveBeforeClose: () => {
    void handleSaveBeforeClose();
  },
  showAbout: () => {
    void showAppNotice({
      eyebrow: "關於",
      title: "Map Schematic",
      message: "離線地圖示意圖製作工具",
      detail: `資料包：${currentPackId || "尚未載入"} ${currentPackVersion}\n資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief`,
      tone: "info",
    });
  },
  exportProject: (format) => {
    void handleExport(format);
  },
  showRequestedDialog: (request) => {
    const { id, ...options } = request;
    void showAppDialog(options).then((response) => {
      window.mapSchematic?.respondToAppDialog?.(id, response);
    });
  },
});
appCommandController.bind();

initializeThemePreferences({ buttons: themePreferenceButtons });
hookToolbar();
hookSteps();
attachOrderDragGlobalEvents();
attachCropInteractions();
attachMarkerControls();
attachShapeControls();
document.addEventListener("click", scheduleProjectDirtyCheck, true);
document.addEventListener("input", scheduleProjectDirtyCheck, true);
document.addEventListener("change", scheduleProjectDirtyCheck, true);
document.addEventListener("pointerup", scheduleProjectDirtyCheck, true);
dotSizeSlider = initSlider(markerDotSize, 7, () => {
  const markerId = getEditableMarker()?.id ?? "none";
  updateMarkerFromControls(`marker:${markerId}:dot-size`);
});
textSizeSlider = initSlider(markerTextSize, 7, () => {
  const markerId = getEditableMarker()?.id ?? "none";
  updateMarkerFromControls(`marker:${markerId}:text-size`);
});
shapeTextSizeSlider = initSlider(shapeTextSize, 7, () => {
  const shapeId = getSelectedShape()?.id ?? "none";
  updateShapeFromControls(`shape:${shapeId}:text-size`);
});
shapeLineWidthSlider = initSlider(shapeLineWidth, 2, () => {
  const shapeId = getSelectedShape()?.id ?? "none";
  updateShapeFromControls(`shape:${shapeId}:line-width`);
});
shapeArrowWidthSlider = initSlider(shapeArrowWidth, 2, () => {
  const shapeId = getSelectedShape()?.id ?? "none";
  updateShapeFromControls(`shape:${shapeId}:arrow-width`);
});
shapeAreaOpacitySlider = initSlider(shapeAreaOpacity, 0.4, () => {
  const shapeId = getSelectedShape()?.id ?? "none";
  updateShapeFromControls(`shape:${shapeId}:area-opacity`);
});
shapeAreaStrokeWidthSlider = initSlider(shapeAreaStrokeWidth, 2, () => {
  const shapeId = getSelectedShape()?.id ?? "none";
  updateShapeFromControls(`shape:${shapeId}:area-stroke-width`);
});
syncHistoryControls();
if (statusEl) {
  new MutationObserver(syncWorkspaceStatusIcon).observe(statusEl, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
syncWorkspaceStatusIcon();
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
