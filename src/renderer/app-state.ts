import type { MapProject } from "./bridge.js";
import type { ExportFrameStyle } from "./export/export-frame.js";

export type WorkflowStep = "0" | "1" | "2" | "3";

export type WorkflowState = {
  activeStep: WorkflowStep;
};

export type ProjectState = {
  current: MapProject | null;
  path: string | null;
  savedFingerprint: string | null;
  dirty: boolean;
  reportedDirty: boolean | null;
  dirtyCheckPending: boolean;
};

export type SearchState = {
  requestSequence: number;
};

export type ExportState = {
  selectedFrame: ExportFrameStyle;
  frameResolver: ((value: ExportFrameStyle | null) => void) | null;
  inProgress: boolean;
};

export type LabelDragState = {
  markerId: string;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

export type MarkerDragState = {
  markerId: string;
  startX: number;
  startY: number;
  startLon: number;
  startLat: number;
};

export type ShapeDragState = {
  shapeId: string;
  startX: number;
  startY: number;
  startLon: number;
  startLat: number;
};

export type SelectionState = {
  markerId: string | null;
  shapeId: string | null;
  labelMarkerId: string | null;
  labelDrag: LabelDragState | null;
  markerDrag: MarkerDragState | null;
  shapeDrag: ShapeDragState | null;
};

export type AppState = {
  workflow: WorkflowState;
  project: ProjectState;
  search: SearchState;
  export: ExportState;
  selection: SelectionState;
};

export function createAppState(): AppState {
  return {
    workflow: {
      activeStep: "0",
    },
    project: {
      current: null,
      path: null,
      savedFingerprint: null,
      dirty: false,
      reportedDirty: null,
      dirtyCheckPending: false,
    },
    search: {
      requestSequence: 0,
    },
    export: {
      selectedFrame: "none",
      frameResolver: null,
      inProgress: false,
    },
    selection: {
      markerId: null,
      shapeId: null,
      labelMarkerId: null,
      labelDrag: null,
      markerDrag: null,
      shapeDrag: null,
    },
  };
}
