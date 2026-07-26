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

export type AppState = {
  workflow: WorkflowState;
  project: ProjectState;
  search: SearchState;
  export: ExportState;
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
  };
}
