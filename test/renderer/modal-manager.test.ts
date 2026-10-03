import { describe, expect, it, vi } from "vitest";
import { ModalManager } from "../../src/renderer/ui/modal-manager.js";

class Element extends EventTarget {
  children: Element[] = [];
  parent: Element | null = null;
  inert = false;
  disabled = false;
  visible = true;
  isConnected = true;
  tabIndex = -1;
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  properties = new Map<string, string>();
  style = { setProperty: (key: string, value: string) => this.properties.set(key, value), removeProperty: (key: string) => this.properties.delete(key) };
  constructor(readonly root: Root) { super(); }
  append(child: Element) { child.parent = this; this.children.push(child); return child; }
  contains(target: Element | null): boolean { return target === this || this.children.some((child) => child.contains(target)); }
  closest(): Element | null { return this.inert ? this : this.parent?.closest() ?? null; }
  matches() { return this.disabled; }
  getClientRects() { return this.visible ? [{}] : []; }
  querySelectorAll(): Element[] { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
  querySelector() { return null; }
  focus() {
    if (this.closest()) return;
    this.root.activeElement = this;
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: this });
    this.root.dispatchEvent(event);
  }
}
class Root extends EventTarget {
  body = new Element(this);
  activeElement: Element | null = null;
}
function setup() {
  const root = new Root();
  const background = root.body.append(new Element(root));
  const trigger = background.append(new Element(root));
  trigger.tabIndex = 0;
  trigger.focus();
  const modal = root.body.append(new Element(root));
  const first = modal.append(new Element(root));
  const last = modal.append(new Element(root));
  first.tabIndex = last.tabIndex = 0;
  const manager = new ModalManager(root as unknown as Document);
  const dismiss = vi.fn(() => manager.close(modal as unknown as HTMLElement));
  const open = () => manager.open(modal as unknown as HTMLElement, { onDismiss: dismiss, initialFocus: () => last as unknown as HTMLElement });
  const key = (key: string, shiftKey = false) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, shiftKey });
    root.dispatchEvent(event);
    return event;
  };
  return { root, background, trigger, modal, first, last, manager, dismiss, open, key };
}

describe("ModalManager", () => {
  it("focuses the requested control and restores the invoker", () => {
    const s = setup();
    s.open();
    expect(s.root.activeElement).toBe(s.last);
    expect(s.background.inert).toBe(true);
    s.manager.close(s.modal as unknown as HTMLElement);
    expect(s.root.activeElement).toBe(s.trigger);
    expect(s.background.inert).toBe(false);
    expect(s.manager.hasOpenModal).toBe(false);
  });
  it("traps forward and backward Tab, skipping hidden and disabled controls", () => {
    const s = setup();
    s.open();
    expect(s.key("Tab").defaultPrevented).toBe(true);
    expect(s.root.activeElement).toBe(s.first);
    s.key("Tab", true);
    expect(s.root.activeElement).toBe(s.last);
    s.first.disabled = true;
    s.key("Tab");
    expect(s.root.activeElement).toBe(s.last);
    s.first.disabled = false;
    s.first.visible = false;
    s.key("Tab");
    expect(s.root.activeElement).toBe(s.last);
  });
  it("closes only the top modal and restores focus to its parent", () => {
    const s = setup();
    s.open();
    const nested = s.root.body.append(new Element(s.root));
    const button = nested.append(new Element(s.root));
    button.tabIndex = 0;
    const dismiss = vi.fn(() => s.manager.close(nested as unknown as HTMLElement));
    s.manager.open(nested as unknown as HTMLElement, { onDismiss: dismiss });
    expect(s.modal.inert).toBe(true);
    expect(nested.properties.get("--modal-stack-index")).toBe("1");
    s.key("Escape");
    expect(dismiss).toHaveBeenCalledOnce();
    expect(s.dismiss).not.toHaveBeenCalled();
    expect(s.root.activeElement).toBe(s.last);
    expect(s.modal.inert).toBe(false);
    expect(s.background.inert).toBe(true);
    s.key("Escape");
    expect(s.root.activeElement).toBe(s.trigger);
  });
  it("retains native Tab behavior between controls inside the dialog", () => {
    const s = setup();
    s.open();
    s.first.focus();
    expect(s.key("Tab").defaultPrevented).toBe(false);
  });
  it("does not dismiss the dialog while the input method is composing", () => {
    const s = setup();
    s.open();
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "Escape", isComposing: true });
    s.root.dispatchEvent(event);
    expect(s.dismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
  it("preserves pre-existing inert state", () => {
    const s = setup();
    s.background.inert = true;
    s.open();
    s.key("Escape");
    expect(s.background.inert).toBe(true);
  });
  it("does not restore focus into a parent closed under a nested modal", () => {
    const s = setup();
    s.open();
    const nested = s.root.body.append(new Element(s.root));
    s.manager.open(nested as unknown as HTMLElement, { onDismiss: () => {} });
    s.manager.close(s.modal as unknown as HTMLElement);
    s.manager.close(nested as unknown as HTMLElement);
    expect(s.root.activeElement).toBe(s.trigger);
  });
  it("ignores duplicate opens and closes", () => {
    const s = setup();
    s.open();
    s.open();
    s.key("Escape");
    s.manager.close(s.modal as unknown as HTMLElement);
    expect(s.dismiss).toHaveBeenCalledOnce();
    expect(s.manager.hasOpenModal).toBe(false);
    expect(s.root.activeElement).toBe(s.trigger);
  });
  it("routes backdrop dismissal only to the top dialog", () => {
    const s = setup();
    s.open();
    const click = (target: Element) => {
      const event = new Event("click");
      Object.defineProperty(event, "target", { value: target });
      s.root.dispatchEvent(event);
    };
    click(s.first);
    expect(s.dismiss).not.toHaveBeenCalled();
    click(s.modal);
    expect(s.dismiss).toHaveBeenCalledOnce();
  });
  it("recovers escaped focus and tolerates a disconnected invoker", () => {
    const s = setup();
    s.open();
    s.root.activeElement = s.trigger;
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: s.trigger });
    s.root.dispatchEvent(event);
    expect(s.root.activeElement).toBe(s.last);
    s.trigger.isConnected = false;
    expect(() => s.key("Escape")).not.toThrow();
  });
  it("keeps an empty dialog focusable without invalid Tab indexes", () => {
    const s = setup();
    s.first.disabled = s.last.disabled = true;
    s.open();
    s.key("Tab");
    expect(s.root.activeElement).toBe(s.modal);
  });
});
