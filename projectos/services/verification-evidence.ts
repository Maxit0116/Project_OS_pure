import type { ToolResult } from "../contracts/tool-result.js";
import {
  VerificationEvidenceSchema,
  type VerificationEvidence,
  type VerificationEvidenceReason,
} from "../contracts/verification-evidence.js";

export interface VerificationEvidenceCommand {
  result: ToolResult;
  timedOut?: boolean;
}

/**
 * Compare a leaf FileEditPlan with paths the transaction actually wrote.
 * Paths are repo-relative. A missing plan does not invent unexpected files.
 */
export function unexpectedWritePaths(
  plannedPaths: readonly string[],
  writtenPaths: readonly string[],
): string[] {
  if (plannedPaths.length === 0) return [];
  const planned = new Set(plannedPaths.map(normalizeRepoPath));
  const unexpected: string[] = [];
  for (const path of writtenPaths) {
    const normalized = normalizeRepoPath(path);
    if (!normalized || planned.has(normalized) || unexpected.includes(normalized)) continue;
    unexpected.push(normalized);
  }
  return unexpected;
}

/**
 * Related tests come only from a symbol index (CI-3).
 * Without that index this returns nothing, and it never becomes a shell
 * command or a write path.
 */
/**
 * H5 may regenerate once only for a command failure or timeout.
 * Missing commands, policy denial, and writes outside the plan stay terminal.
 */
export function verificationFailureAllowsRepair(
  evidence: VerificationEvidence | undefined,
  repairAttempt: number,
): boolean {
  if (repairAttempt >= 1 || !evidence || evidence.status !== "failed") return false;
  if (evidence.unexpectedPaths.length > 0) return false;
  return evidence.reason === "command_failed" || evidence.reason === "timed_out";
}

export function suggestRelatedTests(input: {
  symbolIndexAvailable: boolean;
  relatedTestPaths?: readonly string[];
}): string[] {
  if (!input.symbolIndexAvailable) return [];
  return [...new Set((input.relatedTestPaths ?? []).map(normalizeRepoPath).filter(Boolean))];
}

export function buildVerificationEvidence(input: {
  runId: string;
  commands?: readonly VerificationEvidenceCommand[];
  blockedReason?: Extract<
    VerificationEvidenceReason,
    "not_configured" | "approval_required" | "policy_denied"
  >;
  plannedPaths?: readonly string[];
  writtenPaths?: readonly string[];
  symbolIndexAvailable?: boolean;
  relatedTestPaths?: readonly string[];
  acceptanceCriteria?: readonly string[];
}): VerificationEvidence {
  const commands = [...(input.commands ?? [])];
  const unexpectedPaths = unexpectedWritePaths(
    input.plannedPaths ?? [],
    input.writtenPaths ?? [],
  );
  const suggestedTests = suggestRelatedTests({
    symbolIndexAvailable: input.symbolIndexAvailable === true,
    relatedTestPaths: input.relatedTestPaths,
  });
  const acceptanceCriteria = input.acceptanceCriteria
    ? [...input.acceptanceCriteria]
    : undefined;

  let status: VerificationEvidence["status"];
  let reason: VerificationEvidenceReason;

  if (commands.length === 0 || input.blockedReason) {
    if (unexpectedPaths.length > 0) {
      status = "failed";
      reason = "unexpected_paths";
    } else {
      status = "not_run";
      reason = input.blockedReason ?? "not_configured";
    }
  } else if (commands.some((command) => command.timedOut)) {
    status = "failed";
    reason = "timed_out";
  } else if (commands.some((command) => command.result.exitCode !== 0)) {
    status = "failed";
    reason = "command_failed";
  } else if (commands.some((command) => command.result.truncated)) {
    status = "failed";
    reason = "output_truncated";
  } else if (unexpectedPaths.length > 0) {
    status = "failed";
    reason = "unexpected_paths";
  } else {
    status = "passed";
    reason = "commands_passed";
  }

  return VerificationEvidenceSchema.parse({
    evidenceId: `evidence_${input.runId}`,
    runId: input.runId,
    status,
    reason,
    commands: commands.map((command) => command.result),
    unexpectedPaths,
    suggestedTests,
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
  });
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}
