import type { Marker, ShapeItem } from "../editor/types.js";

export function renderObjectList(options: {
  container: HTMLElement;
  orderKeys: string[];
  markers: Marker[];
  shapes: ShapeItem[];
  selectedMarkerId: string | null;
  selectedShapeId: string | null;
  displayName: (key: string, object: Marker | ShapeItem) => string;
  onSelectMarker: (id: string) => void;
  onSelectShape: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onDeleteShape: (id: string) => void;
}): number {
  const { container } = options;
  container.replaceChildren();
  const markersById = new Map(options.markers.map((item) => [item.id, item]));
  const shapesById = new Map(options.shapes.map((item) => [item.id, item]));

  options.orderKeys.forEach((key) => {
    const row = document.createElement("div");
    row.className = "marker-item";
    const title = document.createElement("span");
    title.className = "marker-item-title";
    const actions = document.createElement("div");
    actions.className = "marker-actions";
    const deleteButton = document.createElement("button");
    deleteButton.className = "marker-delete-button";
    deleteButton.type = "button";
    deleteButton.title = "刪除";
    deleteButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<use href="./icons.svg#icon-trash"></use></svg>';

    if (key.startsWith("marker:")) {
      const marker = markersById.get(key.slice("marker:".length));
      if (!marker) return;
      row.classList.toggle("selected", marker.id === options.selectedMarkerId);
      row.dataset.kind = "marker";
      title.textContent = options.displayName(key, marker);
      deleteButton.setAttribute("aria-label", `刪除 ${title.textContent}`);
      row.addEventListener("click", () => options.onSelectMarker(marker.id));
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onDeleteMarker(marker.id);
      });
    } else if (key.startsWith("shape:")) {
      const shape = shapesById.get(key.slice("shape:".length));
      if (!shape) return;
      row.classList.toggle("selected", shape.id === options.selectedShapeId);
      row.dataset.kind = shape.type;
      title.textContent = options.displayName(key, shape);
      deleteButton.setAttribute("aria-label", `刪除 ${title.textContent}`);
      row.addEventListener("click", () => options.onSelectShape(shape.id));
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onDeleteShape(shape.id);
      });
    } else {
      return;
    }

    actions.appendChild(deleteButton);
    row.append(title, actions);
    container.appendChild(row);
  });
  return container.childElementCount;
}
