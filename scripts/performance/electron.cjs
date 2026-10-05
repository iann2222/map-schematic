const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const root = path.resolve(__dirname, "../..");
const started = performance.now();
const timeoutMs = 180000;
let fixturePath;
let tempRoot;
let finished = false;

// Reuse the production main/preload/renderer in a separate diagnostic process.
app.getAppPath = () => root;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
for (const protocol of ["node:http", "node:https"]) {
  const transport = require(protocol);
  transport.get = transport.request = () => { throw new Error("Performance runs must stay offline; install an official pack first."); };
}

const reads = [];
const readFile = fs.readFile.bind(fs);
fs.readFile = async (file, ...args) => {
  const isBasemap = typeof file === "string" && file.split(path.sep).includes("basemap");
  const start = performance.now();
  try { return await readFile(file, ...args); }
  finally { if (isBasemap) reads.push(performance.now() - start); }
};

// The fixed typed scenarios are test-only and are not included in packaged releases.
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText, filename);
};
const { createPerformanceProject, DEFAULT_COUNTS, SCENARIO_VERSION } = require("../../test/performance/scenarios.ts");

function parseCounts() {
  const args = process.argv.slice(2);
  if (!args.length) return DEFAULT_COUNTS;
  if (args.length !== 2 || args[0] !== "--counts") throw new Error("Usage: npm run perf -- --counts 100,500,1000");
  const counts = args[1].split(",").map(Number);
  if (!counts.length || counts.length > 6 || new Set(counts).size !== counts.length) throw new Error("Supply 1-6 distinct object counts");
  for (const count of counts) createPerformanceProject(count, { id: "check", version: "check" });
  return counts;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(win, expression, label) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const result = await win.webContents.executeJavaScript(expression);
    if (result) return result;
    const modal = await win.webContents.executeJavaScript("document.querySelector('.modal-backdrop.active')?.textContent.trim()");
    if (modal) throw new Error(`Unexpected dialog during ${label}: ${modal}`);
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function evaluate(win, expression) {
  return win.webContents.executeJavaScript(expression, true);
}
function assertMetrics(metrics, names) {
  for (const name of names) {
    if (!metrics[name]?.count || metrics[name].failures) throw new Error(`Missing or failed measurement: ${name}`);
  }
}
async function finish(code, error) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  if (error) console.error(error.stack ?? error);
  try { if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true }); }
  catch (cleanupError) { console.error(`Temporary fixture cleanup failed: ${cleanupError.message}`); code = 1; }
  app.exit(code);
}
const watchdog = setTimeout(() => { void finish(1, new Error("Performance run exceeded its time limit")); }, timeoutMs);
process.on("uncaughtException", (error) => { void finish(1, error); });
process.on("unhandledRejection", (error) => { void finish(1, error); });
process.on("SIGINT", () => { void finish(1, new Error("Performance run interrupted")); });
process.on("SIGTERM", () => { void finish(1, new Error("Performance run terminated")); });

app.once("browser-window-created", (_event, win) => {
  const loadFile = win.loadFile.bind(win);
  win.loadFile = (file, options = {}) => loadFile(file, { ...options, query: { ...options.query, performance: "1" } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_details, callback) => callback({ cancel: true }));
  win.webContents.once("did-finish-load", () => {
    void benchmark(win).then(() => finish(0), (error) => finish(1, error));
  });
});

