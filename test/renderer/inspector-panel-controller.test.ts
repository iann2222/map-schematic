import { describe, expect, it, vi } from "vitest";
import { InspectorPanelController } from "../../src/renderer/controllers/inspector-panel-controller.js";

function setup(animated = false, reducedMotion = false) {
  const classes = new Set<string>();
  const button = () => {
    const node = new EventTarget();
    const attributes = new Map<string, string>();
    return Object.assign(node, {
      attributes, focus: vi.fn(),
      setAttribute: (key: string, value: string) => attributes.set(key, value),
    });
  };
  const collapseButton = button();
  const expandButton = button();
  const content = { hidden: false };
  const rail = { hidden: false };
  const animations: { finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn(() => {
    let finish!: () => void;
    let reject!: (reason: Error) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const cancel = vi.fn(() => reject(new Error("Animation canceled")));
    animations.push({ finish, cancel });
    return { finished, cancel } as unknown as Animation;
  });
  if (animated) {
    for (const element of [content, rail]) Object.assign(element, {
      animate, ownerDocument: { defaultView: { matchMedia: () => ({ matches: reducedMotion }) } },
    });
  }
  const onLayoutChange = vi.fn();
  const beforeLayoutChange = vi.fn(() => content.hidden);
  const isActive = vi.fn(() => true);
  const controller = new InspectorPanelController({
    layout: { classList: { toggle: (name: string, enabled: boolean) => {
      if (enabled) classes.add(name); else classes.delete(name);
    } } } as unknown as HTMLElement,
    content: content as HTMLElement, rail: rail as HTMLElement,
    collapseButton: collapseButton as unknown as HTMLButtonElement,
    expandButton: expandButton as unknown as HTMLButtonElement,
    onLayoutChange, beforeLayoutChange, isActive,
  });
  controller.bind();
  return { controller, classes, content, rail, collapseButton, expandButton, onLayoutChange, beforeLayoutChange, animations, animate, isActive };
}

describe("Inspector panel visibility", () => {
  it("starts expanded without resizing or taking keyboard focus", () => {
    const state = setup();
    expect(state.content.hidden).toBe(false);
    expect(state.rail.hidden).toBe(true);
    expect(state.collapseButton.attributes.get("aria-expanded")).toBe("true");
    expect(state.onLayoutChange).not.toHaveBeenCalled();
    expect(state.collapseButton.focus).not.toHaveBeenCalled();
  });

  it("hides controls, preserves an accessible entry and moves focus on each toggle", () => {
    const state = setup();
    state.collapseButton.dispatchEvent(new Event("click"));
    expect(state.classes.has("inspector-collapsed")).toBe(true);
    expect(state.content.hidden).toBe(true);
    expect(state.rail.hidden).toBe(false);
    expect(state.expandButton.attributes.get("aria-expanded")).toBe("false");
    expect(state.expandButton.focus).toHaveBeenCalledWith({ preventScroll: true });
    state.expandButton.dispatchEvent(new Event("click"));
    expect(state.classes.has("inspector-collapsed")).toBe(false);
    expect(state.content.hidden).toBe(false);
    expect(state.rail.hidden).toBe(true);
    expect(state.collapseButton.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(state.onLayoutChange).toHaveBeenCalledTimes(2);
    expect(state.beforeLayoutChange.mock.results.map(result => result.value)).toEqual([false, true]);
  });

  it("ignores repeated requests without redundant resize work", () => {
    const state = setup();
    state.controller.setCollapsed(false);
    state.controller.setCollapsed(true);
    state.controller.setCollapsed(true);
    expect(state.onLayoutChange).toHaveBeenCalledTimes(1);
  });

  it("fades out before resizing once, then reveals the incoming panel", async () => {
    const state = setup(true);
    state.controller.setCollapsed(true);
    expect(state.content.hidden).toBe(false);
    expect(state.onLayoutChange).not.toHaveBeenCalled();
    state.animations[0].finish();
    await Promise.resolve();
    expect(state.content.hidden).toBe(true);
    expect(state.animate).toHaveBeenCalledTimes(2);
    expect(state.onLayoutChange).toHaveBeenCalledTimes(1);
    state.animations[1].finish();
    await Promise.resolve();
    expect(state.animations[1].cancel).toHaveBeenCalledOnce();
    expect(state.onLayoutChange).toHaveBeenCalledTimes(1);
  });

  it("cancels an outgoing transition when reversed without applying stale state", async () => {
    const state = setup(true);
    state.controller.setCollapsed(true);
    state.controller.setCollapsed(true);
    state.controller.setCollapsed(false);
    state.animations[0].finish();
    await Promise.resolve();
    expect(state.animations[0].cancel).toHaveBeenCalledOnce();
    expect(state.content.hidden).toBe(false);
    expect(state.onLayoutChange).not.toHaveBeenCalled();
  });

  it("does not resize another step or steal focus if the workflow changes mid-animation", async () => {
    const state = setup(true);
    state.controller.setCollapsed(true);
    state.isActive.mockReturnValue(false);
    state.animations[0].finish();
    await Promise.resolve();
    expect(state.content.hidden).toBe(true);
    expect(state.onLayoutChange).not.toHaveBeenCalled();
    expect(state.expandButton.focus).not.toHaveBeenCalled();
    expect(state.animate).toHaveBeenCalledTimes(1);
  });

  it("switches immediately without animations when reduced motion is enabled", () => {
    const state = setup(true, true);
    state.controller.setCollapsed(true);
    expect(state.content.hidden).toBe(true);
    expect(state.animate).not.toHaveBeenCalled();
    expect(state.onLayoutChange).toHaveBeenCalledOnce();
  });

  it("can reverse during the reveal without a stale completion changing visibility", async () => {
    const state = setup(true);
    state.controller.setCollapsed(true);
    state.animations[0].finish();
    await Promise.resolve();
    state.controller.setCollapsed(false);
    expect(state.animations[1].cancel).toHaveBeenCalledOnce();
    state.animations[2].finish();
    await Promise.resolve();
    state.animations[3].finish();
    await Promise.resolve();
    expect(state.content.hidden).toBe(false);
    expect(state.rail.hidden).toBe(true);
    expect(state.onLayoutChange).toHaveBeenCalledTimes(2);
  });
});
