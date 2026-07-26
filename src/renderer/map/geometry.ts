export const EARTH_RADIUS = 6378137;
const MIN_LATITUDE = -85;
const MAX_LATITUDE = 85;

export const WORLD_BBOX = {
  minLon: -180,
  maxLon: 180,
  minLat: MIN_LATITUDE,
  maxLat: MAX_LATITUDE
} as const;

type LonLat = [number, number];
type PolygonGeometry = { type: "Polygon"; coordinates: LonLat[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: LonLat[][][] };
type LineStringGeometry = { type: "LineString"; coordinates: LonLat[] };
type MultiLineStringGeometry = {
  type: "MultiLineString";
  coordinates: LonLat[][];
};

export type RenderGeometry =
  | PolygonGeometry
  | MultiPolygonGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | null
  | undefined;

export type GeographicBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
  crossesAntimeridian: boolean;
};

export function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Math.abs(normalized) < 1e-12 ? 0 : normalized;
}

export function geographicBBoxFromUnwrappedBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): GeographicBBox {
  const longitudeSpan = Math.max(0, east - west);
  if (longitudeSpan >= 360 - 1e-9) {
    return {
      west: -180,
      south: Math.min(south, north),
      east: 180,
      north: Math.max(south, north),
      crossesAntimeridian: false,
    };
  }
  const normalizedWest = normalizeLongitude(west);
  const normalizedEast = normalizeLongitude(east);
  return {
    west: normalizedWest,
    south: Math.min(south, north),
    east: normalizedEast,
    north: Math.max(south, north),
    crossesAntimeridian: normalizedWest > normalizedEast,
  };
}

export function unwrappedLongitudeBounds(bbox: GeographicBBox): {
  west: number;
  east: number;
} {
  return {
    west: bbox.west,
    east: bbox.crossesAntimeridian ? bbox.east + 360 : bbox.east,
  };
}

function mercatorX(longitude: number): number {
  return (EARTH_RADIUS * longitude * Math.PI) / 180;
}

function mercatorY(latitude: number): number {
  const clamped = Math.max(Math.min(latitude, MAX_LATITUDE), MIN_LATITUDE);
  const radians = (clamped * Math.PI) / 180;
  return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

const WORLD_X_MIN = mercatorX(WORLD_BBOX.minLon);
const WORLD_X_MAX = mercatorX(WORLD_BBOX.maxLon);
const WORLD_Y_MIN = mercatorY(MIN_LATITUDE);
const WORLD_Y_MAX = mercatorY(MAX_LATITUDE);

export function project(
  longitude: number,
  latitude: number,
  width: number,
  height: number
): [number, number] {
  const x = mercatorX(longitude);
  const y = mercatorY(latitude);
  const sx = (x - WORLD_X_MIN) / (WORLD_X_MAX - WORLD_X_MIN);
  const sy = (y - WORLD_Y_MIN) / (WORLD_Y_MAX - WORLD_Y_MIN);
  return [sx * width, (1 - sy) * height];
}

export function unproject(
  x: number,
  y: number,
  width: number,
  height: number
): [number, number] {
  const sx = x / width;
  const sy = 1 - y / height;
  const mx = WORLD_X_MIN + sx * (WORLD_X_MAX - WORLD_X_MIN);
  const my = WORLD_Y_MIN + sy * (WORLD_Y_MAX - WORLD_Y_MIN);
  const longitude = (mx / EARTH_RADIUS) * (180 / Math.PI);
  const latitude =
    (2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2) *
    (180 / Math.PI);
  return [longitude, latitude];
}

function pathFromCoordinates(
  coordinates: LonLat[],
  width: number,
  height: number
): string {
  if (coordinates.length === 0) {
    return "";
  }
  const [firstLongitude, firstLatitude] = coordinates[0];
  const [x0, y0] = project(firstLongitude, firstLatitude, width, height);
  let path = `M ${x0.toFixed(2)} ${y0.toFixed(2)}`;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [longitude, latitude] = coordinates[index];
    const [x, y] = project(longitude, latitude, width, height);
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

export function geometryToPath(
  geometry: RenderGeometry,
  width: number,
  height: number
): string {
  if (!geometry) {
    return "";
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates
      .map((ring) => `${pathFromCoordinates(ring, width, height)} Z`)
      .join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) =>
        polygon
          .map((ring) => `${pathFromCoordinates(ring, width, height)} Z`)
          .join(" ")
      )
      .join(" ");
  }
  if (geometry.type === "LineString") {
    return pathFromCoordinates(geometry.coordinates, width, height);
  }
  return geometry.coordinates
    .map((line) => pathFromCoordinates(line, width, height))
    .join(" ");
}
