import type { WorkflowStep } from "../app-state.js";
import type { CropBBox, StageLayout, ViewTransform } from "./crop-controller.js";
import { project, unproject } from "../map/geometry.js";
import {
  ensureMapRoot,
  ensureMarkersContainer,
  ensureShapesContainer,
  ensureWrapGroup,
} from "../map/rendering-utils.js";

export type MapViewportOptions = {
  svg: SVGSVGElement | null;
  canvas: HTMLCanvasElement | null;
  mapStage: HTMLDivElement | null;
  zoomIndicator: HTMLElement | null;
  getActiveStep: () => WorkflowStep;
  getCropBBox: () => CropBBox | null;
  requestBasemapDraw: () => void;
  updateMarkerStyles: () => void;
  onViewChanged: () => void;
  renderMarkers: () => void;
  hasSelectedLabel: () => boolean;
  scheduleDirtyCheck: () => void;
  mapWidth: number;
  mapHeight: number;
  minScale: number;
  maxScale: number;
  wraps: readonly number[];
};

export class MapViewportController {
  readonly view: ViewTransform = { scale: 1, tx: 0, ty: 0 };
  private readonly options: MapViewportOptions;
  private worldShiftValue = 0;
  private shiftLockValue: number | null = null;
  private lastScaleFitValue = 1;

  constructor(options: MapViewportOptions) {
    this.options = options;
  }

  get worldShift(): number {
    return this.worldShiftValue;
  }

  get wrapShift(): number {
    return this.shiftLockValue ?? this.worldShiftValue;
  }

  get shiftLocked(): boolean {
    return this.shiftLockValue !== null;
  }

  get lastScaleFit(): number {
    return this.lastScaleFitValue;
  }

  set lastScaleFit(value: number) {
    this.lastScaleFitValue = value;
  }

  applyTransform(): void {
    const { svg } = this.options;
    if (!svg) {
      return;
    }
    const root = ensureMapRoot(svg);
    root.setAttribute(
      "transform",
      `translate(${this.view.tx} ${this.view.ty}) scale(${this.view.scale})`,
    );
    this.updateZoomIndicator();
    this.options.updateMarkerStyles();
    this.options.onViewChanged();
    this.options.requestBasemapDraw();
  }

  updateZoomIndicator(): void {
    const { zoomIndicator } = this.options;
    if (!zoomIndicator) {
      return;
    }
    zoomIndicator.textContent = `${Math.round(this.view.scale * 100)}%`;
  }

