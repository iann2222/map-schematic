import { describe, expect, it } from "vitest";

import { parseCoordinates } from "../../src/renderer/controllers/search-controller.js";

describe("coordinate parser", () => {
  it("parses decimal coordinates with common separators", () => {
    expect(parseCoordinates("25.033, 121.5654")).toEqual({
      lat: 25.033,
      lon: 121.5654,
    });
    expect(parseCoordinates("-33.86　151.21")).toEqual({
      lat: -33.86,
      lon: 151.21,
    });
  });

  it("parses DMS coordinates and applies directions", () => {
    expect(parseCoordinates(`25°2'0"N 121°33'55"E`)).toEqual({
      lat: 25 + 2 / 60,
      lon: 121 + 33 / 60 + 55 / 3600,
    });
    expect(parseCoordinates(`33°51'S 151°12'E`)).toEqual({
      lat: -(33 + 51 / 60),
      lon: 151 + 12 / 60,
    });
  });

  it("rejects out-of-range decimal and malformed DMS values", () => {
    expect(parseCoordinates("91, 121")).toBeNull();
    expect(parseCoordinates(`25°60'N 121°0'E`)).toBeNull();
    expect(parseCoordinates("not coordinates")).toBeNull();
  });
});
