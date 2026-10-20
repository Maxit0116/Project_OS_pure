import { describe, expect, it } from "vitest";

import type { ToolResult } from "../contracts/tool-result.js";
import {
  buildVerificationEvidence,
  suggestRelatedTests,
  unexpectedWritePaths,
  verificationFailureAllowsRepair,
} from "./verification-evidence.js";

function command(overrides: Partial<ToolResult> & { timedOut?: boolean } = {}): {
  result: ToolResult;
  timedOut?: boolean;
} {
  const { timedOut, ...result } = overrides;
  return {
    ...(timedOut ? { timedOut } : {}),
    result: {
      tool: "run_verification",
      ok: true,
      exitCode: 0,
      summary: "Exit code 0.",
      output: "",
      truncated: false,
      ...result,
    },
  };
}

describe("verification evidence (V-0–V-2)", () => {
  it("does not call an unconfigured apply passed", () => {
    const evidence = buildVerificationEvidence({
      runId: "run-1",
      acceptanceCriteria: ["The button submits the form."],
    });
    expect(evidence.status).toBe("not_run");
    expect(evidence.reason).toBe("not_configured");
    expect(evidence.status).not.toBe("passed");
  });

  it("records approval and policy blocks as not_run", () => {
    expect(buildVerificationEvidence({
      runId: "run-1",
      blockedReason: "approval_required",
    }).reason).toBe("approval_required");
    expect(buildVerificationEvidence({
      runId: "run-1",
      blockedReason: "policy_denied",
      commands: [command({ ok: false, exitCode: null, summary: "Denied." })],
    })).toMatchObject({ status: "not_run", reason: "policy_denied" });
  });

  it("fails a non-zero exit and keeps the command envelope", () => {
    const evidence = buildVerificationEvidence({
      runId: "run-1",
      commands: [command({
        ok: false,
        exitCode: 1,
        summary: "Exit code 1. 2 failed.",
        output: "[REDACTED]",
      })],
    });
    expect(evidence).toMatchObject({
      status: "failed",
      reason: "command_failed",
    });
    expect(evidence.commands[0]?.output).toBe("[REDACTED]");
    expect(JSON.stringify(evidence)).not.toContain("npm test output");
  });

  it("fails timeouts and truncated output instead of passing them", () => {
    expect(buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: false, exitCode: null, timedOut: true })],
    }).reason).toBe("timed_out");
    expect(buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: true, exitCode: 0, truncated: true })],
    })).toMatchObject({ status: "failed", reason: "output_truncated" });
  });

  it("fails when the transaction writes a path outside the file plan", () => {
    expect(unexpectedWritePaths(["src/a.ts"], ["src/a.ts"])).toEqual([]);
    expect(unexpectedWritePaths(["src/a.ts"], ["./src/a.ts", "src/b.ts"])).toEqual(["src/b.ts"]);
    expect(unexpectedWritePaths([], ["src/b.ts"])).toEqual([]);

    const evidence = buildVerificationEvidence({
      runId: "run-1",
      commands: [command()],
      plannedPaths: ["src/a.ts"],
      writtenPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(evidence).toMatchObject({
      status: "failed",
      reason: "unexpected_paths",
      unexpectedPaths: ["src/b.ts"],
    });
  });

  it("does not invent related tests or turn them into commands", () => {
    expect(suggestRelatedTests({
      symbolIndexAvailable: false,
      relatedTestPaths: ["src/a.test.ts"],
    })).toEqual([]);

    const allowedWritePaths = ["src/a.ts"];
    const evidence = buildVerificationEvidence({
      runId: "run-1",
      commands: [command()],
      symbolIndexAvailable: false,
      relatedTestPaths: ["src/a.test.ts"],
      plannedPaths: allowedWritePaths,
      writtenPaths: allowedWritePaths,
    });
    expect(evidence.suggestedTests).toEqual([]);
    expect(evidence.commands.map((item) => item.tool)).toEqual(["run_verification"]);
    expect(allowedWritePaths).toEqual(["src/a.ts"]);

    const indexed = buildVerificationEvidence({
      runId: "run-1",
      commands: [command()],
      symbolIndexAvailable: true,
      relatedTestPaths: ["src/a.test.ts"],
    });
    expect(indexed.suggestedTests).toEqual(["src/a.test.ts"]);
    expect(indexed.commands).toHaveLength(1);
    expect(indexed.status).toBe("passed");
  });
});

describe("verification repair gate (H5)", () => {
  it("allows one repair only for a command failure or timeout", () => {
    const failed = buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: false, exitCode: 1, summary: "Exit code 1." })],
    });
    const timedOut = buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: false, exitCode: null, timedOut: true, summary: "Timed out." })],
    });
    expect(verificationFailureAllowsRepair(failed, 0)).toBe(true);
    expect(verificationFailureAllowsRepair(timedOut, 0)).toBe(true);
    expect(verificationFailureAllowsRepair(failed, 1)).toBe(false);
  });

  it("does not repair not_run, truncation, policy denial, or unexpected paths", () => {
    const notRun = buildVerificationEvidence({ runId: "run-1" });
    const truncated = buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: false, truncated: true, summary: "Truncated." })],
    });
    const denied = buildVerificationEvidence({
      runId: "run-1",
      blockedReason: "policy_denied",
    });
    const unexpected = buildVerificationEvidence({
      runId: "run-1",
      commands: [command({ ok: false, exitCode: 1 })],
      plannedPaths: ["src/a.ts"],
      writtenPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(verificationFailureAllowsRepair(notRun, 0)).toBe(false);
    expect(verificationFailureAllowsRepair(truncated, 0)).toBe(false);
    expect(verificationFailureAllowsRepair(denied, 0)).toBe(false);
    expect(unexpected.reason).toBe("command_failed");
    expect(verificationFailureAllowsRepair(unexpected, 0)).toBe(false);
  });
});
