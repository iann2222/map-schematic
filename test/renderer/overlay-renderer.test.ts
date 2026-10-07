import { afterEach, describe, expect, it, vi } from "vitest";
import { createOverlayRenderer } from "../../src/renderer/overlay/overlay-renderer.js";
import { MapViewportController } from "../../src/renderer/controllers/map-viewport-controller.js";
import { defaultMarkerStyle, defaultShapeStyle } from "../../src/renderer/editor/defaults.js";
import type { Marker, ShapeItem } from "../../src/renderer/editor/types.js";

class SvgNode {
  static measures = 0;
  children: SvgNode[] = [];
  attributes = new Map<string, string>();
  parent: SvgNode | null = null;
  style = {};
  textContent = "";
  listeners = new Map<string, Array<(event: MouseEvent) => void>>();
  viewBox = { baseVal: { width: 1200, height: 800 } };
  constructor(readonly tagName: string) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  hasAttribute(key: string) { return this.attributes.has(key); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  addEventListener(type: string, listener: (event: MouseEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string) {
    const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
  getBBox() {
    SvgNode.measures += 1;
    return { x: Number(this.getAttribute("x") ?? 0), y: Number(this.getAttribute("y") ?? 0) - 8, width: this.textContent.length * 6, height: 10 };
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = null;
  }
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

afterEach(() => { vi.unstubAllGlobals(); SvgNode.measures = 0; });

function setupRetainedRenderer(fonts?: unknown) {
  vi.stubGlobal("document", { fonts, createElementNS: (_ns: string, tag: string) => new SvgNode(tag) });
  const svg = new SvgNode("svg");
  const marker: Marker = {
    objectKind: "marker", id: "m", layerId: "layer-1", name: "A", latitude: 0, longitude: 0,
    sourceType: "manual", labelMode: "name", showLabel: true, style: defaultMarkerStyle(),
  };
  const shape: ShapeItem = {
    objectKind: "shape", id: "s", layerId: "layer-1", type: "text", text: "Text",
    latitude: 0, longitude: 0, width: 100, height: 50, style: defaultShapeStyle("text"),
  };
  const model = { markers: [marker], shapes: [shape], order: ["marker:m", "shape:s"] };
  const state = {
    svg: svg as unknown as SVGSVGElement, view: { scale: 1 }, WRAPS: [-1, 0, 1],
    worldShift: 0, activeStep: "3", selectedMarkerId: null as string | null, selectedShapeId: null as string | null,
    selectedLabelMarkerId: null as string | null, previewMarker: null as Marker | null,
    previewToolMarker: null, previewShape: null, labelDrag: null, shapeDrag: null, lastScaleFit: 1,
  };
  const beginMarkerDrag = vi.fn();
  const renderer = createOverlayRenderer({
    getState: () => state, markerObjects: () => model.markers, shapeObjects: () => model.shapes,
    getDisplayRankMap: () => new Map(model.order.map((key, index) => [key, index])),
    markerOverlayKey: (id) => `marker:${id}`, shapeOverlayKey: (id) => `shape:${id}`,
    markerLabelText: (item) => item.name, selectMarker: vi.fn(), selectShape: vi.fn(),
    mapPointFromEvent: () => ({ x: 0, y: 0 }), beginEditorTransaction: vi.fn(),
    setSelectedLabelMarkerId: vi.fn(), setMarkerDrag: beginMarkerDrag,
    setLabelDrag: vi.fn(), setShapeDrag: vi.fn(),
  });
  const worlds = () => svg.querySelector('g[data-layer="objects-wrap"]')!.children;
  return { renderer, svg, model, state, worlds, beginMarkerDrag };
}

describe("retained overlay rendering", () => {
  it("recovers from a text layout failure without retaining incomplete groups", () => {
    const { renderer, worlds } = setupRetainedRenderer();
    const measure = vi.spyOn(SvgNode.prototype, "getBBox").mockImplementationOnce(() => { throw new Error("layout"); });
    expect(() => renderer.renderMarkers()).toThrow("layout");
    measure.mockRestore();
    renderer.renderMarkers();
    worlds().forEach((world) => {
      expect(world.children).toHaveLength(2);
      expect(world.children[0].children.some((node) => node.getAttribute("data-marker") === "label-hit")).toBe(true);
    });
  });
  it("preserves unchanged nodes and shares text measurements across all world copies", () => {
    const { renderer, model, worlds, beginMarkerDrag } = setupRetainedRenderer();
    renderer.renderMarkers();
    const groups = worlds().map((world) => [...world.children]);
    const shapeLabels = groups.map((items) => items[1].children.find((node) => node.tagName === "text"));
    const measurements = SvgNode.measures;
    expect(measurements).toBe(2);
    renderer.renderMarkers();
    worlds().forEach((world, index) => expect(world.children).toEqual(groups[index]));
    model.markers = [{ ...model.markers[0], longitude: 30 }];
    renderer.renderMarkers();
    worlds().forEach((world, index) => {
      expect(world.children[1].children.find((node) => node.tagName === "text")).toBe(shapeLabels[index]);
      expect(world.children[0].children.find((node) => node.getAttribute("data-marker") === "dot")?.getAttribute("cx")).toBe("700.00");
      world.children[0].children.find((node) => node.getAttribute("data-marker") === "dot-hit")!.fire("mousedown");
    });
    expect(beginMarkerDrag).toHaveBeenLastCalledWith(expect.objectContaining({ startLon: 30 }));
    expect(SvgNode.measures).toBe(measurements);
  });

  it("reorders existing groups, deletes stale objects and removes previews", () => {
    const { renderer, model, state, worlds } = setupRetainedRenderer();
    renderer.renderMarkers();
    const original = [...worlds()[0].children];
    model.order.reverse(); renderer.renderMarkers();
    expect(worlds()[0].children).toEqual([...original].reverse());
    state.previewMarker = { ...model.markers[0], id: "preview" };
    renderer.renderMarkers();
    expect(worlds()[0].children.at(-1)?.hasAttribute("data-preview")).toBe(true);
    state.previewMarker = null; model.markers = [];
    renderer.renderMarkers();
    worlds().forEach((world) => expect(world.children.map((node) => node.getAttribute("data-order-key"))).toEqual(["shape:s"]));
    model.shapes = []; renderer.renderMarkers();
    worlds().forEach((world) => expect(world.children).toHaveLength(0));
  });

  it("invalidates text bounds for edits and zoom while keeping selection current", () => {
    const { renderer, state, model, worlds } = setupRetainedRenderer();
    renderer.renderMarkers();
    state.selectedShapeId = "s"; renderer.renderMarkers();
    expect(worlds()[0].children[1].children.some((node) => node.getAttribute("data-shape") === "text-selection")).toBe(true);
    expect(SvgNode.measures).toBe(2);
    model.shapes[0].text = "Longer text"; renderer.renderMarkers();
    expect(SvgNode.measures).toBe(3);
    const oldRadius = Number(worlds()[0].children[0].children.find((node) => node.getAttribute("data-marker") === "dot")!.getAttribute("r"));
    state.view.scale = 2; renderer.renderMarkers();
    expect(Number(worlds()[0].children[0].children.find((node) => node.getAttribute("data-marker") === "dot")!.getAttribute("r"))).toBeCloseTo(oldRadius / 2);
    expect(SvgNode.measures).toBeGreaterThan(3);
    state.selectedShapeId = null; renderer.renderMarkers();
    expect(worlds()[0].children[1].children.some((node) => node.getAttribute("data-shape") === "text-selection")).toBe(false);
  });

  it("refreshes font measurements and releases font listeners on disposal", () => {
    const callbacks = new Map<string, () => void>();
    const fonts = {
      addEventListener: vi.fn((name: string, callback: () => void) => callbacks.set(name, callback)),
      removeEventListener: vi.fn((name: string) => callbacks.delete(name)),
    };
    const { renderer } = setupRetainedRenderer(fonts);
    const request = vi.fn(() => 1); const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
    renderer.renderMarkers(); expect(SvgNode.measures).toBe(2);
    callbacks.get("loadingdone")!();
    renderer.renderMarkers(); expect(SvgNode.measures).toBe(4);
    callbacks.get("loadingerror")!(); renderer.dispose();
    expect(callbacks.size).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });
});

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
      renderMarkers: renderer.renderMarkers, hasSelectedLabel: () => false,
      mapWidth: 1200, mapHeight: 800, minScale: 0.5, maxScale: 10, wraps: [-1, 0, 1],
    });
    viewport.view.tx = -600;
    viewport.updateWrapTransforms();
    check();
    expect(svg.querySelector('g[data-layer="objects-wrap"]')!.children.map((world) => world.getAttribute("transform")))
      .toEqual(["translate(0 0)", "translate(1200 0)", "translate(2400 0)"]);
  });
});
