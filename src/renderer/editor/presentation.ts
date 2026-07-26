import type { Marker } from "./types.js";

export function formatCoordinates(
  latitude: number,
  longitude: number,
): string {
  return `(${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
}

export function markerLabelText(marker: Marker): string {
  const customLabel = marker.labelName?.trim();
  if (customLabel) {
    return customLabel;
  }
  if (marker.sourceType === "coords") {
    return marker.displayName?.trim() || marker.name;
  }
  if (marker.labelMode === "coords") {
    return formatCoordinates(marker.latitude, marker.longitude);
  }
  return marker.name;
}
