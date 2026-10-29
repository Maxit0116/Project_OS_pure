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

type TryGitOptions = {
  /** When set, injects a one-shot GitHub HTTPS Authorization header (never written to git config). */
  accessToken?: string;
};

function tryGit(
  cwd: string,
  args: string[],
  options: TryGitOptions = {},
): { ok: true; stdout: string } | { ok: false; message: string } {
  if (!existsSync(cwd)) {
    return { ok: false, message: "Workspace is not a git repository" };
  }
  const gitArgs =
    options.accessToken && options.accessToken.trim()
      ? [
          "-c",
          `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(
            `x-access-token:${options.accessToken.trim()}`,
            "utf8",
          ).toString("base64")}`,
          ...args,
        ]
      : args;
  const result = spawnSync("git", gitArgs, {
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

export function readGitRemoteUrl(workspaceRoot: string): string | undefined {
  const result = tryGit(workspaceRoot, ["remote", "get-url", "origin"]);
  if (!result.ok) return undefined;
  const url = result.stdout.trim();
  return url || undefined;
}

export function readGitDefaultBranch(workspaceRoot: string): string | null {
  const symbolic = tryGit(workspaceRoot, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  if (symbolic.ok) {
    const match = symbolic.stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) return match[1];
  }
  for (const candidate of ["main", "master"]) {
    const local = tryGit(workspaceRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${candidate}`,
    ]);
    if (local.ok) return candidate;
  }
  return null;
}

export interface ListedGitBranch {
  name: string;
  id: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface ListedGitBranchSet {
  defaultBranch: string | null;
  currentBranch: string | null;
  branches: ListedGitBranch[];
}

/** Local heads + remote-tracking branches (origin/*), de-duplicated by short name preference for locals. */
export function listGitBranches(workspaceRoot: string): ListedGitBranchSet {
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return {
      defaultBranch: null,
      currentBranch: null,
      branches: [],
    };
  }

  const defaultBranch = readGitDefaultBranch(workspaceRoot);
  const currentBranch = status.branch;
  const byName = new Map<string, ListedGitBranch>();

  const local = tryGit(workspaceRoot, [
    "for-each-ref",
    "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)",
    "refs/heads",
  ]);
  if (local.ok) {
    for (const line of local.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, upstream, headFlag] = trimmed.split("\t");
      if (!name) continue;
      const entry: ListedGitBranch = {
        name,
        id: `branch:${name}`,
        current: headFlag === "*",
        remote: false,
        ...(upstream ? { upstream } : {}),
      };
      if (entry.current && status.ahead !== undefined) entry.ahead = status.ahead;
      if (entry.current && status.behind !== undefined) entry.behind = status.behind;
      byName.set(name, entry);
    }
  }

  const remotes = tryGit(workspaceRoot, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/remotes/origin",
  ]);
  if (remotes.ok) {
    for (const line of remotes.stdout.split("\n")) {
      const full = line.trim();
      if (!full || full === "origin/HEAD") continue;
      const short = full.replace(/^origin\//, "");
      if (!short || byName.has(short)) continue;
      byName.set(short, {
        name: short,
        id: `branch:${short}`,
        current: false,
        remote: true,
        upstream: full,
      });
    }
  }

  const branches = [...byName.values()].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.name === defaultBranch) return -1;
    if (b.name === defaultBranch) return 1;
    return a.name.localeCompare(b.name);
  });

  return { defaultBranch, currentBranch, branches };
}

/** Merge GitHub API branch names into a local listing (remote-only names marked remote). */
export function mergeRemoteApiBranches(
  listed: ListedGitBranchSet,
  apiBranchNames: string[],
): ListedGitBranchSet {
  if (apiBranchNames.length === 0) return listed;
  const byName = new Map(listed.branches.map((branch) => [branch.name, branch]));
  for (const name of apiBranchNames) {
    const trimmed = name.trim();
    if (!trimmed || byName.has(trimmed)) continue;
    byName.set(trimmed, {
      name: trimmed,
      id: `branch:${trimmed}`,
      current: false,
      remote: true,
      upstream: `origin/${trimmed}`,
    });
  }
  const defaultBranch = listed.defaultBranch;
  const branches = [...byName.values()].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.name === defaultBranch) return -1;
    if (b.name === defaultBranch) return 1;
    return a.name.localeCompare(b.name);
  });
  return {
    defaultBranch: listed.defaultBranch,
    currentBranch: listed.currentBranch,
    branches,
  };
}

function resolveBranchStartPoint(
  workspaceRoot: string,
  from: string | undefined,
): string {
  const requested = from?.trim();
  if (!requested) {
    const status = readGitRepositoryStatus(workspaceRoot);
    return status.branch || "HEAD";
  }
  const local = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${requested}`,
  ]);
  if (local.ok) return requested;
  const remote = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/remotes/origin/${requested}`,
  ]);
  if (remote.ok) return `origin/${requested}`;
  if (requested.startsWith("origin/")) return requested;
  return requested;
}

export interface GitMutationResult {
  ok: boolean;
  branch?: string | null;
  message: string;
}

export type GitAuthOptions = {
  accessToken?: string;
};

/** Ensure a single remote-tracking ref exists (used before checkout / branch-from). */
function ensureRemoteTrackingBranch(
  workspaceRoot: string,
  branch: string,
  options: GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  const existing = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/remotes/origin/${name}`,
  ]);
  if (existing.ok) return { ok: true, branch: name, message: `origin/${name} present.` };
  const fetched = tryGit(
    workspaceRoot,
    [
      "fetch",
      "--prune",
      "origin",
      `+refs/heads/${name}:refs/remotes/origin/${name}`,
    ],
    { accessToken: options.accessToken },
  );
  if (!fetched.ok) {
    return {
      ok: false,
      message: `Could not fetch origin/${name}: ${fetched.message}`,
    };
  }
  return { ok: true, branch: name, message: `Fetched origin/${name}.` };
}

/** Refuse when the working tree is dirty — no auto-stash in v1. */
export function checkoutGitBranch(
  workspaceRoot: string,
  branch: string,
  options: GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  if (!name) return { ok: false, message: "Branch name is required." };
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return { ok: false, message: status.error };
  }
  if (status.dirty) {
    return {
      ok: false,
      message:
        "Working tree is dirty. Commit or stash changes before switching branches.",
    };
  }
  const result = tryGit(workspaceRoot, ["checkout", name]);
  if (result.ok) {
    return { ok: true, branch: name, message: `Checked out ${name}.` };
  }
  const ensured = ensureRemoteTrackingBranch(workspaceRoot, name, options);
  if (!ensured.ok) {
    return { ok: false, message: result.message };
  }
  const createTrack = tryGit(workspaceRoot, [
    "checkout",
    "-b",
    name,
    "--track",
    `origin/${name}`,
  ]);
  if (!createTrack.ok) {
    return { ok: false, message: createTrack.message || result.message };
  }
  return { ok: true, branch: name, message: `Checked out ${name} (tracking origin/${name}).` };
}

