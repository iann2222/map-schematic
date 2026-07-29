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
import {
  EDITOR_HISTORY_LIMIT,
  EditorCore,
} from "./editor/editor-core.js";
import { cloneEditorObject } from "./editor/document.js";
import {
  defaultMarkerStyle,
  defaultShapeStyle,
} from "./editor/defaults.js";
import { markerLabelText } from "./editor/presentation.js";
import type { EditorDocument, Marker, ShapeItem } from "./editor/types.js";
import { isMarker, isShape } from "./editor/types.js";
import {
  WORLD_BBOX,
  geographicBBoxFromUnwrappedBounds,
  normalizeLongitude,
  project,
  unproject,
  unwrappedLongitudeBounds,
} from "./map/geometry.js";
import {
  ensureBasemapContainer,
  ensureMapRoot,
} from "./map/rendering-utils.js";
import {
  canvasPixelDimensions,
} from "./project/canvas.js";
import {
  labelOffsetScale,
  labelZoomScale,
  shapeStrokeScale,
} from "./overlay/overlay-presentation.js";
import { renderObjectList } from "./overlay/object-list.js";
import {
  markerListName,
  markerOrderKey,
  ObjectOrderModel,
  shapeDefaultName,
  shapeOrderKey,
} from "./overlay/object-order-model.js";
import { createOverlayRenderer } from "./overlay/overlay-renderer.js";
import { updateMarkerStyles as updateOverlayMarkerStyles } from "./overlay/marker-style-updater.js";
import {
  editorDocumentToProjectObjects,
  mapProjectToEditorDocument,
} from "./project/project-adapter.js";
import { bindFirstClickSelect } from "./ui/input-selection.js";
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
import {
  OrderDialogController,
  type OrderDialogItem,
  type OrderMode,
} from "./controllers/order-dialog-controller.js";
import { InspectorController } from "./controllers/inspector-controller.js";
import { SelectionController } from "./controllers/selection-controller.js";
import { CropController } from "./controllers/crop-controller.js";
import { MapViewportController } from "./controllers/map-viewport-controller.js";
import { MapInteractionController } from "./controllers/map-interaction-controller.js";
import { MapInitializationController } from "./controllers/map-initialization-controller.js";
import { BasemapRenderer } from "./map/basemap-renderer.js";

type BBox = MapProject["viewport"]["bbox"];
const appState = createAppState();

const statusEl = document.getElementById("status");
const workspaceStatusEl =
  statusEl?.closest<HTMLElement>(".workspace-status") ?? null;
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
let mapLocked = false;

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

const objectOrderModel = new ObjectOrderModel({
  document: editorDocument,
  getMarkers: markerObjects,
  getShapes: shapeObjects,
});

let previewMarker: Marker | null = null;
const preservedProjectObjects: MapProject["objects"] = [];
const selectionState = appState.selection;
let activeTool: "marker" | "line" | "area" | "text" | "arrow" = "marker";
let hasActiveToolSelection = false;
let manualMarkerCount = 0;
let previewToolMarker: Marker | null = null;
let previewShape: ShapeItem | null = null;
let currentPackVersion = "";
let currentPackId = "";
let editingCoordMarker: Marker | null = null;

let cropController: CropController;
let basemapRenderer: BasemapRenderer;
const mapViewport = new MapViewportController({
  svg,
  canvas,
  mapStage,
  zoomIndicator,
  getActiveStep: () => appState.workflow.activeStep,
  getCropBBox: () => cropController?.bbox ?? null,
  requestBasemapDraw: () => basemapRenderer?.requestDraw(),
  updateMarkerStyles,
  onViewChanged: () => {
    if (appState.workflow.activeStep === "1" && cropController?.box) {
      cropController.updateBBox();
    }
  },
  renderMarkers,
  hasSelectedLabel: () => selectionState.labelMarkerId !== null,
  scheduleDirtyCheck: scheduleProjectDirtyCheck,
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,
  wraps: WRAPS,
});
const view = mapViewport.view;

