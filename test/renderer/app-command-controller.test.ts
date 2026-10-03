import { afterEach, describe, expect, it, vi } from "vitest";
import { AppCommandController, type AppCommandControllerOptions } from "../../src/renderer/controllers/app-command-controller.js";
import type { AppDialogRequest, MenuAction } from "../../src/renderer/bridge.js";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const target = new EventTarget();
  let onMenu!: (action: MenuAction) => void;
  let onDialog!: (request: AppDialogRequest) => void;
  Object.assign(target, { mapSchematic: {
    onMenuAction: (callback: typeof onMenu) => { onMenu = callback; },
    onAppDialogRequest: (callback: typeof onDialog) => { onDialog = callback; },
  } });
  vi.stubGlobal("window", target);
  for (const name of ["HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement"]) {
    vi.stubGlobal(name, class {});
  }
  const options: AppCommandControllerOptions = {
    getActiveStep: () => "3", hasOpenModal: vi.fn(() => true),
    undo: vi.fn(), redo: vi.fn(), nudgeSelection: vi.fn(() => false),
    clearSelection: vi.fn(), deleteSelection: vi.fn(), loadProject: vi.fn(),
    saveProject: vi.fn(), saveBeforeClose: vi.fn(), showAbout: vi.fn(),
    showAttributions: vi.fn(), exportProject: vi.fn(), showRequestedDialog: vi.fn(),
  };
  new AppCommandController(options).bind();
  const key = (key: string, ctrlKey = false, shiftKey = false) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, ctrlKey, shiftKey, metaKey: false, altKey: false });
    target.dispatchEvent(event);
  };
  return { options, key, menu: (action: MenuAction) => onMenu(action), dialog: (request: AppDialogRequest) => onDialog(request) };
}

describe("AppCommandController modal guard", () => {
  it("blocks background Undo, Redo, deletion, nudging and selection clearing", () => {
    const { options, key } = setup();
    key("z", true); key("y", true); key("z", true, true);
    key("Delete"); key("ArrowLeft"); key("Escape");
    for (const callback of [options.undo, options.redo, options.deleteSelection, options.nudgeSelection, options.clearSelection]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
  it("blocks menu editing, project operations and competing dialogs", () => {
    const { options, menu } = setup();
    const actions: MenuAction[] = ["edit:undo", "edit:redo", "project:open", "project:save", "project:saveAs", "export:png", "export:pdf", "export:svg", "app:about", "app:attributions"];
    actions.forEach(menu);
    for (const callback of [options.undo, options.redo, options.loadProject, options.saveProject, options.exportProject, options.showAbout, options.showAttributions]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
  it("continues close-before-save and accepts requested confirmations over a modal", () => {
    const { options, menu, dialog } = setup();
    menu("project:saveBeforeClose");
    expect(options.saveBeforeClose).toHaveBeenCalledOnce();
    const request: AppDialogRequest = {
      id: "1", title: "Confirm", message: "Continue?", buttons: [], defaultValue: 0, cancelValue: 0,
    };
    dialog(request);
    expect(options.showRequestedDialog).toHaveBeenCalledWith(request);
  });
  it("resumes editor keyboard and menu commands when no modal is open", () => {
    const { options, key, menu } = setup();
    vi.mocked(options.hasOpenModal).mockReturnValue(false);
    key("z", true);
    key("Delete");
    menu("project:saveAs");
    expect(options.undo).toHaveBeenCalledOnce();
    expect(options.deleteSelection).toHaveBeenCalledOnce();
    expect(options.saveProject).toHaveBeenCalledWith(true);
  });
});
