import { describe, expect, it } from "vitest";

import {
  defaultMarkerStyle,
  defaultShapeStyle,
} from "../../src/renderer/editor/defaults.js";
import {
  formatCoordinates,
  markerLabelText,
} from "../../src/renderer/editor/presentation.js";
import type { Marker } from "../../src/renderer/editor/types.js";

function createMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    objectKind: "marker",
    id: "marker-1",
    layerId: "layer-1",
    name: "Taipei",
    latitude: 25.033,
    longitude: 121.5654,
    sourceType: "manual",
    labelMode: "name",
    style: defaultMarkerStyle(),
    ...overrides,
  };
}

describe("editor presentation", () => {
  it("formats coordinates consistently", () => {
    expect(formatCoordinates(25.033, 121.5654)).toBe(
      "(25.0330, 121.5654)",
    );
  });

  it("uses custom display text before the item name", () => {
    expect(markerLabelText(createMarker({ labelName: "臺北" }))).toBe("臺北");
    expect(markerLabelText(createMarker({ labelName: "  " }))).toBe("Taipei");
  });

  it("formats coordinate labels when requested", () => {
    expect(markerLabelText(createMarker({ labelMode: "coords" }))).toBe(
      "(25.0330, 121.5654)",
    );
  });
});

describe("editor defaults", () => {
  it("returns independent marker style objects", () => {
    const first = defaultMarkerStyle();
    const second = defaultMarkerStyle();

    first.textColor = "#000000";

    expect(second.textColor).not.toBe("#000000");
  });

  it("uses the area fill defaults for area shapes", () => {
    expect(defaultShapeStyle("area").fillOpacity).toBe(0.4);
    expect(defaultShapeStyle("line").fillOpacity).toBe(0.35);
  });
});