export function createGitBranch(
  workspaceRoot: string,
  branch: string,
  options: {
    from?: string;
    checkout?: boolean;
    /** Push the new branch to origin after local create (GitHub Graph default). */
    push?: boolean;
  } & GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  if (!name) return { ok: false, message: "Branch name is required." };
  if (!/^[A-Za-z0-9._/\-]+$/.test(name)) {
    return { ok: false, message: "Branch name contains invalid characters." };
  }
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return { ok: false, message: status.error };
  }
  const from = options.from?.trim();
  if (from) {
    const local = tryGit(workspaceRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${from}`,
    ]);
    const remote = tryGit(workspaceRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/remotes/origin/${from}`,
    ]);
    if (!local.ok && !remote.ok) {
      const ensured = ensureRemoteTrackingBranch(workspaceRoot, from, options);
      if (!ensured.ok) return ensured;
    }
  }
  const base = resolveBranchStartPoint(workspaceRoot, options.from);
  let created: GitMutationResult;
  if (options.checkout !== false) {
    if (status.dirty) {
      return {
        ok: false,
        message:
          "Working tree is dirty. Commit or stash changes before creating and switching to a branch.",
      };
    }
    const result = tryGit(workspaceRoot, ["checkout", "-b", name, base]);
    if (!result.ok) return { ok: false, message: result.message };
    created = {
      ok: true,
      branch: name,
      message: `Created and checked out ${name} from ${base}.`,
    };
  } else {
    const result = tryGit(workspaceRoot, ["branch", name, base]);
    if (!result.ok) return { ok: false, message: result.message };
    created = {
      ok: true,
      branch: name,
      message: `Created ${name} from ${base}.`,
    };
  }

  if (!options.push) return created;

  const pushed = pushGitBranch(workspaceRoot, name, {
    accessToken: options.accessToken,
  });
  if (!pushed.ok) {
    return {
      ok: false,
      branch: name,
      message: `Created local branch '${name}', but push to origin failed: ${pushed.message}`,
    };
  }
  return {
    ok: true,
    branch: name,
    message: `${created.message} Pushed to origin.`,
  };
}

