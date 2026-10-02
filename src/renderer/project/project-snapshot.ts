import type { MapProject } from "../bridge.js";
import type { ProjectState } from "../app-state.js";
import type { EditorCore } from "../editor/editor-core.js";
import type { CropController } from "../controllers/crop-controller.js";
import type { BasemapRenderer } from "../map/basemap-renderer.js";
import { editorDocumentToProjectObjects, mapProjectToEditorDocument } from "./project-adapter.js";
import { serializeProjectContent } from "./project-state.js";
import { WORLD_BBOX, geographicBBoxFromUnwrappedBounds, unproject, project, unwrappedLongitudeBounds } from "../map/geometry.js";

type SnapshotOptions = {
  state: ProjectState;
  core: EditorCore;
  crop: Pick<CropController, "projectCanvas" | "bbox" | "box" | "updateBBox" | "projectUiState" | "setProjectCanvas" | "resetBox" | "setBBox" | "applyProjectUi">;
  basemap: Pick<BasemapRenderer, "activeStyleId" | "reliefEnabled" | "reliefEffect" | "setActiveStyle" | "setReliefMode">;
  getDatapack: () => { id: string; version: string };
  styleIds: readonly string[];
  mapWidth: number;
  mapHeight: number;
};

export class ProjectSnapshot {
  private preservedObjects: MapProject["objects"] = [];
  private documentRevision = -1;
  private documentFingerprint = "";
  private preservedFingerprint = "[]";
  private settingsFingerprint = "";
  private fingerprintValue: string | null = null;
  private historyRevision = -1;
  private history: MapProject["history"];

  constructor(private readonly options: SnapshotOptions) {
    this.history = options.core.exportHistory();
    this.historyRevision = options.core.historyRevision;
  }

  defaultLayerId(): string {
    return this.options.state.current?.layers[0]?.id ?? "layer-1";
  }

  fingerprint(): string | null {
    const settings = this.settings();
    if (!settings) return null;
    const { core } = this.options;
    const settingsFingerprint = serializeProjectContent(settings);
    const documentChanged = this.documentRevision !== core.documentRevision;
    if (!documentChanged && settingsFingerprint === this.settingsFingerprint && this.fingerprintValue !== null) {
      return this.fingerprintValue;
    }
    if (documentChanged) {
      this.documentFingerprint = serializeProjectContent(core.document);
      this.documentRevision = core.documentRevision;
    }
    // History is saved, but changing undo/redo availability alone is not an unsaved map edit.
    this.settingsFingerprint = settingsFingerprint;
    this.fingerprintValue = `${settingsFingerprint}\n${this.documentFingerprint}\n${this.preservedFingerprint}`;
    return this.fingerprintValue;
  }

  build(): MapProject | null {
    const settings = this.settings();
    if (!settings) return null;
    const { core, state } = this.options;
    if (this.historyRevision !== core.historyRevision) {
      this.history = core.exportHistory();
      this.historyRevision = core.historyRevision;
    }
    const now = new Date().toISOString();
    return {
      ...(state.current ?? {}), ...settings,
      createdAt: state.current?.createdAt ?? now, updatedAt: now,
      objects: editorDocumentToProjectObjects(core.document, this.preservedObjects, this.defaultLayerId()),
      history: this.history,
      ui: {
        ...settings.ui, listOrderKeys: [...core.document.listOrderKeys],
        displayOrderKeys: [...core.document.displayOrderKeys]
      },
    };
  }

  apply(projectFile: MapProject): { historyRestored: boolean; preservedObjectCount: number } {
    const { core, crop, basemap, mapWidth, mapHeight, styleIds } = this.options;
    const loaded = mapProjectToEditorDocument(projectFile);
    core.replaceDocument(loaded.document);
    this.preservedObjects = loaded.preservedObjects;
    this.preservedFingerprint = serializeProjectContent(this.preservedObjects);
    this.fingerprintValue = null;
    crop.setProjectCanvas(projectFile.canvas);
    crop.resetBox();
    const bounds = unwrappedLongitudeBounds(projectFile.viewport.bbox);
    const min = project(bounds.west, projectFile.viewport.bbox.south, mapWidth, mapHeight);
    const max = project(bounds.east, projectFile.viewport.bbox.north, mapWidth, mapHeight);
    crop.setBBox({
      x: Math.min(min[0], max[0]), y: Math.min(min[1], max[1]),
      width: Math.abs(max[0] - min[0]), height: Math.abs(max[1] - min[1])
    });
    const style = projectFile.ui?.activeStyleId;
    if (typeof style === "string" && styleIds.includes(style)) basemap.setActiveStyle(style);
    basemap.setReliefMode(projectFile.ui?.hillshadeEnabled === true, projectFile.ui?.hillshadeBlend);
    crop.applyProjectUi(projectFile.ui);
    const historyRestored = core.restoreHistory(projectFile.history);
    if (!historyRestored) core.clearHistory();
    return { historyRestored, preservedObjectCount: this.preservedObjects.length };
  }

  private settings(): Omit<MapProject, "createdAt" | "updatedAt" | "objects" | "history"> | null {
    const { crop, basemap, state, mapWidth, mapHeight } = this.options;
    const pack = this.options.getDatapack();
    if (!pack.id || !pack.version) return null;
    if (!crop.bbox && crop.box) crop.updateBBox();
    let bbox: MapProject["viewport"]["bbox"] = {
      west: WORLD_BBOX.minLon, south: WORLD_BBOX.minLat,
      east: WORLD_BBOX.maxLon, north: WORLD_BBOX.maxLat, crossesAntimeridian: false
    };
    if (crop.bbox) {
      const box = crop.bbox;
      const [minLon, minLat] = unproject(box.x, box.y + box.height, mapWidth, mapHeight);
      const [maxLon, maxLat] = unproject(box.x + box.width, box.y, mapWidth, mapHeight);
      bbox = geographicBBoxFromUnwrappedBounds(Math.min(minLon, maxLon), Math.min(minLat, maxLat),
        Math.max(minLon, maxLon), Math.max(minLat, maxLat));
    }
    const layer = state.current?.layers[0];
    return {
      schemaVersion: "0.7", dataPackVersion: pack.version, dataPackId: pack.id,
      canvas: { ...crop.projectCanvas }, viewport: { bbox, projection: "EPSG:4326" },
      layers: [layer ? { id: layer.id, name: layer.name } : { id: "layer-1", name: "Default" }],
      ui: {
        ...this.persistentUi(),
        activeStyleId: basemap.activeStyleId, hillshadeEnabled: basemap.reliefEnabled,
        hillshadeBlend: basemap.reliefEffect, ...crop.projectUiState()
      },
    };
  }

  private persistentUi(): NonNullable<MapProject["ui"]> {
    const { listOrderKeys: _list, displayOrderKeys: _display, ...ui } = this.options.state.current?.ui ?? {};
    return ui;
  }
}
