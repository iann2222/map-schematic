import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadyDataPack } from "../../src/shared/datapack/types";
import type { DatapackUpdateResult } from "../../src/shared/ipc-contract";
import type { RendererDialogService } from "../../src/main/renderer-dialog";
import { IPC_CHANNELS } from "../../src/shared/ipc-channels";
import { DataPackError } from "../../src/shared/datapack/errors";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  ensure: vi.fn(), update: vi.fn(), status: vi.fn(), read: vi.fn(), search: vi.fn(), close: vi.fn(),
  locked: false, lock: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
}));
vi.mock("fs/promises", () => ({ default: { readFile: mocks.read } }));
vi.mock("../../src/main/datapack-download", () => ({ ensureDatapackReady: mocks.ensure, updateDatapack: mocks.update, getDatapackStatus: mocks.status }));
vi.mock("../../src/main/geonames", () => ({ searchGeonames: mocks.search, closeGeonamesDatabase: mocks.close }));
vi.mock("../../src/shared/paths", () => ({ resolveDataRoot: () => "/data-root" }));
vi.mock("../../src/shared/datapack/data-root-lock", () => ({ withDatapackLock: mocks.lock }));
import { registerDatapackIpc } from "../../src/main/datapack-ipc";

beforeEach(() => {
  mocks.handlers.clear();
  mocks.locked = false;
  const ready = {
    ref: { id: "standard", version: "2026.03" }, rootPath: "/pack", source: "downloaded",
    manifest: { basemap: { layers: [{ id: "land", path: "basemap/land.geojson" }] }, geonames: { dbPath: "geonames.sqlite" }, relief: { path: "hillshade.png", projection: "EPSG:3857" } },
  } as ReadyDataPack;
  mocks.ensure.mockResolvedValue(ready);
  mocks.update.mockResolvedValue(ready);
  mocks.status.mockResolvedValue({ target: ready.ref, active: ready.ref, availability: "ready" });
  mocks.lock.mockImplementation(async (_root: string, _name: string, operation: () => Promise<unknown>) => {
    mocks.locked = true;
    try { return await operation(); } finally { mocks.locked = false; }
  });
  mocks.read.mockImplementation(async () => { expect(mocks.locked).toBe(true); return Buffer.from("image"); });
  mocks.search.mockImplementation(() => { expect(mocks.locked).toBe(true); return []; });
  registerDatapackIpc({} as RendererDialogService);
});
const invoke = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)!(...args);

describe("datapack IPC result and access contracts", () => {
  it("keeps committed updates successful when the subsequent status check fails", async () => {
    mocks.status.mockRejectedValue(Object.assign(new Error("status access denied"), { code: "EACCES" }));
    const result = await invoke(IPC_CHANNELS.datapackUpdate) as DatapackUpdateResult;
    expect(result.ok).toBe(true);
    expect(result.canceled).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "permissionDenied", stage: "validation" }));
  });
  it("passes structured installation failures to the renderer", async () => {
    mocks.update.mockRejectedValue(new DataPackError({ code: "busy", stage: "replace", message: "database is occupied" }));
    expect(await invoke(IPC_CHANNELS.datapackUpdate)).toMatchObject({ ok: false, issue: { code: "busy", stage: "replace" }, error: "database is occupied" });
  });
  it("closes SQLite before releasing the access lock, even when searching throws", async () => {
    mocks.search.mockImplementation(() => { expect(mocks.locked).toBe(true); throw new Error("search failed"); });
    mocks.close.mockImplementation(() => { expect(mocks.locked).toBe(true); });
    await expect(invoke(IPC_CHANNELS.geonamesSearch, {}, "Taipei", 10)).rejects.toThrow("search failed");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.locked).toBe(false);
  });
  it("returns relief bytes that remain usable after the lock is released", async () => {
    expect(await invoke(IPC_CHANNELS.reliefGet)).toEqual({ path: `data:image/png;base64,${Buffer.from("image").toString("base64")}`, projection: "EPSG:3857" });
    expect(mocks.locked).toBe(false);
  });
  it("reads basemap data under the same access lock", async () => {
    mocks.read.mockImplementation(async () => { expect(mocks.locked).toBe(true); return "{}"; });
    expect(await invoke(IPC_CHANNELS.basemapGet)).toEqual([{ id: "land", geojson: "{}" }]);
    expect(mocks.lock).toHaveBeenCalledWith("/data-root", "access", expect.any(Function));
  });
});
