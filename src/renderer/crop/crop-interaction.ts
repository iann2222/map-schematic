import { clampCropBox, cropHandleCursor, resizeCropBox } from "./geometry.js";
import type { CropBox, StageSize } from "./types.js";

type CropDrag = {
  pointerId: number;
  handle: string | undefined;
  startX: number;
  startY: number;
  startBox: CropBox;
};

export class CropInteraction {
  private drag: CropDrag | null = null;
  private eventTarget: Document | HTMLDivElement | null = null;
  private readonly onMove = (event: Event): void => this.move(event as PointerEvent);
  private readonly onEnd = (event: Event): void => {
    if (this.drag?.pointerId === (event as PointerEvent).pointerId) this.finish();
  };

  constructor(private readonly options: {
    frame: HTMLDivElement | null;
    stage: HTMLDivElement | null;
    getEditableBox: () => CropBox | null;
    getRatio: () => { ratio: number; ratioMode: "free" | "fixed" };
    getStageSize: () => StageSize | null;
    updateBox: (box: CropBox) => void;
    onWheel: (event: WheelEvent) => void;
  }) {}

  bind(): void {
    const frame = this.options.frame;
    if (!frame) return;
    frame.addEventListener("wheel", this.options.onWheel, { passive: false });
    frame.addEventListener("pointerdown", (event) => this.begin(event));
    frame.addEventListener("lostpointercapture", this.onEnd);
    frame.ownerDocument?.defaultView?.addEventListener("blur", () => this.finish());
  }

  finish(): void {
    const frame = this.options.frame;
    const drag = this.drag;
    this.drag = null;
    this.eventTarget?.removeEventListener("pointermove", this.onMove);
    this.eventTarget?.removeEventListener("pointerup", this.onEnd);
    this.eventTarget?.removeEventListener("pointercancel", this.onEnd);
    this.eventTarget = null;
    frame?.classList.remove("resizing");
    if (frame) frame.style.cursor = "move";
    if (drag && frame?.hasPointerCapture(drag.pointerId)) frame.releasePointerCapture(drag.pointerId);
  }

  private begin(event: PointerEvent): void {
    const { frame, stage } = this.options;
    const box = this.options.getEditableBox();
    if (event.button !== 0 || this.drag || !frame || !stage || !box) return;
    const rect = stage.getBoundingClientRect();
    const handle = (event.target as HTMLElement | null)?.dataset?.handle;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, handle, startX: event.clientX - rect.left, startY: event.clientY - rect.top, startBox: { ...box } };
    // A drag owns document events until it ends, including moves outside the frame.
    this.eventTarget = frame.ownerDocument ?? frame;
    this.eventTarget.addEventListener("pointermove", this.onMove);
    this.eventTarget.addEventListener("pointerup", this.onEnd);
    this.eventTarget.addEventListener("pointercancel", this.onEnd);
    frame.setPointerCapture(event.pointerId);
    frame.classList.toggle("resizing", Boolean(handle));
    frame.style.cursor = handle ? cropHandleCursor(handle) : "move";
  }

  private move(event: PointerEvent): void {
    const drag = this.drag;
    const stage = this.options.stage;
    const size = this.options.getStageSize();
    if (!drag || event.pointerId !== drag.pointerId || !stage || !size) return;
    if (!this.options.getEditableBox()) { this.finish(); return; }
    const rect = stage.getBoundingClientRect();
    const deltaX = event.clientX - rect.left - drag.startX;
    const deltaY = event.clientY - rect.top - drag.startY;
    const box = drag.handle
      ? resizeCropBox({ start: drag.startBox, handle: drag.handle, deltaX, deltaY, ...this.options.getRatio() })
      : { ...drag.startBox, left: drag.startBox.left + deltaX, top: drag.startBox.top + deltaY };
    this.options.updateBox(clampCropBox(box, size.width, size.height));
  }
}
