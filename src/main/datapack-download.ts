import { createWriteStream } from "fs";
import fs from "fs/promises";
import https from "https";
import path from "path";
import { pipeline } from "stream/promises";

import AdmZip from "adm-zip";
import { app } from "electron";

import {
  DataPackManager,
  EnsureDataPackOptions
} from "../shared/datapack/manager";
import { ReadyDataPack } from "../shared/datapack/types";
import { resolveDataRoot } from "../shared/paths";

let manager: DataPackManager | null = null;

function releaseConfigPath(): string {
  return path.join(app.getAppPath(), "pack-release.json");
}

async function readReleaseConfig(): Promise<unknown> {
  const raw = await fs.readFile(releaseConfigPath(), "utf8");
  return JSON.parse(raw) as unknown;
}

function downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          if (redirectCount >= 5) {
            reject(new Error("Datapack download exceeded the redirect limit"));
            return;
          }
          const redirectUrl = new URL(response.headers.location, url).toString();
          if (new URL(redirectUrl).protocol !== "https:") {
            reject(new Error("Datapack download redirect must use HTTPS"));
            return;
          }
          downloadFile(redirectUrl, destination, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(`Datapack download failed with status ${response.statusCode ?? "unknown"}`)
          );
          return;
        }
        pipeline(response, createWriteStream(destination)).then(resolve).catch(reject);
      })
      .on("error", reject);
  });
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const archive = new AdmZip(archivePath);
  archive.extractAllTo(destination, true);
}

async function getManager(): Promise<DataPackManager> {
  if (!manager) {
    manager = new DataPackManager({
      dataRoot: resolveDataRoot(),
      release: await readReleaseConfig(),
      downloadFile,
      extractArchive
    });
  }
  return manager;
}

export async function ensureDatapackReady(
  confirmDownload?: EnsureDataPackOptions["confirmDownload"]
): Promise<ReadyDataPack> {
  return (await getManager()).ensureReady({ confirmDownload });
}

export async function updateDatapack(): Promise<ReadyDataPack> {
  return (await getManager()).update();
}
