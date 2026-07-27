import type { WorkflowStep, SelectionState } from "../app-state.js";
import type { Marker, ShapeItem } from "../editor/types.js";
import {
  normalizeLongitude,
  project,
  unproject,
  WORLD_BBOX,
} from "../map/geometry.js";
import { labelOffsetScale } from "../overlay/overlay-presentation.js";

export type SelectionTool = "marker" | "line" | "area" | "text" | "arrow";

export type SelectionControllerOptions = {
  state: SelectionState;
  getActiveStep: () => WorkflowStep;
  getMarkers: () => Marker[];
  getShapes: () => ShapeItem[];
  clearToolPreviews: () => void;
  clearMarkerPreview: () => void;
  setActiveTool: (tool: SelectionTool) => void;
  syncMarkerInspector: (marker: Marker | null) => void;
  syncShapeInspector: (shape: ShapeItem | null) => void;
  syncItemName: () => void;
  updateMarkerStyles: () => void;
  renderMapObjects: () => void;
  renderObjectList: () => void;
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
  getMapMetrics: () => {
    scale: number;
    scaleFit: number;
    width: number;
    height: number;
  };
  mapPointFromEvent: (event: MouseEvent) => { x: number; y: number };
  commitTransaction: () => void;
  hasOpenModal: () => boolean;
  mapElement: SVGSVGElement | null;
};

export class SelectionController {
  private readonly options: SelectionControllerOptions;
  private readonly state: SelectionState;

  constructor(options: SelectionControllerOptions) {
    this.options = options;
    this.state = options.state;
  }

  get markerId(): string | null {
    return this.state.markerId;
  }

  get shapeId(): string | null {
    return this.state.shapeId;
  }

  get labelMarkerId(): string | null {
    return this.state.labelMarkerId;
  }

  getSelectedMarker(): Marker | null {
    if (!this.state.markerId) {
      return null;
    }
    return (
      this.options
        .getMarkers()
        .find((marker) => marker.id === this.state.markerId) ?? null
    );
  }

  getSelectedShape(): ShapeItem | null {
    if (!this.state.shapeId) {
      return null;
    }
    return (
      this.options
        .getShapes()
        .find((shape) => shape.id === this.state.shapeId) ?? null
    );
  }

  selectMarker(markerId: string | null): void {
    this.options.clearToolPreviews();
    this.state.markerId = markerId;
    this.state.shapeId = null;
    if (this.state.labelMarkerId !== markerId) {
      this.state.labelMarkerId = null;
    }
    this.options.syncMarkerInspector(this.getSelectedMarker());
    this.options.syncItemName();
    this.options.updateMarkerStyles();
    this.options.renderObjectList();
    if (markerId) {
      this.options.setActiveTool("marker");
    }
  }

  selectShape(shapeId: string | null): void {
    this.options.clearToolPreviews();
    this.state.shapeId = shapeId;
    this.state.markerId = null;
    this.state.labelMarkerId = null;
    this.options.clearMarkerPreview();
    const shape = this.getSelectedShape();
    this.options.syncMarkerInspector(null);
    this.options.syncShapeInspector(shape);
    this.options.syncItemName();
    this.options.renderMapObjects();
    this.options.renderObjectList();
    if (shape) {
      this.options.setActiveTool(shape.type);
    }
  }

  clear(): void {
    this.state.labelDrag = null;
    this.state.labelMarkerId = null;
    this.selectMarker(null);
    this.selectShape(null);
    this.options.renderMapObjects();
  }

  resetTransient(): void {
    this.state.labelMarkerId = null;
    this.state.labelDrag = null;
    this.state.markerDrag = null;
    this.state.shapeDrag = null;
  }

  moveDrag(event: MouseEvent): boolean {
    const metrics = this.options.getMapMetrics();
    if (this.state.labelDrag) {
      const drag = this.state.labelDrag;
      const marker = this.options
        .getMarkers()
        .find((item) => item.id === drag.markerId);
      if (marker) {
        const current = this.options.mapPointFromEvent(event);
        const offsetScale = labelOffsetScale(metrics.scale);
        marker.style.textOffsetX =
          drag.startOffsetX + (current.x - drag.startX) / offsetScale;
        marker.style.textOffsetY =
          drag.startOffsetY + (current.y - drag.startY) / offsetScale;
        this.options.renderMapObjects();
      }
      return true;
    }
    if (this.state.markerDrag) {
      const drag = this.state.markerDrag;
      const marker = this.options
        .getMarkers()
        .find((item) => item.id === drag.markerId);
      if (marker) {
        const current = this.options.mapPointFromEvent(event);
        const [startX, startY] = project(
          drag.startLon,
          drag.startLat,
          metrics.width,
          metrics.height,
        );
        const [longitude, latitude] = unproject(
          startX + current.x - drag.startX,
          startY + current.y - drag.startY,
          metrics.width,
          metrics.height,
        );
        marker.longitude = normalizeLongitude(longitude);
        marker.latitude = latitude;
        this.options.renderMapObjects();
      }
      return true;
    }
    if (this.state.shapeDrag) {
      const drag = this.state.shapeDrag;
      const shape = this.options
        .getShapes()
        .find((item) => item.id === drag.shapeId);
      if (shape) {
        const current = this.options.mapPointFromEvent(event);
        const [startX, startY] = project(
          drag.startLon,
          drag.startLat,
          metrics.width,
          metrics.height,
        );
        const [longitude, latitude] = unproject(
          startX + current.x - drag.startX,
          startY + current.y - drag.startY,
          metrics.width,
          metrics.height,
        );
        shape.longitude = normalizeLongitude(longitude);
        shape.latitude = latitude;
        this.options.renderMapObjects();
      }
      return true;
    }
    return false;
  }

