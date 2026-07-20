import type { Marker, ShapeItem } from "../editor/types.js";

type MapPoint = { x: number; y: number };

export function createOverlayInteractionController(options: {
  isEditing: () => boolean;
  pointFromEvent: (event: MouseEvent) => MapPoint;
  beginTransaction: () => void;
  selectMarker: (id: string) => void;
  selectShape: (id: string) => void;
  selectMarkerLabel: (id: string) => void;
  setMarkerLabelSelection: (id: string) => void;
  beginMarkerDrag: (drag: {
    markerId: string;
    startX: number;
    startY: number;
    startLon: number;
    startLat: number;
  }) => void;
  beginLabelDrag: (drag: {
    markerId: string;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  }) => void;
  beginShapeDrag: (drag: {
    shapeId: string;
    startX: number;
    startY: number;
    startLon: number;
    startLat: number;
  }) => void;
}): {
  selectMarker: (event: MouseEvent, marker: Marker, preview: boolean) => void;
  beginMarkerDrag: (event: MouseEvent, marker: Marker, preview: boolean) => void;
  selectLabel: (event: MouseEvent, marker: Marker, preview: boolean) => void;
  beginLabelDrag: (event: MouseEvent, marker: Marker, preview: boolean) => void;
  selectShape: (event: MouseEvent, shape: ShapeItem, preview: boolean) => void;
  beginShapeDrag: (event: MouseEvent, shape: ShapeItem, preview: boolean) => void;
} {
  const canInteract = (preview: boolean): boolean => options.isEditing() && !preview;
  const stop = (event: MouseEvent): void => event.stopPropagation();
  return {
    selectMarker(event, marker, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectMarker(marker.id);
    },
    beginMarkerDrag(event, marker, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectMarker(marker.id);
      const start = options.pointFromEvent(event);
      options.beginTransaction();
      options.beginMarkerDrag({ markerId: marker.id, startX: start.x, startY: start.y, startLon: marker.longitude, startLat: marker.latitude });
    },
    selectLabel(event, marker, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectMarker(marker.id);
      options.setMarkerLabelSelection(marker.id);
    },
    beginLabelDrag(event, marker, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectMarker(marker.id);
      options.selectMarkerLabel(marker.id);
      const start = options.pointFromEvent(event);
      options.beginTransaction();
      options.beginLabelDrag({ markerId: marker.id, startX: start.x, startY: start.y, startOffsetX: marker.style.textOffsetX, startOffsetY: marker.style.textOffsetY });
    },
    selectShape(event, shape, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectShape(shape.id);
    },
    beginShapeDrag(event, shape, preview) {
      if (!canInteract(preview)) return;
      stop(event);
      options.selectShape(shape.id);
      const start = options.pointFromEvent(event);
      options.beginTransaction();
      options.beginShapeDrag({ shapeId: shape.id, startX: start.x, startY: start.y, startLon: shape.longitude, startLat: shape.latitude });
    },
  };
}
