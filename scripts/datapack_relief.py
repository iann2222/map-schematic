import os
import pathlib
import shutil
import subprocess
import tempfile
import warnings
import zipfile
from typing import Dict, Optional

try:
    from .datapack_environment import resolve_gdalwarp
except ImportError:
    from datapack_environment import resolve_gdalwarp


HILLSHADE_WIDTH = 1200
HILLSHADE_HEIGHT = 800


def try_import_pil():
    try:
        from PIL import Image  # type: ignore

        return Image, None
    except Exception as exc:
        return None, str(exc)


def resolve_hillshade_zip(raw_root: pathlib.Path) -> Optional[pathlib.Path]:
    candidates = [
        raw_root / "MSR_50M.zip",
        raw_root / "US_MSR_10M.zip",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    for path in raw_root.glob("*.zip"):
        name = path.name.lower()
        if "msr" in name and "10m" in name:
            return path
        if "msr" in name and "50m" in name:
            return path
    return None


def resolve_hillshade_image(raw_root: pathlib.Path) -> Optional[pathlib.Path]:
    candidates = [
        raw_root / "hillshade_3857.png",
        raw_root / "hillshade.png",
        raw_root / "hillshade.jpg",
        raw_root / "hillshade.jpeg",
    ]
    return next((path for path in candidates if path.exists()), None)


def build_hillshade_gdal(
    source_zip: pathlib.Path,
    out_dir: pathlib.Path,
    width: int,
    height: int,
) -> Optional[pathlib.Path]:
    gdalwarp = resolve_gdalwarp()
    if not gdalwarp:
        return None
    with zipfile.ZipFile(source_zip, "r") as archive:
        tif_names = [
            name for name in archive.namelist() if name.lower().endswith(".tif")
        ]
    if not tif_names:
        return None
    source_path = f"/vsizip/{source_zip.as_posix()}/{tif_names[0]}"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "hillshade_3857.png"
    bounds = [
        "-20037508.342789244",
        "-20037508.342789244",
        "20037508.342789244",
        "20037508.342789244",
    ]
    command = [
        gdalwarp,
        "-t_srs",
        "EPSG:3857",
        "-te",
        *bounds,
        "-ts",
        str(width),
        str(height),
        "-r",
        "bilinear",
        "-of",
        "PNG",
        source_path,
        str(out_path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True)
    except Exception as exc:
        print(f"Hillshade GDAL warp failed: {exc}.")
        return None
    return out_path


def build_hillshade(
    raw_root: pathlib.Path,
    out_dir: pathlib.Path,
) -> Optional[Dict[str, str]]:
    image_source = resolve_hillshade_image(raw_root)
    if image_source:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / image_source.name
        shutil.copyfile(image_source, out_path)
        projection = (
            "EPSG:3857"
            if image_source.name.endswith("_3857.png")
            else "EPSG:4326"
        )
        return {
            "format": image_source.suffix.lstrip(".").lower(),
            "path": f"relief/{image_source.name}",
            "source": image_source.name,
            "projection": projection,
        }

    source_zip = resolve_hillshade_zip(raw_root)
    if not source_zip:
        print("Hillshade skipped (MSR zip missing).")
        return None
    gdal_output = build_hillshade_gdal(
        source_zip,
        out_dir,
        HILLSHADE_WIDTH,
        HILLSHADE_HEIGHT,
    )
    if gdal_output:
        return {
            "format": "png",
            "path": f"relief/{gdal_output.name}",
            "source": source_zip.name,
            "projection": "EPSG:3857",
        }
    if os.getenv("MAPSCHEM_ENABLE_TIFF") != "1":
        print(
            "Hillshade skipped "
            "(provide hillshade.png or set MAPSCHEM_ENABLE_TIFF=1)."
        )
        return None
    Image, pil_error = try_import_pil()
    if not Image:
        print(f"Hillshade skipped (Pillow missing: {pil_error}).")
        return None
    Image.MAX_IMAGE_PIXELS = None
    warnings.simplefilter("ignore", Image.DecompressionBombWarning)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(source_zip, "r") as archive:
            tif_names = [
                name
                for name in archive.namelist()
                if name.lower().endswith(".tif")
            ]
            if not tif_names:
                print("Hillshade skipped (no .tif in MSR zip).")
                return None
            tif_name = tif_names[0]
            with tempfile.TemporaryDirectory() as temp_dir:
                archive.extract(tif_name, temp_dir)
                tif_path = pathlib.Path(temp_dir) / tif_name
                out_path = out_dir / "hillshade.png"
                try:
                    with Image.open(tif_path) as image:
                        image = image.convert("L")
                        image.draft(
                            "L",
                            (HILLSHADE_WIDTH, HILLSHADE_HEIGHT),
                        )
                        image.thumbnail(
                            (HILLSHADE_WIDTH, HILLSHADE_HEIGHT)
                        )
                        if image.size != (
                            HILLSHADE_WIDTH,
                            HILLSHADE_HEIGHT,
                        ):
                            image = image.resize(
                                (HILLSHADE_WIDTH, HILLSHADE_HEIGHT)
                            )
                        image.save(out_path, "PNG", optimize=True)
                except Exception as exc:
                    print(f"Hillshade skipped (convert failed: {exc}).")
                    return None
    except Exception as exc:
        print(f"Hillshade skipped (read failed: {exc}).")
        return None
    return {
        "format": "png",
        "path": "relief/hillshade.png",
        "source": source_zip.name,
        "projection": "EPSG:4326",
    }