  finishDrag(): boolean {
    if (this.state.labelDrag) {
      this.state.labelDrag = null;
      this.options.renderMapObjects();
    } else if (this.state.markerDrag) {
      this.state.markerDrag = null;
    } else if (this.state.shapeDrag) {
      this.state.shapeDrag = null;
      this.options.mapElement?.classList.remove("shape-moving");
    } else {
      return false;
    }
    this.options.commitTransaction();
    return true;
  }

  reconcile(): void {
    if (
      !this.options
        .getMarkers()
        .some((marker) => marker.id === this.state.markerId)
    ) {
      this.state.markerId = null;
    }
    if (
      !this.options
        .getShapes()
        .some((shape) => shape.id === this.state.shapeId)
    ) {
      this.state.shapeId = null;
    }
    this.resetTransient();
  }

  handleBlankMouseDown(event: MouseEvent): void {
    if (
      this.options.getActiveStep() !== "3" ||
      event.button !== 0 ||
      (!this.state.markerId &&
        !this.state.shapeId &&
        !this.state.labelMarkerId)
    ) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest(".inspector-panel")
    ) {
      return;
    }
    if (this.isBlankTarget(event.target)) {
      this.clear();
    }
  }

  nudge(event: KeyboardEvent): boolean {
    if (
      this.options.getActiveStep() !== "3" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      this.options.hasOpenModal()
    ) {
      return false;
    }
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction || (!this.state.markerId && !this.state.shapeId)) {
      return false;
    }
    const metrics = this.options.getMapMetrics();
    const screenStep = event.shiftKey ? 10 : 1;
    const mapStep =
      screenStep / Math.max(0.001, metrics.scaleFit * metrics.scale);
    const move = (
      longitude: number,
      latitude: number,
    ): [number, number] => {
      const [x, y] = project(
        longitude,
        latitude,
        metrics.width,
        metrics.height,
      );
      const [nextLongitude, nextLatitude] = unproject(
        x + direction.x * mapStep,
        y + direction.y * mapStep,
        metrics.width,
        metrics.height,
      );
      return [
        normalizeLongitude(nextLongitude),
        Math.max(
          WORLD_BBOX.minLat,
          Math.min(WORLD_BBOX.maxLat, nextLatitude),
        ),
      ];
    };

    const marker = this.getSelectedMarker();
    if (marker) {
      const changed = this.options.updateMarker(
        marker,
        (draft) => {
          [draft.longitude, draft.latitude] = move(
            draft.longitude,
            draft.latitude,
          );
        },
        `marker:${marker.id}:nudge`,
      );
      if (changed) {
        this.options.renderMapObjects();
        this.options.syncMarkerInspector(this.getSelectedMarker());
      }
      return changed;
    }

    const shape = this.getSelectedShape();
    if (!shape) {
      return false;
    }
    const changed = this.options.updateShape(
      shape,
      (draft) => {
        [draft.longitude, draft.latitude] = move(
          draft.longitude,
          draft.latitude,
        );
      },
      `shape:${shape.id}:nudge`,
    );
    if (changed) {
      this.options.renderMapObjects();
    }
    return changed;
  }

  private isBlankTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement) && !(target instanceof SVGSVGElement)) {
      return false;
    }
    if (target === this.options.mapElement) {
      return true;
    }
    return target.matches(
      [
        ".layout",
        ".panel",
        ".panel.card",
        ".step-panel",
        ".tool-panel",
        ".right-panel",
        ".settings-stack",
        ".tool-list",
        ".marker-list",
        ".editor-tab-view",
        ".layers-view",
        ".inspector-header",
        ".inspector-empty",
        ".map-list-panel",
        ".map-wrap",
        ".map-stage",
        ".map-footer",
      ].join(","),
    );
  }
}
