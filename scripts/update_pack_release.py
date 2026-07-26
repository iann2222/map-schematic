#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Update pack-release.json with new datapack release info.

Usage:
  python scripts/update_pack_release.py --id standard --version 2026.02 \
    --url https://github.com/.../datapack-standard-2026.02.zip \
    --zip geodata/packs/standard/datapack-standard-2026.02.zip
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import urllib.parse
import zipfile
from pathlib import Path
from typing import Dict, Iterable

try:
    from .datapack_common import EXPECTED_BUILD_ENVIRONMENT, is_safe_pack_segment
except ImportError:
    from datapack_common import EXPECTED_BUILD_ENVIRONMENT, is_safe_pack_segment


EXCLUDE_NAMES = {
    ".keep",
    ".DS_Store",
}
EXCLUDE_SUFFIXES = {
    ".aux.xml",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_source_items(root: Path) -> Iterable[str]:
    for item in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        name = item.name
        if name in EXCLUDE_NAMES:
            continue
        if any(name.endswith(suf) for suf in EXCLUDE_SUFFIXES):
            continue
        if item.is_dir():
            yield f"{root.name}/{name}/"
        else:
            yield f"{root.name}/{name}"


def validate_relative_path(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise SystemExit("Datapack manifest contains an empty file path")
    normalized = posixpath.normpath(value)
    if (
        value.startswith("/")
        or "\\" in value
        or "\0" in value
        or normalized == ".."
        or normalized.startswith("../")
    ):
        raise SystemExit(f"Datapack manifest path escapes the archive root: {value}")
    return value


def read_and_validate_archive(zip_path: Path) -> Dict[str, object]:
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive_names = [name for name in archive.namelist() if name]
        for name in archive_names:
            validate_relative_path(name.rstrip("/"))
        file_names = {
            name
            for name in archive_names
            if not name.endswith("/")
        }
        file_entries = [name for name in archive_names if not name.endswith("/")]
        if len(file_names) != len(file_entries):
            raise SystemExit("Datapack zip contains duplicate file paths")
        if "datapack.json" not in file_names:
            raise SystemExit("Datapack zip must contain datapack.json at the archive root")
        try:
            manifest = json.loads(archive.read("datapack.json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SystemExit(f"Invalid datapack.json in zip: {exc}") from exc
        if not isinstance(manifest, dict):
            raise SystemExit("datapack.json must contain a JSON object")

        pack_id = manifest.get("id")
        version = manifest.get("version")
        if not isinstance(pack_id, str) or not pack_id:
            raise SystemExit("datapack.json is missing id")
        if not isinstance(version, str) or not version:
            raise SystemExit("datapack.json is missing version")
        if not is_safe_pack_segment(pack_id) or not is_safe_pack_segment(version):
            raise SystemExit("datapack.json id and version must be safe path segments")
        if manifest.get("projection") != "EPSG:4326":
            raise SystemExit("datapack.json projection must be EPSG:4326")
        if manifest.get("buildEnvironment") != EXPECTED_BUILD_ENVIRONMENT:
            raise SystemExit(
                "datapack.json buildEnvironment must match the pinned official toolchain"
            )
        basemap = manifest.get("basemap")
        if (
            not isinstance(basemap, dict)
            or basemap.get("format") != "geojson"
            or not isinstance(basemap.get("layers"), list)
            or not basemap["layers"]
        ):
            raise SystemExit("datapack.json must contain non-empty GeoJSON basemap layers")
        geonames = manifest.get("geonames")
        if (
            not isinstance(geonames, dict)
            or geonames.get("format") != "sqlite+fts"
            or not isinstance(geonames.get("languages"), list)
        ):
            raise SystemExit("datapack.json must contain a SQLite FTS GeoNames index")
        files = manifest.get("files")
        if not isinstance(files, list) or not files:
            raise SystemExit("datapack.json files must be a non-empty array")

        listed_paths = set()
        for entry in files:
            if not isinstance(entry, dict):
                raise SystemExit("datapack.json contains an invalid file entry")
            relative = validate_relative_path(entry.get("path"))
            if relative == "datapack.json":
                continue
            if relative in listed_paths:
                raise SystemExit(f"Duplicate file entry in datapack.json: {relative}")
            listed_paths.add(relative)
            if relative not in file_names:
                raise SystemExit(f"File listed in datapack.json is missing from zip: {relative}")
            expected_size = entry.get("sizeBytes")
            expected_sha = entry.get("sha256")
            if not isinstance(expected_size, int) or expected_size < 0:
                raise SystemExit(f"Invalid sizeBytes for {relative}")
            if not isinstance(expected_sha, str) or not re.fullmatch(r"[A-Fa-f0-9]{64}", expected_sha):
                raise SystemExit(f"Invalid SHA-256 in datapack.json: {relative}")
            hasher = hashlib.sha256()
            actual_size = 0
            with archive.open(relative, "r") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    actual_size += len(chunk)
                    hasher.update(chunk)
            if actual_size != expected_size:
                raise SystemExit(f"File size mismatch in zip: {relative}")
            actual_sha = hasher.hexdigest()
            if actual_sha.lower() != expected_sha.lower():
                raise SystemExit(f"File checksum mismatch in zip: {relative}")

        unlisted = sorted(file_names - listed_paths - {"datapack.json"})
        if unlisted:
            raise SystemExit(f"Zip contains files not listed in datapack.json: {', '.join(unlisted)}")

        referenced_paths = set()
        for layer in basemap["layers"]:
            if not isinstance(layer, dict) or not isinstance(layer.get("id"), str):
                raise SystemExit("datapack.json contains an invalid basemap layer")
            referenced_paths.add(validate_relative_path(layer.get("path")))
        referenced_paths.add(validate_relative_path(geonames.get("dbPath")))
        relief = manifest.get("relief")
        if isinstance(relief, dict):
            referenced_paths.add(validate_relative_path(relief.get("path")))
        missing_references = sorted(referenced_paths - listed_paths)
        if missing_references:
            raise SystemExit(
                "Referenced files are missing from datapack.json files: "
                + ", ".join(missing_references)
            )
        return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Update pack-release.json.")
    parser.add_argument("--id", help="Expected datapack id; defaults to datapack.json")
    parser.add_argument("--version", help="Expected datapack version; defaults to datapack.json")
    parser.add_argument("--url", required=True, help="Release asset direct download URL")
    parser.add_argument("--zip", required=True, help="Path to datapack zip")
    parser.add_argument(
        "--source-root",
        default="geodata_source",
        help="Raw data root (default: geodata_source)",
    )
    parser.add_argument(
        "--out",
        default="pack-release.json",
        help="Output JSON path (default: pack-release.json)",
    )
    args = parser.parse_args()

    if args.id is not None and not is_safe_pack_segment(args.id):
        raise SystemExit("--id must be a safe data pack identifier")
    if args.version is not None and not is_safe_pack_segment(args.version):
        raise SystemExit("--version must be a safe data pack version")

    zip_path = Path(args.zip).resolve()
    if not zip_path.exists():
        raise SystemExit(f"Zip not found: {zip_path}")

    source_root = Path(args.source_root).resolve()
    if not source_root.exists():
        raise SystemExit(f"Source root not found: {source_root}")

    parsed_url = urllib.parse.urlparse(args.url)
    if parsed_url.scheme != "https" or parsed_url.hostname != "github.com":
        raise SystemExit("Release URL must be an HTTPS github.com URL")

    manifest = read_and_validate_archive(zip_path)
    manifest_id = str(manifest["id"])
    manifest_version = str(manifest["version"])
    if args.id and args.id != manifest_id:
        raise SystemExit(f"ID mismatch: argument is {args.id}, manifest is {manifest_id}")
    if args.version and args.version != manifest_version:
        raise SystemExit(
            f"Version mismatch: argument is {args.version}, manifest is {manifest_version}"
        )

    payload = {
        "id": manifest_id,
        "version": manifest_version,
        "url": args.url,
        "sha256": sha256_file(zip_path),
        "sourceFiles": list(iter_source_items(source_root)),
    }

    out_path = Path(args.out).resolve()
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {out_path}")


if __name__ == "__main__":
    main()
