export { };

import { ProjectSnapshot } from "./project/project-snapshot.js";
import { createObjectController } from "./controllers/object-controller.js";
import { createPreferencesController } from "./controllers/preferences-controller.js";
import { createExportRenderer } from "./export/export-renderer.js";

import type { MapProject } from "./bridge.js";
import { createReorderCommand } from "./editor/commands.js";
import {
  EDITOR_HISTORY_LIMIT,
  EditorCore,
} from "./editor/editor-core.js";
import { markerLabelText } from "./editor/presentation.js";
import type { EditorDocument, Marker, ShapeItem } from "./editor/types.js";
import { isMarker, isShape } from "./editor/types.js";
import {
  labelOffsetScale,
  labelZoomScale,
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
  createAppDialogService,
  type AppDialogOptions,
} from "./ui/app-dialog.js";
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
let appToastTimer: number | null = null;
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

const selectionState = appState.selection;

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
  onWheel: (event) => mapViewport.handleWheel(event, appState.workflow.activeStep === "2" || appState.workflow.activeStep === "3"),
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,
  maxCropScale: MAX_SCALE_CROP,
  onProjectChanged: scheduleProjectDirtyCheck,
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
  onProjectChanged: scheduleProjectDirtyCheck,
});

const projectSnapshot = new ProjectSnapshot({
  state: appState.project, core: editorCore, crop: cropController, basemap: basemapRenderer,
  getDatapack: () => appState.datapack, styleIds: styleButtons.map((button) => button.id),
  mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
});
const objectController = createObjectController({
  core: editorCore, state: appState.objects, selectionState, order: objectOrderModel,
  getActiveStep: () => appState.workflow.activeStep,
  getDefaultLayerId: () => projectSnapshot.defaultLayerId(),
  getViewCenter: () => mapViewport.centerLonLat(),
  getVisibleBounds: () => mapViewport.visibleMapBounds(),
  getScale: () => view.scale, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
  selectMarker, selectShape, renderMapObjects: renderMarkers, renderObjectList: renderMarkerList,
  syncMarkerInspector: syncMarkerControls, syncShapeInspector: syncShapeControls,
  syncItemName: syncItemNameControl, setStatus,
});

function syncHistoryControls(): void {
  if (undoButton) {
    undoButton.disabled = !editorCore.canUndo;
  }
  if (redoButton) {
    redoButton.disabled = !editorCore.canRedo;
  }
}


function beginEditorTransaction(): void {
  editorCore.beginTransaction();
}

function commitEditorTransaction(): void {
  editorCore.commitTransaction();
}

function cancelEditorTransaction(): void {
  editorCore.cancelTransaction();
}

function refreshEditorAfterHistoryChange(): void {
  orderDialogController.cancelActiveDrag();
  selectionController.reconcile();
  objectController.resetTransient();
  svg?.classList.remove("shape-moving");
  cancelEditorTransaction();
  objectController.syncManualMarkerCount();
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
}

function redoEditorChange(): void {
  if (!editorCore.redo()) {
    return;
  }
  refreshEditorAfterHistoryChange();
}

function applyViewTransform(): void {
  mapViewport.applyTransform();
}

function beforeWorkflowStepChange(
  previousStep: WorkflowStep,
  stepId: WorkflowStep,
): void {
  selectionController.finishDrag();
  hideMapStylePreview();
  cropController.beforeStepChange(previousStep, stepId);
}