/**
 * Fetch all origin heads into remote-tracking refs.
 * Uses an explicit refspec so single-branch clones still learn other remotes.
 * Optional accessToken authenticates HTTPS GitHub remotes without rewriting git config.
 */
export function fetchGitRemote(
  workspaceRoot: string,
  options: GitAuthOptions = {},
): GitMutationResult {
  const auth = { accessToken: options.accessToken };
  const result = tryGit(
    workspaceRoot,
    [
      "fetch",
      "--prune",
      "origin",
      "+refs/heads/*:refs/remotes/origin/*",
    ],
    auth,
  );
  if (!result.ok) {
    const fallback = tryGit(workspaceRoot, ["fetch", "--prune", "origin"], auth);
    if (!fallback.ok) return { ok: false, message: fallback.message };
    return {
      ok: true,
      message:
        "Fetched origin (narrow refspec). Some remote branches may still be missing.",
    };
  }
  return { ok: true, message: "Fetched all origin branches." };
}

/** Push a local branch to origin (sets upstream). Used before Create PR. */
export function pushGitBranch(
  workspaceRoot: string,
  branch: string,
  options: GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  if (!name) return { ok: false, message: "Branch name is required." };
  const local = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${name}`,
  ]);
  if (!local.ok) {
    return {
      ok: false,
      message: `Local branch '${name}' does not exist. Checkout or create it before pushing.`,
    };
  }
  const result = tryGit(
    workspaceRoot,
    ["push", "-u", "origin", name],
    { accessToken: options.accessToken },
  );
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, branch: name, message: `Pushed ${name} to origin.` };
}

const BRANCH_NAME_RE = /^[A-Za-z0-9._/\-]+$/;

function ensureLocalBranch(
  workspaceRoot: string,
  branch: string,
  options: GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  const local = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${name}`,
  ]);
  if (local.ok) return { ok: true, branch: name, message: `Local branch ${name} ready.` };
  const ensured = ensureRemoteTrackingBranch(workspaceRoot, name, options);
  if (!ensured.ok) {
    return {
      ok: false,
      message: `Branch '${name}' does not exist locally or on origin.`,
    };
  }
  const created = tryGit(workspaceRoot, [
    "branch",
    "--track",
    name,
    `origin/${name}`,
  ]);
  if (!created.ok) {
    return { ok: false, message: created.message };
  }
  return { ok: true, branch: name, message: `Created local tracking branch ${name}.` };
}

