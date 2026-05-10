import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import https from "https";
import AdmZip from "adm-zip";

import { resolveDataRoot } from "../shared/paths";
import { resolvePackConfig } from "../shared/config";
import { resolvePackRoot } from "../shared/datapack/resolve";

type ReleaseConfig = {
  id: string;
  version: string;
  url: string;
  sha256?: string;
};

type ManifestFileEntry = {
  path?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
};

type DownloadedManifest = {
  id?: unknown;
  version?: unknown;
  basemap?: {
    layers?: Array<{ path?: unknown }>;
  };
  geonames?: {
    dbPath?: unknown;
  };
  relief?: {
    path?: unknown;
  } | null;
  files?: ManifestFileEntry[];
};

function releaseConfigPath(): string {
  return path.join(process.cwd(), "pack-release.json");
}

async function readReleaseConfig(): Promise<ReleaseConfig> {
  const raw = await fs.readFile(releaseConfigPath(), "utf8");
  return JSON.parse(raw) as ReleaseConfig;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode ?? "unknown"}`));
          res.resume();
          return;
        }
        const fileStream = createWriteStream(dest);
        pipeline(res, fileStream).then(resolve).catch(reject);
      })
      .on("error", reject);
  });
}

async function sha256File(target: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const data = await fs.readFile(target);
  hash.update(data);
  return hash.digest("hex");
}

function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Datapack file path must be relative: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Datapack file path escapes pack root: ${relativePath}`);
  }
  return resolvedPath;
}

async function requireFile(
  root: string,
  relativePath: unknown,
  expectedSizeBytes?: unknown
): Promise<void> {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("Datapack file path must be a non-empty string");
  }
  const filePath = resolveInside(root, relativePath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Datapack path is not a file: ${relativePath}`);
  }
  if (typeof expectedSizeBytes === "number" && stat.size !== expectedSizeBytes) {
    throw new Error(
      `Datapack file size mismatch: ${relativePath} expected ${expectedSizeBytes} bytes but got ${stat.size}`
    );
  }
}

async function readDownloadedManifest(packRoot: string): Promise<DownloadedManifest> {
  const manifestPath = path.join(packRoot, "datapack.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as DownloadedManifest;
}

async function validateInstalledDatapack(
  packRoot: string,
  expected: { id: string; version: string }
): Promise<void> {
  const manifest = await readDownloadedManifest(packRoot);
  if (manifest.id !== expected.id || manifest.version !== expected.version) {
    throw new Error(
      `Installed pack mismatch. Expected ${expected.id} ${expected.version} but manifest is ${String(
        manifest.id
      )} ${String(manifest.version)}`
    );
  }

  const files = Array.isArray(manifest.files) ? manifest.files : null;
  if (!files || files.length === 0) {
    throw new Error("Datapack manifest must include a non-empty files list");
  }
  await Promise.all(
    files.map((entry) => requireFile(packRoot, entry.path, entry.sizeBytes))
  );

  const layers = manifest.basemap?.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("Datapack manifest must include basemap layers");
  }
  await Promise.all(layers.map((layer) => requireFile(packRoot, layer.path)));
  await requireFile(packRoot, manifest.geonames?.dbPath ?? "geonames/geonames.sqlite");
  if (manifest.relief?.path) {
    await requireFile(packRoot, manifest.relief.path);
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export async function ensureDatapackReady(): Promise<void> {
  const packRoot = resolvePackRoot();
  const expected = resolvePackConfig();
  const manifestPath = path.join(packRoot, "datapack.json");
  if (await fileExists(manifestPath)) {
    try {
      await validateInstalledDatapack(packRoot, expected);
      return;
    } catch {
      // Reinstall below. A manifest without the declared files is treated as incomplete.
    }
  }

  const release = await readReleaseConfig();
  if (release.id !== expected.id || release.version !== expected.version) {
    throw new Error(
      `Pack mismatch. Config wants ${expected.id} ${expected.version} but release is ${release.id} ${release.version}`
    );
  }

  const dataRoot = resolveDataRoot();
  const tempDir = path.join(dataRoot, ".download");
  await fs.mkdir(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, `datapack-${release.id}-${release.version}.zip`);
  const tempInstallRoot = path.join(
    tempDir,
    `datapack-${release.id}-${release.version}-installing`
  );

  await downloadFile(release.url, zipPath);
  if (release.sha256) {
    const actual = await sha256File(zipPath);
    if (actual.toLowerCase() !== release.sha256.toLowerCase()) {
      await fs.rm(zipPath, { force: true });
      throw new Error("Datapack checksum mismatch");
    }
  }

  await fs.rm(tempInstallRoot, { recursive: true, force: true });
  try {
    await extractZip(zipPath, tempInstallRoot);
    await validateInstalledDatapack(tempInstallRoot, expected);
    await fs.mkdir(path.dirname(packRoot), { recursive: true });
    await fs.rm(packRoot, { recursive: true, force: true });
    await fs.rename(tempInstallRoot, packRoot);
  } catch (err) {
    await fs.rm(tempInstallRoot, { recursive: true, force: true });
    throw err;
  } finally {
    await fs.rm(zipPath, { force: true });
  }
}
