import { describe, expect, it } from "vitest";

import { createAppState } from "../../src/renderer/app-state.js";

describe("renderer app state", () => {
  it("creates independent workflow, project, and export state", () => {
    const first = createAppState();
    const second = createAppState();

    expect(first).toEqual({
      workflow: { activeStep: "0" },
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
    });

    first.workflow.activeStep = "3";
    first.project.dirty = true;
    first.search.requestSequence = 2;
    expect(second.workflow.activeStep).toBe("0");
    expect(second.project.dirty).toBe(false);
    expect(second.search.requestSequence).toBe(0);
  });
});
