import { defaultMarkerStyle } from "../editor/defaults.js";
import { formatCoordinates } from "../editor/presentation.js";
import type { Marker, ShapeItem } from "../editor/types.js";
import { bindFirstClickSelect } from "../ui/input-selection.js";
import {
  initSlider,
  setSliderValue,
  updateSliderUI,
  type SliderControl,
} from "../ui/slider.js";

export type InspectorControllerOptions = {
  getSelectedMarker: () => Marker | null;
  getEditableMarker: () => Marker | null;
  getSelectedShape: () => ShapeItem | null;
  getShapes: () => ShapeItem[];
  markerListName: (marker: Marker) => string;
  shapeDefaultName: (shape: ShapeItem, index: number) => string;
  updateMarker: (
    marker: Marker,
    update: (draft: Marker) => void,
    mergeKey?: string,
  ) => boolean;
  updateShape: (
    shape: ShapeItem,
    update: (draft: ShapeItem) => void,
    mergeKey?: string,
  ) => boolean;
  renderMapObjects: () => void;
  renderObjectList: () => void;
};

type InspectorElements = {
  settingsEmpty: HTMLElement | null;
  itemNameRow: HTMLElement | null;
  markerDisplayTextRow: HTMLElement | null;
  itemNameInput: HTMLInputElement | null;
  pointSettings: HTMLElement | null;
  pointTextControls: HTMLElement | null;
  textSettings: HTMLElement | null;
  lineSettings: HTMLElement | null;
  arrowSettings: HTMLElement | null;
  areaSettings: HTMLElement | null;
  markerDotSize: HTMLDivElement | null;
  markerTextSize: HTMLDivElement | null;
  markerDotColor: HTMLInputElement | null;
  markerTextColor: HTMLInputElement | null;
  markerDotHex: HTMLInputElement | null;
  markerTextHex: HTMLInputElement | null;
  dotColorChip: HTMLSpanElement | null;
  textColorChip: HTMLSpanElement | null;
  markerFont: HTMLSelectElement | null;
  markerLabelInput: HTMLInputElement | null;
  markerCoordsInput: HTMLInputElement | null;
  shapeTextInput: HTMLInputElement | null;
  shapeTextSize: HTMLDivElement | null;
  shapeTextColor: HTMLInputElement | null;
  shapeTextFont: HTMLSelectElement | null;
  shapeLineWidth: HTMLDivElement | null;
  shapeLineRotation: HTMLInputElement | null;
  shapeLineColor: HTMLInputElement | null;
  shapeArrowWidth: HTMLDivElement | null;
  shapeArrowRotation: HTMLInputElement | null;
  shapeArrowColor: HTMLInputElement | null;
  shapeAreaFill: HTMLInputElement | null;
  shapeAreaOpacity: HTMLDivElement | null;
  shapeAreaStroke: HTMLInputElement | null;
  shapeAreaStrokeWidth: HTMLDivElement | null;
};

function element<T extends HTMLElement>(
  root: Document,
  id: string,
): T | null {
  return root.getElementById(id) as T | null;
}

function collectElements(root: Document): InspectorElements {
  return {
    settingsEmpty: element(root, "settingsEmpty"),
    itemNameRow: element(root, "itemNameRow"),
    markerDisplayTextRow: element(root, "markerDisplayTextRow"),
    itemNameInput: element(root, "itemNameInput"),
    pointSettings: element(root, "pointSettings"),
    pointTextControls: element(root, "pointTextControls"),
    textSettings: element(root, "textSettings"),
    lineSettings: element(root, "lineSettings"),
    arrowSettings: element(root, "arrowSettings"),
    areaSettings: element(root, "areaSettings"),
    markerDotSize: element(root, "markerDotSize"),
    markerTextSize: element(root, "markerTextSize"),
    markerDotColor: element(root, "markerDotColor"),
    markerTextColor: element(root, "markerTextColor"),
    markerDotHex: element(root, "markerDotHex"),
    markerTextHex: element(root, "markerTextHex"),
    dotColorChip: element(root, "dotColorChip"),
    textColorChip: element(root, "textColorChip"),
    markerFont: element(root, "markerFont"),
    markerLabelInput: element(root, "markerLabelInput"),
    markerCoordsInput: element(root, "markerCoordsInput"),
    shapeTextInput: element(root, "shapeTextInput"),
    shapeTextSize: element(root, "shapeTextSize"),
    shapeTextColor: element(root, "shapeTextColor"),
    shapeTextFont: element(root, "shapeTextFont"),
    shapeLineWidth: element(root, "shapeLineWidth"),
    shapeLineRotation: element(root, "shapeLineRotation"),
    shapeLineColor: element(root, "shapeLineColor"),
    shapeArrowWidth: element(root, "shapeArrowWidth"),
    shapeArrowRotation: element(root, "shapeArrowRotation"),
    shapeArrowColor: element(root, "shapeArrowColor"),
    shapeAreaFill: element(root, "shapeAreaFill"),
    shapeAreaOpacity: element(root, "shapeAreaOpacity"),
    shapeAreaStroke: element(root, "shapeAreaStroke"),
    shapeAreaStrokeWidth: element(root, "shapeAreaStrokeWidth"),
  };
}

