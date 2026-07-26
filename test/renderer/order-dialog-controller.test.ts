import { describe, expect, it } from "vitest";

import { moveOrderItemToEdge } from "../../src/renderer/controllers/order-dialog-controller.js";

describe("moveOrderItemToEdge", () => {
  it("moves an item to the top without changing the other order", () => {
    expect(moveOrderItemToEdge(["a", "b", "c"], "c", "top")).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("moves an item to the bottom without duplicating it", () => {
    expect(moveOrderItemToEdge(["a", "b", "c"], "a", "bottom")).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("does not add an unknown item to the order", () => {
    expect(moveOrderItemToEdge(["a", "b"], "missing", "top")).toEqual([
      "a",
      "b",
    ]);
  });
});
