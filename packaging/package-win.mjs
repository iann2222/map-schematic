import { spawnSync } from "child_process";
import { existsSync, readFileSync, rmSync, statSync } from "fs";
import { resolve } from "path";
import { releaseTarget } from "./release-config.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetArguments = {
  setup: ["--win", "nsis"],
  folder: ["--win", "dir"],
  zip: ["--win", "dir"]
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findReleaseArtifacts(outputDirectory, target) {
  if (target === "folder") {
    return [resolve(outputDirectory, "win-unpacked")];
  }

  const artifactPath = resolve(outputDirectory, `${getArtifactBaseName("setup")}.exe`);
  return existsSync(artifactPath) ? [artifactPath] : [];
}

function getArtifactBaseName(kind) {
  const { productName, version } = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  if (typeof productName !== "string" || typeof version !== "string") {
    throw new Error("package.json must define productName and version for packaging.");
  }
  return `${productName}-${version}-${kind === "setup" ? "Setup" : "Portable"}-x64`;
}

function createPortableArchive(outputDirectory) {
  const sourceDirectory = resolve(outputDirectory, "win-unpacked");
  const archivePath = resolve(outputDirectory, `${getArtifactBaseName("portable")}.zip`);
  const escapePowerShellPath = (path) => path.replace(/'/g, "''");
  const command = `Compress-Archive -LiteralPath '${escapePowerShellPath(sourceDirectory)}' -DestinationPath '${escapePowerShellPath(archivePath)}' -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 || !existsSync(archivePath) || statSync(archivePath).size === 0) {
    throw new Error("Portable ZIP could not be created.");
  }

  return archivePath;
}

function removePortableFolder(outputDirectory) {
  rmSync(resolve(outputDirectory, "win-unpacked"), { recursive: true, force: true });
}

function removePackagingDiagnostics(outputDirectory) {
  for (const name of ["builder-debug.yml", "builder-effective-config.yaml"]) {
    const path = resolve(outputDirectory, name);
    if (existsSync(path)) {
      rmSync(path);
    }
  }
}

function cleanReleaseOutput(outputDirectory) {
  rmSync(outputDirectory, { recursive: true, force: true });
}

if (process.platform !== "win32") {
  throw new Error("Windows releases can only be built on Windows.");
}

if (!(releaseTarget in targetArguments)) {
  throw new Error(`Unknown releaseTarget \"${releaseTarget}\". Use \"setup\", \"folder\", or \"zip\".`);
}

run(npmCommand, ["run", "build"]);
const outputDirectory = resolve(process.cwd(), "dist");
cleanReleaseOutput(outputDirectory);
run(npmCommand, [
  "exec",
  "electron-builder",
  "--",
  "--config",
  "packaging/electron-builder.yml",
  ...targetArguments[releaseTarget],
  "--x64",
  "--publish",
  "never"
]);

removePackagingDiagnostics(outputDirectory);
const artifacts = releaseTarget === "zip"
  ? [createPortableArchive(outputDirectory)]
  : findReleaseArtifacts(outputDirectory, releaseTarget);

if (releaseTarget === "zip") {
  removePortableFolder(outputDirectory);
}

if (artifacts.length === 0) {
  throw new Error("Packaging finished, but the expected release artifact was not found in dist.");
}

console.log("\nPackaging completed successfully.");
for (const artifact of artifacts) {
  console.log(`Output: ${artifact}`);
}
