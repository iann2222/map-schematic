import type { WorkflowStep } from "../app-state.js";
import type { ViewTransform, StageLayout } from "../controllers/crop-controller.js";
import {
  buildHillshadeTexture,
  layerStyleFor,
  loadHillshadeTexture,
} from "./rendering-utils.js";
import { geometryToPath, unproject } from "./geometry.js";

export type ReliefEffect = "relief-soft" | "relief-natural" | "relief-strong";

export type BasemapLayer = {
  id: string;
  paths: Path2D[];
  pathData: string[];
};

const reliefEffectSettings: Record<ReliefEffect, { alpha: number }> = {
  "relief-soft": { alpha: 0.3 },
  "relief-natural": { alpha: 0.46 },
  "relief-strong": { alpha: 0.62 },
};

export function normalizeReliefEffect(value?: string): ReliefEffect {
  if (
    value === "relief-soft" ||
    value === "relief-natural" ||
    value === "relief-strong"
  ) {
    return value;
  }
  if (value === "soft-light") {
    return "relief-soft";
  }
  if (value === "multiply") {
    return "relief-strong";
  }
  return "relief-natural";
}

export type BasemapRendererOptions = {
  canvas: HTMLCanvasElement | null;
  mapStage: HTMLDivElement | null;
  view: ViewTransform;
  getActiveStep: () => WorkflowStep;
  getWrapShift: () => number;
  resizeCanvasToStage: () => StageLayout;
  mapWidth: number;
  mapHeight: number;
  styleButtons: HTMLButtonElement[];
  reliefToggle: HTMLInputElement | null;
  reliefModeField: HTMLElement | null;
  reliefEffectButtons: HTMLButtonElement[];
  preview: HTMLDivElement | null;
  previewCanvas: HTMLCanvasElement | null;
};

export class BasemapRenderer {
  private readonly options: BasemapRendererOptions;
  private layersValue: BasemapLayer[] = [];
  private built = false;
  private drawPending = false;
  private activeStyleValue = "styleOriginal";
  private reliefEnabledValue = false;
  private reliefEffectValue: ReliefEffect = "relief-natural";
  private hillshadeImage: HTMLImageElement | null = null;
  private hillshadeTextureValue: HTMLCanvasElement | null = null;
  private reliefLoadPromise: Promise<void> | null = null;
  private reliefLoadGeneration = 0;
  private previewTimer: number | null = null;
  private previewPointer = { x: 0, y: 0 };

  constructor(options: BasemapRendererOptions) {
    this.options = options;
  }

  get layers(): readonly BasemapLayer[] {
    return this.layersValue;
  }

  get hasLayers(): boolean {
    return this.layersValue.length > 0;
  }

  get activeStyleId(): string {
    return this.activeStyleValue;
  }

  get reliefEnabled(): boolean {
    return this.reliefEnabledValue;
  }

  get reliefEffect(): ReliefEffect {
    return this.reliefEffectValue;
  }

  get reliefAlpha(): number {
    return reliefEffectSettings[this.reliefEffectValue].alpha;
  }

  get hillshadeTexture(): HTMLCanvasElement | null {
    return this.hillshadeTextureValue;
  }

