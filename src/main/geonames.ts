import path from "path";

import Database from "better-sqlite3";

import { resolvePackRoot } from "../shared/datapack/resolve";

export type GeonamesResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  featureClass: string | null;
  featureCode: string | null;
  countryCode: string | null;
  population: number | null;
};

let cachedDb: Database.Database | null = null;

function openDatabase(): Database.Database {
  if (cachedDb) {
    return cachedDb;
  }
  const packRoot = resolvePackRoot();
  const dbPath = path.join(packRoot, "geonames", "geonames.sqlite");
  cachedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  return cachedDb;
}

function normalizeQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const safe = trimmed.replace(/"/g, "\"\"");
  return `${safe}*`;
}

export function searchGeonames(query: string, limit: number): GeonamesResult[] {
  const match = normalizeQuery(query);
  if (!match) {
    return [];
  }
  const db = openDatabase();
  const stmt = db.prepare(
    `
    SELECT g.geonameid as id,
           g.name as name,
           g.latitude as latitude,
           g.longitude as longitude,
           g.feature_class as featureClass,
           g.feature_code as featureCode,
           g.country_code as countryCode,
           g.population as population
    FROM geonames_fts f
    JOIN geonames g ON g.geonameid = f.geonameid
    WHERE f.name MATCH ?
    ORDER BY f.is_preferred DESC, g.population DESC
    LIMIT ?
    `
  );
  return stmt.all(match, limit) as GeonamesResult[];
}
