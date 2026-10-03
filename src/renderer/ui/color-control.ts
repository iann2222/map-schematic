export function normalizeHexColor(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    const expanded = value.split("").map((digit) => digit + digit).join("");
    return `#${expanded.toLowerCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null;
}

/** One color input and its palette share presentation and a single edit callback. */
export class ColorControl {
  constructor(
    private readonly input: HTMLInputElement,
    private readonly swatches: readonly HTMLButtonElement[],
    private readonly onChange: (
      color: string,
      source: "input" | "palette",
    ) => boolean,
  ) {}

  bind(): void {
    this.input.addEventListener("input", () =>
      this.apply(this.input.value, "input"),
    );
    for (const swatch of this.swatches) {
      swatch.addEventListener("click", () =>
        this.apply(swatch.dataset.color ?? "", "palette"),
      );
    }
    this.sync(this.input.value);
  }

  sync(color: string): void {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    this.input.value = normalized;
    for (const swatch of this.swatches) {
      const swatchColor = swatch.dataset.color ?? "";
      const active = normalizeHexColor(swatchColor) === normalized;
      swatch.classList.toggle("active", active);
      swatch.setAttribute("aria-pressed", String(active));
      swatch.setAttribute(
        "aria-label",
        active ? `目前顏色 ${swatchColor}` : `選擇顏色 ${swatchColor}`,
      );
      swatch.title = swatchColor;
    }
  }

  private apply(value: string, source: "input" | "palette"): void {
    const color = normalizeHexColor(value);
    if (color && this.onChange(color, source)) this.sync(color);
  }
}
