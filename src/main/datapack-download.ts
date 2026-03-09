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

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export async function ensureDatapackReady(): Promise<void> {
  const packRoot = resolvePackRoot();
  const manifestPath = path.join(packRoot, "datapack.json");
  if (await fileExists(manifestPath)) {
    return;
  }

  const release = await readReleaseConfig();
  const expected = resolvePackConfig();
  if (release.id !== expected.id || release.version !== expected.version) {
    throw new Error(
      `Pack mismatch. Config wants ${expected.id} ${expected.version} but release is ${release.id} ${release.version}`
    );
  }

  const dataRoot = resolveDataRoot();
  const tempDir = path.join(dataRoot, ".download");
  await fs.mkdir(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, `datapack-${release.id}-${release.version}.zip`);

  await downloadFile(release.url, zipPath);
  if (release.sha256) {
    const actual = await sha256File(zipPath);
    if (actual.toLowerCase() !== release.sha256.toLowerCase()) {
      await fs.rm(zipPath, { force: true });
      throw new Error("Datapack checksum mismatch");
    }
  }

  await extractZip(zipPath, packRoot);
  await fs.rm(zipPath, { force: true });
}
