export type OrderMode = "list" | "display";

export type OrderDialogItem = {
  key: string;
  name: string;
};

export type OrderDialogElements = {
  triggerButton: HTMLButtonElement | null;
  modal: HTMLDivElement | null;
  listOrder: HTMLUListElement | null;
  displayOrder: HTMLUListElement | null;
  closeButton: HTMLButtonElement | null;
};

export type OrderDialogControllerOptions = {
  elements: OrderDialogElements;
  normalizeOrders: () => void;
  getItems: () => OrderDialogItem[];
  getOrder: (mode: OrderMode) => readonly string[];
  commitOrder: (mode: OrderMode, order: string[]) => boolean;
  onOrderChanged: () => void;
};

type DragPhase = "pending" | "dragging" | "settling";

type OrderDragSession = {
  phase: DragPhase;
  mode: OrderMode;
  pointerId: number;
  container: HTMLUListElement;
  sourceItem: HTMLLIElement;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  ghost: HTMLLIElement | null;
  placeholder: HTMLLIElement | null;
  cachedRows: HTMLLIElement[];
  rafId: number | null;
  queuedClientX: number;
  queuedClientY: number;
  orderChanged: boolean;
};

const DRAG_START_THRESHOLD = 4;

function isReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

export function moveOrderItemToEdge(
  current: readonly string[],
  key: string,
  edge: "top" | "bottom",
): string[] {
  if (!current.includes(key)) {
    return [...current];
  }
  const base = current.filter((item) => item !== key);
  return edge === "top" ? [key, ...base] : [...base, key];
}

export class OrderDialogController {
  private readonly options: OrderDialogControllerOptions;
  private readonly elements: OrderDialogElements;
  private dragSession: OrderDragSession | null = null;
  private readonly rowAnimations = new WeakMap<HTMLLIElement, Animation>();

  constructor(options: OrderDialogControllerOptions) {
    this.options = options;
    this.elements = options.elements;
  }

