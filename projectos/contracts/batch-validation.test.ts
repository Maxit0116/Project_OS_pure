import { describe, expect, it } from "vitest";

import { BatchValidationResultSchema } from "./batch-validation.js";

const validResult = {
  version: "0.1.0" as const,
  parentRunId: "run_parent",
  planId: "plan_one",
  contextBundleHash: `sha256:${"a".repeat(64)}`,
  verdict: "valid" as const,
  tasks: [{
    taskId: "task_1",
    childRunId: "run_child",
    path: "src/a.ts",
    status: "consistent" as const,
    criteria: [{ criterion: "Exports stay compatible", status: "satisfied" as const }],
    summary: "The proposal satisfies its delegated task.",
  }],
  crossFileAssessment: {
    status: "consistent" as const,
    summary: "The proposals agree on their shared interface.",
  },
  summary: "The batch is valid.",
  rationale: "Every delegated criterion was checked.",
};

describe("BatchValidationResultSchema", () => {
  it("accepts bounded semantic evidence without write authority", () => {
    expect(BatchValidationResultSchema.parse(validResult)).toEqual(validResult);
  });

  it("rejects modified diffs, source text, and commit authority", () => {
    expect(BatchValidationResultSchema.safeParse({
      ...validResult,
      modifiedDiff: { files: [{ path: "src/a.ts", after: "secret source" }] },
    }).success).toBe(false);
    expect(BatchValidationResultSchema.safeParse({
      ...validResult,
      canCommit: true,
    }).success).toBe(false);
  });
});
