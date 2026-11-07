import { describe, expect, it } from "vitest";

import {
  applyBugAlignmentPatches,
  buildBugAlignmentItems,
  markBugItemFixed,
  needsBugAlignment,
  splitBugDescriptions,
} from "./debug-session-service.js";
import type { DebugSession } from "../contracts/debug-session.js";

function sessionWithBugs(description: string): DebugSession {
  const sessionId = "debug_test";
  const bugs = buildBugAlignmentItems(sessionId, description);
  return {
    version: "0.1.0",
    sessionId,
    projectId: "proj",
    scope: { kind: "global" },
    bugDescription: description,
    reproSteps: ["repro"],
    hypotheses: [],
    instrumentation: [],
    logEntries: [],
    phase: needsBugAlignment(bugs) ? "align" : "hypothesize",
    verification: { status: "not_run" },
    bugs,
    bugsAligned: !needsBugAlignment(bugs),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("debug bug alignment", () => {
  it("splits numbered multi-bug descriptions", () => {
    const parts = splitBugDescriptions(
      "1. Login button does nothing\n2. Settings page crashes on save",
    );
    expect(parts).toHaveLength(2);
    expect(needsBugAlignment(buildBugAlignmentItems("s", parts.join("\n")))).toBe(true);
  });

  it("requires alignment confirmation before proceeding", () => {
    const session = sessionWithBugs(
      "1. Null pointer in auth\n2. Flash of wrong theme on load",
    );
    expect(session.phase).toBe("align");
    const confirmed = applyBugAlignmentPatches(session, [
      { id: session.bugs![0]!.id, selected: true, comment: "Only on Safari" },
      { id: session.bugs![1]!.id, selected: false, rejected: true },
    ]);
    expect(confirmed.bugsAligned).toBe(true);
    expect(confirmed.phase).toBe("hypothesize");
    expect(confirmed.bugDescription).toContain("Null pointer");
    expect(confirmed.bugDescription).toContain("Only on Safari");
    expect(confirmed.bugs?.find((bug) => bug.status === "rejected")).toBeTruthy();
  });

  it("marks individual bugs fixed and completes when none remain", () => {
    const session = applyBugAlignmentPatches(
      sessionWithBugs("1. Bug A\n2. Bug B"),
      [
        { id: "debug_test_bug_1", selected: true },
        { id: "debug_test_bug_2", selected: true },
      ],
    );
    const afterFirst = markBugItemFixed(session, "debug_test_bug_1");
    expect(afterFirst.bugs?.find((bug) => bug.id === "debug_test_bug_1")?.status).toBe(
      "fixed",
    );
    expect(afterFirst.phase).not.toBe("complete");
    const afterSecond = markBugItemFixed(afterFirst, "debug_test_bug_2");
    expect(afterSecond.phase).toBe("complete");
  });
});
