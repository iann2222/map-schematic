import type { GeonamesResult } from "../bridge.js";
import type { Marker } from "../editor/types.js";
import { EARTH_RADIUS } from "../map/geometry.js";
import type { SearchState } from "../app-state.js";

export type ParsedCoordinates = {
  lat: number;
  lon: number;
};

export type SearchControllerElements = {
  placeInputs: [HTMLInputElement | null, HTMLInputElement | null];
  placeButtons: [HTMLButtonElement | null, HTMLButtonElement | null];
  coordinateInputs: [HTMLInputElement | null, HTMLInputElement | null];
  coordinateButtons: [HTMLButtonElement | null, HTMLButtonElement | null];
  resultLists: [HTMLUListElement | null, HTMLUListElement | null];
  stepThreeResultBlock: HTMLElement | null;
};

export type SearchControllerOptions = {
  state: SearchState;
  elements: SearchControllerElements;
  getViewCenter: () => [number, number];
  searchGeonames: (query: string, limit: number) => Promise<GeonamesResult[]>;
  clearPreview: () => void;
  previewGeonames: (result: GeonamesResult) => void;
  addGeonames: (result: GeonamesResult) => void;
  hasGeonamesMarker: (result: GeonamesResult) => boolean;
  createCoordinatePreview: (coordinates: ParsedCoordinates) => Marker;
  previewCoordinate: (marker: Marker) => void;
  addCoordinate: (coordinates: ParsedCoordinates) => void;
  setStatus: (message: string) => void;
};

