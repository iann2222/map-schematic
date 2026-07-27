import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys
from importlib import metadata
from typing import Dict, List

try:
    from .datapack_common import (
        CONDA_LOCK_FILE_NAME,
        EXPECTED_BUILD_ENVIRONMENT,
        conda_lock_fingerprint,
        parse_conda_explicit_lock,
    )
except ImportError:
    from datapack_common import (
        CONDA_LOCK_FILE_NAME,
        EXPECTED_BUILD_ENVIRONMENT,
        conda_lock_fingerprint,
        parse_conda_explicit_lock,
    )


GDAL_VERSION_PATTERN = re.compile(
    r"\bGDAL\s+(\d+\.\d+\.\d+)\b",
    re.IGNORECASE,
)
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CONDA_LOCK = REPO_ROOT / CONDA_LOCK_FILE_NAME


def resolve_gdalwarp() -> str | None:
    env_path = os.getenv("MAPSCHEM_GDALWARP")
    if env_path:
        candidate = pathlib.Path(env_path).expanduser()
        if not candidate.is_file():
            raise RuntimeError(
                f"MAPSCHEM_GDALWARP does not point to a file: {candidate}"
            )
        return str(candidate.resolve())
    return shutil.which("gdalwarp")


def read_gdal_version(gdalwarp: str) -> str:
    try:
        result = subprocess.run(
            [gdalwarp, "--version"],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Unable to execute gdalwarp --version: {exc}"
        ) from exc
    output = f"{result.stdout}\n{result.stderr}"
    match = GDAL_VERSION_PATTERN.search(output)
    if not match:
        raise RuntimeError(
            f"Unable to parse GDAL version from: {output.strip()}"
        )
    return match.group(1)


def run_conda_command(conda: str, arguments: List[str]) -> str:
    command = [conda, *arguments]
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError as error:
        raise RuntimeError(
            "Conda executable was not found; install Conda and activate the "
            f"environment created from {CONDA_LOCK_FILE_NAME}"
        ) from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            "Conda environment inspection timed out: "
            + " ".join(command)
        ) from error
    except subprocess.CalledProcessError as error:
        detail = (
            error.stderr or error.stdout or str(error)
        ).strip()
        raise RuntimeError(
            f"Conda environment inspection failed: {detail}"
        ) from error
    return result.stdout


def format_conda_package(package_url: str) -> str:
    return package_url.rsplit("/", 1)[-1].split("#", 1)[0]