export function normalizeHexColor(input: string): string | null {
  let value = input.trim();
  if (!value) {
    return null;
  }
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }
  const short = /^#([0-9a-fA-F]{3})$/;
  if (short.test(value)) {
    const [red, green, blue] = value.slice(1).split("");
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return /^#([0-9a-fA-F]{6})$/.test(value)
    ? value.toLowerCase()
    : null;
}

export class InspectorController {
  private readonly options: InspectorControllerOptions;
  private readonly elements: InspectorElements;
  private readonly root: Document;
  private sliders: SliderControl[] = [];
  private dotSizeSlider: SliderControl | null = null;
  private textSizeSlider: SliderControl | null = null;
  private shapeTextSizeSlider: SliderControl | null = null;
  private shapeLineWidthSlider: SliderControl | null = null;
  private shapeArrowWidthSlider: SliderControl | null = null;
  private shapeAreaOpacitySlider: SliderControl | null = null;
  private shapeAreaStrokeWidthSlider: SliderControl | null = null;

  constructor(
    options: InspectorControllerOptions,
    root: Document = document,
  ) {
    this.options = options;
    this.root = root;
    this.elements = collectElements(root);
  }

  bind(): void {
    this.bindMarkerControls();
    this.bindShapeControls();
    this.elements.itemNameInput?.addEventListener("input", () =>
      this.updateItemName(),
    );
    bindFirstClickSelect(this.elements.itemNameInput, () => true);
    bindFirstClickSelect(this.elements.markerLabelInput, () => true);
    bindFirstClickSelect(
      this.elements.shapeTextInput,
      () => this.isShapeTextDefault(),
    );
    bindFirstClickSelect(this.elements.shapeLineRotation, () => true);
    bindFirstClickSelect(this.elements.shapeArrowRotation, () => true);
    this.initializeSliders();
  }

  syncMarker(marker: Marker | null): void {
    this.updateVisibility(marker, null);
    const {
      markerDotSize,
      markerTextSize,
      markerDotColor,
      markerTextColor,
      markerFont,
      markerLabelInput,
      markerCoordsInput,
    } = this.elements;
    if (
      !markerDotSize ||
      !markerTextSize ||
      !markerDotColor ||
      !markerTextColor ||
      !markerFont
    ) {
      return;
    }
    if (!marker) {
      const defaults = defaultMarkerStyle();
      this.dotSizeSlider &&
        setSliderValue(this.dotSizeSlider, defaults.dotSize, true);
      this.textSizeSlider &&
        setSliderValue(this.textSizeSlider, defaults.textSize, true);
      markerDotColor.value = defaults.dotColor;
      markerTextColor.value = defaults.textColor;
      markerFont.value = defaults.fontFamily;
      this.syncMarkerColorInputs("dot", defaults.dotColor);
      this.syncMarkerColorInputs("text", defaults.textColor);
      if (markerLabelInput) {
        markerLabelInput.value = "";
        markerLabelInput.disabled = true;
      }
      if (markerCoordsInput) {
        markerCoordsInput.value = "";
        markerCoordsInput.disabled = true;
      }
      return;
    }
    this.dotSizeSlider &&
      setSliderValue(this.dotSizeSlider, marker.style.dotSize, true);
    this.textSizeSlider &&
      setSliderValue(this.textSizeSlider, marker.style.textSize, true);
    markerDotColor.value = marker.style.dotColor;
    markerTextColor.value = marker.style.textColor;
    markerFont.value = marker.style.fontFamily;
    this.syncMarkerColorInputs("dot", marker.style.dotColor);
    this.syncMarkerColorInputs("text", marker.style.textColor);
    if (markerLabelInput) {
      const canEdit =
        marker.sourceType === "geonames" || marker.sourceType === "coords";
      markerLabelInput.disabled = !canEdit;
      markerLabelInput.value =
        marker.sourceType === "geonames"
          ? (marker.labelName ?? marker.name)
          : marker.sourceType === "coords"
            ? (marker.labelName ?? marker.displayName ?? marker.name)
            : "";
    }
    if (markerCoordsInput) {
      markerCoordsInput.disabled = false;
      markerCoordsInput.value = formatCoordinates(
        marker.latitude,
        marker.longitude,
      );
    }
  }

