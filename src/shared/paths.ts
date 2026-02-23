import path from "path";

export function resolveDataRoot(): string {
  const basePath = process.env.MAP_SCHEMATIC_ROOT ?? process.cwd();
  return path.resolve(basePath, "geodata");
}
