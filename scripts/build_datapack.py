import argparse
import os
import pathlib
import shutil
import time
from typing import Dict, List

try:
    from .datapack_basemap import (
        BASEMAP_LAYERS,
        build_basemap,
        try_import_geopandas,
    )
    from .datapack_common import (
        EXPECTED_BUILD_ENVIRONMENT,
        require_safe_pack_segment,
    )
    from .datapack_environment import (
        read_gdal_version,
        validate_build_environment,
        validate_locked_conda_environment,
    )
    from .datapack_geonames import (
        build_geonames_sqlite,
        resolve_geonames_source,
    )
    from .datapack_manifest import collect_files, write_json
    from .datapack_relief import build_hillshade
except ImportError:
    from datapack_basemap import (
        BASEMAP_LAYERS,
        build_basemap,
        try_import_geopandas,
    )
    from datapack_common import (
        EXPECTED_BUILD_ENVIRONMENT,
        require_safe_pack_segment,
    )
    from datapack_environment import (
        read_gdal_version,
        validate_build_environment,
        validate_locked_conda_environment,
    )
    from datapack_geonames import (
        build_geonames_sqlite,
        resolve_geonames_source,
    )
    from datapack_manifest import collect_files, write_json
    from datapack_relief import build_hillshade


def safe_segment_argument(label: str):
    def parse(value: str) -> str:
        try:
            return require_safe_pack_segment(value, label)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(str(exc)) from exc

    return parse


def resolve_version_root(
    out_root: pathlib.Path,
    version: str,
) -> pathlib.Path:
    safe_version = require_safe_pack_segment(version, "Data pack version")
    resolved_root = out_root.resolve()
    candidate = (resolved_root / safe_version).resolve()
    if candidate.parent != resolved_root:
        raise ValueError("Data pack version escapes the output root")
    return candidate


def discover_existing_basemap_layers(
    basemap_dir: pathlib.Path,
) -> List[Dict[str, str]]:
    layers: List[Dict[str, str]] = []
    for layer_id, _ in BASEMAP_LAYERS:
        candidate = basemap_dir / f"{layer_id}.geojson"
        if candidate.exists():
            layers.append(
                {
                    "id": layer_id,
                    "path": f"basemap/{layer_id}.geojson",
                }
            )
    return layers


def discover_existing_hillshade(
    relief_dir: pathlib.Path,
) -> Dict[str, str] | None:
    candidates = [
        relief_dir / "hillshade_3857.png",
        relief_dir / "hillshade.png",
        relief_dir / "hillshade.jpg",
        relief_dir / "hillshade.jpeg",
    ]
    for candidate in candidates:
        if candidate.exists():
            return {
                "format": candidate.suffix.lstrip(".").lower(),
                "path": f"relief/{candidate.name}",
                "source": candidate.name,
                "projection": (
                    "EPSG:3857"
                    if candidate.name.endswith("_3857.png")
                    else "EPSG:4326"
                ),
            }
    return None


def build_basemap_layers(
    raw_root: pathlib.Path,
    basemap_dir: pathlib.Path,
    manifest_only: bool,
) -> List[Dict[str, str]]:
    if manifest_only:
        return discover_existing_basemap_layers(basemap_dir)

    source = raw_root / "50m_physical"
    geopandas_module, geopandas_error = try_import_geopandas()
    if geopandas_module and source.exists():
        return build_basemap(geopandas_module, source, basemap_dir)

    reasons = []
    if not geopandas_module:
        reasons.append(f"geopandas import failed: {geopandas_error}")
    if not source.exists():
        reasons.append(f"missing source: {source}")
    detail = "; ".join(reasons) if reasons else "unknown"
    print(f"Basemap skipped ({detail}).")
    return []


def build_geonames(
    raw_root: pathlib.Path,
    geonames_dir: pathlib.Path,
    source_mode: str,
    force: bool,
    manifest_only: bool,
) -> pathlib.Path:
    database = geonames_dir / "geonames.sqlite"
    if manifest_only:
        if not database.exists():
            print("GeoNames skipped (geonames.sqlite missing).")
        return database

    source_zip = resolve_geonames_source(raw_root, source_mode)
    alternate_zip = raw_root / "alternateNamesV2.zip"
    if source_zip.exists() and alternate_zip.exists():
        build_geonames_sqlite(
            source_zip,
            alternate_zip,
            database,
            ["en", "zh", "zh-TW"],
            force,
        )
    else:
        print("GeoNames skipped (source zip missing).")
    return database


def validate_pack_outputs(
    basemap_layers: List[Dict[str, str]],
    geonames_database: pathlib.Path,
) -> None:
    expected_layer_ids = {layer_id for layer_id, _ in BASEMAP_LAYERS}
    actual_layer_ids = {layer["id"] for layer in basemap_layers}
    missing_layers = sorted(expected_layer_ids - actual_layer_ids)
    if missing_layers:
        raise SystemExit(
            "Datapack build incomplete; missing basemap layers: "
            + ", ".join(missing_layers)
        )
    if (
        not geonames_database.is_file()
        or geonames_database.stat().st_size == 0
    ):
        raise SystemExit(
            "Datapack build incomplete; "
            "GeoNames database is missing or empty"
        )