function afterWorkflowStepChange(
  previousStep: WorkflowStep,
  stepId: WorkflowStep,
): void {
  cropController.afterStepChange(previousStep, stepId);
  const mapLocked = stepId === "2" || stepId === "3";
  if (svg) {
    svg.classList.remove("dragging", "boxing");
    svg.style.cursor = mapLocked ? "default" : "grab";
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
  if (stepId === "3") {
    syncMarkerControls(getSelectedMarker());
  }
  if (stepId !== "0" && stepId !== "3" && appState.objects.previewMarker) {
    objectController.clearSearchPreview();
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

function updateCropFrame(): void {
  cropController.updateFrame();
}

function syncStageSize(): void {
  mapViewport.syncStageSize();
  updateCropFrame();
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
    previewMarker: appState.objects.previewMarker,
    previewToolMarker: appState.objects.previewToolMarker,
    previewShape: appState.objects.previewShape,
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

const orderDialogController = new OrderDialogController({
  elements: {
    triggerButton: listOrderSettingsBtn,
    modal: listOrderModal,
    listOrder: listOrderList,
    displayOrder: displayOrderList,
    closeButton: listOrderClose,
  },
  getItems: getOverlayRefs,
  getOrder: (mode: OrderMode) =>
    mode === "list"
      ? editorDocument.listOrderKeys
      : editorDocument.displayOrderKeys,
  commitOrder: (mode, order) =>
    editorCore.dispatch(
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

function getSelectedMarker(): Marker | null {
  return selectionController.getSelectedMarker();
}

function getSelectedShape(): ShapeItem | null {
  return selectionController.getSelectedShape();
}


const inspectorController = new InspectorController({
  getSelectedMarker,
  getEditableMarker: objectController.getEditableMarker,
  getSelectedShape,
  getShapes: shapeObjects,
  markerListName,
  shapeDefaultName,
  updateMarker: objectController.updateMarkerObject,
  updateShape: objectController.updateShapeObject,
  renderMapObjects: renderMarkers,
  renderObjectList: renderMarkerList,
});

const selectionController = new SelectionController({
  state: selectionState,
  getActiveStep: () => appState.workflow.activeStep,
  getMarkers: markerObjects,
  getShapes: shapeObjects,
  clearToolPreviews: objectController.clearToolPreviews,
  clearMarkerPreview: objectController.clearMarkerPreview,
  setActiveTool: objectController.activateTool,
  syncMarkerInspector: syncMarkerControls,
  syncShapeInspector: syncShapeControls,
  syncItemName: syncItemNameControl,
  updateMarkerStyles,
  renderMapObjects: renderMarkers,
  renderObjectList: renderMarkerList,
  updateMarker: objectController.updateMarkerObject,
  updateShape: objectController.updateShapeObject,
  getMapMetrics: () => ({
    scale: view.scale,
    scaleFit: mapViewport.lastScaleFit,
    width: svg?.viewBox.baseVal.width || MAP_WIDTH,
    height: svg?.viewBox.baseVal.height || MAP_HEIGHT,
  }),
  mapPointFromEvent: (event) => mapViewport.mapPointFromEvent(event),
  commitTransaction: commitEditorTransaction,
  updateTransactionObject: (id, update) => editorCore.updateTransactionObject(id, update),
  hasOpenModal: () => Boolean(document.querySelector(".modal-backdrop.active")),
  mapElement: svg,
});

const mapInteractionController = new MapInteractionController({
  svg,
  viewport: mapViewport,
  isLocked: () => appState.workflow.activeStep === "2" || appState.workflow.activeStep === "3",
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
    onDeleteMarker: objectController.deleteMarker,
    onDeleteShape: objectController.deleteShape,
  });
  if (clearMarkersButton) {
    clearMarkersButton.disabled = renderedCount === 0;
  }
}

function openCompleteDialog(): void {
  exportController.openCompleteDialog();
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
  clearPreview: objectController.clearSearchPreview,
  previewGeonames: objectController.setPreviewMarker,
  addGeonames: objectController.addMarkerFromGeonames,
  hasGeonamesMarker: objectController.hasGeonamesMarker,
  createCoordinatePreview: (coordinates: ParsedCoordinates) => {
    const marker = objectController.buildCoordMarker(coordinates, "coord-preview");
    marker.labelMode = "coords";
    return marker;
  },
  previewCoordinate: objectController.previewCoordinateMarker,
  addCoordinate: objectController.addMarkerFromCoordsValue,
  setStatus,
});

function setStatus(message: string): void {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function syncProjectHeader(): void {
  projectController.renderHeader();
}

function scheduleProjectDirtyCheck(): void {
  projectController.scheduleDirtyCheck();
}

function setProjectBaseline(): void {
  projectController.setBaseline();
}

function applyLoadedProject(loadedProject: MapProject): AppliedProjectSummary {
  const summary = projectSnapshot.apply(loadedProject);
  selectionController.reconcile();
  objectController.resetTransient();
  syncHistoryControls();
  objectController.syncManualMarkerCount();
  renderMarkers();
  renderMarkerList();
  syncMarkerControls(getSelectedMarker());
  setActiveStep("3");
  if (cropController.bbox) {
    cropController.zoomToBounds();
    cropController.updateOverlay();
    cropController.applyMapClip();
  }
  scheduleProjectDirtyCheck();
  return summary;
}

const projectController = new ProjectController({
  state: appState.project,
  buildProject: () => projectSnapshot.build(),
  getFingerprint: () => projectSnapshot.fingerprint(),
  prepareSave: () => { selectionController.finishDrag(); },
  applyLoadedProject,
  getDatapack: () => ({
    id: appState.datapack.id,
    version: appState.datapack.version,
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

const exportRenderer = createExportRenderer({
  canvas, svg, mapStage, cropController, mapViewport, basemapRenderer,
  mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
});
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
  renderCanvas: exportRenderer.renderCanvas,
  renderSvg: exportRenderer.renderSvg,
  setStatus,
  showToast: showAppToast,
  hideToast: () => appToast?.classList.remove("show"),
});

function handleExport(format: ExportFormat): Promise<void> {
  return exportController.export(format);
}

function mapPointFromEvent(event: MouseEvent): { x: number; y: number } {
  return mapViewport.mapPointFromEvent(event);
}

async function reloadDatapackAssets(): Promise<void> {
  const datapack = await window.mapSchematic?.getDatapack?.();
  await basemapRenderer.reload();
  if (!datapack) {
    throw new Error("資料包不可用");
  }
  appState.datapack.id = datapack.id;
  appState.datapack.version = datapack.version;
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

const preferencesController = createPreferencesController({
  reloadMap: () => mapInitializationController.initialize(),
  showDialog: showAppDialog, showToast: showAppToast,
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
    for (let i = 0;i < levels.length;i += 1) {
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
    objectController.handleClearMarkers();
  }
});
undoButton?.addEventListener("click", undoEditorChange);
redoButton?.addEventListener("click", redoEditorChange);
appDialogModal?.addEventListener("click", (event) => {
  if (event.target === appDialogModal) {
    appDialog.closeCancel();
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
      `資料包：${appState.datapack.id || "尚未載入"} ${appState.datapack.version}\n`
      + "資料來源：Natural Earth / GeoNames / Natural Earth Shaded Relief\n\n"
      + `版本：${version}\n`
      + `Commit SHA：${shortCommitSha}${commitState}`,
    tone: "info",
  });
}

const appCommandController = new AppCommandController({
  getActiveStep: () => appState.workflow.activeStep,
  handleAppDialogKeyDown: (event) => appDialog.handleKeyDown(event),
  isPreferencesOpen: preferencesController.isOpen,
  closePreferences: preferencesController.close,
  handleExportEscape: () => exportController.handleEscape(),
  isOrderDialogOpen: () => orderDialogController.isOpen(),
  closeOrderDialog: () => orderDialogController.close(),
  isCoordinateDialogOpen: objectController.isCoordinateDialogOpen,
  cancelCoordinateDialog: objectController.cancelCoordinateDialog,
  isCompletionDialogOpen: () =>
    completeModal?.classList.contains("active") === true,
  undo: undoEditorChange,
  redo: redoEditorChange,
  nudgeSelection: nudgeSelectedObject,
  clearSelection: clearStepThreeSelection,
  deleteSelection: () => {
    if (selectionState.markerId) {
      objectController.deleteMarker(selectionState.markerId);
    } else if (selectionState.shapeId) {
      objectController.deleteShape(selectionState.shapeId);
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

preferencesController.bind();
objectController.bind();
hookToolbar();
workflowController.bind();
basemapRenderer.bind();
orderDialogController.bind();
cropController.bind();
inspectorController.bind();
editorCore.subscribe((change) => {
  if (change.kind === "transaction") return;
  syncHistoryControls();
  scheduleProjectDirtyCheck();
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
  syncWorkspaceStatusIcon();
  syncStageSize();
  updateCropFrame();
  requestBasemapDraw();
  inspectorController.resize();
});
