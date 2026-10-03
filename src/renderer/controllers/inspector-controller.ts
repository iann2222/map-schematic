import { defaultMarkerStyle } from "../editor/defaults.js";
import { formatCoordinates } from "../editor/presentation.js";
import type { Marker, ShapeItem } from "../editor/types.js";
import { ColorControl } from "../ui/color-control.js";
import { bindRotationControl } from "../ui/rotation-control.js";
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

type ColorInputId =
  | "markerDotColor"
  | "markerTextColor"
  | "shapeTextColor"
  | "shapeLineColor"
  | "shapeArrowColor"
  | "shapeAreaFill"
  | "shapeAreaStroke";

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

export class InspectorController {
  private readonly options: InspectorControllerOptions;
  private readonly elements: InspectorElements;
  private readonly root: Document;
  private bound = false;
  private readonly colors = new Map<ColorInputId, ColorControl>();
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
    if (this.bound) return;
    this.bound = true;
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
    this.initializeSliders();
  }

  syncMarker(marker: Marker | null): void {
    this.updateVisibility(marker, null);
    const { markerFont, markerLabelInput, markerCoordsInput } = this.elements;
    const style = marker?.style ?? defaultMarkerStyle();
    if (this.dotSizeSlider) setSliderValue(this.dotSizeSlider, style.dotSize, true);
    if (this.textSizeSlider) setSliderValue(this.textSizeSlider, style.textSize, true);
    this.colors.get("markerDotColor")?.sync(style.dotColor);
    this.colors.get("markerTextColor")?.sync(style.textColor);
    if (markerFont) markerFont.value = style.fontFamily;
    if (!marker) {
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
        this.colors.get("shapeTextColor")?.sync(shape.style.textColor);
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
    if (shape.type === "line" || shape.type === "arrow") {
      const line = shape.type === "line";
      const slider = line ? this.shapeLineWidthSlider : this.shapeArrowWidthSlider;
      const rotation = line
        ? this.elements.shapeLineRotation
        : this.elements.shapeArrowRotation;
      this.colors
        .get(line ? "shapeLineColor" : "shapeArrowColor")
        ?.sync(shape.style.strokeColor);
      if (slider) setSliderValue(slider, shape.style.strokeWidth, true);
      if (rotation) rotation.value = String(shape.rotation ?? 0);
    }
    if (shape.type === "area") {
      if (this.elements.shapeAreaFill) {
        this.colors.get("shapeAreaFill")?.sync(shape.style.fillColor);
      }
      if (this.elements.shapeAreaStroke) {
        this.colors.get("shapeAreaStroke")?.sync(shape.style.strokeColor);
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
      (value) => this.editMarker("dot-size", (draft) => {
        draft.style.dotSize = value;
      }),
    );
    this.textSizeSlider = initSlider(
      this.elements.markerTextSize,
      7,
      (value) => this.editMarker("text-size", (draft) => {
        draft.style.textSize = value;
      }),
    );
    this.shapeTextSizeSlider = initSlider(
      this.elements.shapeTextSize,
      7,
      (value) => this.editShape("text", "text-size", (draft) => {
        draft.style.textSize = value;
      }),
    );
    this.shapeLineWidthSlider = initSlider(
      this.elements.shapeLineWidth,
      2,
      (value) => this.editShape("line", "line-width", (draft) => {
        draft.style.strokeWidth = value;
      }),
    );
    this.shapeArrowWidthSlider = initSlider(
      this.elements.shapeArrowWidth,
      2,
      (value) => this.editShape("arrow", "arrow-width", (draft) => {
        draft.style.strokeWidth = value;
      }),
    );
    this.shapeAreaOpacitySlider = initSlider(
      this.elements.shapeAreaOpacity,
      0.4,
      (value) => this.editShape("area", "area-opacity", (draft) => {
        draft.style.fillOpacity = value;
      }),
    );
    this.shapeAreaStrokeWidthSlider = initSlider(
      this.elements.shapeAreaStrokeWidth,
      2,
      (value) => this.editShape("area", "area-stroke-width", (draft) => {
        draft.style.strokeWidth = value;
      }),
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

  private bindColor(
    id: ColorInputId,
    palette: string,
    onChange: (color: string, source: "input" | "palette") => boolean,
  ): void {
    const input = this.elements[id];
    if (!input) return;
    const control = new ColorControl(
      input,
      Array.from(this.root.querySelectorAll<HTMLButtonElement>(`#${palette} .color-swatch`)),
      onChange,
    );
    this.colors.set(id, control);
    control.bind();
  }

  private bindMarkerControls(): void {
    const { markerLabelInput, markerFont } = this.elements;
    markerLabelInput?.addEventListener("input", () => {
      const marker = this.options.getEditableMarker();
      if (marker?.sourceType !== "geonames" && marker?.sourceType !== "coords") return;
      this.editMarker("label", (draft) => {
        draft.labelName = markerLabelInput.value.trim() || undefined;
        draft.labelMode = "name";
      });
    });
    markerFont?.addEventListener("change", () =>
      this.editMarker("font", (draft) => {
        draft.style.fontFamily = markerFont.value;
      }),
    );
    this.bindColor("markerDotColor", "dotPalette", (color, source) =>
      this.editMarker("dot-color", (draft) => {
        draft.style.dotColor = color;
      }, source === "input"),
    );
    this.bindColor("markerTextColor", "textPalette", (color, source) =>
      this.editMarker("text-color", (draft) => {
        draft.style.textColor = color;
      }, source === "input"),
    );
  }

  private bindShapeControls(): void {
    const { shapeTextInput, shapeTextFont } = this.elements;
    shapeTextInput?.addEventListener("input", () =>
      this.editShape("text", "text", (draft) => {
        draft.text = shapeTextInput.value.trim() || "文字標示";
      }),
    );
    shapeTextFont?.addEventListener("change", () =>
      this.editShape("text", "font", (draft) => {
        draft.style.fontFamily = shapeTextFont.value;
      }),
    );
    this.bindColor("shapeTextColor", "shapeTextPalette", (color) =>
      this.editShape("text", "text-color", (draft) => {
        draft.style.textColor = color;
      }),
    );
    this.bindLineControls("line");
    this.bindLineControls("arrow");
    this.bindColor("shapeAreaFill", "shapeAreaFillPalette", (color) =>
      this.editShape("area", "area-fill", (draft) => {
        draft.style.fillColor = color;
      }),
    );
    this.bindColor("shapeAreaStroke", "shapeAreaStrokePalette", (color) =>
      this.editShape("area", "area-stroke", (draft) => {
        draft.style.strokeColor = color;
      }),
    );
  }

  private bindLineControls(type: "line" | "arrow"): void {
    const line = type === "line";
    const colorId = line ? "shapeLineColor" : "shapeArrowColor";
    const rotation = line
      ? this.elements.shapeLineRotation
      : this.elements.shapeArrowRotation;
    this.bindColor(colorId, line ? "shapeLinePalette" : "shapeArrowPalette", (color) =>
      this.editShape(type, `${type}-color`, (draft) => {
        draft.style.strokeColor = color;
      }),
    );
    bindRotationControl(
      rotation,
      Array.from(this.root.querySelectorAll<HTMLButtonElement>(
        `[data-rotation-target="${line ? "shapeLineRotation" : "shapeArrowRotation"}"]`,
      )),
      () => {
        const shape = this.options.getSelectedShape();
        return shape?.type === type
          ? { id: shape.id, rotation: shape.rotation ?? 0 }
          : null;
      },
      (value) => { this.editShape(type, "rotation", (draft) => {
        draft.rotation = value;
      }); },
    );
  }

  private isShapeTextDefault(): boolean {
    const shape = this.options.getSelectedShape();
    if (!shape || shape.type !== "text") {
      return false;
    }
    const text = (shape.text ?? "").trim();
    return text.length === 0 || /^文字標示\d*$/.test(text);
  }

  private editMarker(
    property: string,
    update: (draft: Marker) => void,
    merge = true,
  ): boolean {
    const marker = this.options.getEditableMarker();
    if (!marker) return false;
    const mergeKey = merge ? `marker:${marker.id}:${property}` : undefined;
    if (this.options.updateMarker(marker, update, mergeKey)) {
      this.options.renderMapObjects();
    }
    return true;
  }

  private editShape(
    type: ShapeItem["type"],
    property: string,
    update: (draft: ShapeItem) => void,
  ): boolean {
    const shape = this.options.getSelectedShape();
    if (!shape || shape.type !== type) return false;
    if (this.options.updateShape(shape, update, `shape:${shape.id}:${property}`)) {
      this.options.renderMapObjects();
    }
    return true;
  }
}
