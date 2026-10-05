import { describe, expect, it } from "vitest";

import { AgentProposalValidationResultSchema } from "./agent-validation.js";

function validResult() {
  return {
    version: "0.1.0",
    runId: "run_validation",
    path: "app/login/page.tsx",
    contextBundleHash: `sha256:${"1".repeat(64)}`,
    selectedFileSha256: `sha256:${"2".repeat(64)}`,
    verdict: "valid",
    criteria: [{
      criterion: "Login works",
      status: "satisfied",
      explanation: "The proposal implements the requested behavior.",
    }],
    scopeAssessment: {
      status: "compliant",
      explanation: "Only the authorized file changes.",
    },
    summary: "The proposal satisfies the plan.",
    rationale: "The scoped edit meets the criterion.",
  } as const;
}

describe("agent proposal validation contract", () => {
  it("binds semantic evidence to the run, bundle, file snapshot, and path", () => {
    expect(AgentProposalValidationResultSchema.parse(validResult())).toEqual(validResult());
  });

  it("rejects diff mutations and untyped authority fields", () => {
    expect(AgentProposalValidationResultSchema.safeParse({
      ...validResult(),
      expandedWritePaths: ["lib/auth.ts"],
    }).success).toBe(false);
    expect(AgentProposalValidationResultSchema.safeParse({
      ...validResult(),
      proposal: { files: [{ path: "lib/auth.ts" }] },
    }).success).toBe(false);
  });
});
