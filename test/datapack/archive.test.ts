import path from "path";

import { describe, expect, it } from "vitest";

import { validateArchiveEntryPath } from "../../src/shared/datapack/archive";

describe("datapack archive paths", () => {
  const destination = path.resolve("C:/temp/datapack");

  it("accepts regular relative archive entries", () => {
    expect(() => validateArchiveEntryPath(destination, "basemap/land.geojson")).not.toThrow();
  });

  it.each(["../outside.txt", "/outside.txt", "C:/outside.txt", "basemap\\land.geojson"])(
    "rejects unsafe entry path %s",
    (entryName) => {
      expect(() => validateArchiveEntryPath(destination, entryName)).toThrow(/path/);
    }
  );
});
