import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => {
  const close = vi.fn();
  const all = vi.fn(() => []);
  const prepare = vi.fn(() => ({ all }));
  const open = vi.fn(function MockDatabase() {
    return { close, prepare };
  });
  return { all, close, open, prepare };
});

vi.mock("better-sqlite3", () => ({
  default: databaseMock.open
}));

import {
  closeGeonamesDatabase,
  searchGeonames
} from "../../src/main/geonames";

describe("GeoNames database lifecycle", () => {
  beforeEach(() => {
    closeGeonamesDatabase();
    vi.clearAllMocks();
  });

  it("reopens a database at the same path after closing it", () => {
    const dbPath = "C:\\data\\geonames.sqlite";

    searchGeonames("Taipei", 10, dbPath);
    searchGeonames("Taipei", 10, dbPath);
    expect(databaseMock.open).toHaveBeenCalledOnce();

    closeGeonamesDatabase();
    expect(databaseMock.close).toHaveBeenCalledOnce();

    searchGeonames("Kaohsiung", 10, dbPath);
    expect(databaseMock.open).toHaveBeenCalledTimes(2);
  });
});
