type InspectorPanelOptions = {
  layout: HTMLElement;
  content: HTMLElement;
  rail: HTMLElement;
  collapseButton: HTMLButtonElement;
  expandButton: HTMLButtonElement;
  beforeLayoutChange?: () => void;
  onLayoutChange: () => void;
  isActive?: () => boolean;
};

function animatePanel(element: HTMLElement, entering: boolean): Animation | null {
  const window = element.ownerDocument?.defaultView;
  if (!element.animate || window?.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  return element.animate(entering
    ? [{ opacity: 0, transform: "translateX(8px)" }, { opacity: 1, transform: "translateX(0)" }]
    : [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(6px)" }], {
    duration: entering ? 110 : 70,
    easing: entering ? "cubic-bezier(0.2, 0, 0, 1)" : "ease-in",
    fill: "both",
  });
}

/** Owns transient panel visibility, independently of project and selection state. */
export class InspectorPanelController {
  private collapsed = false;
  private requestedCollapsed = false;
  private animation: Animation | null = null;
  private transition = 0;

  constructor(private readonly options: InspectorPanelOptions) {}

  bind(): void {
    this.render();
    this.options.collapseButton.addEventListener("click", () => this.setCollapsed(true));
    this.options.expandButton.addEventListener("click", () => this.setCollapsed(false));
  }

  setCollapsed(collapsed: boolean): void {
    if (this.requestedCollapsed === collapsed) return;
    this.requestedCollapsed = collapsed;
    const transition = ++this.transition;
    this.animation?.cancel();
    this.animation = null;
    if (this.collapsed === collapsed) return;
    this.options.beforeLayoutChange?.();
    const outgoing = this.collapsed ? this.options.rail : this.options.content;
    const animation = animatePanel(outgoing, false);
    if (!animation) {
      this.applyCollapsed(collapsed);
      return;
    }
    this.animation = animation;
    void animation.finished.then(() => {
      if (transition !== this.transition) return;
      animation.cancel();
      this.animation = null;
      this.applyCollapsed(collapsed);
      if (this.options.isActive?.() === false) return;
      const incoming = collapsed ? this.options.rail : this.options.content;
      const reveal = animatePanel(incoming, true);
      this.animation = reveal;
      if (reveal) {
        void reveal.finished.then(() => {
          if (transition !== this.transition) return;
          reveal.cancel();
          this.animation = null;
        }, () => {});
      }
    }, () => {});
  }

  private applyCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.render();
    if (this.options.isActive?.() === false) return;
    const button = collapsed ? this.options.expandButton : this.options.collapseButton;
    button.focus({ preventScroll: true });
    this.options.onLayoutChange();
  }

  private render(): void {
    const { layout, content, rail, collapseButton, expandButton } = this.options;
    layout.classList.toggle("inspector-collapsed", this.collapsed);
    content.hidden = this.collapsed;
    rail.hidden = !this.collapsed;
    for (const button of [collapseButton, expandButton]) {
      button.setAttribute("aria-expanded", String(!this.collapsed));
    }
  }
}