  resizeCanvasToStage(): StageLayout {
    const { canvas, mapStage, mapWidth, mapHeight } = this.options;
    if (!canvas || !mapStage) {
      return {
        width: mapWidth,
        height: mapHeight,
        scaleFit: 1,
        offsetX: 0,
        offsetY: 0,
      };
    }
    const rect = mapStage.getBoundingClientRect();
    const stageWidth = Math.max(1, rect.width);
    const stageHeight = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(stageWidth * dpr));
    const targetHeight = Math.max(1, Math.round(stageHeight * dpr));
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }
    const scaleFit = Math.min(stageWidth / mapWidth, stageHeight / mapHeight);
    const offsetX = (stageWidth - mapWidth * scaleFit) / 2;
    const offsetY = (stageHeight - mapHeight * scaleFit) / 2;
    return { width: stageWidth, height: stageHeight, scaleFit, offsetX, offsetY };
  }

  syncStageSize(): void {
    const { canvas, mapStage, svg, mapWidth, mapHeight } = this.options;
    if (!mapStage || !canvas || !svg) {
      return;
    }
    const center = this.centerLonLat();
    const { scaleFit } = this.resizeCanvasToStage();
    if (this.lastScaleFitValue > 0 && scaleFit > 0) {
      this.view.scale *= this.lastScaleFitValue / scaleFit;
    }
    this.lastScaleFitValue = scaleFit;
    const [centerX, centerY] = project(
      center[0],
      center[1],
      mapWidth,
      mapHeight,
    );
    this.view.tx = mapWidth / 2 - centerX * this.view.scale;
    this.view.ty = mapHeight / 2 - centerY * this.view.scale;
    this.clampVertical();
    this.applyTransform();
    this.updateWrapTransforms(true);
  }

  updateWrapTransforms(forceRender = false): void {
    const { svg, wraps } = this.options;
    if (!svg) {
      return;
    }
    const width = svg.viewBox.baseVal.width || this.options.mapWidth;
    if (!this.shiftLocked) {
      const centerX = (width / 2 - this.view.tx) / this.view.scale;
      this.worldShiftValue = Math.round(centerX / width);
    }
    const root = ensureMapRoot(svg);
    const markerWrap = ensureMarkersContainer(root);
    const shapeWrap = ensureShapesContainer(root);
    for (const wrap of wraps) {
      ensureWrapGroup(
        markerWrap,
        `marker-${wrap}`,
        (wrap + this.wrapShift) * width,
      );
      ensureWrapGroup(
        shapeWrap,
        `shape-${wrap}`,
        (wrap + this.wrapShift) * width,
      );
    }
    if (forceRender) {
      this.options.requestBasemapDraw();
    }
  }

  lockWrapShift(): void {
    this.shiftLockValue = this.worldShiftValue;
  }

  unlockWrapShift(forceRender = true): void {
    this.shiftLockValue = null;
    this.updateWrapTransforms(forceRender);
  }

  clampVertical(): void {
    const { svg, mapHeight } = this.options;
    if (!svg) {
      return;
    }
    const height = svg.viewBox.baseVal.height || mapHeight;
    const scaledHeight = height * this.view.scale;
    if (scaledHeight <= height) {
      this.view.ty = (height - scaledHeight) / 2;
      return;
    }
    this.view.ty = Math.min(0, Math.max(height - scaledHeight, this.view.ty));
  }

  centerLonLat(): [number, number] {
    const { svg, mapWidth, mapHeight } = this.options;
    if (!svg) {
      return [0, 0];
    }
    const centerX = (mapWidth / 2 - this.view.tx) / this.view.scale;
    const centerY = (mapHeight / 2 - this.view.ty) / this.view.scale;
    return unproject(centerX, centerY, mapWidth, mapHeight);
  }

  visibleMapBounds(): CropBBox | null {
    const cropBBox = this.options.getCropBBox();
    const step = this.options.getActiveStep();
    if (cropBBox && (step === "2" || step === "3")) {
      return { ...cropBBox };
    }
    const { mapStage } = this.options;
    if (!mapStage) {
      return null;
    }
    const rect = mapStage.getBoundingClientRect();
    const { scaleFit, offsetX, offsetY } = this.resizeCanvasToStage();
    const left = ((0 - offsetX) / scaleFit - this.view.tx) / this.view.scale;
    const top = ((0 - offsetY) / scaleFit - this.view.ty) / this.view.scale;
    const right =
      ((rect.width - offsetX) / scaleFit - this.view.tx) / this.view.scale;
    const bottom =
      ((rect.height - offsetY) / scaleFit - this.view.ty) / this.view.scale;
    return {
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  }

  svgPointFromEvent(event: MouseEvent): { x: number; y: number } {
    const { svg } = this.options;
    if (!svg) {
      return { x: 0, y: 0 };
    }
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return { x: 0, y: 0 };
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  mapPointFromEvent(event: MouseEvent): { x: number; y: number } {
    const screen = this.svgPointFromEvent(event);
    return {
      x: (screen.x - this.view.tx) / this.view.scale,
      y: (screen.y - this.view.ty) / this.view.scale,
    };
  }

  zoomAt(point: { x: number; y: number }, delta: number): void {
    const prevScale = this.view.scale;
    const nextScale = Math.min(
      this.options.maxScale,
      Math.max(this.options.minScale, this.view.scale * delta),
    );
    const scaleRatio = nextScale / prevScale;
    this.view.tx = point.x - scaleRatio * (point.x - this.view.tx);
    this.view.ty = point.y - scaleRatio * (point.y - this.view.ty);
    this.view.scale = nextScale;
    this.clampVertical();
    this.applyTransform();
    this.updateWrapTransforms(true);
    if (this.options.hasSelectedLabel()) {
      this.options.renderMarkers();
    }
    this.options.scheduleDirtyCheck();
  }

  zoomToScale(targetScale: number): void {
    const { svg, mapWidth, mapHeight } = this.options;
    if (!svg) {
      return;
    }
    const width = svg.viewBox.baseVal.width || mapWidth;
    const height = svg.viewBox.baseVal.height || mapHeight;
    this.zoomAt(
      { x: width / 2, y: height / 2 },
      targetScale / this.view.scale,
    );
  }

  reset(): void {
    Object.assign(this.view, { scale: 1, tx: 0, ty: 0 });
    this.worldShiftValue = 0;
    this.shiftLockValue = null;
    this.applyTransform();
    this.updateWrapTransforms(true);
    if (this.options.hasSelectedLabel()) {
      this.options.renderMarkers();
    }
    this.options.scheduleDirtyCheck();
  }

  handleWheel(event: WheelEvent, locked: boolean): void {
    if (!this.options.svg || locked) {
      return;
    }
    event.preventDefault();
    const zoomFactor = Math.sign(event.deltaY) > 0 ? 0.9 : 1.1;
    this.zoomAt(this.svgPointFromEvent(event), zoomFactor);
  }
}
