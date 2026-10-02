import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectController } from "../../src/renderer/controllers/project-controller.js";
import { createEditorProject } from "../fixtures/editor-project.js";
import { createUpdateObjectCommand } from "../../src/renderer/editor/commands.js";
import { cloneEditorObject } from "../../src/renderer/editor/document.js";
import type { ProjectSaveResult } from "../../src/renderer/bridge.js";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const fixture = createEditorProject();
  const frames: FrameRequestCallback[] = [];
  const api = {
    saveProject: vi.fn(async (): Promise<ProjectSaveResult> => ({ ok: true, path: "map.mapproj" })),
    setProjectDirty: vi.fn(), closeAfterSave: vi.fn()
  };
  vi.stubGlobal("window", { mapSchematic: api, requestAnimationFrame: (fn: FrameRequestCallback) => frames.push(fn) });
  vi.stubGlobal("document", { title: "" });
  const buildProject = vi.fn(() => fixture.snapshot.build());
  const controller = new ProjectController({
    state: fixture.state.project, buildProject,
    getFingerprint: () => fixture.snapshot.fingerprint(), applyLoadedProject: (project) => fixture.snapshot.apply(project),
    getDatapack: () => fixture.state.datapack, setStatus: vi.fn(), renderHeader: vi.fn(),
    showDialog: vi.fn(async () => 0), showNotice: vi.fn(async () => { })
  });
  controller.setBaseline();
  const edit = () => {
    const next = cloneEditorObject(fixture.core.document.objects[0]);
    if (next.objectKind === "marker") next.name = "B";
    fixture.core.dispatch(createUpdateObjectCommand(fixture.core.document.objects[0], next));
  };
  return { ...fixture, controller, buildProject, frames, api, edit };
}

describe("ProjectController dirty tracking", () => {
  it("coalesces change notifications without building project or history", () => {
    const { controller, frames, buildProject, edit, core } = setup();
    edit();
    for (let i = 0;i < 10;i++) controller.scheduleDirtyCheck();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(controller.isDirty).toBe(true);
    core.undo();
    controller.syncDirtyState();
    expect(controller.isDirty).toBe(false);
    expect(buildProject).not.toHaveBeenCalled();
  });

  it.each([false, true])("retains edits made while %s save is awaiting IPC", async (close) => {
    const { controller, api, edit } = setup();
    let resolve!: (result: ProjectSaveResult) => void;
    api.saveProject.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const operation = close ? controller.saveBeforeClose() : controller.save();
    await vi.waitFor(() => expect(api.saveProject).toHaveBeenCalledOnce());
    edit();
    resolve({ ok: true, path: "map.mapproj" });
    await operation;
    expect(controller.isDirty).toBe(true);
    expect(api.closeAfterSave).not.toHaveBeenCalled();
  });
});