  syncShape(shape: ShapeItem | null): void {
    if (!shape) {
      if (!this.options.getSelectedMarker()) {
        this.updateVisibility(null, null);
      }
      if (this.elements.shapeTextInput) {
        this.elements.shapeTextInput.value = "";
      }
      return;
    }
    this.updateVisibility(null, shape);
    if (shape.type === "text") {
      if (this.elements.shapeTextInput) {
        this.elements.shapeTextInput.value = shape.text ?? "";
      }
      if (this.elements.shapeTextColor) {
        this.elements.shapeTextColor.value = shape.style.textColor;
      }
      if (this.elements.shapeTextFont) {
        this.elements.shapeTextFont.value = shape.style.fontFamily;
      }
      this.shapeTextSizeSlider &&
        setSliderValue(
          this.shapeTextSizeSlider,
          shape.style.textSize,
          true,
        );
    }
    if (shape.type === "line") {
      if (this.elements.shapeLineColor) {
        this.elements.shapeLineColor.value = shape.style.strokeColor;
      }
      this.shapeLineWidthSlider &&
        setSliderValue(
          this.shapeLineWidthSlider,
          shape.style.strokeWidth,
          true,
        );
      if (this.elements.shapeLineRotation) {
        this.elements.shapeLineRotation.value = String(shape.rotation ?? 0);
      }
    }
    if (shape.type === "arrow") {
      if (this.elements.shapeArrowColor) {
        this.elements.shapeArrowColor.value = shape.style.strokeColor;
      }
      this.shapeArrowWidthSlider &&
        setSliderValue(
          this.shapeArrowWidthSlider,
          shape.style.strokeWidth,
          true,
        );
      if (this.elements.shapeArrowRotation) {
        this.elements.shapeArrowRotation.value = String(shape.rotation ?? 0);
      }
    }
    if (shape.type === "area") {
      if (this.elements.shapeAreaFill) {
        this.elements.shapeAreaFill.value = shape.style.fillColor;
      }
      if (this.elements.shapeAreaStroke) {
        this.elements.shapeAreaStroke.value = shape.style.strokeColor;
      }
      this.shapeAreaOpacitySlider &&
        setSliderValue(
          this.shapeAreaOpacitySlider,
          shape.style.fillOpacity,
          true,
        );
      this.shapeAreaStrokeWidthSlider &&
        setSliderValue(
          this.shapeAreaStrokeWidthSlider,
          shape.style.strokeWidth,
          true,
        );
    }
    this.syncShapeColorPalettes();
    this.syncItemName();
  }

  syncItemName(): void {
    const { itemNameRow, itemNameInput } = this.elements;
    if (!itemNameRow || !itemNameInput) {
      return;
    }
    const marker = this.options.getSelectedMarker();
    const shape = this.options.getSelectedShape();
    if (!marker && !shape) {
      itemNameRow.hidden = true;
      itemNameInput.value = "";
      itemNameInput.disabled = true;
      return;
    }
    itemNameRow.hidden = false;
    itemNameInput.disabled = false;
    if (marker) {
      itemNameInput.value =
        marker.displayName ?? this.options.markerListName(marker);
      return;
    }
    if (shape) {
      const sameType = this.options
        .getShapes()
        .filter((item) => item.type === shape.type);
      const index = Math.max(
        1,
        sameType.findIndex((item) => item.id === shape.id) + 1,
      );
      itemNameInput.value =
        shape.displayName ?? this.options.shapeDefaultName(shape, index);
    }
  }

