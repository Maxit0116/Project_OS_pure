import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  AgentWorktreeManifestSchema,
  CreateAgentWorktreeOptionsSchema,
  MergeAgentWorktreeOptionsSchema,
  type AgentWorktreeManifest,
  type AgentWorktreeRecord,
  type CreateAgentWorktreeOptions,
  type MergeAgentWorktreeOptions,
} from "../../contracts/agent-worktree.js";
import { ProjectOSError } from "../../errors.js";

const MANIFEST_FILE = ".projectos/agent-worktrees.json";
const WORKTREE_DIR = ".projectos/agent-worktrees";

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw new ProjectOSError("git_worktree_failed", result.error.message);
  }
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "git command failed").trim();
    throw new ProjectOSError("git_worktree_failed", message);
  }
  return (result.stdout ?? "").trim();
}

function ensureGitRepo(workspaceRoot: string): void {
  const gitDir = join(workspaceRoot, ".git");
  if (!existsSync(gitDir)) {
    throw new ProjectOSError(
      "git_worktree_failed",
      "Workspace is not a git repository",
    );
  }
}

function manifestPath(workspaceRoot: string): string {
  return join(workspaceRoot, MANIFEST_FILE);
}

function worktreeRoot(workspaceRoot: string): string {
  return join(workspaceRoot, WORKTREE_DIR);
}

export function loadAgentWorktreeManifest(
  workspaceRoot: string,
): AgentWorktreeManifest {
  const absolute = manifestPath(workspaceRoot);
  if (!existsSync(absolute)) {
    return { version: "0.1.0", worktrees: [] };
  }
  try {
    return AgentWorktreeManifestSchema.parse(
      JSON.parse(readFileSync(absolute, "utf8")) as unknown,
    );
  } catch {
    return { version: "0.1.0", worktrees: [] };
  }
}

