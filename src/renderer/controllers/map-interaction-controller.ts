import type { MapViewportController } from "./map-viewport-controller.js";

type DragMode = "pan" | "box" | null;

export type MapInteractionOptions = {
  svg: SVGSVGElement | null;
  viewport: MapViewportController;
  isLocked: () => boolean;
  clearSelection: () => void;
  moveSelectionDrag: (event: MouseEvent) => boolean;
  finishSelectionDrag: () => boolean;
  maxScale: number;
  minScale: number;
};

export class MapInteractionController {
  private readonly options: MapInteractionOptions;
  private dragging = false;
  private dragStartScreen: { x: number; y: number } | null = null;
  private dragStartMap: { x: number; y: number } | null = null;
  private dragMode: DragMode = null;
  private dragRect: SVGRectElement | null = null;

  constructor(options: MapInteractionOptions) {
    this.options = options;
  }

  bind(): void {
    const { svg } = this.options;
    if (!svg) {
      return;
    }
    svg.addEventListener("contextmenu", this.preventContextMenu);
    svg.addEventListener("wheel", this.handleWheel, { passive: false });
    svg.addEventListener("mousedown", this.handleMouseDown);
    svg.addEventListener("mousemove", this.handleMouseMove);
    svg.addEventListener("mouseup", this.handleMouseUp);
    svg.addEventListener("mouseleave", this.handleMouseLeave);
  }

  private readonly preventContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    this.options.viewport.handleWheel(event, this.options.isLocked());
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    const { svg, viewport } = this.options;
    if (!svg) {
      return;
    }
    if (event.button === 0 && event.target === svg) {
      this.options.clearSelection();
    }
    if (
      this.options.isLocked() ||
      (event.button !== 0 && event.button !== 2)
    ) {
      return;
    }
    this.dragging = true;
    svg.classList.add("dragging");
    this.dragStartScreen = viewport.svgPointFromEvent(event);
    this.dragStartMap = viewport.mapPointFromEvent(event);
    this.dragMode = event.button === 2 ? "box" : "pan";
    svg.classList.toggle("boxing", this.dragMode === "box");
    if (this.dragMode === "box") {
      viewport.lockWrapShift();
      const rect = this.ensureDragRect();
      if (rect) {
        rect.setAttribute("x", this.dragStartScreen.x.toFixed(2));
        rect.setAttribute("y", this.dragStartScreen.y.toFixed(2));
        rect.setAttribute("width", "0");
        rect.setAttribute("height", "0");
      }
    }
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (this.options.moveSelectionDrag(event)) {
      return;
    }
    const { svg, viewport } = this.options;
    if (
      !svg ||
      !this.dragging ||
      !this.dragStartScreen ||
      this.options.isLocked()
    ) {
      return;
    }
    const currentScreen = viewport.svgPointFromEvent(event);
    if (this.dragMode === "pan") {
      viewport.view.tx += currentScreen.x - this.dragStartScreen.x;
      viewport.view.ty += currentScreen.y - this.dragStartScreen.y;
      this.dragStartScreen = currentScreen;
      viewport.clampVertical();
      viewport.applyTransform();
      viewport.updateWrapTransforms(true);
      return;
    }
    if (this.dragMode !== "box") {
      return;
    }
    const rect = this.ensureDragRect();
    if (!rect) {
      return;
    }
    rect.setAttribute(
      "x",
      Math.min(this.dragStartScreen.x, currentScreen.x).toFixed(2),
    );
    rect.setAttribute(
      "y",
      Math.min(this.dragStartScreen.y, currentScreen.y).toFixed(2),
    );
    rect.setAttribute(
      "width",
      Math.abs(currentScreen.x - this.dragStartScreen.x).toFixed(2),
    );
    rect.setAttribute(
      "height",
      Math.abs(currentScreen.y - this.dragStartScreen.y).toFixed(2),
    );
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (this.options.finishSelectionDrag()) {
      return;
    }
    const { svg, viewport } = this.options;
    if (!svg || !this.dragging || !this.dragStartScreen) {
      this.resetDragClasses();
      return;
    }
    if (this.options.isLocked()) {
      this.clearDragRect();
      this.resetDragClasses();
      return;
    }
    if (this.dragMode === "box") {
      const endMap = viewport.mapPointFromEvent(event);
      const startMap = this.dragStartMap ?? { x: 0, y: 0 };
      const x = Math.min(startMap.x, endMap.x);
      const y = Math.min(startMap.y, endMap.y);
      const width = Math.abs(endMap.x - startMap.x);
      const height = Math.abs(endMap.y - startMap.y);
      if (width > 10 && height > 10) {
        const mapWidth = svg.viewBox.baseVal.width || 1200;
        const mapHeight = svg.viewBox.baseVal.height || 800;
        const nextScale = Math.min(
          this.options.maxScale,
          Math.max(
            this.options.minScale,
            Math.min(mapWidth / width, mapHeight / height),
          ),
        );
        viewport.view.tx =
          (mapWidth - width * nextScale) / 2 - x * nextScale;
        viewport.view.ty =
          (mapHeight - height * nextScale) / 2 - y * nextScale;
        viewport.view.scale = nextScale;
        viewport.applyTransform();
        viewport.updateWrapTransforms(true);
      }
      viewport.unlockWrapShift(true);
    }
    this.clearDragRect();
    this.resetDragClasses();
  };

  private readonly handleMouseLeave = (): void => {
    if (this.options.finishSelectionDrag()) {
      return;
    }
    if (this.dragging) {
      this.clearDragRect();
      this.resetDragClasses();
    }
  };

  private ensureDragRect(): SVGRectElement | null {
    const { svg } = this.options;
    if (!svg) {
      return null;
    }
    if (!this.dragRect) {
      this.dragRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      this.dragRect.setAttribute("fill", "rgba(56, 189, 248, 0.12)");
      this.dragRect.setAttribute("stroke", "#38bdf8");
      this.dragRect.setAttribute("stroke-width", "1");
      svg.appendChild(this.dragRect);
    }
    return this.dragRect;
  }

  private clearDragRect(): void {
    this.dragRect?.remove();
    this.dragRect = null;
  }

  private resetDragClasses(): void {
    this.dragging = false;
    this.dragMode = null;
    this.dragStartScreen = null;
    this.dragStartMap = null;
    this.options.svg?.classList.remove("dragging", "boxing");
  }
}
