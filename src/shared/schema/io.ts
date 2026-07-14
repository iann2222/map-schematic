import fs from "fs/promises";

import { validateProject, ValidationResult } from "./validate";
import { MapProject } from "./mapproj";

export function serializeProject(project: MapProject): string {
  return JSON.stringify(project, null, 2);
}

export async function saveProjectToFile(filePath: string, project: MapProject): Promise<void> {
  const validation = validateProject(project);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Project validation failed: ${details}`);
  }
  const payload = serializeProject(project);
  await fs.writeFile(filePath, payload, "utf8");
}

export async function loadProjectFromFile(
  filePath: string
): Promise<{ project: MapProject; validation: ValidationResult }> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as MapProject;
  const validation = validateProject(parsed);
  return { project: parsed, validation };
}
