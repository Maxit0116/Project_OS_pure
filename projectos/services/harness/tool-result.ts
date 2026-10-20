import type { HarnessToolName } from "../../contracts/tool-policy.js";
import { HarnessToolNameSchema } from "../../contracts/tool-policy.js";
import type { ToolResult, ToolResultArtifacts } from "../../contracts/tool-result.js";
import { ToolResultSchema } from "../../contracts/tool-result.js";
import type { VerificationCommandResult } from "../../contracts/exec-command.js";
import { redactText } from "../model-gateway/redaction.js";

const SUMMARY_LIMIT = 400;

export function sealToolResult(result: ToolResult): ToolResult {
  return ToolResultSchema.parse(result);
}

export function deniedToolResult(
  tool: HarnessToolName,
  reason: string,
): ToolResult {
  const summary = boundSummary(reason.trim() || "Denied. Command was not run.");
  return sealToolResult({
    tool,
    ok: false,
    exitCode: null,
    summary,
    output: summary,
    truncated: false,
  });
}

/**
 * Map a harness shell / verification capture onto the shared envelope.
 * Timeout always reports `exitCode: null`. A non-zero exit is never summarized
 * as passed, even when the output cannot be parsed.
 */
export function shellCommandToToolResult(
  tool: Extract<HarnessToolName, "shell" | "run_verification">,
  result: VerificationCommandResult & {
    blocked?: boolean;
    cancelled?: boolean;
    processCleanup?: "process-group" | "direct-child-only" | "failed";
    protectedPathsChanged?: boolean;
    concurrencyRejected?: boolean;
  },
): ToolResult {
  const truncated = result.outputTruncated;
  const rawOutput = result.output ?? "";
  const output = redactText(rawOutput, "secrets_and_paths");
  const blocked = Boolean(result.blocked);
  const timedOut = result.timedOut;
  const cancelled = Boolean(result.cancelled);
  const concurrencyRejected = Boolean(result.concurrencyRejected);
  const protectedPathsChanged = Boolean(result.protectedPathsChanged);
  const cleanupFailed = result.processCleanup === "failed";
  const exitCode = blocked || timedOut || cancelled ? null : result.exitCode;

  let summary: string;
  if (concurrencyRejected) {
    summary = "Concurrency limit reached. Command was not run.";
  } else if (blocked && cancelled) {
    summary = "Cancelled. Command was not run.";
  } else if (blocked) {
    summary = result.output?.includes("tool_policy_ask") || result.output?.includes("shell_sandbox_ask")
      ? "Approval required. Command was not run."
      : "Denied. Command was not run.";
  } else if (cancelled) {
    summary = "Cancelled before the command exited.";
  } else if (timedOut) {
    summary = truncated
      ? "Timed out before the command exited. Output truncated."
      : "Timed out before the command exited.";
  } else {
    const code = exitCode === null ? "unavailable" : String(exitCode);
    const parts = [`Exit code ${code}.`];
    if (exitCode !== 0 && exitCode !== null) {
      const failed = parseFailedTestCount(rawOutput);
      if (failed !== null && failed > 0) parts.push(`${failed} failed.`);
    }
    if (truncated) parts.push("Output truncated.");
    summary = parts.join(" ");
  }

  const notes: string[] = [];
  if (!concurrencyRejected && protectedPathsChanged) {
    notes.push("Protected files changed. Review them before continuing.");
  }
  if (cleanupFailed) notes.push("Process cleanup failed.");
  else if (
    result.processCleanup === "direct-child-only" &&
    (timedOut || cancelled) &&
    !blocked
  ) {
    notes.push("Process cleanup was limited to the direct child.");
  }
  if (notes.length > 0) summary = `${summary} ${notes.join(" ")}`;

  return sealToolResult({
    tool,
    ok:
      !blocked &&
      !timedOut &&
      !cancelled &&
      !concurrencyRejected &&
      !protectedPathsChanged &&
      !cleanupFailed &&
      exitCode === 0,
    exitCode,
    summary: boundSummary(summary),
    output,
    truncated,
  });
}

/**
 * Apply stays on the transaction path. A rejection lists no written paths
 * and does not invent a backup id.
 */
export function applyDiffToToolResult(input: {
  written: boolean;
  paths?: readonly string[];
  backupId?: string;
  additions?: number;
  deletions?: number;
  reason?: string;
}): ToolResult {
  if (!input.written) {
    const summary = boundSummary(
      input.reason?.trim() || "Apply rejected. No files were written.",
    );
    return sealToolResult({
      tool: "apply_diff",
      ok: false,
      exitCode: null,
      summary,
      output: summary,
      truncated: false,
    });
  }

  const paths = [...(input.paths ?? [])];
  const files = paths.length;
  const additions = input.additions ?? 0;
  const deletions = input.deletions ?? 0;
  const artifacts: ToolResultArtifacts = {
    ...(paths.length > 0 ? { paths } : {}),
    diffStats: { files, additions, deletions },
    ...(input.backupId ? { backupId: input.backupId } : {}),
  };
  const summary = boundSummary(
    `Wrote ${files} file(s)${input.backupId ? ` (backup ${input.backupId})` : ""}.`,
  );
  return sealToolResult({
    tool: "apply_diff",
    ok: true,
    exitCode: 0,
    summary,
    output: summary,
    truncated: false,
    artifacts,
  });
}

export function knownHarnessTool(tool: string): HarnessToolName | null {
  const parsed = HarnessToolNameSchema.safeParse(tool);
  return parsed.success ? parsed.data : null;
}

function boundSummary(summary: string): string {
  const redacted = redactText(summary, "secrets_and_paths").replace(/\s+/g, " ").trim();
  if (redacted.length <= SUMMARY_LIMIT) return redacted;
  return `${redacted.slice(0, SUMMARY_LIMIT - 1)}…`;
}

/**
 * Read a failure count only from a test-runner summary line.
 * Returns null when the output does not contain one. Callers must not treat
 * null as a pass.
 */
export function parseFailedTestCount(output: string): number | null {
  for (const line of output.split("\n")) {
    if (!/\bTests\b/.test(line)) continue;
    const match = line.match(/(\d+)\s+failed\b/);
    if (match) return Number(match[1]);
  }
  const mocha = output.match(/(\d+)\s+failing\b/);
  if (mocha) return Number(mocha[1]);
  return null;
}
