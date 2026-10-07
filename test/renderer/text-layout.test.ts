import { describe, expect, it, vi } from "vitest";
import { TextLayout, type TextBounds } from "../../src/renderer/overlay/text-layout";

function label(text: string, x = 0, y = 0, font = "sans-serif", size = "10", anchor = "start") {
  const attributes: Record<string, string> = { x: String(x), y: String(y), "font-family": font, "font-size": size, "text-anchor": anchor };
  const getBBox = vi.fn(() => ({ x: x - 2, y: y - 8, width: 40, height: 10 }));
  const node = { textContent: text, getAttribute: (key: string) => attributes[key] ?? null, getBBox };
  return { node: node as unknown as SVGTextElement, getBBox };
}

describe("batched text layout", () => {
  it("reads uncached bounds before performing any hit-area writes", () => {
    const layout = new TextLayout();
    const events: string[] = [];
    const a = label("A"); const b = label("B");
    a.getBBox.mockImplementation(() => { events.push("read A"); return { x: 0, y: 0, width: 40, height: 10 }; });
    b.getBBox.mockImplementation(() => { events.push("read B"); return { x: 0, y: 0, width: 40, height: 10 }; });
    layout.enqueue(a.node, () => events.push("write A"));
    layout.enqueue(b.node, () => events.push("write B"));
    expect(events).toEqual([]);
    layout.flush();
    expect(events).toEqual(["read A", "read B", "write A", "write B"]);
  });
  it("reuses position-independent bounds across world copies and movement", () => {
    const layout = new TextLayout();
    const a = label("A", 100, 200); const b = label("A", 1300, 250);
    const result: TextBounds[] = [];
    layout.enqueue(a.node, (bounds) => result.push(bounds));
    layout.enqueue(b.node, (bounds) => result.push(bounds));
    layout.flush();
    expect(a.getBBox).toHaveBeenCalledTimes(1);
    expect(b.getBBox).not.toHaveBeenCalled();
    expect(result).toEqual([{ x: 98, y: 192, width: 40, height: 10 }, { x: 1298, y: 242, width: 40, height: 10 }]);
    layout.enqueue(b.node, () => {}); layout.flush();
    expect(b.getBBox).not.toHaveBeenCalled();
  });
  it("invalidates by content, font, size and anchor, and clears for font loading", () => {
    const layout = new TextLayout();
    const values = [label("A"), label("B"), label("A", 0, 0, "serif"), label("A", 0, 0, "sans-serif", "12"), label("A", 0, 0, "sans-serif", "10", "end")];
    values.forEach((item) => layout.enqueue(item.node, () => {})); layout.flush();
    values.forEach((item) => expect(item.getBBox).toHaveBeenCalledTimes(1));
    layout.clear(); layout.enqueue(values[0].node, () => {}); layout.flush();
    expect(values[0].getBBox).toHaveBeenCalledTimes(2);
  });
  it("bounds cache size and discards queued work", () => {
    const layout = new TextLayout(2);
    const a = label("A"); const b = label("B"); const c = label("C");
    for (const item of [a, b, c, a]) { layout.enqueue(item.node, () => {}); layout.flush(); }
    expect(a.getBBox).toHaveBeenCalledTimes(2);
    const apply = vi.fn(); layout.enqueue(b.node, apply); layout.discard(); layout.flush();
    expect(apply).not.toHaveBeenCalled();
  });
});
