import argparse
import csv
import hashlib
import json
import pathlib
import sqlite3
import time
import zipfile
from typing import Dict, Iterable, List, Optional, Tuple


BASEMAP_LAYERS = [
    ("land", "ne_50m_land.shp"),
    ("ocean", "ne_50m_ocean.shp"),
    ("lakes", "ne_50m_lakes.shp"),
    ("rivers", "ne_50m_rivers_lake_centerlines.shp"),
    ("coastline", "ne_50m_coastline.shp"),
]


def sha256_file(path: pathlib.Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def write_json(path: pathlib.Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_files(root: pathlib.Path) -> List[Dict[str, object]]:
    files: List[Dict[str, object]] = []
    if not root.exists():
        return files
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        files.append(
            {
                "path": rel,
                "sizeBytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return files


def try_import_geopandas():
    try:
        import geopandas  # type: ignore

        return geopandas, None
    except Exception as exc:
        return None, str(exc)


def build_basemap(
    geopandas_module,
    source_dir: pathlib.Path,
    out_dir: pathlib.Path,
) -> List[Dict[str, str]]:
    layers: List[Dict[str, str]] = []
    for layer_id, shp_name in BASEMAP_LAYERS:
        shp_path = source_dir / shp_name
        if not shp_path.exists():
            continue
        gdf = geopandas_module.read_file(shp_path)
        out_path = out_dir / f"{layer_id}.geojson"
        gdf.to_file(out_path, driver="GeoJSON")
        layers.append({"id": layer_id, "path": f"basemap/{layer_id}.geojson"})
    return layers


def open_geonames_zip(zip_path: pathlib.Path, candidate_txt: str) -> Iterable[List[str]]:
    with zipfile.ZipFile(zip_path, "r") as archive:
        with archive.open(candidate_txt, "r") as handle:
            reader = csv.reader(
                (line.decode("utf-8") for line in handle),
                delimiter="\t",
            )
            for row in reader:
                yield row


def ensure_sqlite(db_path: pathlib.Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def create_geonames_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS geonames (
          geonameid INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          asciiname TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          feature_class TEXT,
          feature_code TEXT,
          country_code TEXT,
          admin1_code TEXT,
          admin2_code TEXT,
          population INTEGER,
          timezone TEXT,
          modification_date TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS alternatenames (
          geonameid INTEGER NOT NULL,
          lang TEXT NOT NULL,
          name TEXT NOT NULL,
          is_preferred INTEGER,
          is_short INTEGER,
          is_colloquial INTEGER,
          is_historic INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS geonames_fts
        USING fts5(name, lang, geonameid UNINDEXED, is_preferred UNINDEXED)
        """
    )


def insert_geonames_rows(
    conn: sqlite3.Connection,
    rows: Iterable[List[str]],
) -> None:
    insert_sql = """
        INSERT INTO geonames (
          geonameid, name, asciiname, latitude, longitude,
          feature_class, feature_code, country_code, admin1_code, admin2_code,
          population, timezone, modification_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    batch: List[Tuple[object, ...]] = []
    for row in rows:
        if len(row) < 19:
            continue
        batch.append(
            (
                int(row[0]),
                row[1],
                row[2],
                float(row[4]),
                float(row[5]),
                row[6],
                row[7],
                row[8],
                row[10],
                row[11],
                int(row[14] or 0),
                row[17],
                row[18],
            )
        )
        if len(batch) >= 5000:
            conn.executemany(insert_sql, batch)
            batch.clear()
    if batch:
        conn.executemany(insert_sql, batch)


def insert_alternate_names(
    conn: sqlite3.Connection,
    rows: Iterable[List[str]],
    keep_langs: List[str],
) -> None:
    insert_alt = """
        INSERT INTO alternatenames (
          geonameid, lang, name, is_preferred, is_short, is_colloquial, is_historic
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    insert_fts = "INSERT INTO geonames_fts (name, lang, geonameid, is_preferred) VALUES (?, ?, ?, ?)"
    batch_alt: List[Tuple[object, ...]] = []
    batch_fts: List[Tuple[object, ...]] = []
    for row in rows:
        if len(row) < 10:
            continue
        lang = row[2]
        if lang not in keep_langs:
            continue
        geonameid = int(row[1])
        name = row[3]
        is_preferred = int(row[4] == "1")
        is_short = int(row[5] == "1")
        is_colloquial = int(row[6] == "1")
        is_historic = int(row[7] == "1")
        batch_alt.append(
            (geonameid, lang, name, is_preferred, is_short, is_colloquial, is_historic)
        )
        batch_fts.append((name, lang, geonameid, is_preferred))
        if len(batch_alt) >= 5000:
            conn.executemany(insert_alt, batch_alt)
            conn.executemany(insert_fts, batch_fts)
            batch_alt.clear()
            batch_fts.clear()
    if batch_alt:
        conn.executemany(insert_alt, batch_alt)
        conn.executemany(insert_fts, batch_fts)


def build_geonames_sqlite(
    source_zip: pathlib.Path,
    alternate_zip: pathlib.Path,
    out_db: pathlib.Path,
    keep_langs: List[str],
    force: bool,
) -> None:
    if out_db.exists():
        if not force:
            raise RuntimeError(f"GeoNames DB already exists: {out_db}")
        out_db.unlink()
    conn = ensure_sqlite(out_db)
    create_geonames_schema(conn)
    rows = open_geonames_zip(source_zip, source_zip.stem + ".txt")
    insert_geonames_rows(conn, rows)
    alt_rows = open_geonames_zip(alternate_zip, alternate_zip.stem + ".txt")
    insert_alternate_names(conn, alt_rows, keep_langs)
    conn.commit()
    conn.close()


def resolve_geonames_source(raw_root: pathlib.Path, mode: str) -> pathlib.Path:
    if mode == "all":
        return raw_root / "allCountries.zip"
    if mode == "cities1000":
        return raw_root / "cities1000.zip"
    if mode == "cities15000":
        return raw_root / "cities15000.zip"
    raise ValueError(f"Unsupported geonames mode: {mode}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build map-schematic datapack.")
    parser.add_argument("--raw", default="geodata-source", help="Raw data root")
    parser.add_argument("--out", default="geodata/packs/standard", help="Output root")
    parser.add_argument("--id", default="standard", help="Data pack id")
    parser.add_argument("--version", default=time.strftime("%Y.%m"), help="Data pack version")
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
    args = parser.parse_args()

    raw_root = pathlib.Path(args.raw).resolve()
    out_root = pathlib.Path(args.out).resolve()
    pack_root = out_root / args.version

    basemap_dir = pack_root / "basemap"
    geonames_dir = pack_root / "geonames"
    basemap_dir.mkdir(parents=True, exist_ok=True)
    geonames_dir.mkdir(parents=True, exist_ok=True)

    geopandas_module, geopandas_error = try_import_geopandas()
    basemap_layers: List[Dict[str, str]] = []
    basemap_source = raw_root / "50m_physical"
    if geopandas_module and basemap_source.exists():
        basemap_layers = build_basemap(geopandas_module, basemap_source, basemap_dir)
    else:
        reason = []
        if not geopandas_module:
            reason.append(f"geopandas import failed: {geopandas_error}")
        if not basemap_source.exists():
            reason.append(f"missing source: {basemap_source}")
        detail = "; ".join(reason) if reason else "unknown"
        print(f"Basemap skipped ({detail}).")

    geonames_source = resolve_geonames_source(raw_root, args.geonames)
    alternate_zip = raw_root / "alternateNamesV2.zip"
    geonames_db = geonames_dir / "geonames.sqlite"
    if geonames_source.exists() and alternate_zip.exists():
        build_geonames_sqlite(
            geonames_source,
            alternate_zip,
            geonames_db,
            ["en", "zh", "zh-TW"],
            args.force,
        )
    else:
        print("GeoNames skipped (source zip missing).")

    datapack = {
        "id": args.id,
        "version": args.version,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "projection": "EPSG:4326",
        "basemap": {
            "format": "geojson",
            "layers": basemap_layers,
        },
        "geonames": {
            "format": "sqlite+fts",
            "dbPath": "geonames/geonames.sqlite",
            "languages": ["en", "zh-TW", "zh"],
        },
        "files": [],
    }

    datapack["files"] = collect_files(pack_root)
    write_json(pack_root / "datapack.json", datapack)

    print(f"Data pack initialized at: {pack_root}")


if __name__ == "__main__":
    main()