  resize(): void {
    this.sliders.forEach((slider) => {
      slider.rect = null;
      updateSliderUI(slider);
    });
  }

  private initializeSliders(): void {
    this.dotSizeSlider = initSlider(
      this.elements.markerDotSize,
      7,
      () => this.updateMarkerFromControls(this.markerMergeKey("dot-size")),
    );
    this.textSizeSlider = initSlider(
      this.elements.markerTextSize,
      7,
      () => this.updateMarkerFromControls(this.markerMergeKey("text-size")),
    );
    this.shapeTextSizeSlider = initSlider(
      this.elements.shapeTextSize,
      7,
      () => this.updateShapeFromControls(this.shapeMergeKey("text-size")),
    );
    this.shapeLineWidthSlider = initSlider(
      this.elements.shapeLineWidth,
      2,
      () => this.updateShapeFromControls(this.shapeMergeKey("line-width")),
    );
    this.shapeArrowWidthSlider = initSlider(
      this.elements.shapeArrowWidth,
      2,
      () => this.updateShapeFromControls(this.shapeMergeKey("arrow-width")),
    );
    this.shapeAreaOpacitySlider = initSlider(
      this.elements.shapeAreaOpacity,
      0.4,
      () => this.updateShapeFromControls(this.shapeMergeKey("area-opacity")),
    );
    this.shapeAreaStrokeWidthSlider = initSlider(
      this.elements.shapeAreaStrokeWidth,
      2,
      () =>
        this.updateShapeFromControls(
          this.shapeMergeKey("area-stroke-width"),
        ),
    );
    this.sliders = [
      this.dotSizeSlider,
      this.textSizeSlider,
      this.shapeTextSizeSlider,
      this.shapeLineWidthSlider,
      this.shapeArrowWidthSlider,
      this.shapeAreaOpacitySlider,
      this.shapeAreaStrokeWidthSlider,
    ].filter((slider): slider is SliderControl => slider !== null);
  }

  private markerMergeKey(property: string): string {
    return `marker:${this.options.getEditableMarker()?.id ?? "none"}:${property}`;
  }

  private shapeMergeKey(property: string): string {
    return `shape:${this.options.getSelectedShape()?.id ?? "none"}:${property}`;
  }

  private updateItemName(): void {
    const value = this.elements.itemNameInput?.value.trim() ?? "";
    const marker = this.options.getSelectedMarker();
    const shape = this.options.getSelectedShape();
    if (marker) {
      this.options.updateMarker(
        marker,
        (draft) => {
          draft.displayName = value || undefined;
        },
        `item:${marker.id}:name`,
      );
      this.options.renderObjectList();
      return;
    }
    if (shape) {
      this.options.updateShape(
        shape,
        (draft) => {
          draft.displayName = value || undefined;
        },
        `item:${shape.id}:name`,
      );
      this.options.renderObjectList();
    }
  }

  private updateVisibility(
    marker: Marker | null,
    shape: ShapeItem | null,
  ): void {
    const {
      settingsEmpty,
      markerDisplayTextRow,
      pointSettings,
      pointTextControls,
      textSettings,
      lineSettings,
      arrowSettings,
      areaSettings,
    } = this.elements;
    if (
      !settingsEmpty ||
      !pointSettings ||
      !textSettings ||
      !lineSettings ||
      !arrowSettings ||
      !areaSettings
    ) {
      return;
    }
    settingsEmpty.hidden = Boolean(marker || shape);
    if (markerDisplayTextRow) {
      const canEdit =
        marker?.sourceType === "geonames" || marker?.sourceType === "coords";
      markerDisplayTextRow.hidden = !canEdit;
    }
    pointSettings.hidden = !marker;
    textSettings.hidden = shape?.type !== "text";
    lineSettings.hidden = shape?.type !== "line";
    arrowSettings.hidden = shape?.type !== "arrow";
    areaSettings.hidden = shape?.type !== "area";
    if (pointTextControls) {
      pointTextControls.hidden = marker?.kind === "point";
    }
  }

