import hashlib
import pathlib
import re
from typing import Final, Iterable


MAX_PACK_SEGMENT_LENGTH: Final = 64
CONDA_LOCK_FILE_NAME: Final = "environment-win-64.lock.txt"
EXPECTED_CONDA_PLATFORM: Final = "win-64"
EXPECTED_BUILD_ENVIRONMENT: Final = {
    "python": "3.11.14",
    "geopandas": "1.1.2",
    "pyogrio": "0.11.1",
    "pyproj": "3.7.2",
    "pillow": "12.1.0",
    "gdal": "3.11.4",
}
SAFE_PACK_SEGMENT = re.compile(
    rf"^[A-Za-z0-9](?:[A-Za-z0-9._-]{{0,{MAX_PACK_SEGMENT_LENGTH - 2}}}[A-Za-z0-9_-])?$"
)
WINDOWS_RESERVED_NAMES: Final = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}
CONDA_PACKAGE_PATTERN = re.compile(
    r"^https://conda\.anaconda\.org/conda-forge/(?:noarch|win-64)/"
    r"[^#]+#[0-9a-f]{32}$"
)
EXPLICIT_PACKAGE_PATTERN = re.compile(r"^https://[^#]+#[0-9a-f]{32}$")


def is_safe_pack_segment(value: object) -> bool:
    if not isinstance(value, str) or not SAFE_PACK_SEGMENT.fullmatch(value):
        return False
    if ".." in value:
        return False
    device_name = value.split(".", 1)[0].upper()
    return device_name not in WINDOWS_RESERVED_NAMES


def require_safe_pack_segment(value: str, label: str) -> str:
    if not is_safe_pack_segment(value):
        raise ValueError(
            f"{label} must be 1-{MAX_PACK_SEGMENT_LENGTH} characters using only "
            "letters, digits, dot, underscore, or hyphen; it cannot contain '..', "
            "end in a dot, or use a reserved Windows device name"
        )
    return value


def parse_conda_explicit_lock(
    content: str,
    *,
    require_official_source: bool = True,
) -> tuple[str, tuple[str, ...]]:
    platform_name = ""
    explicit_marker = False
    packages = []
    package_pattern = (
        CONDA_PACKAGE_PATTERN if require_official_source else EXPLICIT_PACKAGE_PATTERN
    )
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("# platform:"):
            platform_name = line.partition(":")[2].strip()
            continue
        if line == "@EXPLICIT":
            explicit_marker = True
            continue
        if line.startswith("#"):
            continue
        if not package_pattern.fullmatch(line):
            raise ValueError(f"Invalid or unsupported Conda lock entry: {line}")
        packages.append(line)

    if platform_name != EXPECTED_CONDA_PLATFORM:
        raise ValueError(
            f"Conda lock platform must be {EXPECTED_CONDA_PLATFORM}, found "
            f"{platform_name or 'missing'}"
        )
    if not explicit_marker:
        raise ValueError("Conda lock is missing the @EXPLICIT marker")
    if not packages:
        raise ValueError("Conda lock does not contain any packages")
    if len(packages) != len(set(packages)):
        raise ValueError("Conda lock contains duplicate package entries")
    return platform_name, tuple(sorted(packages))


def conda_lock_fingerprint(platform_name: str, packages: Iterable[str]) -> str:
    canonical = f"{platform_name}\n" + "\n".join(sorted(packages)) + "\n"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def read_conda_lock_contract(lock_path: pathlib.Path) -> dict[str, str]:
    try:
        content = lock_path.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Unable to read Conda lock: {lock_path}: {error}") from error
    try:
        platform_name, packages = parse_conda_explicit_lock(content)
    except ValueError as error:
        raise RuntimeError(f"Invalid Conda lock {lock_path}: {error}") from error
    return {
        "condaPlatform": platform_name,
        "condaLockSha256": conda_lock_fingerprint(platform_name, packages),
    }
