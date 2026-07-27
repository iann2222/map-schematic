import hashlib
import json
import os
import pathlib
from typing import Dict, List


def sha256_file(path: pathlib.Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def write_json(path: pathlib.Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.writing")
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)


def collect_files(root: pathlib.Path) -> List[Dict[str, object]]:
    files: List[Dict[str, object]] = []
    if not root.exists():
        return files
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative_path = path.relative_to(root).as_posix()
        if relative_path == "datapack.json":
            continue
        files.append(
            {
                "path": relative_path,
                "sizeBytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return files
