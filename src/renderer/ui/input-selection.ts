export function bindFirstClickSelect(
  input: HTMLInputElement | null,
  shouldSelect: () => boolean,
): void {
  if (!input) {
    return;
  }
  let consumedInFocus = false;
  input.addEventListener("blur", () => {
    consumedInFocus = false;
  });
  input.addEventListener("focus", () => {
    if (!shouldSelect() || consumedInFocus) {
      return;
    }
    consumedInFocus = true;
    requestAnimationFrame(() => input.select());
  });
  input.addEventListener("mousedown", (event) => {
    if (!shouldSelect() || consumedInFocus) {
      return;
    }
    event.preventDefault();
    consumedInFocus = true;
    input.focus();
    requestAnimationFrame(() => input.select());
  });
}
