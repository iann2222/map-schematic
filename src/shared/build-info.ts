import type { AppBuildInfo } from "./ipc-contract";
import { isRecord } from "./validation/primitives";

export type { AppBuildInfo } from "./ipc-contract";

export const UNKNOWN_COMMIT_SHA = "unknown";

function isCommitSha(value: unknown): value is string {
  return (
    typeof value === "string"
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)
  );
}

export function parseBuildInfo(
  input: unknown,
  fallbackVersion: string
): AppBuildInfo {
  if (!isRecord(input)) {
    return {
      version: fallbackVersion,
      commitSha: UNKNOWN_COMMIT_SHA,
      shortCommitSha: UNKNOWN_COMMIT_SHA,
      dirty: null
    };
  }
  const commitSha = isCommitSha(input.commitSha)
    ? input.commitSha.toLowerCase()
    : UNKNOWN_COMMIT_SHA;
  const shortCommitSha = commitSha === UNKNOWN_COMMIT_SHA
    ? UNKNOWN_COMMIT_SHA
    : commitSha.slice(0, 12);
  return {
    version:
      typeof input.version === "string" && input.version.trim()
        ? input.version.trim()
        : fallbackVersion,
    commitSha,
    shortCommitSha,
    dirty: typeof input.dirty === "boolean" ? input.dirty : null
  };
}
