import { vi } from "vitest";
import { createAppState } from "../../src/renderer/app-state.js";
import { EditorCore } from "../../src/renderer/editor/editor-core.js";
import { defaultMarkerStyle } from "../../src/renderer/editor/defaults.js";
import { ProjectSnapshot } from "../../src/renderer/project/project-snapshot.js";
import type { Marker } from "../../src/renderer/editor/types.js";
import type { CropBBox } from "../../src/renderer/crop/types.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function createEditorProject() {
  const state = createAppState();
  state.datapack = { id: "standard", version: "2026.02" };
  const marker: Marker = {
    objectKind: "marker", id: "m", layerId: "layer-1", name: "A",
    longitude: 121, latitude: 25, sourceType: "manual", labelMode: "name", showLabel: true,
    kind: "label", style: defaultMarkerStyle()
  };
  const core = new EditorCore({ objects: [marker], listOrderKeys: [], displayOrderKeys: [] });
  const crop: Mutable<ConstructorParameters<typeof ProjectSnapshot>[0]["crop"]> = {
    projectCanvas: { width: 1200, height: 800, unit: "px" }, box: null, bbox: null,
    updateBBox: vi.fn(), projectUiState: () => ({ ratioMode: "fixed", cropRatio: 1.5 }),
    setProjectCanvas: (canvas) => { crop.projectCanvas = { ...canvas }; },
    resetBox: vi.fn(), setBBox: (bbox: CropBBox | null) => { crop.bbox = bbox; },
    applyProjectUi: vi.fn(),
  };
  const basemap: Mutable<ConstructorParameters<typeof ProjectSnapshot>[0]["basemap"]> = {
    activeStyleId: "styleOriginal", reliefEnabled: false, reliefEffect: "relief-natural",
    setActiveStyle: vi.fn(), setReliefMode: vi.fn(),
  };
  const snapshot = new ProjectSnapshot({
    state: state.project, core, crop, basemap,
    getDatapack: () => state.datapack, styleIds: ["styleOriginal", "styleDark"], mapWidth: 1200, mapHeight: 800
  });
  return { state, core, crop, basemap, snapshot };
}
