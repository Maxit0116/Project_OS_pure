import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CapabilityContext, ToolPermissionRule } from "../contracts/tool-policy.js";
import type { ToolResult, ToolResultDiffStats } from "../contracts/tool-result.js";
import { ProjectOSError } from "../errors.js";
import { loadToolPermissionDocument } from "./harness/permissions.js";
import { evaluateToolCall } from "./harness/tool-policy.js";
import { deniedToolResult, sealToolResult } from "./harness/tool-result.js";

const DEFAULT_MAX_DIFF_CHARS = 32_000;

export interface GitDiffResult {
  diff: string;
  disposition: "exact" | "truncated";
  byteLength: number;
  includedByteLength: number;
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw new ProjectOSError(
      "git_context_unavailable",
      result.error.message,
    );
  }
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "git command failed").trim();
    throw new ProjectOSError("git_context_unavailable", message);
  }
  return result.stdout ?? "";
}

function ensureGitRepo(workspaceRoot: string): void {
  if (!existsSync(join(workspaceRoot, ".git"))) {
    throw new ProjectOSError(
      "git_context_unavailable",
      "Workspace is not a git repository",
    );
  }
}

function truncateDiff(diff: string, maxChars: number): GitDiffResult {
  const byteLength = Buffer.byteLength(diff, "utf8");
  if (diff.length <= maxChars) {
    return {
      diff,
      disposition: "exact",
      byteLength,
      includedByteLength: byteLength,
    };
  }
  const truncated = diff.slice(0, maxChars);
  return {
    diff: truncated,
    disposition: "truncated",
    byteLength,
    includedByteLength: Buffer.byteLength(truncated, "utf8"),
  };
}

export function getWorkingTreeDiff(
  workspaceRoot: string,
  maxChars = DEFAULT_MAX_DIFF_CHARS,
): GitDiffResult {
  ensureGitRepo(workspaceRoot);
  const diff = runGit(workspaceRoot, ["diff", "--no-color"]);
  const staged = runGit(workspaceRoot, ["diff", "--cached", "--no-color"]);
  const combined = [diff, staged].filter(Boolean).join("\n");
  return truncateDiff(combined || "(no changes)", maxChars);
}

export function getBranchDiff(
  workspaceRoot: string,
  base = "main",
  maxChars = DEFAULT_MAX_DIFF_CHARS,
): GitDiffResult {
  ensureGitRepo(workspaceRoot);
  const diff = runGit(workspaceRoot, [
    "diff",
    "--no-color",
    `${base}...HEAD`,
  ]);
  return truncateDiff(diff || "(no changes vs base)", maxChars);
}

export interface GitReadOnlyStatus {
  branch: string | null;
  dirty: boolean;
  ahead?: number;
  behind?: number;
  diffTruncated: boolean;
  diffStats?: ToolResultDiffStats;
  error?: string;
}

/**
 * Read-only repository status. Not a git repository is an error result,
 * not an exception. `ahead` / `behind` are omitted when no upstream exists.
 * A truncated diff must not be applied as a complete patch.
 */
export function readGitRepositoryStatus(
  workspaceRoot: string,
  maxChars = DEFAULT_MAX_DIFF_CHARS,
): GitReadOnlyStatus {
  const inside = tryGit(workspaceRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return {
      branch: null,
      dirty: false,
      diffTruncated: false,
      error: "Workspace is not a git repository",
    };
  }

  const branchResult = tryGit(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchResult.ok) {
    return {
      branch: null,
      dirty: false,
      diffTruncated: false,
      error: branchResult.message,
    };
  }

  const porcelain = tryGit(workspaceRoot, ["status", "--porcelain"]);
  if (!porcelain.ok) {
    return {
      branch: branchResult.stdout.trim() || null,
      dirty: false,
      diffTruncated: false,
      error: porcelain.message,
    };
  }

  const status: GitReadOnlyStatus = {
    branch: branchResult.stdout.trim() || null,
    dirty: porcelain.stdout.trim().length > 0,
    diffTruncated: false,
  };

  const upstream = tryGit(workspaceRoot, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  if (upstream.ok && upstream.stdout.trim()) {
    const counts = tryGit(workspaceRoot, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ]);
    if (counts.ok) {
      const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
      if (Number.isInteger(ahead) && Number.isInteger(behind)) {
        status.ahead = ahead;
        status.behind = behind;
      }
    }
  }

  try {
    const diff = getWorkingTreeDiff(workspaceRoot, maxChars);
    status.diffTruncated = diff.disposition === "truncated";
  } catch (error) {
    status.error = error instanceof Error ? error.message : "git diff failed";
  }

  const stats = readDiffStats(workspaceRoot);
  if (stats) status.diffStats = stats;
  return status;
}

/**
 * Server query. Allowed at the same level as `list_files`: read-only, no write
 * capability. Deny and ask return a ToolResult and do not run git.
 */
export function queryGitReadOnlyStatus(
  workspaceRoot: string,
  policy: CapabilityContext,
  options: { rules?: readonly ToolPermissionRule[]; maxChars?: number } = {},
): ToolResult {
  const decision = evaluateToolCall(
    { tool: "git_status" },
    policy,
    { rules: options.rules ?? loadToolPermissionDocument(workspaceRoot).rules },
  );
  if (decision.decision !== "allow") {
    return deniedToolResult("git_status", decision.reason);
  }
  return gitStatusToToolResult(readGitRepositoryStatus(workspaceRoot, options.maxChars));
}

export function gitStatusToToolResult(status: GitReadOnlyStatus): ToolResult {
  if (status.error) {
    return sealToolResult({
      tool: "git_status",
      ok: false,
      exitCode: null,
      summary: status.error,
      output: status.error,
      truncated: false,
    });
  }

  const parts = [
    status.branch ? `On branch ${status.branch}.` : "Detached HEAD.",
    status.dirty ? "Dirty." : "Clean.",
  ];
  if (status.ahead !== undefined && status.behind !== undefined) {
    parts.push(`Ahead ${status.ahead}, behind ${status.behind}.`);
  }
  if (status.diffTruncated) {
    parts.push("Working tree diff is truncated and is not a complete patch.");
  }
  const summary = parts.join(" ");
  return sealToolResult({
    tool: "git_status",
    ok: true,
    exitCode: 0,
    summary,
    output: summary,
    truncated: status.diffTruncated,
    ...(status.diffStats ? { artifacts: { diffStats: status.diffStats } } : {}),
  });
}

function readDiffStats(workspaceRoot: string): ToolResultDiffStats | undefined {
  const unstaged = tryGit(workspaceRoot, ["diff", "--numstat"]);
  const staged = tryGit(workspaceRoot, ["diff", "--cached", "--numstat"]);
  if (!unstaged.ok && !staged.ok) return undefined;
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of `${unstaged.ok ? unstaged.stdout : ""}\n${staged.ok ? staged.stdout : ""}`.split("\n")) {
    const match = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (!match) continue;
    files += 1;
    additions += Number(match[1]);
    deletions += Number(match[2]);
  }
  return { files, additions, deletions };
}

function tryGit(
  cwd: string,
  args: string[],
): { ok: true; stdout: string } | { ok: false; message: string } {
  if (!existsSync(cwd)) {
    return { ok: false, message: "Workspace is not a git repository" };
  }
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "git command failed").trim();
    return { ok: false, message };
  }
  return { ok: true, stdout: result.stdout ?? "" };
}