cropController = new CropController({
  view,
  getActiveStep: () => appState.workflow.activeStep,
  resizeCanvasToStage,
  applyViewTransform,
  updateWrapTransforms,
  requestBasemapDraw,
  onWheel: (event) => mapViewport.handleWheel(event, mapLocked),
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,
  maxCropScale: MAX_SCALE_CROP,
});

basemapRenderer = new BasemapRenderer({
  canvas,
  mapStage,
  view,
  getActiveStep: () => appState.workflow.activeStep,
  getWrapShift: () => mapViewport.wrapShift,
  resizeCanvasToStage: () => mapViewport.resizeCanvasToStage(),
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  styleButtons,
  reliefToggle,
  reliefModeField,
  reliefEffectButtons,
  preview: mapStyleHoverPreview,
  previewCanvas: mapStyleHoverCanvas,
});

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
  orderDialogController.cancelActiveDrag();
  selectionController.reconcile();
  previewMarker = null;
  previewToolMarker = null;
  previewShape = null;
  editingCoordMarker = null;
  coordEditModal?.classList.remove("active");
  svg?.classList.remove("shape-moving");
  cancelEditorTransaction();
  syncOrderKeys();
  syncManualMarkerCount();
  renderMarkers();
  renderMarkerList();
  if (orderDialogController.isOpen()) {
    orderDialogController.render();
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
  mapViewport.applyTransform();
}

function saveStepOneCropSnapshot(): void {
  cropController.saveSnapshot();
}

function restoreStepOneCropSnapshot(): void {
  cropController.restoreSnapshot();
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
    cropController.hasSnapshot()
  ) {
    restoreStepOneCropSnapshot();
  }
  if (stepId === "1" && previousStep === "0") {
    cropController.resetForLocationChange();
  }
}

