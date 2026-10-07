const fs = require("node:fs/promises");
const path = require("node:path");
const { nativeImage } = require("electron");

module.exports = async function verifyUi(win, tempRoot, poll) {
  const evaluate = async (fn, ...args) => {
    const result = await win.webContents.executeJavaScript(`(async () => {
      try { return { value: await (${fn.toString()})(...${JSON.stringify(args)}) }; }
      catch (error) { return { error: error.stack ?? String(error) }; }
    })()`, true);
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  const click = (selector) => evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing UI control: ${selector}`);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, selector);
  const input = (id, value, type = "input") => evaluate((id, value, type) => {
    const element = document.getElementById(id);
    if (!element || element.disabled) throw new Error(`Unavailable inspector input: ${id}`);
    element.value = value;
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }, id, value, type);
  const settle = () => evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const labelSelector = '[data-marker="label"][data-id="bench-0"]';

  await evaluate(() => {
    window.__regressionStable = [...document.querySelectorAll('[data-order-key="marker:bench-5"]')].map(node => node.querySelector('[data-marker="dot"]'));
  });
  await click(labelSelector);
  await input("markerLabelInput", "Edited annotation for cache verification");
  await input("markerTextColor", "#2563eb");
  const previousFont = await evaluate((selector) => document.querySelector(selector).getAttribute("font-family"), labelSelector);
  const nextFont = await evaluate(() => [...document.getElementById("markerFont").options].find(option => option.value !== document.getElementById("markerFont").value)?.value);
  check(nextFont, "No alternate font option");
  await input("markerFont", nextFont, "change");
  await settle();
  check(await evaluate((selector, font) => [...document.querySelectorAll(selector)].every(label => label.textContent === "Edited annotation for cache verification" && label.getAttribute("fill") === "#2563eb" && label.getAttribute("font-family") === font), labelSelector, nextFont), "Marker text, color or font was not synchronized");
  await click("#undoBtn");
  check(await evaluate((selector, font) => document.querySelector(selector).getAttribute("font-family") === font, labelSelector, previousFont), "Font undo failed");
  await click("#redoBtn");
  await settle();
  check(await evaluate((selector, font) => document.querySelector(selector).getAttribute("font-family") === font, labelSelector, nextFont), "Font redo failed");
  check(await evaluate(() => [...document.querySelectorAll('[data-order-key="marker:bench-5"]')].every((node, index) => node.querySelector('[data-marker="dot"]') === window.__regressionStable[index])), "An unrelated object was rebuilt during property edits");

  await click('[data-shape="text"][data-id="bench-1"]');
  await input("shapeTextInput", "Longer standalone text with a refreshed hit area");
  await input("shapeTextColor", "#dc2626");
  await click('[data-shape="line"][data-id="bench-2"]');
  await input("shapeLineRotation", "90");
  check(await evaluate(() => [...document.querySelectorAll('[data-shape="line"][data-id="bench-2"]')].every(node => node.getAttribute("transform").startsWith("rotate(90.00 "))), "Line rotation was not synchronized");
  await click('[data-shape="arrow"][data-id="bench-3"]');
  await input("shapeArrowRotation", "135");
  check(await evaluate(() => [...document.querySelectorAll('[data-shape="arrow"][data-id="bench-3"]')].every(node => node.getAttribute("transform").startsWith("rotate(135.00 "))), "Arrow rotation was not synchronized");
  await click('[data-shape="area"][data-id="bench-4"]');
  await input("shapeAreaFill", "#22c55e");

  await click('[data-step-jump="0"]');
  await click("#toolZoomIn");
  await click('[data-step-jump="3"]');
  win.setContentSize(1120, 820);
  await settle();
  check(await evaluate(() => {
    for (const label of document.querySelectorAll('text[data-marker="label"], text[data-shape="text"]')) {
      const hit = [...label.parentElement.children].find(node => node.getAttribute("data-export-ignore") === "true" && node.tagName === "rect");
      const box = label.getBBox();
      if (!hit || box.width <= 0 || Number(hit.getAttribute("x")) > box.x + 0.1 || Number(hit.getAttribute("y")) > box.y + 0.1 || Number(hit.getAttribute("width")) < box.width - 0.1 || Number(hit.getAttribute("height")) < box.height - 0.1 || Number(hit.getAttribute("width")) - box.width > 5) return false;
    }
    return true;
  }), "Text hit areas became stale after edits, zoom or resize");

  const originalOrder = await evaluate(() => [...document.querySelector('g[data-wrap="object-0"]').children].map(node => node.getAttribute("data-order-key")));
  await click("#listOrderSettingsBtn");
  await click('#displayOrderList [data-key="marker:bench-0"] button:last-child');
  await click("#listOrderClose");
  check(await evaluate(() => [...document.querySelectorAll('g[data-wrap]')].filter(node => node.getAttribute('data-wrap').startsWith('object-')).every(node => node.lastElementChild.getAttribute("data-order-key") === "marker:bench-0")), "Cross-kind display ordering failed");
  await click("#undoBtn");
  check(await evaluate((order) => JSON.stringify([...document.querySelector('g[data-wrap="object-0"]').children].map(node => node.getAttribute("data-order-key"))) === JSON.stringify(order), originalOrder), "Display order undo failed");

  const burst = await evaluate(() => {
    const world = document.querySelector('g[data-wrap="object-0"]');
    const before = world.querySelector('[data-marker="dot"][data-id="bench-0"]').getBoundingClientRect();
    const hit = world.querySelector('[data-marker="dot-hit"][data-id="bench-0"]');
    const rect = hit.getBoundingClientRect();
    const x = rect.x + rect.width * 0.2; const y = rect.y + rect.height / 2;
    window.mapSchematicPerformance.reset();
    hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: x, clientY: y }));
    for (let step = 1; step <= 10; step++) {
      document.getElementById("map").dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: x + step * 2, clientY: y + step }));
    }
    document.getElementById("map").dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: x + 20, clientY: y + 10 }));
    const after = world.querySelector('[data-marker="dot"][data-id="bench-0"]').getBoundingClientRect();
    const metrics = window.mapSchematicPerformance.snapshot();
    return { beforeX: before.x, beforeY: before.y, dx: after.x - before.x, dy: after.y - before.y, updates: metrics['interaction.dragUpdate']?.count, renders: metrics['overlay.rebuild']?.count };
  });
  check(burst.updates === 10 && burst.renders <= 3 && Math.abs(burst.dx - 20) < 1 && Math.abs(burst.dy - 10) < 1, "Burst drag was not coalesced or the final update was lost");
  await settle();
  check(await evaluate((count) => window.mapSchematicPerformance.snapshot()['overlay.rebuild'].count === count, burst.renders), "A stale animation frame rendered after mouseup");
  await click("#undoBtn");
  check(await evaluate((x, y) => {
    const rect = document.querySelector('g[data-wrap="object-0"] [data-marker="dot"][data-id="bench-0"]').getBoundingClientRect();
    return Math.abs(rect.x - x) < 1 && Math.abs(rect.y - y) < 1;
  }, burst.beforeX, burst.beforeY), "Burst drag was not undone as one operation");

  const exports = {};
  for (const format of ["svg", "png", "pdf"]) {
    await click(`#completeExport${format[0].toUpperCase()}${format.slice(1)}`);
    if (format !== "svg") {
      await poll(win, "document.getElementById('exportFrameModal').classList.contains('active')", "export frame dialog");
      await click('[data-export-frame="none"]');
      await click("#exportFrameApply");
    }
    const output = path.join(tempRoot, `regression.${format}`);
    await poll(win, `document.getElementById('status').textContent.includes(${JSON.stringify(output)})`, `${format} export`);
    const bytes = await fs.readFile(output);
    if (format === "svg") {
      check(await evaluate((data) => {
        const svg = new DOMParser().parseFromString(data, "image/svg+xml");
        return !svg.querySelector("parsererror") && svg.querySelector("path") && !svg.querySelector("image") && !svg.querySelector('[data-export-ignore="true"]') && svg.querySelector('[data-marker="label"][data-id="bench-0"]')?.textContent === "Edited annotation for cache verification" && svg.querySelector('[data-shape="text"][data-id="bench-1"]')?.textContent === "Longer standalone text with a refreshed hit area";
      }, bytes.toString("utf8")), "Vector SVG output was incomplete or contained interaction artifacts");
    } else if (format === "png") {
      const image = nativeImage.createFromBuffer(bytes);
      check(!image.isEmpty(), "PNG output could not be decoded");
      const pixels = image.toBitmap();
      const samples = new Set();
      const stride = Math.max(4, Math.floor(pixels.length / 1000 / 4) * 4);
      for (let index = 0; index + 3 < pixels.length; index += stride) samples.add(pixels.readUInt32LE(index));
      check(samples.size > 10, "PNG output was blank");
      exports.pngSize = image.getSize();
    } else {
      check(bytes.subarray(0, 5).toString() === "%PDF-", "PDF output was invalid");
    }
    exports[format] = true;
  }
  return { propertyEdits: true, nodeReuse: true, textBounds: true, zoomAndResize: true, rotation: true, orderAndUndo: true, burstDragAndFlush: true, exports };
};
