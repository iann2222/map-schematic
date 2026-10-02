import type { MapProject } from "../bridge.js";

export type ProjectObject = MapProject["objects"][number];

export type PartitionedProjectObjects = {
  editablePointObjects: ProjectObject[];
  preservedObjects: ProjectObject[];
};

function cloneProjectObject(object: ProjectObject): ProjectObject {
  return JSON.parse(JSON.stringify(object)) as ProjectObject;
}

export function partitionProjectObjects(
  objects: ProjectObject[],
): PartitionedProjectObjects {
  const editablePointObjects: ProjectObject[] = [];
  const preservedObjects: ProjectObject[] = [];

  for (const object of objects) {
    if (
      object.geometry.kind === "point" &&
      typeof object.geometry.lon === "number" &&
      typeof object.geometry.lat === "number"
    ) {
      editablePointObjects.push(object);
    } else {
      preservedObjects.push(cloneProjectObject(object));
    }
  }

  return { editablePointObjects, preservedObjects };
}

export function projectFingerprint(project: MapProject): string {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...content } = project;
  return serializeProjectContent(content);
}

export function serializeProjectContent(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  });
}