/** Rename a local branch; optionally retarget origin (push new + delete old). */
export function renameGitBranch(
  workspaceRoot: string,
  fromName: string,
  toName: string,
  options: {
    push?: boolean;
    deleteRemoteOld?: boolean;
  } & GitAuthOptions = {},
): GitMutationResult {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to) {
    return { ok: false, message: "Current and new branch names are required." };
  }
  if (from === to) {
    return { ok: true, branch: to, message: `Branch already named ${to}.` };
  }
  if (!BRANCH_NAME_RE.test(to)) {
    return { ok: false, message: "Branch name contains invalid characters." };
  }
  const defaultBranch = readGitDefaultBranch(workspaceRoot);
  if (defaultBranch && from === defaultBranch) {
    return {
      ok: false,
      message: "Cannot rename the default branch from the graph.",
    };
  }
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return { ok: false, message: status.error };
  }
  const ensured = ensureLocalBranch(workspaceRoot, from, options);
  if (!ensured.ok) return ensured;

  const renamed = tryGit(workspaceRoot, ["branch", "-m", from, to]);
  if (!renamed.ok) return { ok: false, message: renamed.message };

  if (options.push === false) {
    return { ok: true, branch: to, message: `Renamed ${from} → ${to} locally.` };
  }

  const pushed = pushGitBranch(workspaceRoot, to, {
    accessToken: options.accessToken,
  });
  if (!pushed.ok) {
    return {
      ok: false,
      branch: to,
      message: `Renamed locally to '${to}', but push failed: ${pushed.message}`,
    };
  }

  let remoteNote = "";
  if (options.deleteRemoteOld !== false) {
    const deletedRemote = tryGit(
      workspaceRoot,
      ["push", "origin", "--delete", from],
      { accessToken: options.accessToken },
    );
    remoteNote = deletedRemote.ok
      ? ` Removed origin/${from}.`
      : ` (could not delete origin/${from}: ${deletedRemote.message})`;
  }

  return {
    ok: true,
    branch: to,
    message: `Renamed ${from} → ${to} and pushed to origin.${remoteNote}`,
  };
}

/** Delete a local branch; optionally delete origin/<name>. Will not delete default. */
export function deleteGitBranch(
  workspaceRoot: string,
  branch: string,
  options: {
    remote?: boolean;
    force?: boolean;
  } & GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  if (!name) return { ok: false, message: "Branch name is required." };
  const defaultBranch = readGitDefaultBranch(workspaceRoot) ?? "main";
  if (name === defaultBranch) {
    return { ok: false, message: "Cannot delete the default branch." };
  }
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return { ok: false, message: status.error };
  }
  if (status.branch === name) {
    if (status.dirty) {
      return {
        ok: false,
        message:
          "Working tree is dirty. Commit or stash before deleting the current branch.",
      };
    }
    const switched = tryGit(workspaceRoot, ["checkout", defaultBranch]);
    if (!switched.ok) {
      return {
        ok: false,
        message: `Could not switch to ${defaultBranch} before delete: ${switched.message}`,
      };
    }
  }

  const local = tryGit(workspaceRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${name}`,
  ]);
  if (local.ok) {
    const flag = options.force === false ? "-d" : "-D";
    const deleted = tryGit(workspaceRoot, ["branch", flag, name]);
    if (!deleted.ok) return { ok: false, message: deleted.message };
  }

  if (options.remote === false) {
    return {
      ok: true,
      branch: defaultBranch,
      message: local.ok
        ? `Deleted local branch ${name}.`
        : `No local branch ${name} to delete.`,
    };
  }

  const remoteDeleted = tryGit(
    workspaceRoot,
    ["push", "origin", "--delete", name],
    { accessToken: options.accessToken },
  );
  if (!remoteDeleted.ok && local.ok) {
    return {
      ok: true,
      branch: defaultBranch,
      message: `Deleted local ${name}, but remote delete failed: ${remoteDeleted.message}`,
    };
  }
  if (!remoteDeleted.ok && !local.ok) {
    return { ok: false, message: remoteDeleted.message };
  }
  return {
    ok: true,
    branch: defaultBranch,
    message: `Deleted ${name} locally and on origin.`,
  };
}

/**
 * Roll a feature branch tip back to another tip (default: repo default branch).
 * Optionally force-pushes with --force-with-lease.
 */
export function rollbackGitBranch(
  workspaceRoot: string,
  branch: string,
  options: {
    to?: string;
    mode?: "hard" | "mixed";
    push?: boolean;
  } & GitAuthOptions = {},
): GitMutationResult {
  const name = branch.trim();
  if (!name) return { ok: false, message: "Branch name is required." };
  const defaultBranch = readGitDefaultBranch(workspaceRoot) ?? "main";
  if (name === defaultBranch) {
    return {
      ok: false,
      message: "Cannot roll back the default branch from the graph.",
    };
  }
  const status = readGitRepositoryStatus(workspaceRoot);
  if (status.error && !status.branch) {
    return { ok: false, message: status.error };
  }
  if (status.dirty) {
    return {
      ok: false,
      message:
        "Working tree is dirty. Commit or stash before rolling back a branch.",
    };
  }

  const ensured = ensureLocalBranch(workspaceRoot, name, options);
  if (!ensured.ok) return ensured;

  if (status.branch !== name) {
    const checked = tryGit(workspaceRoot, ["checkout", name]);
    if (!checked.ok) return { ok: false, message: checked.message };
  }

  const targetRef = options.to?.trim() || defaultBranch;
  const target = resolveBranchStartPoint(workspaceRoot, targetRef);
  const modeFlag = options.mode === "mixed" ? "--mixed" : "--hard";
  const reset = tryGit(workspaceRoot, ["reset", modeFlag, target]);
  if (!reset.ok) return { ok: false, message: reset.message };

  if (options.push === false) {
    return {
      ok: true,
      branch: name,
      message: `Reset ${name} to ${target} (${modeFlag.slice(2)}).`,
    };
  }

  const pushed = tryGit(
    workspaceRoot,
    ["push", "--force-with-lease", "origin", name],
    { accessToken: options.accessToken },
  );
  if (!pushed.ok) {
    return {
      ok: false,
      branch: name,
      message: `Reset ${name} to ${target} locally, but force-push failed: ${pushed.message}`,
    };
  }
  return {
    ok: true,
    branch: name,
    message: `Reset ${name} to ${target} and force-pushed to origin.`,
  };
}

export function githubHttpsUrlFromRemote(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return undefined;
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
  const ssh = trimmed.match(/^git@github\.com:(.+)$/i);
  if (ssh?.[1]) return `https://github.com/${ssh[1]}`;
  const https = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/(.+)$/i);
  if (https?.[1]) return `https://github.com/${https[1]}`;
  return undefined;
}

