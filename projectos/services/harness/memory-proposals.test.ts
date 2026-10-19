import { describe, expect, it } from "vitest";

import {
  memoryProposalSkipReason,
  parseMemoryProposalOutput,
} from "./memory-proposals.js";

const ready = {
  enabled: true,
  generateMemories: true,
  runStatus: "complete",
  userText: "x".repeat(80),
  usedMcp: false,
  verificationFailed: false,
  rolledBack: false,
};

describe("memory proposals", () => {
  it("skips short, failed, child, and external runs", () => {
    expect(memoryProposalSkipReason(ready)).toBeNull();
    expect(memoryProposalSkipReason({ ...ready, userText: "too short" })).toBe("short_run");
    expect(memoryProposalSkipReason({ ...ready, parentRunId: "run_parent" })).toBe("child_run");
    expect(memoryProposalSkipReason({ ...ready, usedMcp: true })).toBe("external_context");
    expect(memoryProposalSkipReason({ ...ready, verificationFailed: true })).toBe("failed_run");
    expect(memoryProposalSkipReason({ ...ready, rolledBack: true })).toBe("failed_run");
    expect(memoryProposalSkipReason({ ...ready, runStatus: "error" })).toBe("not_successful");
    expect(memoryProposalSkipReason({ ...ready, generateMemories: false })).toBe("disabled");
  });

  it("parses at most three notes and drops invalid json", () => {
    const raw = [
      "```json",
      JSON.stringify({
        notes: [
          { type: "user", text: "prefers bun" },
          { type: "feedback", text: " " },
          { type: "project", text: "keep diffs small" },
          { type: "reference", text: "fourth is dropped by schema" },
        ],
      }),
      "```",
    ].join("\n");
    expect(parseMemoryProposalOutput(raw).map((note) => note.text)).toEqual([
      "prefers bun",
      "keep diffs small",
    ]);
    expect(parseMemoryProposalOutput("not json")).toEqual([]);
  });
});
