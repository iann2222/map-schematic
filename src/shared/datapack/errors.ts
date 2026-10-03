import type { DataPackIssue } from "./types";

export class DataPackError extends Error {
  constructor(readonly issue: DataPackIssue, readonly cause?: unknown) {
    super(issue.message);
    this.name = "DataPackError";
  }
}

export function invalidDatapack(message: string): DataPackError {
  return new DataPackError({ code: "invalidData", stage: "validation", message });
}

export function isInvalidOrMissingDatapack(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return (error instanceof DataPackError && error.issue.code === "invalidData") ||
    code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

export function datapackError(error: unknown, stage: DataPackIssue["stage"]): DataPackError {
  if (error instanceof DataPackError) return error;
  const errno = (error as NodeJS.ErrnoException | null)?.code;
  const code: DataPackIssue["code"] = errno === "EACCES" || errno === "EPERM" ? "permissionDenied"
    : errno === "EBUSY" || errno === "ETXTBSY" ? "busy"
    : errno === "ENOSPC" || errno === "EIO" || errno === "EROFS" ? "storageFailure"
    : "operationFailed";
  const reason = error instanceof Error ? error.message : String(error);
  return new DataPackError({ code, stage, message: reason }, error);
}
