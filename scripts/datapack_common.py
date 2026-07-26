import re
from typing import Final


MAX_PACK_SEGMENT_LENGTH: Final = 64
EXPECTED_BUILD_ENVIRONMENT: Final = {
    "python": "3.11.14",
    "geopandas": "1.1.2",
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