function saveManifest(
  workspaceRoot: string,
  manifest: AgentWorktreeManifest,
): void {
  mkdirSync(join(workspaceRoot, ".projectos"), { recursive: true });
  writeFileSync(
    manifestPath(workspaceRoot),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function newWorktreeId(): string {
  return `wt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an isolated git worktree for a parallel agent session.
 * Leaf ACL still applies relative to the returned `path` as workspace root.
 */
export function createAgentWorktree(
  workspaceRoot: string,
  options: CreateAgentWorktreeOptions = {},
): AgentWorktreeRecord {
  const parsed = CreateAgentWorktreeOptionsSchema.parse(options);
  ensureGitRepo(workspaceRoot);
  const root = resolve(workspaceRoot);
  const id = parsed.id ?? newWorktreeId();
  const manifest = loadAgentWorktreeManifest(root);
  if (manifest.worktrees.some((item) => item.id === id && item.status === "active")) {
    throw new ProjectOSError(
      "git_worktree_failed",
      `Worktree '${id}' already exists`,
    );
  }

  mkdirSync(worktreeRoot(root), { recursive: true });
  const checkoutPath = join(worktreeRoot(root), id);
  if (existsSync(checkoutPath)) {
    throw new ProjectOSError(
      "git_worktree_failed",
      `Worktree path already exists: ${checkoutPath}`,
    );
  }

  const baseRef = parsed.baseRef ?? "HEAD";
  const branch = `projectos/agent/${id}`;
  runGit(root, [
    "worktree",
    "add",
    "-b",
    branch,
    checkoutPath,
    baseRef,
  ]);

  const record: AgentWorktreeRecord = {
    id,
    branch,
    path: checkoutPath,
    relativePath: relative(root, checkoutPath).replace(/\\/gu, "/"),
    createdAt: new Date().toISOString(),
    status: "active",
    ...(parsed.boundRunId ? { boundRunId: parsed.boundRunId } : {}),
    ...(parsed.boundSessionId ? { boundSessionId: parsed.boundSessionId } : {}),
  };

  const next: AgentWorktreeManifest = {
    version: "0.1.0",
    worktrees: [
      ...manifest.worktrees.filter((item) => item.id !== id),
      record,
    ],
  };
  saveManifest(root, next);
  return record;
}

export function listAgentWorktrees(
  workspaceRoot: string,
): AgentWorktreeRecord[] {
  return loadAgentWorktreeManifest(workspaceRoot).worktrees;
}

export function getAgentWorktree(
  workspaceRoot: string,
  worktreeId: string,
): AgentWorktreeRecord | undefined {
  return listAgentWorktrees(workspaceRoot).find((item) => item.id === worktreeId);
}

/**
 * Merge a worktree branch into the main workspace. Requires `confirm: true`.
 * Never auto-merges.
 */
export function mergeAgentWorktree(
  workspaceRoot: string,
  options: MergeAgentWorktreeOptions,
): AgentWorktreeRecord {
  const parsed = MergeAgentWorktreeOptionsSchema.parse(options);
  if (parsed.confirm !== true) {
    throw new ProjectOSError(
      "git_worktree_failed",
      "Merge requires explicit confirm: true",
    );
  }
  ensureGitRepo(workspaceRoot);
  const root = resolve(workspaceRoot);
  const manifest = loadAgentWorktreeManifest(root);
  const record = manifest.worktrees.find((item) => item.id === parsed.worktreeId);
  if (!record || record.status !== "active") {
    throw new ProjectOSError(
      "git_worktree_failed",
      `Active worktree '${parsed.worktreeId}' not found`,
    );
  }

  if (parsed.intoRef) {
    runGit(root, ["checkout", parsed.intoRef]);
  }
  try {
    runGit(root, ["merge", "--no-ff", "-m", `Merge agent worktree ${record.id}`, record.branch]);
  } catch (error) {
    if (error instanceof ProjectOSError) {
      throw new ProjectOSError("git_conflict", error.message, { cause: error });
    }
    throw error;
  }

  const updated: AgentWorktreeRecord = {
    ...record,
    status: "merged",
    mergedAt: new Date().toISOString(),
  };
  saveManifest(root, {
    version: "0.1.0",
    worktrees: manifest.worktrees.map((item) =>
      item.id === record.id ? updated : item,
    ),
  });
  return updated;
}

/**
 * Remove a worktree checkout. Does not delete the branch unless `deleteBranch`.
 */
export function removeAgentWorktree(
  workspaceRoot: string,
  worktreeId: string,
  options?: { deleteBranch?: boolean },
): AgentWorktreeRecord {
  ensureGitRepo(workspaceRoot);
  const root = resolve(workspaceRoot);
  const manifest = loadAgentWorktreeManifest(root);
  const record = manifest.worktrees.find((item) => item.id === worktreeId);
  if (!record) {
    throw new ProjectOSError(
      "git_worktree_failed",
      `Worktree '${worktreeId}' not found`,
    );
  }

  if (existsSync(record.path)) {
    try {
      runGit(root, ["worktree", "remove", "--force", record.path]);
    } catch {
      rmSync(record.path, { recursive: true, force: true });
      try {
        runGit(root, ["worktree", "prune"]);
      } catch {
        /* best-effort */
      }
    }
  }

  if (options?.deleteBranch) {
    try {
      runGit(root, ["branch", "-D", record.branch]);
    } catch {
      /* branch may already be gone after merge */
    }
  }

  const updated: AgentWorktreeRecord = {
    ...record,
    status: "removed",
    removedAt: new Date().toISOString(),
  };
  saveManifest(root, {
    version: "0.1.0",
    worktrees: manifest.worktrees.map((item) =>
      item.id === record.id ? updated : item,
    ),
  });
  return updated;
}

/** Working-tree diff inside an agent worktree (for review before merge). */
export function getAgentWorktreeDiff(
  workspaceRoot: string,
  worktreeId: string,
): string {
  const record = getAgentWorktree(workspaceRoot, worktreeId);
  if (!record || record.status !== "active") {
    throw new ProjectOSError(
      "git_worktree_failed",
      `Active worktree '${worktreeId}' not found`,
    );
  }
  ensureGitRepo(record.path);
  const unstaged = runGit(record.path, ["diff", "--no-color"]);
  const staged = runGit(record.path, ["diff", "--cached", "--no-color"]);
  const vsBase = runGit(workspaceRoot, [
    "diff",
    "--no-color",
    "HEAD",
    record.branch,
  ]);
  return [unstaged, staged, vsBase].filter(Boolean).join("\n") || "(no changes)";
}