function afterWorkflowStepChange(
  previousStep: WorkflowStep,
  stepId: WorkflowStep,
): void {
  cropController.updateStepPresentation(stepId);
  mapLocked = stepId === "2" || stepId === "3";
  if (svg) {
    svg.classList.remove("dragging", "boxing");
    svg.style.cursor = mapLocked ? "default" : "grab";
  }
  if (stepId === "1") {
    cropController.updateFrame();
  }
  if (stepId === "0") {
    updateWrapTransforms(true);
  }
  if (stepId !== "3") {
    selectionState.labelDrag = null;
    selectionState.labelMarkerId = null;
    selectionState.markerDrag = null;
    selectionState.shapeDrag = null;
  }
  if (stepId === "2" || stepId === "3") {
    cropController.prepareLockedStep(previousStep, stepId);
  }
  cropController.applyMapClip();
  cropController.updateOverlay();
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

function setActiveStyleButton(targetId: string): void {
  basemapRenderer.setActiveStyle(targetId);
}

function setReliefMode(enabled: boolean, effect?: string): void {
  basemapRenderer.setReliefMode(enabled, effect);
}

function updateCropFrame(): void {
  cropController.updateFrame();
}

function syncStageSize(): void {
  mapViewport.syncStageSize();
  updateCropFrame();
  cropController.applyMapClip();
  cropController.updateOverlay();
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
    await mapInitializationController.initialize();
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
  return mapViewport.resizeCanvasToStage();
}

function requestBasemapDraw(): void {
  basemapRenderer.requestDraw();
}

function hideMapStylePreview(): void {
  basemapRenderer.hideStylePreview();
}

function updateWrapTransforms(forceRender = false): void {
  mapViewport.updateWrapTransforms(forceRender);
}

function viewCenterLonLat(): [number, number] {
  return mapViewport.centerLonLat();
}

function visibleMapBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  return mapViewport.visibleMapBounds();
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

const overlayRenderer = createOverlayRenderer({
  getState: () => ({
    svg,
    view,
    WRAPS,
    worldShift: mapViewport.worldShift,
    activeStep: appState.workflow.activeStep,
    selectedMarkerId: selectionState.markerId,
    selectedShapeId: selectionState.shapeId,
    selectedLabelMarkerId: selectionState.labelMarkerId,
    previewMarker,
    previewToolMarker,
    previewShape,
    labelDrag: selectionState.labelDrag,
    shapeDrag: selectionState.shapeDrag,
    lastScaleFit: mapViewport.lastScaleFit,
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
    selectionState.labelMarkerId = id;
  },
  setMarkerDrag: (drag) => {
    selectionState.markerDrag = drag;
  },
  setLabelDrag: (drag) => {
    selectionState.labelDrag = drag;
  },
  setShapeDrag: (drag) => {
    selectionState.shapeDrag = drag;
  },
});
function renderMarkers(): void {
  overlayRenderer.renderMarkers();
}
function updateMarkerStyles(): void {
  updateOverlayMarkerStyles({
    svg,
    scale: view.scale,
    activeStep: appState.workflow.activeStep,
    selectedMarkerId: selectionState.markerId,
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

function markerOverlayKey(markerId: string): string {
  return markerOrderKey(markerId);
}

function shapeOverlayKey(shapeId: string): string {
  return shapeOrderKey(shapeId);
}

function shapeDisplayNameMap(): Map<string, string> {
  return objectOrderModel.shapeNames();
}

function getOverlayRefs(): OrderDialogItem[] {
  return objectOrderModel.items();
}

function syncOrderKeys(): void {
  objectOrderModel.normalize();
}

const orderDialogController = new OrderDialogController({
  elements: {
    triggerButton: listOrderSettingsBtn,
    modal: listOrderModal,
    listOrder: listOrderList,
    displayOrder: displayOrderList,
    closeButton: listOrderClose,
  },
  normalizeOrders: syncOrderKeys,
  getItems: getOverlayRefs,
  getOrder: (mode: OrderMode) =>
    mode === "list"
      ? editorDocument.listOrderKeys
      : editorDocument.displayOrderKeys,
  commitOrder: (mode, order) =>
    dispatchEditorCommand(
      createReorderCommand(
        mode,
        mode === "list"
          ? editorDocument.listOrderKeys
          : editorDocument.displayOrderKeys,
        order,
      ),
    ),
  onOrderChanged: () => {
    renderMarkers();
    renderMarkerList();
  },
});

function getDisplayRankMap(): Map<string, number> {
  return objectOrderModel.displayRanks();
}

function hasDuplicateShape(candidate: ShapeItem): boolean {
  return objectOrderModel.hasDuplicateShape(candidate);
}

function hasDuplicateMarker(candidate: {
  name: string;
  latitude: number;
  longitude: number;
}): boolean {
  return objectOrderModel.hasDuplicateMarker(candidate);
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
  return selectionController.getSelectedMarker();
}

function getSelectedShape(): ShapeItem | null {
  return selectionController.getSelectedShape();
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

const inspectorController = new InspectorController({
  getSelectedMarker,
  getEditableMarker,
  getSelectedShape,
  getShapes: shapeObjects,
  markerListName,
  shapeDefaultName,
  updateMarker: updateMarkerObject,
  updateShape: updateShapeObject,
  renderMapObjects: renderMarkers,
  renderObjectList: renderMarkerList,
});

const selectionController = new SelectionController({
  state: selectionState,
  getActiveStep: () => appState.workflow.activeStep,
  getMarkers: markerObjects,
  getShapes: shapeObjects,
  clearToolPreviews: () => {
    previewToolMarker = null;
    previewShape = null;
  },
  clearMarkerPreview: () => {
    previewMarker = null;
  },
  setActiveTool: (tool) => {
    activeTool = tool;
    hasActiveToolSelection = true;
    document
      .querySelectorAll<HTMLButtonElement>(".tool-select")
      .forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === tool);
      });
  },
  syncMarkerInspector: syncMarkerControls,
  syncShapeInspector: syncShapeControls,
  syncItemName: syncItemNameControl,
  updateMarkerStyles,
  renderMapObjects: renderMarkers,
  renderObjectList: renderMarkerList,
  updateMarker: updateMarkerObject,
  updateShape: updateShapeObject,
  getMapMetrics: () => ({
    scale: view.scale,
    scaleFit: mapViewport.lastScaleFit,
    width: svg?.viewBox.baseVal.width || MAP_WIDTH,
    height: svg?.viewBox.baseVal.height || MAP_HEIGHT,
  }),
  mapPointFromEvent: (event) => mapViewport.mapPointFromEvent(event),
  commitTransaction: commitEditorTransaction,
  hasOpenModal: () => Boolean(document.querySelector(".modal-backdrop.active")),
  mapElement: svg,
});

const mapInteractionController = new MapInteractionController({
  svg,
  viewport: mapViewport,
  isLocked: () => mapLocked,
  clearSelection: () => {
    if (appState.workflow.activeStep === "3") {
      clearStepThreeSelection();
    }
  },
  moveSelectionDrag: (event) => selectionController.moveDrag(event),
  finishSelectionDrag: () => selectionController.finishDrag(),
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,
});

function syncMarkerControls(marker: Marker | null): void {
  inspectorController.syncMarker(marker);
}

function syncShapeControls(shape: ShapeItem | null): void {
  inspectorController.syncShape(shape);
}

function syncItemNameControl(): void {
  inspectorController.syncItemName();
}

function syncWorkspaceStatusIcon(): void {
  const statusText = statusEl?.textContent?.trim() ?? "";
  const datapackReady =
    statusText.includes("資料包") && statusText.includes("已就緒");
  workspaceStatusIcon?.classList.toggle("ready", datapackReady);
  workspaceStatusEl?.setAttribute("data-status-tooltip", statusText);

  requestAnimationFrame(() => {
    if (!statusEl || !workspaceStatusEl) {
      return;
    }
    const hasOverflow =
      statusEl.scrollHeight > statusEl.clientHeight + 1 ||
      statusEl.scrollWidth > statusEl.clientWidth + 1;
    workspaceStatusEl.classList.toggle("has-overflow", hasOverflow);
    if (hasOverflow) {
      statusEl.tabIndex = 0;
      statusEl.setAttribute("aria-label", statusText);
    } else {
      statusEl.removeAttribute("tabindex");
      statusEl.removeAttribute("aria-label");
    }
  });
}

function selectMarker(markerId: string | null): void {
  selectionController.selectMarker(markerId);
}

function selectShape(shapeId: string | null): void {
  selectionController.selectShape(shapeId);
}

function clearStepThreeSelection(): void {
  selectionController.clear();
}

function handleStepThreeBlankMouseDown(event: MouseEvent): void {
  selectionController.handleBlankMouseDown(event);
}

function renderMarkerList(): void {
  if (!markerList) {
    return;
  }
  syncOrderKeys();
  const uniqueNames = new Map(
    objectOrderModel.items().map((item) => [item.key, item.name]),
  );
  const renderedCount = renderObjectList({
    container: markerList,
    orderKeys: editorDocument.listOrderKeys,
    markers: markerObjects(),
    shapes: shapeObjects(),
    selectedMarkerId: selectionState.markerId,
    selectedShapeId: selectionState.shapeId,
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

function openCompleteDialog(): void {
  exportController.openCompleteDialog();
}

function deleteMarker(markerId: string): void {
  if (
    !dispatchEditorCommand(createRemoveObjectCommand(editorDocument, markerId))
  ) {
    return;
  }
  if (selectionState.markerId === markerId) {
    selectionState.markerId = null;
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
  if (!cropController.bbox && cropController.box) {
    cropController.updateBBox();
  }
  if (cropController.bbox) {
    return unprojectBBox(cropController.bbox);
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
    canvas: { ...cropController.projectCanvas },
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
      activeStyleId: basemapRenderer.activeStyleId,
      hillshadeEnabled: basemapRenderer.reliefEnabled,
      hillshadeBlend: basemapRenderer.reliefEffect,
      ...cropController.projectUiState(),
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
  cropController.setProjectCanvas(loadedProject.canvas);
  const loadedEditor = mapProjectToEditorDocument(loadedProject);
  editorCore.replaceDocument(loadedEditor.document);
  selectionState.markerId = null;
  selectionState.shapeId = null;
  selectionState.labelMarkerId = null;
  previewMarker = null;
  previewShape = null;
  previewToolMarker = null;
  cropController.resetBox();
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
    cropController.setBBox({
      x: Math.min(min[0], max[0]),
      y: Math.min(min[1], max[1]),
      width: Math.abs(max[0] - min[0]),
      height: Math.abs(max[1] - min[1]),
    });
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
  cropController.applyProjectUi(loadedProject.ui);
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
  if (cropController.bbox) {
    cropController.zoomToBounds();
    cropController.updateOverlay();
    cropController.applyMapClip();
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
  const crop = cropController.currentExportRect();
  if (!crop) {
    return null;
  }
  const outputSize = canvasPixelDimensions(
    cropController.projectCanvas,
    exportScale,
  );
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
  if (!svg || !mapStage || !basemapRenderer.hasLayers) {
    return null;
  }
  const crop = cropController.currentExportRect();
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
  const outputSize = canvasPixelDimensions(cropController.projectCanvas);
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
    cropController.projectCanvas.unit === "mm"
      ? `${cropController.projectCanvas.width}mm`
      : String(outputWidth),
  );
  svgClone.setAttribute(
    "height",
    cropController.projectCanvas.unit === "mm"
      ? `${cropController.projectCanvas.height}mm`
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
  for (const layer of basemapRenderer.layers) {
    if (layer.pathData.length === 0) {
      continue;
    }
    const style = basemapRenderer.exportStyle(layer.id);
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

  if (basemapRenderer.reliefEnabled && basemapRenderer.hillshadeTexture) {
    const image = document.createElementNS(svgNs, "image");
    const imageData = basemapRenderer.hillshadeTexture.toDataURL("image/png");
    image.setAttribute("href", imageData);
    image.setAttributeNS(xlinkNs, "xlink:href", imageData);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", String(MAP_WIDTH));
    image.setAttribute("height", String(MAP_HEIGHT));
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute(
      "opacity",
      String(basemapRenderer.reliefAlpha),
    );
    image.setAttribute("style", "mix-blend-mode:multiply");
    worldDefinition.appendChild(image);
  }
  defs.appendChild(worldDefinition);

  const wrapShift = mapViewport.wrapShift;
  const wrapSpan = basemapRenderer.exportWrapSpan(stageRect.width, scaleFit);
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
  selectionState.markerId = null;
  selectionState.shapeId = null;
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
  if (selectionState.shapeId === shapeId) {
    selectionState.shapeId = null;
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

function isCoordLabelDefault(): boolean {
  if (!editingCoordMarker) {
    return false;
  }
  return (
    !editingCoordMarker.labelName ||
    editingCoordMarker.labelName.trim().length === 0
  );
}

bindFirstClickSelect(coordLabelInput, isCoordLabelDefault);

function mapPointFromEvent(event: MouseEvent): { x: number; y: number } {
  return mapViewport.mapPointFromEvent(event);
}

async function reloadDatapackAssets(): Promise<void> {
  const datapack = await window.mapSchematic?.getDatapack?.();
  await basemapRenderer.reload();
  if (!datapack) {
    throw new Error("資料包不可用");
  }
  currentPackId = datapack.id;
  currentPackVersion = datapack.version;
  scheduleProjectDirtyCheck();
  if (statusEl) {
    statusEl.textContent = `資料包 ${datapack.id} ${datapack.version} 已就緒`;
  }
}

const mapInitializationController = new MapInitializationController({
  reloadAssets: reloadDatapackAssets,
  prepareFirstReadyState: () => {
    if (!appState.project.current) {
      setActiveStyleButton("styleOriginal");
      setActiveStep("0");
    }
  },
  renderWorkspace: () => {
    renderMarkers();
    renderMarkerList();
  },
  syncViewport: () => {
    applyViewTransform();
    updateWrapTransforms(true);
    updateCropFrame();
    mapViewport.lastScaleFit = resizeCanvasToStage().scaleFit;
  },
  bindInteractions: () => mapInteractionController.bind(),
  commitFirstReadyState: () => {
    if (!appState.project.current) {
      setProjectBaseline();
    }
  },
});

async function boot() {
  if (!statusEl) {
    return;
  }
  syncProjectHeader();
  const ping = window.mapSchematic?.ping?.() ?? "no-bridge";
  statusEl.textContent = `橋接：${ping}。載入資料包中...`;
  try {
    await mapInitializationController.initialize();
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
    mapViewport.zoomToScale(targetScale);
  }

  toolZoomIn?.addEventListener("click", () => {
    const target = nextZoom(view.scale, 1);
    zoomToScale(target);
  });
  toolZoomOut?.addEventListener("click", () => {
    const target = nextZoom(view.scale, -1);
    zoomToScale(target);
  });
  toolReset?.addEventListener("click", () => mapViewport.reset());
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
  return selectionController.nudge(event);
}

function attributionTextForDialog(markdown: string): string {
  return markdown
    .replace(/^#+\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .trim();
}

async function showAttributions(): Promise<void> {
  if (!window.mapSchematic?.getAttributions) {
    await showAppNotice({
      eyebrow: "資料來源與授權",
      title: "無法讀取授權資訊",
      message: "目前執行環境未提供授權檔案。",
      tone: "warning",
    });
    return;
  }
  let result: {
    ok: boolean;
    content?: string;
    error?: string;
  };
  try {
    result = await window.mapSchematic.getAttributions();
  } catch (error) {
    result = { ok: false, error: String(error) };
  }
  if (!result.ok || !result.content) {
    await showAppNotice({
      eyebrow: "資料來源與授權",
      title: "無法讀取授權資訊",
      message: "ATTRIBUTIONS.md 無法載入。",
      detail: result.error,
      tone: "warning",
    });
    return;
  }
  await showAppNotice({
    eyebrow: "資料來源與授權",
    title: "官方資料來源",
    message: "Map Schematic 使用以下資料來源：",
    detail: attributionTextForDialog(result.content),
    tone: "info",
  });
}

async function showAbout(): Promise<void> {
  let version = "未知";
  let shortCommitSha = "unknown";
  let dirty: boolean | null = null;
  try {
    const buildInfo = await window.mapSchematic?.getBuildInfo?.();
    if (buildInfo) {
      version = buildInfo.version;
      shortCommitSha = buildInfo.shortCommitSha;
      dirty = buildInfo.dirty;
    }
  } catch {
    // Runtime and datapack details remain useful without build metadata.
  }
  const commitState = dirty === true
    ? "（包含未提交變更）"
    : dirty === null
      ? "（狀態未知）"
      : "";
  await showAppNotice({
    eyebrow: "關於",
    title: "Map Schematic",
    message: "離線地圖示意圖製作工具",
    detail:
      `資料包：${currentPackId || "尚未載入"} ${currentPackVersion}\n`
      + "資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief\n\n"
      + `版本：${version}\n`
      + `Commit SHA：${shortCommitSha}${commitState}`,
    tone: "info",
  });
}

const appCommandController = new AppCommandController({
  getActiveStep: () => appState.workflow.activeStep,
  handleAppDialogKeyDown: (event) => appDialog.handleKeyDown(event),
  isPreferencesOpen: () =>
    preferencesModal?.classList.contains("active") === true,
  closePreferences: closePreferencesDialog,
  handleExportEscape: () => exportController.handleEscape(),
  isOrderDialogOpen: () => orderDialogController.isOpen(),
  closeOrderDialog: () => orderDialogController.close(),
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
    if (selectionState.markerId) {
      deleteMarker(selectionState.markerId);
    } else if (selectionState.shapeId) {
      deleteShape(selectionState.shapeId);
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
    void showAbout();
  },
  showAttributions: () => {
    void showAttributions();
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
basemapRenderer.bind();
orderDialogController.bind();
cropController.bind();
inspectorController.bind();
document.addEventListener("click", scheduleProjectDirtyCheck, true);
document.addEventListener("input", scheduleProjectDirtyCheck, true);
document.addEventListener("change", scheduleProjectDirtyCheck, true);
document.addEventListener("pointerup", scheduleProjectDirtyCheck, true);
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
  syncWorkspaceStatusIcon();
  syncStageSize();
  updateCropFrame();
  requestBasemapDraw();
  inspectorController.resize();
});