function haversineDistance(
  first: [number, number],
  second: [number, number],
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const [lon1, lat1] = first;
  const [lon2, lat2] = second;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const lat1Radians = toRadians(lat1);
  const lat2Radians = toRadians(lat2);
  const latSin = Math.sin(deltaLat / 2);
  const lonSin = Math.sin(deltaLon / 2);
  const haversine =
    latSin * latSin +
    Math.cos(lat1Radians) * Math.cos(lat2Radians) * lonSin * lonSin;
  return (
    2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

export function parseCoordinates(value: string): ParsedCoordinates | null {
  const normalized = value
    .trim()
    .replace(/[，；]/g, ",")
    .replace(/　/g, " ");
  const decimalParts = normalized
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (decimalParts.length >= 2) {
    const lat = Number(decimalParts[0]);
    const lon = Number(decimalParts[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      return { lat, lon };
    }
  }

  const dmsMatches = normalized
    .replace(/º/g, "°")
    .replace(/″/g, '"')
    .replace(/′/g, "'")
    .match(
      /([NS])?\s*(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*\"?\s*([NS])?.*?([EW])?\s*(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*\"?\s*([EW])?/i,
    );
  if (!dmsMatches) {
    return null;
  }
  const latDirection = (dmsMatches[1] || dmsMatches[5] || "").toUpperCase();
  const lonDirection = (dmsMatches[6] || dmsMatches[10] || "").toUpperCase();
  const latDegrees = Number(dmsMatches[2]);
  const latMinutes = Number(dmsMatches[3] || "0");
  const latSeconds = Number(dmsMatches[4] || "0");
  const lonDegrees = Number(dmsMatches[7]);
  const lonMinutes = Number(dmsMatches[8] || "0");
  const lonSeconds = Number(dmsMatches[9] || "0");
  if (
    !Number.isFinite(latDegrees) ||
    !Number.isFinite(lonDegrees) ||
    !Number.isFinite(latMinutes) ||
    !Number.isFinite(latSeconds) ||
    !Number.isFinite(lonMinutes) ||
    !Number.isFinite(lonSeconds) ||
    latMinutes < 0 ||
    latMinutes >= 60 ||
    latSeconds < 0 ||
    latSeconds >= 60 ||
    lonMinutes < 0 ||
    lonMinutes >= 60 ||
    lonSeconds < 0 ||
    lonSeconds >= 60
  ) {
    return null;
  }
  let lat = latDegrees + latMinutes / 60 + latSeconds / 3600;
  let lon = lonDegrees + lonMinutes / 60 + lonSeconds / 3600;
  if (latDirection === "S") {
    lat = -lat;
  }
  if (lonDirection === "W") {
    lon = -lon;
  }
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    ? { lat, lon }
    : null;
}

export class SearchController {
  private readonly state: SearchState;
  private readonly options: SearchControllerOptions;
  private readonly elements: SearchControllerElements;

  constructor(options: SearchControllerOptions) {
    this.state = options.state;
    this.options = options;
    this.elements = options.elements;
  }

  bind(): void {
    this.elements.placeButtons.forEach((button, index) => {
      const input = this.elements.placeInputs[index];
      button?.addEventListener("click", () => {
        void this.searchPlace(input, button, index === 1);
      });
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && button) {
          void this.searchPlace(input, button, index === 1);
        }
      });
    });
    this.elements.coordinateButtons.forEach((button, index) => {
      const input = this.elements.coordinateInputs[index];
      const target = this.elements.resultLists[index];
      button?.addEventListener("click", () => {
        this.searchCoordinates(input, target, index === 1);
      });
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          this.searchCoordinates(input, target, index === 1);
        }
      });
    });
  }

  private async searchPlace(
    input: HTMLInputElement | null,
    button: HTMLButtonElement,
    showStepThreeResults: boolean,
  ): Promise<void> {
    const query = input?.value.trim() ?? "";
    if (!query) {
      return;
    }
    this.options.clearPreview();
    const requestId = ++this.state.requestSequence;
    button.disabled = true;
    try {
      const results = await this.options.searchGeonames(query, 10);
      if (requestId !== this.state.requestSequence) {
        return;
      }
      this.elements.resultLists.forEach((target) => {
        if (target) {
          this.renderPlaceResults(results, target);
        }
      });
      if (showStepThreeResults) {
        this.setStepThreeResultsVisible(true);
      }
    } catch (error) {
      if (requestId !== this.state.requestSequence) {
        return;
      }
      console.error(error);
      this.options.setStatus("地名搜尋失敗，請確認資料包狀態後再試一次。");
    } finally {
      button.disabled = false;
    }
  }

  private searchCoordinates(
    input: HTMLInputElement | null,
    target: HTMLUListElement | null,
    showStepThreeResults: boolean,
  ): void {
    if (!input || !target) {
      return;
    }
    const value = input.value.trim();
    if (!value) {
      return;
    }
    this.state.requestSequence += 1;
    if (showStepThreeResults) {
      this.setStepThreeResultsVisible(true);
    }
    const coordinates = parseCoordinates(value);
    if (!coordinates) {
      this.options.setStatus(
        "經緯度格式錯誤，請輸入「緯度, 經度」。",
      );
      return;
    }
    const marker = this.options.createCoordinatePreview(coordinates);
    this.options.previewCoordinate(marker);
    this.renderCoordinateResult(target, marker, coordinates);
  }

  private sortedResults(results: GeonamesResult[]): GeonamesResult[] {
    const center = this.options.getViewCenter();
    return [...results].sort((left, right) => {
      const leftDistance = haversineDistance(center, [
        left.longitude,
        left.latitude,
      ]);
      const rightDistance = haversineDistance(center, [
        right.longitude,
        right.latitude,
      ]);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return (right.population ?? 0) - (left.population ?? 0);
    });
  }

  private renderPlaceResults(
    results: GeonamesResult[],
    target: HTMLUListElement,
  ): void {
    target.innerHTML = "";
    this.sortedResults(results).forEach((result) => {
      const item = document.createElement("li");
      item.className = "result-item";
      const content = document.createElement("div");
      content.className = "result-content";
      const title = document.createElement("div");
      const displayName =
        result.nameAlt && result.nameAlt !== result.name
          ? `${result.nameAlt} / ${result.name}`
          : result.name;
      title.textContent = displayName;
      const meta = document.createElement("div");
      meta.className = "meta";
      const country = result.countryCode ?? "";
      meta.textContent = `${displayName} · ${country} (${result.latitude.toFixed(
        4,
      )}, ${result.longitude.toFixed(4)})`;
      content.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "result-actions";
      const addButton = document.createElement("button");
      addButton.className = "icon-btn";
      addButton.textContent = "+";
      addButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.options.addGeonames(result);
        this.options.clearPreview();
      });
      actions.appendChild(addButton);
      item.append(content, actions);
      item.addEventListener("click", () => {
        if (this.options.hasGeonamesMarker(result)) {
          this.options.clearPreview();
          return;
        }
        this.options.previewGeonames(result);
      });
      target.appendChild(item);
    });
  }

  private renderCoordinateResult(
    target: HTMLUListElement,
    marker: Marker,
    coordinates: ParsedCoordinates,
  ): void {
    target.innerHTML = "";
    const item = document.createElement("li");
    item.className = "result-item";
    const content = document.createElement("div");
    content.className = "result-content";
    const title = document.createElement("div");
    title.textContent = marker.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `座標 · (${coordinates.lat.toFixed(
      4,
    )}, ${coordinates.lon.toFixed(4)})`;
    content.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const addButton = document.createElement("button");
    addButton.className = "icon-btn";
    addButton.textContent = "+";
    addButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.addCoordinate(coordinates);
    });
    actions.appendChild(addButton);
    item.append(content, actions);
    item.addEventListener("click", () => {
      this.options.previewCoordinate(marker);
    });
    target.appendChild(item);
  }

  private setStepThreeResultsVisible(visible: boolean): void {
    this.elements.stepThreeResultBlock?.classList.toggle("visible", visible);
  }
}