export interface ListedPullRequest {
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed" | "merged";
}

export type GithubApiOptions = {
  accessToken?: string;
  fetchImpl?: typeof fetch;
};

function listGithubPullRequestsViaGh(workspaceRoot: string): {
  available: boolean;
  pullRequests: ListedPullRequest[];
  message?: string;
} {
  const result = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,url,headRefName,baseRefName,state",
      "--limit",
      "50",
    ],
    { cwd: workspaceRoot, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    return {
      available: false,
      pullRequests: [],
      message: (result.stderr || result.error?.message || "gh unavailable").trim(),
    };
  }
  try {
    const raw = JSON.parse(result.stdout || "[]") as Array<{
      number: number;
      title: string;
      url: string;
      headRefName: string;
      baseRefName: string;
      state?: string;
    }>;
    return {
      available: true,
      pullRequests: raw.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.url,
        headRef: item.headRefName,
        baseRef: item.baseRefName,
        state: "open" as const,
      })),
    };
  } catch (error) {
    return {
      available: false,
      pullRequests: [],
      message: error instanceof Error ? error.message : "Failed to parse gh output",
    };
  }
}

export async function listGithubPullRequests(
  workspaceRoot: string,
  options: GithubApiOptions = {},
): Promise<{
  available: boolean;
  pullRequests: ListedPullRequest[];
  message?: string;
}> {
  if (options.accessToken) {
    const remoteUrl = readGitRemoteUrl(workspaceRoot);
    const {
      parseGithubOwnerRepo,
      listPullRequestsViaRest,
    } = await import("./github-auth/github-rest.js");
    const parsed = parseGithubOwnerRepo(remoteUrl);
    if (parsed) {
      return listPullRequestsViaRest(
        parsed.owner,
        parsed.repo,
        options.accessToken,
        options.fetchImpl,
      );
    }
    return {
      available: false,
      pullRequests: [],
      message:
        "Signed in with GitHub, but could not parse owner/repo from the git remote. Sign in with GitHub still helps once a GitHub remote is set.",
    };
  }
  const viaGh = listGithubPullRequestsViaGh(workspaceRoot);
  if (!viaGh.available) {
    return {
      ...viaGh,
      message:
        viaGh.message ||
        "GitHub CLI unavailable. Sign in with GitHub in Settings to use the API.",
    };
  }
  return viaGh;
}

