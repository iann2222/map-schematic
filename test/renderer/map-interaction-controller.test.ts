import { describe, expect, it, vi } from "vitest";

import { MapInteractionController } from "../../src/renderer/controllers/map-interaction-controller.js";
import type { MapViewportController } from "../../src/renderer/controllers/map-viewport-controller.js";

describe("MapInteractionController", () => {
  it("binds each map event once and can release the listeners", () => {
    const svg = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      classList: { remove: vi.fn() },
    } as unknown as SVGSVGElement;
    const controller = new MapInteractionController({
      svg,
      viewport: {} as MapViewportController,
      isLocked: () => false,
      clearSelection: vi.fn(),
      moveSelectionDrag: () => false,
      finishSelectionDrag: () => false,
      minScale: 0.4,
      maxScale: 12,
    });

    controller.bind();
    controller.bind();

    expect(svg.addEventListener).toHaveBeenCalledTimes(6);

    controller.unbind();
    controller.unbind();
    expect(svg.removeEventListener).toHaveBeenCalledTimes(6);
  });
});
