import { describe, expect, it } from "vitest";

import {
  LoopChangeSetSchema,
  LoopDevPlanSchema,
  LoopHumanDecisionSchema,
  LoopReviewResultSchema,
  LoopTestReportSchema,
} from "./loop-artifacts.js";

describe("loop-artifacts", () => {
  it("accepts a structured DevPlan with dependencies", () => {
    const plan = LoopDevPlanSchema.parse({
      goal: "Link Issues with Features",
      tasks: [
        { id: "T1", title: "Update data model", type: "backend", depends_on: [] },
        {
          id: "T2",
          title: "Build feature tree UI",
          type: "frontend",
          depends_on: ["T1"],
        },
      ],
      risks: ["Write conflicts on shared types"],
      expectedArtifacts: ["ChangeSet", "TestReport"],
    });
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[1]?.depends_on).toEqual(["T1"]);
  });

  it("rejects an empty DevPlan task list", () => {
    expect(() =>
      LoopDevPlanSchema.parse({
        goal: "Nope",
        tasks: [],
      }),
    ).toThrow();
  });

  it("parses ChangeSet, TestReport, ReviewResult, and HumanDecision", () => {
    expect(
      LoopChangeSetSchema.parse({
        files: ["src/a.ts"],
        summary: "Added mapping",
        agentRunId: "run_1",
      }).files,
    ).toEqual(["src/a.ts"]);

    expect(
      LoopTestReportSchema.parse({
        status: "failed",
        total: 10,
        passed: 8,
        failed: 2,
        failedTests: ["a.test.ts"],
      }).status,
    ).toBe("failed");

    expect(
      LoopReviewResultSchema.parse({
        verdict: "needs_changes",
        issues: [
          {
            id: "i1",
            severity: "warning",
            message: "Missing null check",
          },
        ],
        allowNext: false,
      }).verdict,
    ).toBe("needs_changes");

    expect(
      LoopHumanDecisionSchema.parse({
        mode: "approval",
        choice: "approve",
        editedPayload: { title: "feat: tree" },
        at: "2026-11-03T00:00:00.000Z",
      }).editedPayload,
    ).toEqual({ title: "feat: tree" });
  });
});
