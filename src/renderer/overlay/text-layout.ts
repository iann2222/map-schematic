import { rendererPerformance } from "../performance/diagnostics.js";

export type TextBounds = { x: number; y: number; width: number; height: number };
type Request = { label: SVGTextElement; apply: (bounds: TextBounds) => void };

/** Measures after all text is attached, then writes hit areas in a separate pass. */
export class TextLayout {
  private readonly cache = new Map<string, TextBounds>();
  private pending: Request[] = [];

  constructor(private readonly limit = 2048) {}

  enqueue(label: SVGTextElement, apply: Request["apply"]): void {
    this.pending.push({ label, apply });
  }

  flush(): void {
    const pending = this.pending;
    this.pending = [];
    const bounds = pending.map(({ label }) => this.measure(label));
    pending.forEach(({ apply }, index) => apply(bounds[index]));
  }

  clear(): void {
    this.cache.clear();
    this.discard();
  }

  discard(): void {
    this.pending = [];
  }

  private measure(label: SVGTextElement): TextBounds {
    const key = JSON.stringify([
      label.textContent, label.getAttribute("font-family"), label.getAttribute("font-size"),
      label.getAttribute("text-anchor"),
    ]);
    const x = Number(label.getAttribute("x") ?? 0);
    const y = Number(label.getAttribute("y") ?? 0);
    let local = this.cache.get(key);
    if (!local) {
      const measured = rendererPerformance.measure("overlay.textMeasure", () => label.getBBox());
      local = { x: measured.x - x, y: measured.y - y, width: measured.width, height: measured.height };
      this.cache.set(key, local);
      if (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
    } else {
      rendererPerformance.record("overlay.textCacheHit", 0);
      // Refresh insertion order for bounded LRU eviction.
      this.cache.delete(key);
      this.cache.set(key, local);
    }
    return { x: x + local.x, y: y + local.y, width: local.width, height: local.height };
  }
}
