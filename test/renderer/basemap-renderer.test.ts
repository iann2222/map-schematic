import { describe, expect, it } from "vitest";

import { normalizeReliefEffect } from "../../src/renderer/map/basemap-renderer.js";

describe("normalizeReliefEffect", () => {
  it("keeps current relief effect values", () => {
    expect(normalizeReliefEffect("relief-soft")).toBe("relief-soft");
    expect(normalizeReliefEffect("relief-natural")).toBe("relief-natural");
    expect(normalizeReliefEffect("relief-strong")).toBe("relief-strong");
  });

  it("migrates legacy blend mode values", () => {
    expect(normalizeReliefEffect("soft-light")).toBe("relief-soft");
    expect(normalizeReliefEffect("multiply")).toBe("relief-strong");
    expect(normalizeReliefEffect("unknown")).toBe("relief-natural");
  });
});
