import { ensureWrapGroup } from "../map/rendering-utils.js";

type Entry = { node: SVGGElement; signature: string };
type World = { node: SVGGElement; entries: Map<string, Entry>; seen: Set<string> };

/** Keeps object groups and their listeners until their presentation actually changes. */
export class RetainedScene {
  private parent: SVGGElement | null = null;
  private readonly worlds = new Map<number, World>();

  begin(parent: SVGGElement, wraps: readonly number[], width: number, shift: number): void {
    if (this.parent !== parent) {
      this.worlds.clear();
      this.parent = parent;
    }
    const active = new Set(wraps);
    for (const [index, world] of this.worlds) {
      if (!active.has(index)) {
        world.node.remove();
        this.worlds.delete(index);
      }
    }
    for (const index of wraps) {
      const node = ensureWrapGroup(parent, `object-${index}`, (index + shift) * width);
      let world = this.worlds.get(index);
      if (!world || world.node !== node) {
        world = { node, entries: new Map(), seen: new Set() };
        this.worlds.set(index, world);
      }
      world.seen.clear();
    }
  }

  update(index: number, key: string, signature: string): SVGGElement | null {
    const world = this.worlds.get(index);
    if (!world) throw new Error("World must be prepared before rendering");
    world.seen.add(key);
    let entry = world.entries.get(key);
    if (entry && entry.signature === signature) return null;
    if (!entry) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
      entry = { node, signature };
      world.entries.set(key, entry);
      world.node.appendChild(node);
    } else {
      entry.node.replaceChildren();
      entry.signature = signature;
    }
    return entry.node;
  }

  finish(rankMap: ReadonlyMap<string, number>): void {
    for (const world of this.worlds.values()) {
      for (const [key, entry] of world.entries) {
        if (!world.seen.has(key)) {
          entry.node.remove();
          world.entries.delete(key);
        }
      }
      const children = Array.from(world.node.children);
      const rank = (node: Element) => node.hasAttribute("data-preview")
        ? Number.MAX_SAFE_INTEGER
        : rankMap.get(node.getAttribute("data-order-key") ?? "") ?? Number.MAX_SAFE_INTEGER - 1;
      const ordered = [...children].sort((a, b) => rank(a) - rank(b));
      if (ordered.some((node, index) => node !== children[index])) {
        ordered.forEach((node) => world.node.appendChild(node));
      }
    }
  }

  invalidate(): void {
    for (const world of this.worlds.values()) {
      for (const entry of world.entries.values()) entry.signature = "";
    }
  }
}