export async function listGithubRemoteBranchNames(
  workspaceRoot: string,
  options: GithubApiOptions = {},
): Promise<{ available: boolean; branches: string[]; message?: string }> {
  if (!options.accessToken) {
    return { available: false, branches: [], message: "GitHub auth required" };
  }
  const remoteUrl = readGitRemoteUrl(workspaceRoot);
  const { parseGithubOwnerRepo, listBranchesViaRest } = await import(
    "./github-auth/github-rest.js"
  );
  const parsed = parseGithubOwnerRepo(remoteUrl);
  if (!parsed) {
    return {
      available: false,
      branches: [],
      message: "Could not parse GitHub owner/repo from the git remote.",
    };
  }
  return listBranchesViaRest(
    parsed.owner,
    parsed.repo,
    options.accessToken,
    options.fetchImpl,
  );
}

export async function createGithubPullRequest(
  workspaceRoot: string,
  input: { title: string; head?: string; base?: string; body?: string },
  options: GithubApiOptions & { pushHead?: boolean } = {},
): Promise<{ ok: boolean; url?: string; number?: number; message: string }> {
  const status = readGitRepositoryStatus(workspaceRoot);
  const head = input.head ?? status.branch ?? undefined;
  const base = input.base ?? readGitDefaultBranch(workspaceRoot) ?? undefined;
  if (!head || !base) {
    return {
      ok: false,
      message: "PR create requires head and base branch names.",
    };
  }

  // Local heads: push first. Remote-only heads: ensure origin ref exists (already on GitHub).
  if (options.pushHead !== false) {
    const localHead = tryGit(workspaceRoot, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${head}`,
    ]);
    if (localHead.ok) {
      const pushed = pushGitBranch(workspaceRoot, head, {
        accessToken: options.accessToken,
      });
      if (!pushed.ok) {
        return {
          ok: false,
          message: `Push ${head} before creating a PR: ${pushed.message}`,
        };
      }
    } else {
      const ensured = ensureRemoteTrackingBranch(workspaceRoot, head, {
        accessToken: options.accessToken,
      });
      if (!ensured.ok) {
        return {
          ok: false,
          message: `Head '${head}' is not local and could not be found on origin: ${ensured.message}`,
        };
      }
    }
  }

  if (options.accessToken) {
    const remoteUrl = readGitRemoteUrl(workspaceRoot);
    const {
      parseGithubOwnerRepo,
      createPullRequestViaRest,
    } = await import("./github-auth/github-rest.js");
    const parsed = parseGithubOwnerRepo(remoteUrl);
    if (!parsed) {
      return {
        ok: false,
        message: "Could not parse GitHub owner/repo from the git remote.",
      };
    }
    return createPullRequestViaRest(
      parsed.owner,
      parsed.repo,
      options.accessToken,
      {
        title: input.title,
        head,
        base,
        ...(input.body ? { body: input.body } : {}),
      },
      options.fetchImpl,
    );
  }

  const args = ["pr", "create", "--title", input.title, "--fill", "--head", head, "--base", base];
  if (input.body) args.push("--body", input.body);
  const result = spawnSync("gh", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      message: (
        result.stderr ||
        result.stdout ||
        result.error?.message ||
        "gh pr create failed. Sign in with GitHub in Settings to use the API."
      ).trim(),
    };
  }
  const output = (result.stdout || "").trim();
  const urlMatch = output.match(/https:\/\/github\.com\/\S+/);
  return {
    ok: true,
    url: urlMatch?.[0],
    message: output || "Pull request created.",
  };
}
