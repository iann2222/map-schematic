import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportController } from "../../src/renderer/controllers/export-controller.js";
import { createAppState } from "../../src/renderer/app-state.js";
import type { ModalManager, ModalOptions } from "../../src/renderer/ui/modal-manager.js";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const exportProject = vi.fn();
  vi.stubGlobal("window", { mapSchematic: { exportProject } });
  const open = vi.fn((_element: HTMLElement | null, _options: ModalOptions) => {});
  const close = vi.fn();
  const state = createAppState().export;
  const renderCanvas = vi.fn(async () => null);
  const setStatus = vi.fn();
  const controller = new ExportController({
    modals: { open, close } as unknown as ModalManager, state, pngScale: 3,
    renderCanvas, renderSvg: () => null, setStatus, showToast: vi.fn(), hideToast: vi.fn(),
    elements: {
      completeModal: {} as HTMLElement, completePngButton: {} as HTMLButtonElement,
      completeSvgButton: null, completePdfButton: null, completeContinueButton: null, completeCloseButton: null,
      frameModal: { querySelector: () => null } as unknown as HTMLElement,
      frameOptions: [], frameCloseButton: null, frameCancelButton: null, frameApplyButton: null,
    },
  });
  return { controller, state, open, close, renderCanvas, exportProject, setStatus };
}

describe("ExportController modal lifecycle", () => {
  it("settles canceled frame selection, releases busy state and permits a retry", async () => {
    const s = setup();
    const first = s.controller.export("png");
    expect(s.state.inProgress).toBe(true);
    s.open.mock.calls.at(-1)![1].onDismiss();
    await first;
    expect(s.state.frameResolver).toBeNull();
    expect(s.state.inProgress).toBe(false);
    expect(s.renderCanvas).not.toHaveBeenCalled();
    expect(s.exportProject).not.toHaveBeenCalled();
    expect(s.setStatus).toHaveBeenCalledWith("已取消匯出。");
    const retry = s.controller.export("pdf");
    s.open.mock.calls.at(-1)![1].onDismiss();
    await retry;
    expect(s.open).toHaveBeenCalledTimes(2);
  });
  it("does not open competing frame prompts during an export", async () => {
    const s = setup();
    const first = s.controller.export("png");
    await s.controller.export("pdf");
    expect(s.open).toHaveBeenCalledOnce();
    s.controller.closeFrameDialog(null);
    await first;
    s.controller.closeFrameDialog(null);
    expect(s.state.frameResolver).toBeNull();
  });
  it("routes completion dismissal through the same close operation", () => {
    const s = setup();
    s.controller.openCompleteDialog();
    s.open.mock.calls.at(-1)![1].onDismiss();
    expect(s.close).toHaveBeenCalledWith(s.open.mock.calls[0][0]);
  });
});