def validate_locked_conda_environment(
    lock_path: pathlib.Path = DEFAULT_CONDA_LOCK,
) -> Dict[str, str]:
    try:
        lock_content = lock_path.read_text(encoding="utf-8")
        expected_platform, expected_packages = (
            parse_conda_explicit_lock(lock_content)
        )
    except (OSError, ValueError) as error:
        raise RuntimeError(
            f"Unable to validate Conda lock {lock_path}: {error}"
        ) from error

    prefix = pathlib.Path(sys.prefix).resolve()
    if not (prefix / "conda-meta").is_dir():
        raise RuntimeError(
            "The datapack builder is not running inside a Conda environment; "
            f"activate the environment created from {CONDA_LOCK_FILE_NAME}"
        )
    conda = os.getenv("CONDA_EXE") or shutil.which("conda")
    if not conda:
        raise RuntimeError(
            "Conda executable was not found in the active environment"
        )

    explicit_output = run_conda_command(
        conda,
        [
            "list",
            "--prefix",
            str(prefix),
            "--explicit",
            "--md5",
        ],
    )
    try:
        actual_platform, actual_packages = parse_conda_explicit_lock(
            explicit_output,
            require_official_source=False,
        )
    except ValueError as error:
        raise RuntimeError(
            f"Unable to inspect the active Conda environment: {error}"
        ) from error

    expected_set = set(expected_packages)
    actual_set = set(actual_packages)
    missing = sorted(expected_set - actual_set)
    unexpected = sorted(actual_set - expected_set)
    if (
        actual_platform != expected_platform
        or missing
        or unexpected
    ):
        details = []
        if actual_platform != expected_platform:
            details.append(
                f"platform expected {expected_platform}, "
                f"found {actual_platform}"
            )
        if missing:
            names = ", ".join(
                format_conda_package(item)
                for item in missing[:3]
            )
            details.append(
                f"{len(missing)} locked package(s) missing: {names}"
            )
        if unexpected:
            names = ", ".join(
                format_conda_package(item)
                for item in unexpected[:3]
            )
            details.append(
                f"{len(unexpected)} unexpected package(s): {names}"
            )
        raise RuntimeError(
            f"Active Conda environment does not match "
            f"{CONDA_LOCK_FILE_NAME}: "
            + "; ".join(details)
        )

    package_list_output = run_conda_command(
        conda,
        ["list", "--prefix", str(prefix), "--json"],
    )
    try:
        package_list = json.loads(package_list_output)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            "Conda returned invalid JSON while checking pip packages"
        ) from error
    if not isinstance(package_list, list):
        raise RuntimeError("Conda returned an invalid package list")
    pip_packages = sorted(
        str(entry.get("name"))
        for entry in package_list
        if isinstance(entry, dict)
        and (
            entry.get("channel") == "pypi"
            or entry.get("build_string") == "pypi_0"
        )
    )
    if pip_packages:
        raise RuntimeError(
            "Active Conda environment contains package(s) outside the lock: "
            + ", ".join(pip_packages[:5])
        )

    contract = {
        "condaPlatform": expected_platform,
        "condaLockSha256": conda_lock_fingerprint(
            expected_platform,
            expected_packages,
        ),
    }
    actual_fingerprint = conda_lock_fingerprint(
        actual_platform,
        actual_packages,
    )
    if actual_fingerprint != contract["condaLockSha256"]:
        raise RuntimeError(
            "Active Conda environment fingerprint does not match the lock"
        )
    return contract


def inspect_build_environment(
    lock_path: pathlib.Path = DEFAULT_CONDA_LOCK,
) -> Dict[str, str]:
    versions = {"python": platform.python_version()}
    for manifest_name, output_name in [
        ("geopandas", "geopandas"),
        ("pyogrio", "pyogrio"),
        ("pyproj", "pyproj"),
        ("Pillow", "pillow"),
    ]:
        try:
            versions[output_name] = metadata.version(manifest_name)
        except metadata.PackageNotFoundError as exc:
            raise RuntimeError(
                f"Required build package is missing: {manifest_name}"
            ) from exc

    gdalwarp = resolve_gdalwarp()
    if not gdalwarp:
        raise RuntimeError(
            "gdalwarp is missing; create the official Conda environment from "
            "environment-win-64.lock.txt"
        )
    versions["gdal"] = read_gdal_version(gdalwarp)
    versions.update(validate_locked_conda_environment(lock_path))
    return versions


def validate_build_environment(
    lock_path: pathlib.Path = DEFAULT_CONDA_LOCK,
) -> Dict[str, str]:
    versions = inspect_build_environment(lock_path)
    mismatches = [
        f"{name} expected {expected}, "
        f"found {versions.get(name, 'missing')}"
        for name, expected in EXPECTED_BUILD_ENVIRONMENT.items()
        if versions.get(name) != expected
    ]
    if mismatches:
        raise RuntimeError(
            "Datapack build environment does not match "
            "the official toolchain: "
            + "; ".join(mismatches)
        )
    direct_versions = {
        name: versions[name]
        for name in EXPECTED_BUILD_ENVIRONMENT
    }
    print(
        "Build environment verified: "
        + ", ".join(
            f"{name} {version}"
            for name, version in direct_versions.items()
        )
        + f", Conda lock {versions['condaPlatform']} "
        + versions["condaLockSha256"][:12]
    )
    return versions
