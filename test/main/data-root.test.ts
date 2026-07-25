import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(),
    getPath: vi.fn()
  }
}));

vi.mock("electron", () => electron);

import { configureDataRoot } from "../../src/main/data-root";

const DATA_ROOT_ENV = "MAP_SCHEMATIC_ROOT";
const originalDataRoot = process.env[DATA_ROOT_ENV];
const originalLocalAppData = process.env.LOCALAPPDATA;
let tempDirectory = "";

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

beforeEach(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "map-schematic-data-root-"));
  process.env.LOCALAPPDATA = tempDirectory;
  delete process.env[DATA_ROOT_ENV];
  electron.app.isPackaged = false;
  electron.app.getAppPath.mockReturnValue(path.join(tempDirectory, "repo"));
  electron.app.getPath.mockReturnValue(path.join(tempDirectory, "app-data"));
});

afterEach(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  restoreEnvironment(DATA_ROOT_ENV, originalDataRoot);
  restoreEnvironment("LOCALAPPDATA", originalLocalAppData);
  vi.clearAllMocks();
});

describe("configureDataRoot", () => {
  it("uses an explicit environment root without persisting it", () => {
    const environmentRoot = path.join(tempDirectory, "portable");
    process.env[DATA_ROOT_ENV] = environmentRoot;

    expect(configureDataRoot()).toBe(path.resolve(environmentRoot));
    expect(process.env[DATA_ROOT_ENV]).toBe(path.resolve(environmentRoot));
    expect(fs.existsSync(path.join(tempDirectory, "map-schematic", "datapack-location.json"))).toBe(false);
  });

  it("uses a previously saved data root", () => {
    const savedRoot = path.join(tempDirectory, "shared-data");
    const locationDirectory = path.join(tempDirectory, "map-schematic");
    fs.mkdirSync(locationDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(locationDirectory, "datapack-location.json"),
      JSON.stringify({ dataRoot: savedRoot }),
      "utf8"
    );

    expect(configureDataRoot()).toBe(path.resolve(savedRoot));
  });

  it("uses the development repository when it already has an active data pack", () => {
    const repositoryRoot = path.join(tempDirectory, "repo");
    fs.mkdirSync(path.join(repositoryRoot, "geodata"), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, "geodata", "active.json"), "{}", "utf8");
    electron.app.getAppPath.mockReturnValue(repositoryRoot);

    expect(configureDataRoot()).toBe(path.resolve(repositoryRoot));
  });

  it("falls back to the local application data directory and remembers it", () => {
    const expectedRoot = path.join(tempDirectory, "map-schematic");

    expect(configureDataRoot()).toBe(path.resolve(expectedRoot));
    expect(
      JSON.parse(fs.readFileSync(path.join(expectedRoot, "datapack-location.json"), "utf8"))
    ).toEqual({ dataRoot: path.resolve(expectedRoot) });
  });
});
