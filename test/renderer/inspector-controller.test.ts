import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorController } from "../../src/renderer/controllers/inspector-controller.js";
import { normalizeHexColor } from "../../src/renderer/ui/color-control.js";
import { bindRotationControl } from "../../src/renderer/ui/rotation-control.js";
import { defaultMarkerStyle, defaultShapeStyle } from "../../src/renderer/editor/defaults.js";
import type { Marker, ShapeItem } from "../../src/renderer/editor/types.js";

class Control extends EventTarget {
  value = "";
  hidden = false;
  disabled = false;
  innerHTML = "";
  title = "";
  className = "";
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  children: Control[] = [];
  parts = new Map<string, Control>();
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    toggle: (name: string, active: boolean) => {
      if (active) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
  get valueAsNumber(): number { return this.value === "" ? NaN : Number(this.value); }
  querySelector(selector: string): Control | null { return this.parts.get(selector) ?? null; }
  appendChild(child: Control): void { this.children.push(child); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

function setup() {
  const controls = new Map<string, Control>();
  const palettes = new Map<string, Control[]>();
  for (const id of ["itemNameInput", "markerDotColor", "markerTextColor", "markerFont", "markerLabelInput", "markerCoordsInput", "shapeTextInput", "shapeTextColor", "shapeTextFont", "shapeLineColor", "shapeLineRotation", "shapeArrowColor", "shapeArrowRotation", "shapeAreaFill", "shapeAreaStroke"]) {
    controls.set(id, new Control());
  }
  for (const id of ["markerDotSize", "markerTextSize", "shapeTextSize", "shapeLineWidth", "shapeArrowWidth", "shapeAreaOpacity", "shapeAreaStrokeWidth"]) {
    const slider = new Control();
    slider.dataset = { min: "0", max: id === "shapeAreaOpacity" ? "1" : "100", step: id === "shapeAreaOpacity" ? "0.1" : "1" };
    for (const part of [".slider-track", ".slider-fill", ".slider-thumb", ".slider-marks"]) slider.parts.set(part, new Control());
    controls.set(id, slider);
  }
  for (const id of ["dotPalette", "textPalette", "shapeTextPalette", "shapeLinePalette", "shapeArrowPalette", "shapeAreaFillPalette", "shapeAreaStrokePalette"]) {
    const swatch = new Control();
    swatch.dataset.color = "#ef4444";
    palettes.set(id, [swatch]);
  }
  const root = {
    getElementById: (id: string) => controls.get(id) ?? null,
    querySelectorAll: (selector: string) => palettes.get(selector.replace(/^#/, "").replace(/ \.color-swatch$/, "")) ?? [],
    createElement: () => new Control(),
  } as unknown as Document;
  vi.stubGlobal("document", root);
  let marker: Marker | null = {
    objectKind: "marker", id: "m", layerId: "l", name: "Test", latitude: 25, longitude: 121,
    sourceType: "coords", labelMode: "coords", labelName: "Custom", style: defaultMarkerStyle(),
  };
  let shape: ShapeItem | null = null;
  const updateMarker = vi.fn((_marker: Marker, update: (draft: Marker) => void, _mergeKey?: string) => { update(marker!); return true; });
  const updateShape = vi.fn((_shape: ShapeItem, update: (draft: ShapeItem) => void) => { update(shape!); return true; });
  const render = vi.fn();
  const inspector = new InspectorController({
    getSelectedMarker: () => marker, getEditableMarker: () => marker, getSelectedShape: () => shape,
    getShapes: () => shape ? [shape] : [], markerListName: (item) => item.name, shapeDefaultName: (item) => item.type,
    updateMarker, updateShape, renderMapObjects: render, renderObjectList: vi.fn(),
  }, root);
  inspector.bind();
  const input = (id: string, value: string, event = "input") => {
    const control = controls.get(id)!;
    control.value = value;
    control.dispatchEvent(new Event(event));
  };
  const slider = (id: string) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "key", { value: "ArrowRight" });
    controls.get(id)!.parts.get(".slider-thumb")!.dispatchEvent(event);
  };
  const selectShape = (type: ShapeItem["type"]) => {
    marker = null;
    shape = { objectKind: "shape", id: "s", layerId: "l", type, longitude: 121, latitude: 25, width: 20, height: 10, rotation: 30, text: "Custom text", style: defaultShapeStyle(type) };
    inspector.syncShape(shape);
    return shape;
  };
  return { inspector, controls, palettes, input, slider, selectShape, getMarker: () => marker!, updateMarker, updateShape, render };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Inspector field edits", () => {
  it("syncs without submitting commands and binds only once", () => {
    const f = setup();
    f.inspector.syncMarker(f.getMarker());
    expect(f.updateMarker).not.toHaveBeenCalled();
    f.inspector.bind();
    f.input("markerDotColor", "#ef4444");
    expect(f.updateMarker).toHaveBeenCalledTimes(1);
  });

  it.each(["markerDotColor", "markerTextColor"])("editing %s preserves label mode and unsupported fonts", (id) => {
    const f = setup();
    const marker = f.getMarker();
    marker.style.fontFamily = "Unavailable font";
    f.inspector.syncMarker(marker);
    f.controls.get("markerFont")!.value = "";
    f.controls.get("markerLabelInput")!.value = "stale";
    const before = structuredClone(marker);
    f.input(id, "#ef4444");
    before.style[id === "markerDotColor" ? "dotColor" : "textColor"] = "#ef4444";
    expect(marker).toEqual(before);
  });

  it("changes label mode only when display text is edited", () => {
    const f = setup();
    f.input("markerLabelInput", " New label ");
    expect(f.getMarker()).toMatchObject({ labelName: "New label", labelMode: "name" });
  });

  it("keeps discrete marker palette clicks separate from continuous color edits", () => {
    const f = setup();
    f.input("markerDotColor", "#ef4444");
    expect(f.updateMarker.mock.calls[0][2]).toBe("marker:m:dot-color");
    f.palettes.get("dotPalette")![0].dispatchEvent(new Event("click"));
    expect(f.updateMarker.mock.calls[1][2]).toBeUndefined();
  });

  it.each(["markerDotSize", "markerTextSize"])("%s changes only its numeric field", (id) => {
    const f = setup();
    f.inspector.syncMarker(f.getMarker());
    const before = structuredClone(f.getMarker());
    const property = id === "markerDotSize" ? "dotSize" : "textSize";
    f.slider(id);
    before.style[property] += 1;
    expect(f.getMarker()).toEqual(before);
  });

  it.each(["line", "arrow"] as const)("%s rotation leaves width and color unchanged", (type) => {
    const f = setup();
    const shape = f.selectShape(type);
    const before = structuredClone(shape);
    f.controls.get(type === "line" ? "shapeLineColor" : "shapeArrowColor")!.value = "#ef4444";
    const id = type === "line" ? "shapeLineRotation" : "shapeArrowRotation";
    f.input(id, "400");
    before.rotation = 360;
    expect(shape).toEqual(before);
    f.input(id, "");
    expect(shape.rotation).toBe(360);
    f.input(id, "", "change");
    expect(f.controls.get(id)!.value).toBe("360");
  });

  it("ignores controls belonging to a different shape type", () => {
    const f = setup();
    const shape = f.selectShape("area");
    const before = structuredClone(shape);
    f.input("shapeArrowRotation", "90");
    f.palettes.get("shapeTextPalette")![0].dispatchEvent(new Event("click"));
    expect(shape).toEqual(before);
    expect(f.updateShape).not.toHaveBeenCalled();
  });

  it("routes each palette only to its own color field", () => {
    const f = setup();
    const shape = f.selectShape("area");
    const before = structuredClone(shape);
    f.palettes.get("shapeAreaFillPalette")![0].dispatchEvent(new Event("click"));
    before.style.fillColor = "#ef4444";
    expect(shape).toEqual(before);
    expect(f.updateMarker).not.toHaveBeenCalled();
    expect(f.palettes.get("shapeAreaFillPalette")![0].attributes.get("aria-pressed")).toBe("true");
  });

  it("opacity does not rewrite area colors", () => {
    const f = setup();
    const shape = f.selectShape("area");
    const before = structuredClone(shape);
    f.controls.get("shapeAreaFill")!.value = "#ef4444";
    f.slider("shapeAreaOpacity");
    before.style.fillOpacity = Math.round((before.style.fillOpacity + 0.1) * 10) / 10;
    expect(shape).toEqual(before);
  });
});

describe("shared rotation control", () => {
  function setupRotation() {
    vi.useFakeTimers();
    const input = new Control();
    input.value = "30";
    const view = new EventTarget();
    Object.assign(input, { ownerDocument: { defaultView: view } });
    const button = new Control();
    button.dataset.rotationStep = "1";
    Object.assign(button, { setPointerCapture: vi.fn() });
    let selection: { id: string; rotation: number } | null = { id: "first", rotation: 30 };
    const onChange = vi.fn((rotation: number) => { if (selection) selection.rotation = rotation; });
    bindRotationControl(input as unknown as HTMLInputElement, [button as unknown as HTMLButtonElement], () => selection, onChange);
    const press = () => {
      const event = new Event("pointerdown", { cancelable: true });
      Object.assign(event, { button: 0, pointerId: 1 });
      button.dispatchEvent(event);
    };
    return { press, view, onChange, select: (value: typeof selection) => { selection = value; } };
  }

  it("stops a held button before it edits a newly selected object", () => {
    const f = setupRotation();
    f.press();
    expect(f.onChange).toHaveBeenLastCalledWith(31);
    vi.advanceTimersByTime(455);
    expect(f.onChange).toHaveBeenLastCalledWith(32);
    f.select({ id: "second", rotation: 90 });
    vi.advanceTimersByTime(150);
    expect(f.onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops button repetition on window blur", () => {
    const f = setupRotation();
    f.press();
    f.view.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);
    expect(f.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start repetition without a matching selection", () => {
    const f = setupRotation();
    f.select(null);
    f.press();
    expect(f.onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

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
