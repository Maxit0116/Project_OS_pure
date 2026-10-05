import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ProjectOSError } from "../errors.js";

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
