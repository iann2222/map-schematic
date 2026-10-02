import { afterEach, describe, expect, it, vi } from "vitest";
import { createOverlayRenderer } from "../../src/renderer/overlay/overlay-renderer.js";
import { MapViewportController } from "../../src/renderer/controllers/map-viewport-controller.js";
import { defaultMarkerStyle, defaultShapeStyle } from "../../src/renderer/editor/defaults.js";
import type { Marker, ShapeItem } from "../../src/renderer/editor/types.js";

class SvgNode {
  children: SvgNode[] = [];
  attributes = new Map<string, string>();
  parent: SvgNode | null = null;
  style = {};
  viewBox = { baseVal: { width: 1200, height: 800 } };
  constructor(readonly tagName: string) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  hasAttribute(key: string) { return this.attributes.has(key); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  addEventListener() {}
  getBBox() { return { x: 0, y: 0, width: 40, height: 10 }; }
  appendChild(node: SvgNode) {
    if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
    node.parent = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node: SvgNode, before: SvgNode) {
    this.appendChild(node);
    this.children.pop();
    this.children.splice(this.children.indexOf(before), 0, node);
    return node;
  }
  replaceChildren() { this.children.forEach((child) => { child.parent = null; }); this.children = []; }
  querySelector(selector: string): SvgNode | null {
    const match = /^g\[([^=]+)="([^"]+)"\]$/.exec(selector);
    for (const child of this.children) {
      if (match && child.tagName === "g" && child.getAttribute(match[1]) === match[2]) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("overlay display order", () => {
  it("interleaves markers and shapes in every world copy and keeps previews last", () => {
    vi.stubGlobal("document", { createElementNS: (_ns: string, tag: string) => new SvgNode(tag) });
    const svg = new SvgNode("svg");
    const marker: Marker = {
      objectKind: "marker", id: "m", layerId: "layer-1", name: "A",
      latitude: 0, longitude: 0, sourceType: "manual", labelMode: "name",
      showLabel: false, style: defaultMarkerStyle()
    };
    const shape = (id: string, type: ShapeItem["type"]): ShapeItem => ({
      objectKind: "shape", id, layerId: "layer-1", type,
      latitude: 0, longitude: 0, width: 100, height: 50,
      style: defaultShapeStyle(type)
    });
    let order = ["shape:a", "marker:m", "shape:b"];
    const renderer = createOverlayRenderer({
      getState: () => ({
        svg: svg as unknown as SVGSVGElement, view: { scale: 1 }, WRAPS: [-1, 0, 1],
        worldShift: 0, activeStep: "3", selectedMarkerId: null, selectedShapeId: null,
        selectedLabelMarkerId: null, previewMarker: { ...marker, id: "preview" },
        previewToolMarker: null, previewShape: null, labelDrag: null, shapeDrag: null, lastScaleFit: 1
      }),
      markerObjects: () => [marker], shapeObjects: () => [shape("a", "area"), shape("b", "arrow")],
      getDisplayRankMap: () => new Map(order.map((key, index) => [key, index])),
      markerOverlayKey: (id) => `marker:${id}`, shapeOverlayKey: (id) => `shape:${id}`,
      markerLabelText: () => "A", selectMarker: vi.fn(), selectShape: vi.fn(),
      mapPointFromEvent: () => ({ x: 0, y: 0 }), beginEditorTransaction: vi.fn(),
      setSelectedLabelMarkerId: vi.fn(), setMarkerDrag: vi.fn(), setLabelDrag: vi.fn(), setShapeDrag: vi.fn()
    });
    const check = () => {
      const container = svg.querySelector('g[data-layer="objects-wrap"]')!;
      expect(container.children).toHaveLength(3);
      for (const world of container.children) {
        expect(world.children.map((group) => group.getAttribute("data-order-key")))
          .toEqual([...order, "marker:preview"]);
        expect(world.children.at(-1)?.hasAttribute("data-preview")).toBe(true);
      }
    };
    renderer.renderMarkers();
    check();
    order = ["shape:b", "shape:a", "marker:m"];
    renderer.renderMarkers();
    check();
    const viewport = new MapViewportController({
      svg: svg as unknown as SVGSVGElement, canvas: null, mapStage: null, zoomIndicator: null,
      getActiveStep: () => "3", getCropBBox: () => null,
      requestBasemapDraw: vi.fn(), updateMarkerStyles: vi.fn(), onViewChanged: vi.fn(),
      renderMarkers: renderer.renderMarkers, hasSelectedLabel: () => false, scheduleDirtyCheck: vi.fn(),
      mapWidth: 1200, mapHeight: 800, minScale: 0.5, maxScale: 10, wraps: [-1, 0, 1],
    });
    viewport.view.tx = -600;
    viewport.updateWrapTransforms();
    check();
    expect(svg.querySelector('g[data-layer="objects-wrap"]')!.children.map((world) => world.getAttribute("transform")))
      .toEqual(["translate(0 0)", "translate(1200 0)", "translate(2400 0)"]);
  });
});
