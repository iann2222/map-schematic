import { describe, expect, it } from "vitest";

import {
  parseBuildInfo,
  UNKNOWN_COMMIT_SHA
} from "../../src/shared/build-info";

describe("build info contract", () => {
  it("normalizes valid generated build information", () => {
    const commitSha = "ABCDEF1234567890ABCDEF1234567890ABCDEF12";

    expect(
      parseBuildInfo(
        {
          version: " 0.2.0 ",
          commitSha,
          shortCommitSha: "ignored",
          dirty: false
        },
        "0.1.0"
      )
    ).toEqual({
      version: "0.2.0",
      commitSha: commitSha.toLowerCase(),
      shortCommitSha: "abcdef123456",
      dirty: false
    });
  });

  it("uses safe fallback values for missing build information", () => {
    expect(parseBuildInfo(null, "0.1.0")).toEqual({
      version: "0.1.0",
      commitSha: UNKNOWN_COMMIT_SHA,
      shortCommitSha: UNKNOWN_COMMIT_SHA,
      dirty: null
    });
  });

  it("does not trust malformed commit metadata", () => {
    expect(
      parseBuildInfo(
        {
          version: "",
          commitSha: "../not-a-commit",
          dirty: "false"
        },
        "0.1.0"
      )
    ).toEqual({
      version: "0.1.0",
      commitSha: UNKNOWN_COMMIT_SHA,
      shortCommitSha: UNKNOWN_COMMIT_SHA,
      dirty: null
    });
  });
});
