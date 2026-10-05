import { PerformanceRecorder } from "./recorder.js";

const enabled = typeof window !== "undefined" &&
  new URLSearchParams(window.location?.search ?? "").get("performance") === "1";

export const rendererPerformance = new PerformanceRecorder(enabled);

if (enabled) {
  // Diagnostic mode exposes metrics only, never the editor or project state.
  Object.defineProperty(window, "mapSchematicPerformance", {
    value: Object.freeze({
      reset: () => rendererPerformance.reset(),
      snapshot: () => rendererPerformance.snapshot(),
      recordFrame: (ms: number) => rendererPerformance.record("interaction.frameInterval", ms),
    }),
  });
}