  bind(): void {
    this.options.styleButtons.forEach((button) => {
      button.addEventListener("click", () => this.setActiveStyle(button.id));
      button.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        this.previewPointer = { x: event.clientX, y: event.clientY };
        this.scheduleStylePreview(button.id);
      });
      button.addEventListener("pointermove", (event) => {
        this.previewPointer = { x: event.clientX, y: event.clientY };
        if (this.options.preview?.classList.contains("visible")) {
          this.positionStylePreview(event.clientX, event.clientY);
        }
      });
      button.addEventListener("pointerleave", () => this.hideStylePreview());
      button.addEventListener("focus", () => {
        const rect = button.getBoundingClientRect();
        this.previewPointer = {
          x: rect.right,
          y: rect.top + rect.height / 2,
        };
        this.scheduleStylePreview(button.id, 120);
      });
      button.addEventListener("blur", () => this.hideStylePreview());
    });
    window.addEventListener("blur", () => this.hideStylePreview());
    window.addEventListener("resize", () => this.hideStylePreview());
    this.options.reliefToggle?.addEventListener("change", () => {
      this.setReliefMode(
        this.options.reliefToggle?.checked === true,
        this.reliefEffectValue,
      );
    });
    this.options.reliefEffectButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.reliefEffect) {
          this.setReliefMode(true, button.dataset.reliefEffect);
        }
      });
    });
  }

  setActiveStyle(styleId: string): void {
    this.hideStylePreview();
    this.activeStyleValue = styleId;
    this.options.styleButtons.forEach((button) => {
      button.classList.toggle("active", button.id === styleId);
    });
    this.requestDraw();
  }

  setReliefMode(enabled: boolean, effect?: string): void {
    this.reliefEnabledValue = enabled;
    if (enabled) {
      this.reliefEffectValue = normalizeReliefEffect(
        effect ?? this.reliefEffectValue,
      );
    }
    if (this.options.reliefToggle) {
      this.options.reliefToggle.checked = enabled;
    }
    this.options.reliefModeField?.classList.toggle("disabled", !enabled);
    this.options.reliefEffectButtons.forEach((button) => {
      const active =
        enabled && button.dataset.reliefEffect === this.reliefEffectValue;
      button.disabled = !enabled;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    if (enabled && !this.hillshadeTextureValue) {
      void this.ensureReliefLoaded();
    }
    this.requestDraw();
  }

  requestDraw(): void {
    if (!this.built || !this.options.canvas || this.drawPending) {
      return;
    }
    this.drawPending = true;
    requestAnimationFrame(() => {
      this.drawPending = false;
      this.draw();
    });
  }

  draw(): void {
    const { canvas, view } = this.options;
    if (!canvas || this.layersValue.length === 0) {
      return;
    }
    const {
      width: stageWidth,
      scaleFit,
      offsetX,
      offsetY,
    } = this.options.resizeCanvasToStage();
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    const transformScale = view.scale * scaleFit * dpr;
    const transformX = (offsetX + view.tx * scaleFit) * dpr;
    const transformY = (offsetY + view.ty * scaleFit) * dpr;
    const wrapSpan = this.wrapSpan(stageWidth, scaleFit);
    const wrapShift = this.options.getWrapShift();

    ctx.save();
    ctx.setTransform(
      transformScale,
      0,
      0,
      transformScale,
      transformX,
      transformY,
    );
    this.paintLayers(ctx, this.activeStyleValue, wrapShift, wrapSpan);
    ctx.restore();

    if (this.reliefEnabledValue && this.hillshadeTextureValue) {
      ctx.save();
      ctx.setTransform(
        transformScale,
        0,
        0,
        transformScale,
        transformX,
        transformY,
      );
      this.paintHillshade(ctx, wrapShift, wrapSpan);
      ctx.restore();
    }
  }

  async loadBasemap(): Promise<void> {
    if (this.built || !window.mapSchematic?.getBasemapLayers) {
      return;
    }
    const rawLayers = await window.mapSchematic.getBasemapLayers();
    const layers: BasemapLayer[] = [];
    for (let index = 0; index < rawLayers.length; index += 1) {
      if (index > 0) {
        await nextRenderTurn();
      }
      const layer = rawLayers[index];
      const geojson = JSON.parse(layer.geojson);
      const paths: Path2D[] = [];
      const pathData: string[] = [];
      for (const feature of geojson.features ?? []) {
        const data = geometryToPath(
          feature.geometry,
          this.options.mapWidth,
          this.options.mapHeight,
        );
        if (!data) {
          continue;
        }
        paths.push(new Path2D(data));
        pathData.push(data);
      }
      layers.push({ id: layer.id, paths, pathData });
    }
    this.layersValue = layers;
    this.built = true;
    this.draw();
  }

  async reload(): Promise<void> {
    this.reliefLoadGeneration += 1;
    this.reliefLoadPromise = null;
    this.hillshadeTextureValue = null;
    this.hillshadeImage = null;
    this.built = false;
    this.layersValue = [];
    const reliefPromise = this.reliefEnabledValue
      ? this.ensureReliefLoaded()
      : Promise.resolve();
    await Promise.all([this.loadBasemap(), reliefPromise]);
  }

  hideStylePreview(): void {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.options.preview?.classList.remove("visible");
    if (this.options.preview) {
      this.options.preview.hidden = true;
    }
  }

  exportStyle(layerId: string): ReturnType<typeof layerStyleFor> {
    return layerStyleFor(this.activeStyleValue, layerId);
  }

  exportWrapSpan(stageWidth: number, scaleFit: number): number {
    return this.wrapSpan(stageWidth, scaleFit);
  }

  private paintLayers(
    ctx: CanvasRenderingContext2D,
    styleId: string,
    wrapShift: number,
    wrapSpan: number,
  ): void {
    for (let index = -wrapSpan; index <= wrapSpan; index += 1) {
      ctx.save();
      ctx.translate((index + wrapShift) * this.options.mapWidth, 0);
      for (const layer of this.layersValue) {
        const style = layerStyleFor(styleId, layer.id);
        if (style.fill && style.fill !== "none") {
          ctx.fillStyle = style.fill;
          layer.paths.forEach((path) => ctx.fill(path));
        }
        if (style.stroke && style.stroke !== "none") {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = (style.strokeWidth ?? 0.4) / this.options.view.scale;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          layer.paths.forEach((path) => ctx.stroke(path));
        }
      }
      ctx.restore();
    }
  }

  private paintHillshade(
    ctx: CanvasRenderingContext2D,
    wrapShift: number,
    wrapSpan: number,
  ): void {
    if (!this.reliefEnabledValue || !this.hillshadeTextureValue) {
      return;
    }
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = this.reliefAlpha;
    for (let index = -wrapSpan; index <= wrapSpan; index += 1) {
      ctx.save();
      ctx.translate((index + wrapShift) * this.options.mapWidth, 0);
      ctx.drawImage(
        this.hillshadeTextureValue,
        0,
        0,
        this.options.mapWidth,
        this.options.mapHeight,
      );
      ctx.restore();
    }
  }

  private wrapSpan(stageWidth: number, scaleFit: number): number {
    const viewWidth =
      stageWidth /
      Math.max(0.0001, scaleFit * this.options.view.scale);
    return Math.min(
      5,
      Math.max(1, Math.ceil(viewWidth / this.options.mapWidth / 2) + 1),
    );
  }

  private scheduleStylePreview(styleId: string, delay = 260): void {
    this.hideStylePreview();
    if (
      this.options.getActiveStep() !== "2" ||
      !this.options.preview
    ) {
      return;
    }
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      if (!this.drawStylePreview(styleId)) {
        return;
      }
      if (this.options.preview) {
        this.options.preview.hidden = false;
      }
      this.positionStylePreview(
        this.previewPointer.x,
        this.previewPointer.y,
      );
      requestAnimationFrame(() => {
        this.options.preview?.classList.add("visible");
      });
    }, delay);
  }

  private drawStylePreview(styleId: string): boolean {
    const { previewCanvas, mapStage, view } = this.options;
    if (!previewCanvas || !mapStage || this.layersValue.length === 0) {
      return false;
    }
    const previewWidth = 196;
    const previewHeight = 122;
    const dpr = window.devicePixelRatio || 1;
    previewCanvas.width = Math.round(previewWidth * dpr);
    previewCanvas.height = Math.round(previewHeight * dpr);
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) {
      return false;
    }
    const stageRect = mapStage.getBoundingClientRect();
    const stageWidth = Math.max(1, stageRect.width);
    const stageHeight = Math.max(1, stageRect.height);
    const scaleFit = Math.min(
      stageWidth / this.options.mapWidth,
      stageHeight / this.options.mapHeight,
    );
    const offsetX = (stageWidth - this.options.mapWidth * scaleFit) / 2;
    const offsetY = (stageHeight - this.options.mapHeight * scaleFit) / 2;
    const previewScale = Math.min(
      previewWidth / stageWidth,
      previewHeight / stageHeight,
    );
    const previewOffsetX = (previewWidth - stageWidth * previewScale) / 2;
    const previewOffsetY = (previewHeight - stageHeight * previewScale) / 2;
    const transformScale = view.scale * scaleFit * previewScale * dpr;
    const transformX =
      (previewOffsetX + (offsetX + view.tx * scaleFit) * previewScale) * dpr;
    const transformY =
      (previewOffsetY + (offsetY + view.ty * scaleFit) * previewScale) * dpr;
    const wrapSpan = this.wrapSpan(stageWidth, scaleFit);
    const wrapShift = this.options.getWrapShift();
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.save();
    ctx.setTransform(
      transformScale,
      0,
      0,
      transformScale,
      transformX,
      transformY,
    );
    this.paintLayers(ctx, styleId, wrapShift, wrapSpan);
    ctx.restore();
    if (this.reliefEnabledValue && this.hillshadeTextureValue) {
      ctx.save();
      ctx.setTransform(
        transformScale,
        0,
        0,
        transformScale,
        transformX,
        transformY,
      );
      this.paintHillshade(ctx, wrapShift, wrapSpan);
      ctx.restore();
    }
    return true;
  }

  private positionStylePreview(clientX: number, clientY: number): void {
    const preview = this.options.preview;
    if (!preview || preview.hidden) {
      return;
    }
    const gap = 14;
    const edge = 10;
    const rect = preview.getBoundingClientRect();
    let left = clientX + gap;
    let top = clientY - rect.height - gap;
    if (left + rect.width > window.innerWidth - edge) {
      left = clientX - rect.width - gap;
    }
    if (top < edge) {
      top = clientY + gap;
    }
    preview.style.left = `${Math.min(
      window.innerWidth - rect.width - edge,
      Math.max(edge, left),
    )}px`;
    preview.style.top = `${Math.min(
      window.innerHeight - rect.height - edge,
      Math.max(edge, top),
    )}px`;
  }

  private ensureReliefLoaded(): Promise<void> {
    if (this.hillshadeTextureValue) {
      return Promise.resolve();
    }
    if (this.reliefLoadPromise) {
      return this.reliefLoadPromise;
    }
    const generation = this.reliefLoadGeneration;
    const operation = this.loadRelief(generation);
    this.reliefLoadPromise = operation;
    void operation.then(
      () => this.clearReliefLoad(operation),
      () => this.clearReliefLoad(operation),
    );
    return operation;
  }

  private async loadRelief(generation: number): Promise<void> {
    try {
      const relief = await window.mapSchematic?.getRelief?.();
      if (generation !== this.reliefLoadGeneration || !relief?.path) {
        return;
      }
      const texture = await loadHillshadeTexture(
        relief.path,
        relief.projection ?? null,
        this.options.mapWidth,
        this.options.mapHeight,
      );
      if (generation !== this.reliefLoadGeneration) {
        return;
      }
      if (texture) {
        this.hillshadeTextureValue = texture;
        this.requestDraw();
        return;
      }
      const image = new Image();
      this.hillshadeImage = image;
      await new Promise<void>((resolve) => {
        image.onload = () => {
          if (
            generation === this.reliefLoadGeneration &&
            this.hillshadeImage === image
          ) {
            this.hillshadeTextureValue = buildHillshadeTexture({
              image,
              width: this.options.mapWidth,
              height: this.options.mapHeight,
              unproject,
            });
            this.requestDraw();
          }
          resolve();
        };
        image.onerror = () => {
          if (this.hillshadeImage === image) {
            this.hillshadeImage = null;
            this.requestDraw();
          }
          resolve();
        };
        image.src = relief.path;
      });
    } catch {
      if (generation === this.reliefLoadGeneration) {
        this.hillshadeImage = null;
        this.requestDraw();
      }
    }
  }

  private clearReliefLoad(operation: Promise<void>): void {
    if (this.reliefLoadPromise === operation) {
      this.reliefLoadPromise = null;
    }
  }
}

function nextRenderTurn(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
