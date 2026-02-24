export type PackConfig = {
  id: string;
  version: string;
};

export function resolvePackConfig(): PackConfig {
  return {
    id: process.env.MAP_SCHEMATIC_PACK_ID ?? "standard",
    version: process.env.MAP_SCHEMATIC_PACK_VERSION ?? "2026.02"
  };
}
