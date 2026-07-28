import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  validateInstalledDatapack
} from "../../src/shared/datapack/manifest";
import {
  DATAPACK_VALIDATION_CACHE_FILENAME,
  validateInstalledDatapackCached
} from "../../src/shared/datapack/validation-cache";
import type { DataPackRef } from "../../src/shared/datapack/types";
import { createTestDatapack } from "../fixtures/datapacks";

describe("installed datapack validation cache", () => {
  const ref: DataPackRef = { id: "standard", version: "2026.03" };
  let tempDir = "";
  let packRoot = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "map-schematic-validation-cache-")
    );
    packRoot = path.join(tempDir, "pack");
    await createTestDatapack(packRoot, ref);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("records a successful full validation for later launches", async () => {
    await validateInstalledDatapackCached(packRoot, ref);

    const raw = await fs.readFile(
      path.join(packRoot, DATAPACK_VALIDATION_CACHE_FILENAME),
      "utf8"
    );
    expect(JSON.parse(raw)).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        id: ref.id,
        version: ref.version
      })
    );
    await expect(
      validateInstalledDatapackCached(packRoot, ref)
    ).resolves.toEqual(expect.objectContaining(ref));
  });

  it("falls back to checksums when a cached file changes without changing size", async () => {
    await validateInstalledDatapackCached(packRoot, ref);
    const target = path.join(packRoot, "geonames", "geonames.sqlite");
    const original = await fs.readFile(target, "utf8");
    const damaged = `${original.startsWith("x") ? "y" : "x"}${original.slice(1)}`;
    expect(Buffer.byteLength(damaged)).toBe(Buffer.byteLength(original));
    await fs.writeFile(target, damaged, "utf8");

    await expect(
      validateInstalledDatapackCached(packRoot, ref)
    ).rejects.toThrow("checksum mismatch");
  });

  it("does not let a cache file bypass explicit full validation", async () => {
    await validateInstalledDatapackCached(packRoot, ref);
    const target = path.join(packRoot, "geonames", "geonames.sqlite");
    const original = await fs.readFile(target, "utf8");
    await fs.writeFile(target, original.replace("sqlite", "sqlitx"), "utf8");

    await expect(
      validateInstalledDatapack(packRoot, ref)
    ).rejects.toThrow("checksum mismatch");
  });
});
