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
from pathlib import Path
from typing import Iterable


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Update pack-release.json.")
    parser.add_argument("--id", required=True, help="Datapack id, e.g. standard")
    parser.add_argument("--version", required=True, help="Datapack version, e.g. 2026.02")
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

    zip_path = Path(args.zip).resolve()
    if not zip_path.exists():
        raise SystemExit(f"Zip not found: {zip_path}")

    source_root = Path(args.source_root).resolve()
    if not source_root.exists():
        raise SystemExit(f"Source root not found: {source_root}")

    payload = {
        "id": args.id,
        "version": args.version,
        "url": args.url,
        "sha256": sha256_file(zip_path),
        "sourceFiles": list(iter_source_items(source_root)),
    }

    out_path = Path(args.out).resolve()
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {out_path}")


if __name__ == "__main__":
    main()
