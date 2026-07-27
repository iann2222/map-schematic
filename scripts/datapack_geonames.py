import csv
import pathlib
import sqlite3
import zipfile
from typing import Iterable, List, Tuple


def open_geonames_zip(
    zip_path: pathlib.Path,
    candidate_txt: str,
) -> Iterable[List[str]]:
    with zipfile.ZipFile(zip_path, "r") as archive:
        with archive.open(candidate_txt, "r") as handle:
            reader = csv.reader(
                (line.decode("utf-8") for line in handle),
                delimiter="\t",
            )
            yield from reader


def ensure_sqlite(db_path: pathlib.Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    return connection


def create_geonames_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
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
    connection.execute(
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
    connection.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS geonames_fts
        USING fts5(name, lang, geonameid UNINDEXED, is_preferred UNINDEXED)
        """
    )


def insert_geonames_rows(
    connection: sqlite3.Connection,
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
            connection.executemany(insert_sql, batch)
            batch.clear()
    if batch:
        connection.executemany(insert_sql, batch)


def insert_alternate_names(
    connection: sqlite3.Connection,
    rows: Iterable[List[str]],
    keep_languages: List[str],
) -> None:
    insert_alternate = """
        INSERT INTO alternatenames (
          geonameid, lang, name, is_preferred, is_short, is_colloquial, is_historic
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    insert_fts = """
        INSERT INTO geonames_fts (name, lang, geonameid, is_preferred)
        VALUES (?, ?, ?, ?)
    """
    alternate_batch: List[Tuple[object, ...]] = []
    fts_batch: List[Tuple[object, ...]] = []
    for row in rows:
        if len(row) < 10:
            continue
        language = row[2]
        if language not in keep_languages:
            continue
        geoname_id = int(row[1])
        name = row[3]
        is_preferred = int(row[4] == "1")
        is_short = int(row[5] == "1")
        is_colloquial = int(row[6] == "1")
        is_historic = int(row[7] == "1")
        alternate_batch.append(
            (
                geoname_id,
                language,
                name,
                is_preferred,
                is_short,
                is_colloquial,
                is_historic,
            )
        )
        fts_batch.append((name, language, geoname_id, is_preferred))
        if len(alternate_batch) >= 5000:
            connection.executemany(insert_alternate, alternate_batch)
            connection.executemany(insert_fts, fts_batch)
            alternate_batch.clear()
            fts_batch.clear()
    if alternate_batch:
        connection.executemany(insert_alternate, alternate_batch)
        connection.executemany(insert_fts, fts_batch)


def build_geonames_sqlite(
    source_zip: pathlib.Path,
    alternate_zip: pathlib.Path,
    out_db: pathlib.Path,
    keep_languages: List[str],
    force: bool,
) -> None:
    if out_db.exists():
        if not force:
            raise RuntimeError(f"GeoNames DB already exists: {out_db}")
        out_db.unlink()
    connection = ensure_sqlite(out_db)
    try:
        create_geonames_schema(connection)
        rows = open_geonames_zip(source_zip, source_zip.stem + ".txt")
        insert_geonames_rows(connection, rows)
        alternate_rows = open_geonames_zip(
            alternate_zip,
            alternate_zip.stem + ".txt",
        )
        insert_alternate_names(connection, alternate_rows, keep_languages)
        connection.commit()
    finally:
        connection.close()


def resolve_geonames_source(raw_root: pathlib.Path, mode: str) -> pathlib.Path:
    sources = {
        "all": "allCountries.zip",
        "cities1000": "cities1000.zip",
        "cities15000": "cities15000.zip",
    }
    try:
        return raw_root / sources[mode]
    except KeyError as exc:
        raise ValueError(f"Unsupported geonames mode: {mode}") from exc
