import type { GeonamesResult } from "../bridge.js";
import type { ObjectToolState, SelectionState, WorkflowStep } from "../app-state.js";
import type { EditorCore } from "../editor/editor-core.js";
import type { EditorCommand } from "../editor/commands.js";
import { createAddObjectCommand, createRemoveObjectCommand, createClearObjectsCommand, createUpdateObjectCommand } from "../editor/commands.js";
import { cloneEditorObject } from "../editor/document.js";
import { defaultMarkerStyle, defaultShapeStyle } from "../editor/defaults.js";
import { isMarker, isShape, type Marker, type ShapeItem } from "../editor/types.js";
import type { ObjectOrderModel } from "../overlay/object-order-model.js";
import { normalizeLongitude, project } from "../map/geometry.js";
import { bindFirstClickSelect } from "../ui/input-selection.js";
import type { ModalManager } from "../ui/modal-manager.js";

export function createObjectController(options: {
  modals: ModalManager;
  core: EditorCore;
  state: ObjectToolState;
  selectionState: SelectionState;
  order: ObjectOrderModel;
  getActiveStep: () => WorkflowStep;
  getDefaultLayerId: () => string;
  getViewCenter: () => [number, number];
  getVisibleBounds: () => { x: number; y: number; width: number; height: number } | null;
  getScale: () => number;
  mapWidth: number;
  mapHeight: number;
  selectMarker: (id: string | null) => void;
  selectShape: (id: string | null) => void;
  renderMapObjects: () => void;
  renderObjectList: () => void;
  syncMarkerInspector: (marker: Marker | null) => void;
  syncShapeInspector: (shape: ShapeItem | null) => void;
  syncItemName: () => void;
  setStatus: (message: string) => void;
  root?: Document;
}) {
  const { state, selectionState, selectMarker, selectShape, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT } = options;
  const root = options.root ?? document;
  const editorDocument = options.core.document;
  const markerObjects = () => editorDocument.objects.filter(isMarker);
  const dispatchEditorCommand = (command: EditorCommand | null, mergeKey?: string) => options.core.dispatch(command, { mergeKey });
  const defaultObjectLayerId = options.getDefaultLayerId;
  const viewCenterLonLat = options.getViewCenter;
  const visibleMapBounds = options.getVisibleBounds;
  const renderMarkers = options.renderMapObjects;
  const renderMarkerList = options.renderObjectList;
  const syncMarkerControls = options.syncMarkerInspector;
  const syncShapeControls = options.syncShapeInspector;
  const syncItemNameControl = options.syncItemName;
  const hasDuplicateMarker = (candidate: { name: string; latitude: number; longitude: number }) => options.order.hasDuplicateMarker(candidate);
  const hasDuplicateShape = (candidate: ShapeItem) => options.order.hasDuplicateShape(candidate);
  const coordEditModal = root.getElementById("coordEditModal");
  const coordLabelInput = root.getElementById("coordLabelInput") as HTMLInputElement | null;
  const coordEditSave = root.getElementById("coordEditSave") as HTMLButtonElement | null;
  const coordEditCancel = root.getElementById("coordEditCancel") as HTMLButtonElement | null;

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
    const rightEdge = bounds.x + bounds.width * 0.78;
    const topEdge = bounds.y + bounds.height * 0.22;
    const placeLeft = x > rightEdge;
    marker.style.textOffsetX = placeLeft ? -8 : 8;
    marker.style.textOffsetY = y < topEdge ? 10 : -6;
    marker.style.textAnchor = placeLeft ? "end" : "start";
  }

  function activateTool(tool: typeof state.activeTool): void {
    state.activeTool = tool;
    state.hasActiveToolSelection = true;
    root
      .querySelectorAll<HTMLButtonElement>(".tool-select")
      .forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === tool);
      });
  }

  function setActiveTool(tool: typeof state.activeTool): void {
    activateTool(tool);
    const [lon, lat] = viewCenterLonLat();
    if (tool === "marker") {
      state.previewShape = null;
      state.previewToolMarker = buildPreviewMarkerAt({ lon, lat });
    } else {
      state.previewToolMarker = null;
      state.previewShape = buildShapeAt(tool, { lon, lat });
    }
    renderMarkers();
  }

  function addToolItem(tool: typeof state.activeTool): void {
    if (options.getActiveStep() !== "3") {
      return;
    }
    activateTool(tool);
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
      state.previewMarker = null;
      state.previewToolMarker = null;
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
      state.previewShape = null;
      selectShape(shape.id);
      renderMarkerList();
      return;
    }
  }

  function setPreviewMarker(result: GeonamesResult): void {
    state.previewMarker = {
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
    placeMarkerLabelInsideView(state.previewMarker);
    renderMarkers();
    syncMarkerControls(state.previewMarker);
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
    state.previewMarker = null;
    if (options.getActiveStep() === "3") {
      selectMarker(marker.id);
    }
    renderMarkers();
    renderMarkerList();
    options.setStatus(`已新增座標：${marker.name}`);
  }

  function buildManualMarkerAt(center: { lon: number; lat: number }): Marker {
    state.manualMarkerCount += 1;
    return {
      objectKind: "marker",
      id: `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      layerId: defaultObjectLayerId(),
      name: `點標示${state.manualMarkerCount}`,
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
    const size = 140 / Math.max(0.4, options.getScale());
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
    state.manualMarkerCount = maxIndex;
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
    state.previewMarker = null;
    if (options.getActiveStep() === "3") {
      selectMarker(marker.id);
    }
    renderMarkers();
    renderMarkerList();
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

  function handleClearMarkers(): void {
    if (!dispatchEditorCommand(createClearObjectsCommand(editorDocument))) {
      return;
    }
    selectionState.markerId = null;
    selectionState.shapeId = null;
    state.previewMarker = null;
    state.previewToolMarker = null;
    state.previewShape = null;
    state.manualMarkerCount = 0;
    syncMarkerControls(null);
    syncShapeControls(null);
    syncItemNameControl();
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
    state.editingCoordMarker = marker;
    coordLabelInput.value = marker.labelName ?? "";
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
      state.editingCoordMarker = null;
      options.modals.close(coordEditModal);
      renderMarkers();
      renderMarkerList();
    };
    coordEditCancel.onclick = () => {
      state.editingCoordMarker = null;
      options.modals.close(coordEditModal);
    };
    options.modals.open(coordEditModal, {
      onDismiss: () => coordEditCancel.click(),
      initialFocus: () => coordLabelInput,
    });
    coordLabelInput.select();
  }

  function isCoordLabelDefault(): boolean {
    if (!state.editingCoordMarker) {
      return false;
    }
    return (
      !state.editingCoordMarker.labelName ||
      state.editingCoordMarker.labelName.trim().length === 0
    );
  }

  function bind(): void {
    root.querySelectorAll<HTMLButtonElement>(".tool-select").forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool as ObjectToolState["activeTool"] | undefined;
        if (tool) setActiveTool(tool);
      });
    });
    root.querySelectorAll<HTMLButtonElement>(".tool-add").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const tool = button.dataset.addTool as ObjectToolState["activeTool"] | undefined;
        if (tool) addToolItem(tool);
      });
    });
    bindFirstClickSelect(coordLabelInput, isCoordLabelDefault);
  }
  function resetTransient(): void {
    state.previewMarker = null;
    state.previewToolMarker = null;
    state.previewShape = null;
    state.editingCoordMarker = null;
    options.modals.close(coordEditModal);
  }
  function clearToolPreviews(): void {
    state.previewToolMarker = null;
    state.previewShape = null;
  }
  function clearMarkerPreview(): void {
    state.previewMarker = null;
  }
  function clearSearchPreview(): void {
    clearMarkerPreview();
    renderMarkers();
  }
  function previewCoordinateMarker(marker: Marker): void {
    placeMarkerLabelInsideView(marker);
    state.previewMarker = marker;
    renderMarkers();
    syncMarkerControls(marker);
  }
  function getEditableMarker(): Marker | null {
    return markerObjects().find((marker) => marker.id === selectionState.markerId) ?? state.previewMarker;
  }
  return {
    bind, resetTransient, activateTool, setActiveTool, addToolItem, setPreviewMarker, buildCoordMarker,
    addMarkerFromCoordsValue, hasGeonamesMarker, syncManualMarkerCount, addMarkerFromGeonames,
    updateMarkerObject, updateShapeObject, deleteMarker, deleteShape, handleClearMarkers,
    openCoordEditor, clearToolPreviews, clearMarkerPreview, clearSearchPreview, previewCoordinateMarker, getEditableMarker,
    cancelCoordinateDialog: () => coordEditCancel?.click(),
    isCoordinateDialogOpen: () => options.modals.isOpen(coordEditModal)
  };
}