async function benchmark(win) {
  const counts = parseCounts();
  win.setContentSize(1200, 880);
  win.show(); win.focus();
  await poll(win, "window.mapSchematicPerformance?.snapshot()['startup.initialize']", "offline initialization");
  const startup = await evaluate(win, "window.mapSchematicPerformance.snapshot()");
  assertMetrics(startup, ["startup.initialize", "datapack.ready", "basemap.request", "basemap.parse", "basemap.geometryAndPaths", "basemap.draw"]);
  const startupWallMs = performance.now() - started;
  const pack = await evaluate(win, "window.mapSchematic.getDatapack()");
  await evaluate(win, "document.fonts.ready.then(() => true)");
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "map-schematic-perf-"));
  const cases = [];
  for (const count of counts) {
    console.log(`Measuring ${count} mixed objects...`);
    const project = createPerformanceProject(count, pack);
    fixturePath = path.join(tempRoot, `performance-${count}.mapproj`);
    await fs.writeFile(fixturePath, JSON.stringify(project), "utf8");
    await evaluate(win, "window.mapSchematicPerformance.reset(); document.getElementById('loadBtn').click()");
    await poll(win, `document.getElementById('status').textContent.includes(${JSON.stringify(fixturePath)})`, "project load");
    await delay(100);
    const load = await evaluate(win, "window.mapSchematicPerformance.snapshot()");
    assertMetrics(load, ["overlay.rebuild", "overlay.textMeasure"]);
    const targetExpression = `(() => {
      const stage = document.querySelector('.map-stage').getBoundingClientRect();
      return [...document.querySelectorAll('[data-marker="dot"][data-id="bench-0"]')]
        .map(el => el.getBoundingClientRect()).find(r => r.width && r.left > stage.left && r.right < stage.right && r.top > stage.top && r.bottom < stage.bottom);
    })()`;
    const target = await evaluate(win, `(() => { const r = ${targetExpression}; return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null; })()`);
    if (!target) throw new Error("Drag target is not visible");
    const input = await evaluate(win, `(() => {
      const candidates = [...document.querySelectorAll('[data-marker="dot-hit"][data-id="bench-0"]')];
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        const point = { x: Math.round(r.x + r.width * 0.2), y: Math.round(r.y + r.height / 2) };
        if (document.elementFromPoint(point.x, point.y) === el) return point;
      }
      return null;
    })()`);
    if (!input) throw new Error("Drag hit area is not visible or is occluded");
    const nodes = await evaluate(win, "document.querySelectorAll('svg [data-order-key]').length");
    const uniqueObjects = await evaluate(win, "new Set([...document.querySelectorAll('svg [data-order-key]')].map(el => el.getAttribute('data-order-key'))).size");
    if (uniqueObjects !== count || nodes < count) throw new Error("Objects did not render completely");
    if (!await evaluate(win, "document.getElementById('undoBtn').disabled")) throw new Error("Fixture history must start empty");
    await evaluate(win, `(() => {
      window.mapSchematicPerformance.reset();
      window.__perfFrames = { active: true, last: null };
      function frame(now) {
        const state = window.__perfFrames;
        if (!state.active) return;
        if (state.last !== null) window.mapSchematicPerformance.recordFrame(now - state.last);
        state.last = now;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })()`);
    win.webContents.sendInputEvent({ type: "mouseMove", ...input });
    win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...input });
    for (let step = 1; step <= 20; step++) {
      win.webContents.sendInputEvent({ type: "mouseMove", x: input.x + step * 2, y: input.y + step });
      await delay(20);
      // Wait for each handler so event coalescing cannot reduce the sample count.
      await poll(win, `window.mapSchematicPerformance.snapshot()['interaction.dragUpdate']?.count >= ${step}`, "drag update");
    }
    win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: input.x + 40, y: input.y + 20 });
    await delay(100);
    const drag = await evaluate(win, "window.__perfFrames.active = false; window.mapSchematicPerformance.snapshot()");
    assertMetrics(drag, ["interaction.dragUpdate", "overlay.rebuild", "overlay.textMeasure", "interaction.frameInterval"]);
    const moved = await evaluate(win, `(() => { const r = ${targetExpression}; return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!moved || Math.abs(moved.x - target.x - 40) > 3 || Math.abs(moved.y - target.y - 20) > 3) throw new Error("Drag did not reach the expected position");
    await evaluate(win, "document.getElementById('undoBtn').click()");
    await delay(100);
    const restored = await evaluate(win, `(() => { const r = ${targetExpression}; return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!restored || Math.abs(restored.x - target.x) > 2 || Math.abs(restored.y - target.y) > 2) throw new Error("Undo did not restore the drag target");
    if (!await evaluate(win, "document.getElementById('undoBtn').disabled")) throw new Error("One drag must produce exactly one undo entry");
    cases.push({ objectCount: count, renderedObjectGroups: nodes, renderedUniqueObjects: uniqueObjects, load, drag, dragAndUndoVerified: true });
  }
  const report = {
    reportVersion: 1, scenarioVersion: SCENARIO_VERSION, generatedAt: new Date().toISOString(),
    environment: { versions: process.versions, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem(), viewport: [1200, 880],
      devicePixelRatio: await evaluate(win, "window.devicePixelRatio"),
      build: JSON.parse(await fs.readFile(path.join(root, "out/build-info.json"), "utf8")) },
    datapack: { id: pack.id, version: pack.version },
    startupWallMs, startup, mainBasemapReadsMs: reads, cases,
  };
  const output = path.join(root, "performance-results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(`Performance run passed. Report: ${output}`);
}

require(path.join(root, "out/main/index.js"));
