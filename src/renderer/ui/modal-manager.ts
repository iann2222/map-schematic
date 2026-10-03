export type ModalOptions = {
  onDismiss: () => void;
  initialFocus?: () => HTMLElement | null | undefined;
  onKeyDown?: (event: KeyboardEvent) => void;
};

type ModalSession = ModalOptions & {
  element: HTMLElement;
  returnFocus: HTMLElement | null;
};

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]';

export class ModalManager {
  private readonly stack: ModalSession[] = [];
  private readonly inertBefore = new Map<HTMLElement, boolean>();

  constructor(private readonly root: Document = document) {
    root.addEventListener("keydown", this.handleKeyDown, true);
    root.addEventListener("focusin", this.handleFocusIn, true);
    root.addEventListener("click", this.handleBackdropClick);
  }

  get hasOpenModal(): boolean {
    return this.stack.length > 0;
  }

  isOpen(element: HTMLElement | null): boolean {
    return this.stack.some((session) => session.element === element);
  }

  open(element: HTMLElement | null, options: ModalOptions): void {
    if (!element || this.isOpen(element)) return;
    const active = this.root.activeElement as HTMLElement | null;
    const session: ModalSession = {
      ...options, element,
      returnFocus: active && typeof active.focus === "function" ? active : null,
    };
    this.stack.push(session);
    element.classList.add("active");
    this.syncBackground();
    this.focusSession(session);
  }

  close(element: HTMLElement | null): void {
    const index = this.stack.findIndex((session) => session.element === element);
    if (index < 0) return;
    const session = this.stack[index];
    const wasTop = index === this.stack.length - 1;
    this.stack.splice(index, 1);
    session.element.classList.remove("active");
    session.element.style.removeProperty("--modal-stack-index");
    // A parent may close while its confirmation remains open.
    for (const remaining of this.stack) {
      if (remaining.returnFocus && session.element.contains(remaining.returnFocus)) {
        remaining.returnFocus = session.returnFocus;
      }
    }
    this.syncBackground();
    if (!wasTop) return;
    const top = this.stack.at(-1);
    const target = session.returnFocus;
    if (target?.isConnected && !target.closest("[inert]") &&
        (!top || top.element.contains(target))) {
      target.focus();
    }
    if (top && !top.element.contains(this.root.activeElement)) this.focusSession(top);
  }

  private focusable(session: ModalSession): HTMLElement[] {
    return Array.from(session.element.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => {
        const visibility = this.root.defaultView?.getComputedStyle(element).visibility;
        return element.tabIndex >= 0 && !element.matches(":disabled") &&
          !element.closest("[inert]") && element.getClientRects().length > 0 &&
          visibility !== "hidden" && visibility !== "collapse";
      });
  }

  private focusSession(session: ModalSession): void {
    const requested = session.initialFocus?.();
    const candidates = this.focusable(session);
    const target = requested && candidates.includes(requested) ? requested : candidates[0];
    if (target) {
      target.focus();
    } else {
      const dialog = session.element.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? session.element;
      dialog.tabIndex = -1;
      dialog.focus();
    }
  }

  private syncBackground(): void {
    for (const [element, inert] of this.inertBefore) element.inert = inert;
    this.inertBefore.clear();
    const top = this.stack.at(-1);
    if (!top) return;
    for (const child of Array.from(this.root.body.children)) {
      const element = child as HTMLElement;
      if (typeof element.inert !== "boolean") continue;
      this.inertBefore.set(element, element.inert);
      element.inert = !element.contains(top.element);
    }
    this.stack.forEach((session, index) => {
      session.element.style.setProperty("--modal-stack-index", String(index));
    });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const top = this.stack.at(-1);
    if (!top || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      top.onDismiss();
    } else if (event.key === "Tab") {
      const candidates = this.focusable(top);
      const index = candidates.indexOf(this.root.activeElement as HTMLElement);
      // Inside the dialog, retain native Tab behavior (including radio groups).
      if (index >= 0 && (event.shiftKey ? index > 0 : index < candidates.length - 1)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (candidates.length) candidates[event.shiftKey ? candidates.length - 1 : 0].focus();
      else this.focusSession(top);
    } else {
      top.onKeyDown?.(event);
    }
  };

  private handleFocusIn = (event: FocusEvent): void => {
    const top = this.stack.at(-1);
    if (top && !top.element.contains(event.target as Node | null)) this.focusSession(top);
  };

  private handleBackdropClick = (event: MouseEvent): void => {
    const top = this.stack.at(-1);
    if (top && event.target === top.element) top.onDismiss();
  };
}
