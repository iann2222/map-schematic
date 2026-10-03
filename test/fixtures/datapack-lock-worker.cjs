const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(compiled.outputText, filename);
};

const { withDatapackLock } = require(path.join(__dirname, "../../src/shared/datapack/data-root-lock.ts"));
process.send({ state: "requesting" });
withDatapackLock(process.argv[2], process.argv[3], async () => {
  process.send({ state: "entered" });
  await new Promise((resolve) => process.once("message", resolve));
}, { timeoutMs: 4000 }).then(() => {
  process.send({ state: "released" }, () => process.disconnect());
}).catch((error) => {
  process.send({ state: "error", error: String(error) }, () => { process.exitCode = 1; process.disconnect(); });
});
