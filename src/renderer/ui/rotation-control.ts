import { bindFirstClickSelect } from "./input-selection.js";

const clampRotation = (value: number): number => Math.max(0, Math.min(360, value));

export function bindRotationControl(
  input: HTMLInputElement | null,
  buttons: readonly HTMLButtonElement[],
  getSelection: () => { id: string; rotation: number } | null,
  onChange: (rotation: number) => void,
): void {
  if (!input) return;
  bindFirstClickSelect(input, () => true);
  input.addEventListener("input", () => {
    if (!getSelection() || !Number.isFinite(input.valueAsNumber)) return;
    const rotation = clampRotation(input.valueAsNumber);
    input.value = String(rotation);
    onChange(rotation);
  });
  input.addEventListener("change", () => {
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = String(getSelection()?.rotation ?? 0);
    }
  });
  for (const button of buttons) {
    const step = Number(button.dataset.rotationStep);
    if (!Number.isFinite(step)) continue;
    let delay: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = (): void => {
      if (delay !== null) clearTimeout(delay);
      if (interval !== null) clearInterval(interval);
      delay = interval = null;
    };
    const apply = (id: string): void => {
      const selection = getSelection();
      if (!selection || selection.id !== id) {
        stop();
        return;
      }
      const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : selection.rotation;
      input.value = String(clampRotation(current + step));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    button.addEventListener("pointerdown", (event) => {
      const selection = getSelection();
      if (event.button !== 0 || !selection) return;
      event.preventDefault();
      stop();
      apply(selection.id);
      button.setPointerCapture(event.pointerId);
      delay = setTimeout(() => {
        delay = null;
        interval = setInterval(() => apply(selection.id), 75);
      }, 380);
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
    input.ownerDocument?.defaultView?.addEventListener("blur", stop);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const selection = getSelection();
      if (!event.repeat && selection) apply(selection.id);
    });
  }
}
