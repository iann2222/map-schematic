import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreferencesController } from "../../src/renderer/controllers/preferences-controller.js";
import type { DatapackUpdateResult, DataPackStatus } from "../../src/shared/ipc-contract.js";
import type { ModalManager } from "../../src/renderer/ui/modal-manager.js";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const elements = new Map(["datapackPreferenceState", "datapackPreferenceDetail", "datapackUpdateBtn", "datapackUpdateLabel"]
    .map((id) => [id, { textContent: "", disabled: false }]));
  const root = { getElementById: (id: string) => elements.get(id) ?? null, querySelectorAll: () => [] } as unknown as Document;
  const status: DataPackStatus = {
    target: { id: "standard", version: "2026.03" },
    active: { id: "standard", version: "2026.02" }, availability: "updateAvailable"
  };
  const updateDatapack = vi.fn(async (): Promise<DatapackUpdateResult> => ({ ok: true }));
  const getDatapackStatus = vi.fn(async () => status);
  vi.stubGlobal("window", { mapSchematic: { updateDatapack, getDatapackStatus } });
  const reloadMap = vi.fn(async () => { });
  const showDialog = vi.fn(async () => 0);
  const showToast = vi.fn();
  const modals = { open: vi.fn(), close: vi.fn(), isOpen: vi.fn() } as unknown as ModalManager;
  const controller = createPreferencesController({ modals, root, reloadMap, showDialog, showToast });
  return { controller, updateDatapack, getDatapackStatus, reloadMap, showDialog, showToast, elements };
}

describe("PreferencesController update lifecycle", () => {
  it("handles rejected IPC and restores the retry button", async () => {
    const { controller, updateDatapack, reloadMap, showDialog, elements } = setup();
    updateDatapack.mockRejectedValue(new Error("IPC failed"));
    await controller.updateDatapack();
    expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({ detail: "Error: IPC failed", tone: "danger" }));
    expect(reloadMap).not.toHaveBeenCalled();
    expect(elements.get("datapackUpdateBtn")!.disabled).toBe(false);
    expect(elements.get("datapackUpdateLabel")!.textContent).toBe("下載並更新");
  });

  it("does not reload the map after cancellation", async () => {
    const { controller, updateDatapack, reloadMap } = setup();
    updateDatapack.mockResolvedValue({ ok: true, canceled: true });
    await controller.updateDatapack();
    expect(reloadMap).not.toHaveBeenCalled();
  });

  it("coalesces repeated update requests and disables the button until reload completes", async () => {
    const { controller, updateDatapack, reloadMap, elements } = setup();
    let finish!: () => void;
    reloadMap.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const operation = controller.updateDatapack();
    await vi.waitFor(() => expect(reloadMap).toHaveBeenCalledOnce());
    await controller.updateDatapack();
    expect(updateDatapack).toHaveBeenCalledOnce();
    expect(elements.get("datapackUpdateBtn")!.disabled).toBe(true);
    finish();
    await operation;
    expect(elements.get("datapackUpdateBtn")!.disabled).toBe(false);
  });

  it("distinguishes installed data from a failed workspace reload", async () => {
    const { controller, reloadMap, showDialog, elements } = setup();
    reloadMap.mockRejectedValue(new Error("reload failed"));
    await controller.updateDatapack();
    expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({ eyebrow: "資料包已更新", tone: "warning" }));
    expect(elements.get("datapackUpdateBtn")!.disabled).toBe(false);
  });
});
