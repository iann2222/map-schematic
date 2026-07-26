import { describe, expect, it } from "vitest";

import {
  createEmptyProjectHistory,
  migrateLegacyProjectHistory,
  validateProjectHistory
} from "../../src/shared/schema/history";

function createCommand(): Record<string, unknown> {
  return {
    type: "update-object",
    objectId: "point-1",
    objectKind: "marker",
    changes: [
      {
        path: ["name"],
        before: { present: true, value: "Taipei" },
        after: { present: true, value: "Taipei City" }
      }
    ]
  };
}

describe("project history schema", () => {
  it("accepts the versioned command contract", () => {
    expect(
      validateProjectHistory({
        historyVersion: 1,
        undo: [createCommand()],
        redo: []
      })
    ).toEqual({ valid: true, errors: [] });
  });

  it("rejects unsupported commands and unsafe field paths", () => {
    const unsupported = validateProjectHistory({
      historyVersion: 1,
      undo: [{ type: "future-command" }],
      redo: []
    });
    const unsafe = validateProjectHistory({
      historyVersion: 1,
      undo: [
        {
          ...createCommand(),
          changes: [
            {
              path: ["__proto__"],
              before: { present: false },
              after: { present: true, value: "unsafe" }
            }
          ]
        }
      ],
      redo: []
    });

    expect(unsupported.errors).toEqual([
      {
        path: "history.undo[0].type",
        message: "unsupported history command"
      }
    ]);
    expect(unsafe.errors).toEqual([
      {
        path: "history.undo[0].changes[0].path",
        message: "must be an editable field path"
      }
    ]);
  });

  it("preserves valid legacy stacks and clears malformed ones", () => {
    expect(
      migrateLegacyProjectHistory({
        undo: [createCommand()],
        redo: []
      })
    ).toEqual({
      historyVersion: 1,
      undo: [createCommand()],
      redo: []
    });
    expect(
      migrateLegacyProjectHistory({
        undo: [{ type: "unknown-command" }],
        redo: []
      })
    ).toEqual(createEmptyProjectHistory());
  });
});
