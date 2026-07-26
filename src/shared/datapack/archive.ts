import AdmZip from "adm-zip";
import fs from "fs/promises";
import path from "path";

const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 32 * 1024 * 1024 * 1024;

type ZipEntryHeader = {
  attr?: number;
  size?: number;
};

export function validateArchiveEntryPath(destination: string, entryName: string): void {
  if (
    !entryName ||
    entryName.includes("\\") ||
    entryName.includes("\0") ||
    entryName.startsWith("/") ||
    /^[A-Za-z]:/.test(entryName)
  ) {
    throw new Error(`Datapack archive contains an unsafe path: ${entryName}`);
  }
  const resolvedRoot = path.resolve(destination);
  const resolvedPath = path.resolve(resolvedRoot, entryName);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Datapack archive path escapes destination: ${entryName}`);
  }
}

function isSymbolicLink(header: ZipEntryHeader): boolean {
  const mode = ((header.attr ?? 0) >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

export async function extractDatapackArchive(
  archivePath: string,
  destination: string
): Promise<void> {
  const archive = new AdmZip(archivePath);
  let totalSize = 0;
  for (const entry of archive.getEntries()) {
    validateArchiveEntryPath(destination, entry.entryName);
    if (isSymbolicLink(entry.header as ZipEntryHeader)) {
      throw new Error(`Datapack archive contains a symbolic link: ${entry.entryName}`);
    }
    if (!entry.isDirectory) {
      const size = Number((entry.header as ZipEntryHeader).size ?? 0);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`Datapack archive has an invalid entry size: ${entry.entryName}`);
      }
      totalSize += size;
      if (totalSize > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
        throw new Error("Datapack archive exceeds the supported extracted size");
      }
    }
  }
  await fs.mkdir(destination, { recursive: true });
  archive.extractAllTo(destination, true);
}
