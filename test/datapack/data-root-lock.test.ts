import { fork, type ChildProcess } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withDatapackLock } from "../../src/shared/datapack/data-root-lock";

describe("datapack data-root locks", () => {
  let root: string;
  const children: ChildProcess[] = [];
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "map-lock-")); });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
        child.kill();
        await exited;
      }
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  function worker(name: "install" | "access") {
    const child = fork(path.resolve("test/fixtures/datapack-lock-worker.cjs"), [root, name], {
      execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    children.push(child);
    const messages: string[] = [];
    const requesting = new Promise<void>((resolve) => {
      child.on("message", (message: { state: string }) => { if (message.state === "requesting") resolve(); });
    });
    const entered = new Promise<void>((resolve, reject) => {
      child.on("message", (message: { state: string; error?: string }) => {
        messages.push(message.state);
        if (message.state === "entered") resolve();
        if (message.state === "error") reject(new Error(message.error));
      });
      child.once("error", reject);
      child.once("exit", (code) => { if (!messages.includes("entered")) reject(new Error(`Worker exited: ${code}`)); });
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    return { child, messages, requesting, entered, exited };
  }

  it("serializes independent processes sharing a data root", async () => {
    const first = worker("install");
    await first.entered;
    const second = worker("install");
    await second.requesting;
    await delay(250);
    expect(second.messages).not.toContain("entered");
    first.child.send("release");
    await first.exited;
    await second.entered;
    second.child.send("release");
    await second.exited;
    expect(second.messages).toContain("released");
  });
  it("reclaims a killed owner's unique record without waiting for a stale-age timeout", async () => {
    const first = worker("access");
    await first.entered;
    first.child.kill("SIGKILL");
    await first.exited;
    await expect(withDatapackLock(root, "access", async () => "recovered")).resolves.toBe("recovered");
    expect(await fs.readdir(path.join(root, ".locks", "access"))).toEqual([]);
  });
  it("reports busy rather than evicting a live owner", async () => {
    const first = worker("access");
    await first.entered;
    await expect(withDatapackLock(root, "access", async () => {}, { timeoutMs: 50 }))
      .rejects.toMatchObject({ issue: { code: "busy", stage: "lock" } });
    expect(first.messages).toEqual(["requesting", "entered"]);
    first.child.send("release");
    await first.exited;
  });
  it("does not block file access while another process holds the installation lock", async () => {
    const first = worker("install");
    await first.entered;
    await expect(withDatapackLock(root, "access", async () => "offline read")).resolves.toBe("offline read");
    first.child.send("release");
    await first.exited;
  });
  it("releases after an operation throws and preserves the original failure", async () => {
    const failure = new Error("original error");
    await expect(withDatapackLock(root, "access", async () => { throw failure; })).rejects.toBe(failure);
    await expect(withDatapackLock(root, "access", async () => "retry")).resolves.toBe("retry");
  });
  it("admits only one holder during simultaneous contention", async () => {
    let active = 0;
    let completed = 0;
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => withDatapackLock(root, "access", async () => {
      active += 1;
      expect(active).toBe(1);
      await delay(5);
      active -= 1;
      completed += 1;
    })));
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    expect(completed).toBe(12);
  });
  it("does not let record cleanup failure invalidate a completed operation", async () => {
    const remove = fs.rm.bind(fs);
    vi.spyOn(fs, "rm").mockImplementation(async (target, options) => {
      if (String(target).endsWith(".json")) throw Object.assign(new Error("cannot clean lock"), { code: "EACCES" });
      return remove(target, options);
    });
    const onWarning = vi.fn();
    await expect(withDatapackLock(root, "access", async () => "done", { onWarning })).resolves.toBe("done");
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ code: "permissionDenied", stage: "cleanup" }));
    vi.restoreAllMocks();
    await expect(withDatapackLock(root, "access", async () => "retry")).resolves.toBe("retry");
  });
});
