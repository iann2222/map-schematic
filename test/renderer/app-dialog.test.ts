import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppDialogService, type AppDialogOptions } from "../../src/renderer/ui/app-dialog.js";
import type { ModalManager, ModalOptions } from "../../src/renderer/ui/modal-manager.js";

afterEach(() => vi.unstubAllGlobals());

class Button extends EventTarget {
  type = "";
  textContent = "";
  className = "";
}
function setup() {
  const buttons: Button[] = [];
  const actions = {
    replaceChildren: () => { buttons.length = 0; },
    appendChild: (button: Button) => buttons.push(button),
    classList: { toggle: vi.fn() },
  };
  vi.stubGlobal("document", { createElement: () => new Button() });
  vi.stubGlobal("HTMLButtonElement", Button);
  const open = vi.fn((_element: HTMLElement | null, _options: ModalOptions) => {});
  const close = vi.fn();
  const modals = { open, close } as unknown as ModalManager;
  const elements = {
    modal: {} as HTMLDivElement, dialog: { dataset: {} } as HTMLDivElement,
    icon: null, eyebrow: null, title: { textContent: "" } as HTMLElement,
    message: { textContent: "" } as HTMLElement, detail: null,
    actions: actions as unknown as HTMLElement,
  };
  const service = createAppDialogService(elements, modals);
  const options: AppDialogOptions = {
    title: "First", message: "Continue?", defaultValue: 2, cancelValue: 1,
    buttons: [{ label: "Cancel", value: 1 }, { label: "OK", value: 2, variant: "primary" }],
  };
  const session = () => open.mock.calls.at(-1)![1];
  return { service, options, elements, buttons, open, close, session, modals };
}

describe("AppDialog modal lifecycle", () => {
  it("presents queued requests in order and resolves each with its own cancellation value", async () => {
    const s = setup();
    const first = s.service.show(s.options);
    const second = s.service.show({ ...s.options, title: "Second", cancelValue: 3 });
    expect(s.open).toHaveBeenCalledOnce();
    expect(s.session().initialFocus?.()).toBe(s.buttons[1]);
    s.session().onDismiss();
    expect(await first).toBe(1);
    expect(s.elements.title.textContent).toBe("Second");
    expect(s.open).toHaveBeenCalledTimes(2);
    s.session().onDismiss();
    expect(await second).toBe(3);
    s.service.closeCancel();
    expect(s.close).toHaveBeenCalledTimes(2);
  });
  it("uses the clicked response rather than the default response", async () => {
    const s = setup();
    const result = s.service.show(s.options);
    s.buttons[0].dispatchEvent(new Event("click"));
    expect(await result).toBe(1);
  });
  it("lets focused buttons handle Enter natively but applies the default from dialog content", async () => {
    const s = setup();
    const result = s.service.show(s.options);
    const preventDefault = vi.fn();
    s.session().onKeyDown?.({ key: "Enter", target: s.buttons[0], preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).not.toHaveBeenCalled();
    s.session().onKeyDown?.({ key: "Enter", target: s.elements.message, preventDefault } as unknown as KeyboardEvent);
    expect(await result).toBe(2);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
  it("returns cancellation instead of leaving a request pending when required DOM is missing", async () => {
    const s = setup();
    const service = createAppDialogService({ ...s.elements, title: null }, s.modals);
    expect(await service.show(s.options)).toBe(1);
    expect(s.open).not.toHaveBeenCalled();
  });
});
