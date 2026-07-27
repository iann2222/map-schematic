import { describe, expect, it } from "vitest";

import { normalizeHexColor } from "../../src/renderer/controllers/inspector-controller.js";

describe("normalizeHexColor", () => {
  it("normalizes shorthand and full hex colors", () => {
    expect(normalizeHexColor("ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("#12AbEf")).toBe("#12abef");
  });

  it("rejects empty and invalid colors", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#12")).toBeNull();
    expect(normalizeHexColor("#xyzxyz")).toBeNull();
  });
});