def create_manifest(
    pack_id: str,
    version: str,
    build_environment: Dict[str, str],
    basemap_layers: List[Dict[str, str]],
    hillshade_info: Dict[str, str] | None,
    pack_root: pathlib.Path,
) -> Dict[str, object]:
    manifest: Dict[str, object] = {
        "id": pack_id,
        "version": version,
        "createdAt": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(),
        ),
        "projection": "EPSG:4326",
        "buildEnvironment": build_environment,
        "basemap": {
            "format": "geojson",
            "layers": basemap_layers,
        },
        "geonames": {
            "format": "sqlite+fts",
            "dbPath": "geonames/geonames.sqlite",
            "languages": ["en", "zh-TW", "zh"],
        },
        "relief": hillshade_info,
        "files": collect_files(pack_root),
    }

    referenced_paths = {
        layer["path"]
        for layer in basemap_layers
    }
    referenced_paths.add("geonames/geonames.sqlite")
    if hillshade_info:
        referenced_paths.add(hillshade_info["path"])
    files = manifest["files"]
    if not isinstance(files, list):
        raise RuntimeError("Manifest file collection returned an invalid value")
    collected_paths = {
        entry["path"]
        for entry in files
        if isinstance(entry, dict) and isinstance(entry.get("path"), str)
    }
    missing_files = sorted(referenced_paths - collected_paths)
    if missing_files:
        raise SystemExit(
            "Datapack build incomplete; files missing from manifest: "
            + ", ".join(missing_files)
        )
    return manifest


def activate_built_pack(
    pack_root: pathlib.Path,
    final_pack_root: pathlib.Path,
) -> None:
    previous_root = (
        final_pack_root.parent
        / f".{final_pack_root.name}-previous-build"
    )
    shutil.rmtree(previous_root, ignore_errors=True)
    if final_pack_root.exists():
        final_pack_root.rename(previous_root)
    try:
        pack_root.rename(final_pack_root)
    except Exception:
        if previous_root.exists() and not final_pack_root.exists():
            previous_root.rename(final_pack_root)
        raise
    shutil.rmtree(previous_root, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build map-schematic datapack."
    )
    parser.add_argument(
        "--raw",
        default="geodata_source",
        help="Raw data root",
    )
    parser.add_argument(
        "--out",
        default="geodata/packs/standard",
        help="Output root",
    )
    parser.add_argument(
        "--id",
        default="standard",
        type=safe_segment_argument("Data pack id"),
        help="Data pack id",
    )
    parser.add_argument(
        "--version",
        default=time.strftime("%Y.%m"),
        type=safe_segment_argument("Data pack version"),
        help="Data pack version",
    )
    parser.add_argument(
        "--geonames",
        default="cities1000",
        choices=["cities1000", "cities15000", "all"],
        help="GeoNames source zip to use",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing outputs in the target pack directory",
    )
    parser.add_argument(
        "--check-environment",
        action="store_true",
        help="Verify the pinned Python and GDAL toolchain, then exit",
    )
    args = parser.parse_args()

    try:
        build_environment = validate_build_environment()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    if args.check_environment:
        return

    raw_root = pathlib.Path(args.raw).resolve()
    out_root = pathlib.Path(args.out).resolve()
    final_pack_root = resolve_version_root(out_root, args.version)
    manifest_only = os.getenv("MAPSCHEM_MANIFEST_ONLY") == "1"

    if manifest_only and not final_pack_root.is_dir():
        raise SystemExit(
            "Cannot rebuild manifest; target pack does not exist: "
            f"{final_pack_root}"
        )
    if final_pack_root.exists() and not manifest_only and not args.force:
        raise SystemExit(
            "Target pack already exists; use --force to rebuild: "
            f"{final_pack_root}"
        )

    if manifest_only:
        pack_root = final_pack_root
    else:
        pack_root = out_root / f".{args.version}-building"
        shutil.rmtree(pack_root, ignore_errors=True)

    basemap_dir = pack_root / "basemap"
    geonames_dir = pack_root / "geonames"
    relief_dir = pack_root / "relief"
    basemap_dir.mkdir(parents=True, exist_ok=True)
    geonames_dir.mkdir(parents=True, exist_ok=True)

    basemap_layers = build_basemap_layers(
        raw_root,
        basemap_dir,
        manifest_only,
    )
    geonames_database = build_geonames(
        raw_root,
        geonames_dir,
        args.geonames,
        args.force,
        manifest_only,
    )
    hillshade_info = (
        discover_existing_hillshade(relief_dir)
        if manifest_only
        else build_hillshade(raw_root, relief_dir)
    )

    validate_pack_outputs(basemap_layers, geonames_database)
    manifest = create_manifest(
        args.id,
        args.version,
        build_environment,
        basemap_layers,
        hillshade_info,
        pack_root,
    )
    write_json(pack_root / "datapack.json", manifest)

    if not manifest_only:
        activate_built_pack(pack_root, final_pack_root)

    print(f"Data pack initialized at: {final_pack_root}")


if __name__ == "__main__":
    main()
