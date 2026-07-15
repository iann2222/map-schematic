import { describe, expect, it } from "vitest";

import {
  WORLD_BBOX,
  geometryToPath,
  project,
  unproject
} from "../../src/renderer/map/geometry.js";

describe("renderer map geometry", () => {
  it("projects and unprojects coordinates consistently", () => {
    const coordinate: [number, number] = [121.5654, 25.033];
    const point = project(coordinate[0], coordinate[1], 1200, 800);
    const restored = unproject(point[0], point[1], 1200, 800);

    expect(restored[0]).toBeCloseTo(coordinate[0], 8);
    expect(restored[1]).toBeCloseTo(coordinate[1], 8);
  });

  it("keeps the supported world bounds inside the canvas", () => {
    expect(project(WORLD_BBOX.minLon, WORLD_BBOX.maxLat, 1200, 800)).toEqual([
      0,
      0
    ]);
    expect(project(WORLD_BBOX.maxLon, WORLD_BBOX.minLat, 1200, 800)).toEqual([
      1200,
      800
    ]);
  });

  it("converts polygon geometry into a closed SVG path", () => {
    const path = geometryToPath(
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1]
          ]
        ]
      },
      1200,
      800
    );

    expect(path).toMatch(/^M /);
    expect(path).toContain(" L ");
    expect(path).toMatch(/ Z$/);
  });
});
