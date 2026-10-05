import { describe, expect, it } from "vitest";
import { validateProject } from "../../src/shared/schema/validate";
import { mapProjectToEditorDocument } from "../../src/renderer/project/project-adapter";
import { createPerformanceProject, DEFAULT_COUNTS } from "./scenarios";

describe("fixed performance scenarios", () => {
  for (const count of DEFAULT_COUNTS) {
    it(`builds ${count} valid editable mixed objects deterministically`, () => {
      const pack = { id: "standard", version: "2026.02" };
      const project = createPerformanceProject(count, pack);
      expect(validateProject(project)).toEqual({ valid: true, errors: [] });
      expect(project).toEqual(createPerformanceProject(count, pack));
      expect(new Set(project.objects.map((object) => object.id)).size).toBe(count);
      expect(new Set(project.objects.map((object) => object.type)).size).toBe(5);
      expect(project.objects.some((object) => (object.text?.length ?? 0) > 80)).toBe(true);
      const loaded = mapProjectToEditorDocument(project);
      expect(loaded.document.objects).toHaveLength(count);
      expect(loaded.preservedObjects).toEqual([]);
    });
  }
  it("rejects invalid or excessive workload sizes", () => {
    for (const count of [0, 4, 5.5, 5001, Infinity, NaN]) {
      expect(() => createPerformanceProject(count, { id: "standard", version: "test" })).toThrow(RangeError);
    }
  });
});
