import fs from "fs/promises";

import { DataPackManifest } from "./types";

export async function readManifest(manifestPath: string): Promise<DataPackManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as DataPackManifest;
}

export async function writeManifest(
  manifestPath: string,
  manifest: DataPackManifest
): Promise<void> {
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