  private bindMarkerControls(): void {
    const update = (property: string) =>
      this.updateMarkerFromControls(this.markerMergeKey(property));
    this.elements.markerLabelInput?.addEventListener("input", () =>
      update("label"),
    );
    this.elements.markerDotColor?.addEventListener("input", () => {
      this.syncMarkerColorInputs(
        "dot",
        this.elements.markerDotColor?.value ?? "",
      );
      update("dot-color");
    });
    this.elements.markerTextColor?.addEventListener("input", () => {
      this.syncMarkerColorInputs(
        "text",
        this.elements.markerTextColor?.value ?? "",
      );
      update("text-color");
    });
    this.bindHexInput("dot");
    this.bindHexInput("text");
    this.elements.markerFont?.addEventListener("change", () => update("font"));
    this.root
      .querySelectorAll<HTMLButtonElement>(".color-swatch")
      .forEach((swatch) => {
        swatch.addEventListener("click", () => {
          const color = swatch.dataset.color ?? "";
          const target = swatch.dataset.colorTarget;
          if (!this.options.getEditableMarker() || !color) {
            return;
          }
          if (target === "dot" && this.elements.markerDotColor) {
            this.elements.markerDotColor.value = color;
            this.syncMarkerColorInputs("dot", color);
          }
          if (target === "text" && this.elements.markerTextColor) {
            this.elements.markerTextColor.value = color;
            this.syncMarkerColorInputs("text", color);
          }
          this.updateMarkerFromControls();
        });
      });
  }

  private bindHexInput(target: "dot" | "text"): void {
    const input =
      target === "dot"
        ? this.elements.markerDotHex
        : this.elements.markerTextHex;
    const colorInput =
      target === "dot"
        ? this.elements.markerDotColor
        : this.elements.markerTextColor;
    input?.addEventListener("input", () => {
      const color = normalizeHexColor(input.value);
      if (!color || !colorInput) {
        return;
      }
      colorInput.value = color;
      this.syncMarkerColorInputs(target, color);
      this.updateMarkerFromControls(this.markerMergeKey(`${target}-color`));
    });
  }

  private bindShapeControls(): void {
    const update = (property: string) =>
      this.updateShapeFromControls(this.shapeMergeKey(property));
    this.bindRotationInput(this.elements.shapeLineRotation, update);
    this.bindRotationInput(this.elements.shapeArrowRotation, update);
    this.bindRotationSteppers(update);
    this.elements.shapeTextInput?.addEventListener("input", () =>
      update("text"),
    );
    this.bindShapeInput(this.elements.shapeTextColor, "text-color", update);
    this.elements.shapeTextFont?.addEventListener("change", () =>
      update("font"),
    );
    this.bindShapeInput(this.elements.shapeLineColor, "line-color", update);
    this.bindShapeInput(this.elements.shapeArrowColor, "arrow-color", update);
    this.bindShapeInput(this.elements.shapeAreaFill, "area-fill", update);
    this.bindShapeInput(this.elements.shapeAreaStroke, "area-stroke", update);
    this.bindShapeSwatches(update);
  }

  private bindShapeInput(
    input: HTMLInputElement | null,
    property: string,
    update: (property: string) => void,
  ): void {
    input?.addEventListener("input", () => {
      this.syncShapeColorPalettes();
      update(property);
    });
  }

  private bindRotationInput(
    input: HTMLInputElement | null,
    update: (property: string) => void,
  ): void {
    input?.addEventListener("input", () => {
      if (!Number.isFinite(input.valueAsNumber)) {
        return;
      }
      const rotation = Math.max(0, Math.min(360, input.valueAsNumber));
      if (rotation !== input.valueAsNumber) {
        input.value = String(rotation);
      }
      update("rotation");
    });
    input?.addEventListener("change", () => {
      if (!Number.isFinite(input.valueAsNumber)) {
        input.value = String(
          this.options.getSelectedShape()?.rotation ?? 0,
        );
      }
    });
  }

