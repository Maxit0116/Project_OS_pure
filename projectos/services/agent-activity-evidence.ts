import type { GeneratedDiffFile } from "../contracts/diff.js";
import type { VerificationCommandResult } from "../contracts/exec-command.js";
import { redactText } from "./model-gateway/redaction.js";

/** Per-stream cap for activity evidence. Shell capture may already be shorter. */
export const TRACE_TEXT_LIMIT = 12_000;

export function boundTraceText(text: string): { text: string; truncated: boolean } {
  const redacted = redactText(text, "secrets_and_paths");
  if (redacted.length <= TRACE_TEXT_LIMIT) {
    return { text: redacted, truncated: false };
  }
  return { text: redacted.slice(0, TRACE_TEXT_LIMIT), truncated: true };
}

export function excerptWindow(
  content: string,
  focusLine?: number,
  radius = 8,
): {
  startLine: number;
  endLine: number;
  excerpt: string;
  truncated: boolean;
} {
  const lines = content.split("\n");
  const focus = focusLine && focusLine > 0 ? Math.min(focusLine, lines.length) : 1;
  const startLine = Math.max(1, focus - radius);
  const endLine = Math.min(lines.length, focus + radius);
  const bounded = boundTraceText(lines.slice(startLine - 1, endLine).join("\n"));
  const windowCoversFile = startLine === 1 && endLine === lines.length;
  return {
    startLine,
    endLine,
    excerpt: bounded.text,
    truncated: bounded.truncated || !windowCoversFile,
  };
}

export function hunkStats(file: Pick<GeneratedDiffFile, "changeType" | "before" | "after" | "patch">): {
  additions: number;
  deletions: number;
  hunkHeader: string;
} {
  if (file.patch) {
    const fromPatch = hunkStatsFromPatch(file.patch);
    if (fromPatch) return fromPatch;
  }
  const before = file.changeType === "create" ? "" : (file.before ?? "");
  const after = file.changeType === "delete" ? "" : (file.after ?? "");
  return hunkStatsFromContents(before, after);
}

export function verificationTraceFields(result: VerificationCommandResult): {
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  truncated: boolean;
  durationMs: number;
} {
  const stdoutSource = result.stdout ?? result.output ?? "";
  const stderrSource = result.stderr ?? "";
  const stdout = stdoutSource ? boundTraceText(stdoutSource) : undefined;
  const stderr = stderrSource ? boundTraceText(stderrSource) : undefined;
  return {
    exitCode: result.exitCode,
    ...(stdout?.text ? { stdout: stdout.text } : {}),
    ...(stderr?.text ? { stderr: stderr.text } : {}),
    truncated: Boolean(result.outputTruncated || stdout?.truncated || stderr?.truncated),
    durationMs: Math.max(0, Math.round(result.durationMs)),
  };
}

function hunkStatsFromPatch(patch: string): {
  additions: number;
  deletions: number;
  hunkHeader: string;
} | null {
  const header = patch.split("\n").find((line) => line.startsWith("@@"));
  if (!header) return null;
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions, hunkHeader: header.slice(0, 200) };
}

function hunkStatsFromContents(before: string, after: string): {
  additions: number;
  deletions: number;
  hunkHeader: string;
} {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let start = 0;
  while (
    start < oldLines.length
    && start < newLines.length
    && oldLines[start] === newLines[start]
  ) {
    start += 1;
  }
  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld -= 1;
    endNew -= 1;
  }
  const deletions = Math.max(0, endOld - start + 1);
  const additions = Math.max(0, endNew - start + 1);
  const oldStart = deletions === 0 ? 0 : start + 1;
  const newStart = additions === 0 ? 0 : start + 1;
  return {
    additions,
    deletions,
    hunkHeader: `@@ -${oldStart},${deletions} +${newStart},${additions} @@`.slice(0, 200),
  };
}
