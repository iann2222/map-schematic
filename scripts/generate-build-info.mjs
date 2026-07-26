import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const outputPath = path.join(repoRoot, "out", "build-info.json");
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true
  }).trim();
}

function resolveCommitInfo() {
  const environmentSha = process.env.MAP_SCHEMATIC_COMMIT_SHA?.trim();
  if (environmentSha) {
    if (!commitPattern.test(environmentSha)) {
      throw new Error("MAP_SCHEMATIC_COMMIT_SHA must contain a complete 40 or 64 character hexadecimal commit SHA.");
    }
    return {
      commitSha: environmentSha.toLowerCase(),
      dirty: process.env.MAP_SCHEMATIC_COMMIT_DIRTY === "1"
    };
  }

  try {
    const commitSha = runGit(["rev-parse", "HEAD"]);
    if (!commitPattern.test(commitSha)) {
      throw new Error("Git returned an invalid commit SHA.");
    }
    return {
      commitSha: commitSha.toLowerCase(),
      dirty: runGit(["status", "--porcelain"]).length > 0
    };
  } catch {
    return {
      commitSha: "unknown",
      dirty: null
    };
  }
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
  throw new Error("package.json must define a non-empty version.");
}

const commitInfo = resolveCommitInfo();
const buildInfo = {
  version: packageJson.version.trim(),
  commitSha: commitInfo.commitSha,
  shortCommitSha:
    commitInfo.commitSha === "unknown"
      ? "unknown"
      : commitInfo.commitSha.slice(0, 12),
  dirty: commitInfo.dirty
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.writing`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
fs.renameSync(temporaryPath, outputPath);
console.log(
  `Build info: v${buildInfo.version}, commit ${buildInfo.shortCommitSha}`
  + `${buildInfo.dirty ? " (dirty)" : ""}`
);
