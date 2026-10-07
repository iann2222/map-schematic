module.exports = async function verifyInspectorCoverage(win, loadProject, createProject, pack) {
  const regions = [
    { west: 110, east: 150, south: 15, north: 55, crossesAntimeridian: false },
    { west: 170, east: -170, south: -25, north: 40, crossesAntimeridian: true },
    { west: -155, east: -130, south: 50, north: 70, crossesAntimeridian: false },
  ];
  for (const [index, bbox] of regions.entries()) {
    console.log(`Verifying inspector extent ${index + 1}/${regions.length}...`);
    const project = createProject(5, pack);
    project.objects = [];
    project.viewport.bbox = bbox;
    await loadProject(project, `coverage-${index}`);
    for (const width of [900, 1440]) {
      win.setContentSize(width, 820);
      for (const collapsed of [true, false, true, false]) {
        const result = await win.webContents.executeJavaScript(`(async () => {
          document.getElementById(${JSON.stringify(collapsed ? "inspectorCollapse" : "inspectorExpand")}).click();
          const panel = document.querySelector('.inspector-panel');
          while (panel.getAnimations({ subtree: true }).length) {
            await Promise.all(panel.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
          }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const { project, unwrappedLongitudeBounds } = await import('./map/geometry.js');
          const bbox = ${JSON.stringify(bbox)};
          const bounds = unwrappedLongitudeBounds(bbox);
          const root = document.querySelector('[data-layer="map-root"]');
          const stage = document.querySelector('.map-stage').getBoundingClientRect();
          const matrix = root.getScreenCTM();
          const point = (lon, lat) => {
            const [x, y] = project(lon, lat, 1200, 800);
            return new DOMPoint(x, y).matrixTransform(matrix);
          };
          const topLeft = point(bounds.west, bbox.north);
          const bottomRight = point(bounds.east, bbox.south);
          const epsilon = 1;
          const centered = Math.abs((topLeft.x + bottomRight.x) / 2 - (stage.left + stage.width / 2)) < epsilon
            && Math.abs((topLeft.y + bottomRight.y) / 2 - (stage.top + stage.height / 2)) < epsilon;
          const complete = topLeft.x >= stage.left - epsilon && topLeft.y >= stage.top - epsilon
            && bottomRight.x <= stage.right + epsilon && bottomRight.y <= stage.bottom + epsilon;
          const filled = Math.max((bottomRight.x - topLeft.x) / stage.width, (bottomRight.y - topLeft.y) / stage.height) > 0.99;
          return { centered, complete, filled,
            clean: document.getElementById('projectStateText').textContent === '已儲存',
            emptyHistory: document.getElementById('undoBtn').disabled };
        })()`, true);
        if (Object.values(result).some(value => !value)) {
          throw new Error(`Inspector extent mismatch: ${JSON.stringify({ bbox, width, collapsed, result })}`);
        }
      }
    }
  }
  win.setContentSize(1200, 880);
  return { regions: regions.length, repeatedToggleCoverage: true };
};