  bind(): void {
    this.elements.triggerButton?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.elements.triggerButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open();
    });
    this.elements.closeButton?.addEventListener("click", () => this.close());
    this.elements.modal?.addEventListener("click", (event) => {
      if (event.target === this.elements.modal) {
        this.close();
      }
    });
    window.addEventListener("pointermove", this.handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("blur", this.cancelActiveDrag);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        this.cancelActiveDrag();
      }
    });
  }

  isOpen(): boolean {
    return this.elements.modal?.classList.contains("active") === true;
  }

  open(): void {
    if (!this.elements.modal) {
      return;
    }
    this.render();
    this.elements.modal.classList.add("active");
    window.requestAnimationFrame(() => {
      this.elements.modal
        ?.querySelector<HTMLElement>("button, [tabindex]")
        ?.focus();
    });
  }

  close(): void {
    this.cancelActiveDrag();
    this.elements.modal?.classList.remove("active");
  }

  render(): void {
    const { listOrder, displayOrder } = this.elements;
    if (!listOrder || !displayOrder) {
      return;
    }
    this.options.normalizeOrders();
    const items = new Map(
      this.options.getItems().map((item) => [item.key, item]),
    );
    this.renderList(listOrder, this.options.getOrder("list"), "list", items);
    this.renderList(
      displayOrder,
      this.options.getOrder("display"),
      "display",
      items,
    );
  }

  cancelActiveDrag = (): void => {
    if (this.dragSession) {
      this.cleanupDragSession("cancel");
    }
  };

  private renderList(
    container: HTMLUListElement,
    keys: readonly string[],
    mode: OrderMode,
    items: Map<string, OrderDialogItem>,
  ): void {
    container.replaceChildren();
    keys.forEach((key) => {
      const item = items.get(key);
      if (item) {
        container.appendChild(this.createOrderItem(item, mode));
      }
    });
  }

  private createOrderItem(
    item: OrderDialogItem,
    mode: OrderMode,
  ): HTMLLIElement {
    const row = document.createElement("li");
    row.className = "order-item";
    row.dataset.key = item.key;
    row.dataset.mode = mode;

    const handle = document.createElement("span");
    handle.className = "order-handle";
    handle.textContent = "⋮⋮";

    const name = document.createElement("span");
    name.className = "order-name";
    name.textContent = item.name;

    const actions = document.createElement("span");
    actions.className = "order-actions";
    const moveTop = this.createEdgeButton("top");
    const moveBottom = this.createEdgeButton("bottom");
    actions.append(moveTop, moveBottom);
    row.append(handle, name, actions);

    moveTop.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.moveToEdge(item.key, mode, "top");
    });
    moveBottom.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.moveToEdge(item.key, mode, "bottom");
    });
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.startPendingDrag(event, mode, row, handle);
    });
    return row;
  }

  private createEdgeButton(edge: "top" | "bottom"): HTMLButtonElement {
    const button = document.createElement("button");
    const isTop = edge === "top";
    button.className = "order-jump";
    button.type = "button";
    button.title = isTop ? "移到最上" : "移到最下";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = isTop
      ? '<svg class="icon-double-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"></path><path d="M18 9l-6-6-6 6"></path></svg>'
      : '<svg class="icon-double-down" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path><path d="M6 15l6 6 6-6"></path></svg>';
    return button;
  }

  private moveToEdge(
    key: string,
    mode: OrderMode,
    edge: "top" | "bottom",
  ): void {
    const current = this.options.getOrder(mode);
    const next = moveOrderItemToEdge(current, key, edge);
    if (this.options.commitOrder(mode, next)) {
      this.render();
      this.options.onOrderChanged();
    }
  }

  private startPendingDrag(
    event: PointerEvent,
    mode: OrderMode,
    sourceItem: HTMLLIElement,
    handle: HTMLElement,
  ): void {
    this.cancelActiveDrag();
    const container =
      mode === "list"
        ? this.elements.listOrder
        : this.elements.displayOrder;
    if (!container || !sourceItem.dataset.key) {
      return;
    }
    const rect = sourceItem.getBoundingClientRect();
    this.dragSession = {
      phase: "pending",
      mode,
      pointerId: event.pointerId,
      container,
      sourceItem,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      ghost: null,
      placeholder: null,
      cachedRows: [],
      rafId: null,
      queuedClientX: event.clientX,
      queuedClientY: event.clientY,
      orderChanged: false,
    };
    handle.setPointerCapture(event.pointerId);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const session = this.dragSession;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    const pointer = this.latestPointerPosition(event);
    if (session.phase === "pending") {
      const dx = pointer.clientX - session.startClientX;
      const dy = pointer.clientY - session.startClientY;
      if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD) {
        this.startDragging(session, pointer.clientX, pointer.clientY);
        this.scheduleDragMove(session, pointer.clientX, pointer.clientY);
      }
      return;
    }
    if (session.phase === "dragging") {
      this.scheduleDragMove(session, pointer.clientX, pointer.clientY);
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const session = this.dragSession;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    this.cleanupDragSession(
      session.phase === "dragging" ? "commit" : "cancel",
    );
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    const session = this.dragSession;
    if (session && event.pointerId === session.pointerId) {
      this.cleanupDragSession("cancel");
    }
  };

  private latestPointerPosition(event: PointerEvent): {
    clientX: number;
    clientY: number;
  } {
    const samples = event.getCoalescedEvents?.() ?? [];
    const latest = samples[samples.length - 1] ?? event;
    return { clientX: latest.clientX, clientY: latest.clientY };
  }

  private startDragging(
    session: OrderDragSession,
    clientX: number,
    clientY: number,
  ): void {
    session.phase = "dragging";
    const sourceRect = session.sourceItem.getBoundingClientRect();
    session.sourceItem.classList.add("order-item--drag-source");

    const placeholder = document.createElement("li");
    placeholder.className = "order-placeholder";
    placeholder.style.minHeight = `${Math.max(32, sourceRect.height)}px`;
    session.container.replaceChild(placeholder, session.sourceItem);
    session.placeholder = placeholder;

    const ghost = session.sourceItem.cloneNode(true) as HTMLLIElement;
    ghost.classList.add("order-ghost");
    ghost.style.width = `${sourceRect.width}px`;
    ghost.style.height = `${sourceRect.height}px`;
    document.body.appendChild(ghost);
    session.ghost = ghost;
    session.cachedRows = Array.from(
      session.container.querySelectorAll<HTMLLIElement>("li.order-item"),
    );
    this.updateGhostTransform(session, clientX, clientY);
  }

  private scheduleDragMove(
    session: OrderDragSession,
    clientX: number,
    clientY: number,
  ): void {
    session.queuedClientX = clientX;
    session.queuedClientY = clientY;
    if (session.rafId !== null) {
      return;
    }
    session.rafId = requestAnimationFrame(() => {
      session.rafId = null;
      if (this.dragSession !== session) {
        return;
      }
      this.updateGhostTransform(
        session,
        session.queuedClientX,
        session.queuedClientY,
      );
      this.movePlaceholder(session, session.queuedClientY);
    });
  }

  private updateGhostTransform(
    session: OrderDragSession,
    clientX: number,
    clientY: number,
  ): void {
    if (session.ghost) {
      session.ghost.style.transform = `translate3d(${clientX - session.offsetX}px, ${clientY - session.offsetY}px, 0)`;
    }
  }

  private movePlaceholder(
    session: OrderDragSession,
    clientY: number,
  ): void {
    const placeholder = session.placeholder;
    if (!placeholder) {
      return;
    }
    const positions = new Map<string, DOMRect>();
    let reference: Node | null = null;
    session.cachedRows.forEach((row) => {
      if (!row.isConnected || !row.dataset.key) {
        return;
      }
      const rect = row.getBoundingClientRect();
      positions.set(row.dataset.key, rect);
      if (reference === null && clientY < rect.top + rect.height / 2) {
        reference = row;
      }
    });
    if (reference === null) {
      if (placeholder.nextSibling === null) {
        return;
      }
      session.container.appendChild(placeholder);
    } else if (placeholder.nextSibling === reference) {
      return;
    } else {
      session.container.insertBefore(placeholder, reference);
    }
    this.animateRows(session.container, positions);
    session.orderChanged = true;
  }

  private animateRows(
    container: HTMLUListElement,
    before: Map<string, DOMRect>,
  ): void {
    container
      .querySelectorAll<HTMLLIElement>("li.order-item")
      .forEach((row) => {
        this.rowAnimations.get(row)?.cancel();
        if (isReducedMotion() || !row.dataset.key) {
          return;
        }
        const oldRect = before.get(row.dataset.key);
        if (!oldRect) {
          return;
        }
        const deltaY = oldRect.top - row.getBoundingClientRect().top;
        if (Math.abs(deltaY) < 0.5) {
          return;
        }
        const animation = row.animate(
          [
            { transform: `translate3d(0, ${deltaY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: 115,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
        this.rowAnimations.set(row, animation);
        const clear = () => {
          if (this.rowAnimations.get(row) === animation) {
            this.rowAnimations.delete(row);
          }
        };
        animation.addEventListener("finish", clear, { once: true });
        animation.addEventListener("cancel", clear, { once: true });
      });
  }

  private cleanupDragSession(reason: "commit" | "cancel"): void {
    const session = this.dragSession;
    if (!session) {
      return;
    }
    const wasDragging = session.phase === "dragging";
    session.phase = "settling";
    if (session.handle.hasPointerCapture?.(session.pointerId)) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    if (session.rafId !== null) {
      cancelAnimationFrame(session.rafId);
    }
    session.container
      .querySelectorAll<HTMLLIElement>("li.order-item")
      .forEach((row) => this.rowAnimations.get(row)?.cancel());
    if (session.ghost) {
      if (isReducedMotion()) {
        session.ghost.remove();
      } else {
        const ghost = session.ghost;
        ghost.style.transition =
          "transform 100ms ease-out, opacity 100ms ease-out";
        ghost.style.opacity = "0";
        window.setTimeout(() => ghost.remove(), 110);
      }
    }
    if (session.placeholder?.parentElement) {
      session.container.replaceChild(
        session.sourceItem,
        session.placeholder,
      );
    }
    session.sourceItem.classList.remove("order-item--drag-source");
    this.dragSession = null;
    if (reason === "commit" && wasDragging && session.orderChanged) {
      this.commitDraggedOrder(session);
    }
  }

  private commitDraggedOrder(session: OrderDragSession): void {
    const nextOrder = Array.from(
      session.container.querySelectorAll<HTMLLIElement>("li.order-item"),
    )
      .map((row) => row.dataset.key ?? "")
      .filter(Boolean);
    if (this.options.commitOrder(session.mode, nextOrder)) {
      this.render();
      this.options.onOrderChanged();
    }
  }
}
