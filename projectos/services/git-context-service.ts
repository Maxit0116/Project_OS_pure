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

export interface GitMutationResult {
  ok: boolean;
  branch?: string | null;
  message: string;
}

/** Refuse when the working tree is dirty — no auto-stash in v1. */
export function checkoutGitBranch(
  workspaceRoot: string,
  branch: string,
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
  if (!result.ok) {
    const createTrack = tryGit(workspaceRoot, [
      "checkout",
      "-b",
      name,
      "--track",
      `origin/${name}`,
    ]);
    if (!createTrack.ok) {
      return { ok: false, message: result.message };
    }
  }
  return { ok: true, branch: name, message: `Checked out ${name}.` };
}

export function createGitBranch(
  workspaceRoot: string,
  branch: string,
  options: { from?: string; checkout?: boolean } = {},
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
  const base = options.from?.trim() || status.branch || "HEAD";
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
    return { ok: true, branch: name, message: `Created and checked out ${name}.` };
  }
  const result = tryGit(workspaceRoot, ["branch", name, base]);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, branch: name, message: `Created ${name}.` };
}

export function fetchGitRemote(workspaceRoot: string): GitMutationResult {
  const result = tryGit(workspaceRoot, ["fetch", "--prune", "origin"]);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: "Fetched origin." };
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

export async function createGithubPullRequest(
  workspaceRoot: string,
  input: { title: string; head?: string; base?: string; body?: string },
  options: GithubApiOptions = {},
): Promise<{ ok: boolean; url?: string; number?: number; message: string }> {
  if (options.accessToken) {
    const remoteUrl = readGitRemoteUrl(workspaceRoot);
    const status = readGitRepositoryStatus(workspaceRoot);
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
    const head = input.head ?? status.branch ?? undefined;
    const base =
      input.base ?? readGitDefaultBranch(workspaceRoot) ?? undefined;
    if (!head || !base) {
      return {
        ok: false,
        message: "PR create requires head and base branch names.",
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

  const args = ["pr", "create", "--title", input.title, "--fill"];
  if (input.head) args.push("--head", input.head);
  if (input.base) args.push("--base", input.base);
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
