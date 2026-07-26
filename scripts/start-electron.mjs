import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const environment = { ...process.env };

// Some shells and IDEs set this for Electron's Node mode; the app needs Electron mode.
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, process.argv.slice(2), {
  stdio: "inherit",
  env: environment
});

child.on("error", (error) => {
  console.error(`Unable to start Electron: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