  private bindRotationSteppers(
    update: (property: string) => void,
  ): void {
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-rotation-target]")
      .forEach((button) => {
        const targetId = button.dataset.rotationTarget;
        const step = Number(button.dataset.rotationStep);
        const input = targetId
          ? element<HTMLInputElement>(this.root, targetId)
          : null;
        if (!input || !Number.isFinite(step)) {
          return;
        }
        let repeatDelay: number | null = null;
        let repeatInterval: number | null = null;
        const stop = (): void => {
          if (repeatDelay !== null) {
            window.clearTimeout(repeatDelay);
            repeatDelay = null;
          }
          if (repeatInterval !== null) {
            window.clearInterval(repeatInterval);
            repeatInterval = null;
          }
        };
        const apply = (): void => {
          const current = Number.isFinite(input.valueAsNumber)
            ? input.valueAsNumber
            : (this.options.getSelectedShape()?.rotation ?? 0);
          input.value = String(Math.max(0, Math.min(360, current + step)));
          input.dispatchEvent(new Event("input", { bubbles: true }));
        };
        button.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          apply();
          button.setPointerCapture(event.pointerId);
          repeatDelay = window.setTimeout(() => {
            repeatDelay = null;
            repeatInterval = window.setInterval(apply, 75);
          }, 380);
        });
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", stop);
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          if (!event.repeat) {
            apply();
          }
        });
      });
  }

  private bindShapeSwatches(
    update: (property: string) => void,
  ): void {
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-shape-color]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const color = button.dataset.shapeColor;
          const shape = this.options.getSelectedShape();
          if (!color || !shape) {
            return;
          }
          const paletteId = button.closest<HTMLElement>(".color-palette")?.id;
          const property = this.applyShapeSwatch(shape, paletteId, color);
          if (property) {
            this.syncShapeColorPalettes();
            update(property);
          }
        });
      });
  }

  private applyShapeSwatch(
    shape: ShapeItem,
    paletteId: string | undefined,
    color: string,
  ): string | null {
    if (
      shape.type === "text" &&
      paletteId === "shapeTextPalette" &&
      this.elements.shapeTextColor
    ) {
      this.elements.shapeTextColor.value = color;
      return "text-color";
    }
    if (
      shape.type === "line" &&
      paletteId === "shapeLinePalette" &&
      this.elements.shapeLineColor
    ) {
      this.elements.shapeLineColor.value = color;
      return "line-color";
    }
    if (
      shape.type === "arrow" &&
      paletteId === "shapeArrowPalette" &&
      this.elements.shapeArrowColor
    ) {
      this.elements.shapeArrowColor.value = color;
      return "arrow-color";
    }
    if (
      shape.type === "area" &&
      paletteId === "shapeAreaFillPalette" &&
      this.elements.shapeAreaFill
    ) {
      this.elements.shapeAreaFill.value = color;
      return "area-fill";
    }
    if (
      shape.type === "area" &&
      paletteId === "shapeAreaStrokePalette" &&
      this.elements.shapeAreaStroke
    ) {
      this.elements.shapeAreaStroke.value = color;
      return "area-stroke";
    }
    return null;
  }

  private syncMarkerColorInputs(
    target: "dot" | "text",
    color: string,
  ): void {
    this.root
      .querySelectorAll<HTMLButtonElement>(
        `.color-swatch[data-color-target="${target}"]`,
      )
      .forEach((swatch) => this.syncColorSwatch(swatch, color));
    if (target === "dot") {
      if (this.elements.markerDotHex) {
        this.elements.markerDotHex.value = color;
      }
      if (this.elements.dotColorChip) {
        this.elements.dotColorChip.style.background = color;
      }
      return;
    }
    if (this.elements.markerTextHex) {
      this.elements.markerTextHex.value = color;
    }
    if (this.elements.textColorChip) {
      this.elements.textColorChip.style.background = color;
    }
  }

  private syncColorSwatch(
    swatch: HTMLButtonElement,
    color: string,
  ): void {
    const swatchColor =
      swatch.dataset.color ?? swatch.dataset.shapeColor ?? "";
    const active = swatchColor.toLowerCase() === color.toLowerCase();
    swatch.classList.toggle("active", active);
    swatch.setAttribute("aria-pressed", String(active));
    swatch.setAttribute(
      "aria-label",
      active ? `目前顏色 ${swatchColor}` : `選擇顏色 ${swatchColor}`,
    );
    swatch.title = swatchColor;
  }

  private syncShapeColorPalettes(): void {
    this.syncPalette("shapeTextPalette", this.elements.shapeTextColor);
    this.syncPalette("shapeLinePalette", this.elements.shapeLineColor);
    this.syncPalette("shapeArrowPalette", this.elements.shapeArrowColor);
    this.syncPalette("shapeAreaFillPalette", this.elements.shapeAreaFill);
    this.syncPalette(
      "shapeAreaStrokePalette",
      this.elements.shapeAreaStroke,
    );
  }

  private syncPalette(
    paletteId: string,
    input: HTMLInputElement | null,
  ): void {
    if (!input) {
      return;
    }
    this.root
      .querySelectorAll<HTMLButtonElement>(`#${paletteId} .color-swatch`)
      .forEach((swatch) => this.syncColorSwatch(swatch, input.value));
  }

  private isShapeTextDefault(): boolean {
    const shape = this.options.getSelectedShape();
    if (!shape || shape.type !== "text") {
      return false;
    }
    const text = (shape.text ?? "").trim();
    return text.length === 0 || /^文字標示\d*$/.test(text);
  }

  private updateMarkerFromControls(mergeKey?: string): void {
    const marker = this.options.getEditableMarker();
    if (!marker) {
      return;
    }
    this.options.updateMarker(
      marker,
      (draft) => {
        if (this.dotSizeSlider) {
          draft.style.dotSize = this.dotSizeSlider.value;
        }
        if (this.textSizeSlider) {
          draft.style.textSize = this.textSizeSlider.value;
        }
        if (this.elements.markerDotColor) {
          draft.style.dotColor = this.elements.markerDotColor.value;
        }
        if (this.elements.markerTextColor) {
          draft.style.textColor = this.elements.markerTextColor.value;
        }
        if (this.elements.markerFont) {
          draft.style.fontFamily = this.elements.markerFont.value;
        }
        if (
          this.elements.markerLabelInput &&
          (draft.sourceType === "geonames" || draft.sourceType === "coords")
        ) {
          const value = this.elements.markerLabelInput.value.trim();
          draft.labelName = value || undefined;
          draft.labelMode = "name";
        }
      },
      mergeKey,
    );
    this.options.renderMapObjects();
  }

  private updateShapeFromControls(mergeKey?: string): void {
    const shape = this.options.getSelectedShape();
    if (!shape) {
      return;
    }
    this.options.updateShape(
      shape,
      (draft) => {
        this.applyShapeControls(draft);
      },
      mergeKey,
    );
    this.options.renderMapObjects();
  }

  private applyShapeControls(draft: ShapeItem): void {
    if (draft.type === "text") {
      draft.text =
        this.elements.shapeTextInput?.value.trim() || "文字標示";
      if (this.elements.shapeTextColor) {
        draft.style.textColor = this.elements.shapeTextColor.value;
      }
      if (this.elements.shapeTextFont) {
        draft.style.fontFamily = this.elements.shapeTextFont.value;
      }
      if (this.shapeTextSizeSlider) {
        draft.style.textSize = this.shapeTextSizeSlider.value;
      }
    }
    if (draft.type === "line") {
      if (this.elements.shapeLineColor) {
        draft.style.strokeColor = this.elements.shapeLineColor.value;
      }
      if (this.shapeLineWidthSlider) {
        draft.style.strokeWidth = this.shapeLineWidthSlider.value;
      }
      if (
        this.elements.shapeLineRotation &&
        Number.isFinite(this.elements.shapeLineRotation.valueAsNumber)
      ) {
        draft.rotation = this.elements.shapeLineRotation.valueAsNumber;
      }
    }
    if (draft.type === "arrow") {
      if (this.elements.shapeArrowColor) {
        draft.style.strokeColor = this.elements.shapeArrowColor.value;
      }
      if (this.shapeArrowWidthSlider) {
        draft.style.strokeWidth = this.shapeArrowWidthSlider.value;
      }
      if (
        this.elements.shapeArrowRotation &&
        Number.isFinite(this.elements.shapeArrowRotation.valueAsNumber)
      ) {
        draft.rotation = this.elements.shapeArrowRotation.valueAsNumber;
      }
    }
    if (draft.type === "area") {
      if (this.elements.shapeAreaFill) {
        draft.style.fillColor = this.elements.shapeAreaFill.value;
      }
      if (this.elements.shapeAreaStroke) {
        draft.style.strokeColor = this.elements.shapeAreaStroke.value;
      }
      if (this.shapeAreaOpacitySlider) {
        draft.style.fillOpacity = this.shapeAreaOpacitySlider.value;
      }
      if (this.shapeAreaStrokeWidthSlider) {
        draft.style.strokeWidth = this.shapeAreaStrokeWidthSlider.value;
      }
    }
  }
}
