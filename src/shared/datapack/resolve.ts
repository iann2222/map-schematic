import path from "path";

import { resolveDataRoot } from "../paths";
import { resolvePackConfig } from "../config";

export function resolvePackRoot(): string {
  const dataRoot = resolveDataRoot();
  const pack = resolvePackConfig();
  return path.join(dataRoot, "packs", pack.id, pack.version);
}
