/**
 * Shared RunBinding snapshot for every Loop start entry (manual / params / event).
 *
 * Identity vs content:
 * - identityDigest / repo / identityKind describe *where* the workspace is
 * - codeDigest digests *file contents* (HEAD when clean git; dirty/untracked bytes;
 *   bounded non-git source walk). Never substitute path-only identity for content.
 *
 * Incomplete digests (truncated / oversized / unreadable) are explicit and must
 * block production start / approval reuse — never pretend a path hash is complete.
 *
 * Credentials: ref ids only — never tokens.
 * Budget/permission freeze is consumed at runtime (see loop-runtime-service).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

import type { LoopGraphDocument, LoopSpec } from "../contracts/loop-graph.js";
import type {
  LoopRunBinding,
  LoopTaskMaterial,
} from "../contracts/loop-task-materials.js";
import { resolveAgentCallBudgetLimits } from "./loop-agent-call-budget.js";
import { digestBytes } from "./loop-workspace-digest.js";
import { stableStringify } from "./loop-intent-graph-diff.js";

export type RepoIdentityKind =
  | "git_remote"
  | "git_local"
  | "workspace_path"
  | "unbound";

export type BranchSource = "verified_git" | "declared_unverified" | "none";

export type CodeDigestStatus = "complete" | "incomplete";

export type FrozenRunBudget = {
  maxRounds: number;
  maxRetries: number;
  maxAgentCalls: number;
  maxAgentCallDepth: number;
};

export type FrozenPermissionSet = {
  credentialRefIds: string[];
  requireHitlForHighRisk: true;
};

export type WorkspaceIdentitySnapshot = {
  identityKind: RepoIdentityKind;
  workspaceRoot: string;
  repo: string;
  remoteUrl?: string;
  headSha?: string;
  branch?: string;
  branchSource: BranchSource;
  declaredBranch?: string;
  /** Identity-only fingerprint (path/remote) — NOT a code content digest. */
  identityDigest: string;
  /** Content digest of dirty/untracked (or clean HEAD marker). */
  workspaceDirtyDigest: string;
  /** Content digest used as RunBinding.codeDigest. */
  codeDigest: string;
  codeDigestStatus: CodeDigestStatus;
  incompleteReasons: string[];
};

export type BuildRunBindingInput = {
  projectId: string;
  workspaceRoot: string;
  document: LoopGraphDocument;
  spec: LoopSpec;
  createdAt: string;
  materials?: LoopTaskMaterial[];
  declaredBranch?: string;
  preflightNotes?: string[];
  launchKind: "manual" | "params" | "event";
};

export const MAX_DIRTY_PATHS = 200;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_NONGIT_FILES = 100;

const SOURCE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".prisma",
  ".sql",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "out",
  "coverage",
  ".projectos",
]);

function gitCapture(workspaceRoot: string, args: string[]): string | null {
  try {
    // Do NOT String.trim() the whole payload — porcelain leading spaces are
    // significant (e.g. " M path" → XY=" M"). Only strip trailing newlines.
    return execFileSync("git", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    }).replace(/\n+$/u, "");
  } catch {
    return null;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

function isSecretishPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes(".env") ||
    lower.includes("credential") ||
    lower.includes("secret") ||
    lower.endsWith(".pem") ||
    lower.endsWith(".key")
  );
}

function parsePorcelainPath(line: string): string | null {
  // XY PATH or XY PATH -> PATH2
  if (line.length < 4) return null;
  const body = line.slice(3);
  const arrow = body.indexOf(" -> ");
  const raw = arrow >= 0 ? body.slice(arrow + 4) : body;
  const path = raw.trim().replace(/^"|"$/g, "");
  return path || null;
}

type PathContentResult = {
  entries: Array<[string, string]>;
  incompleteReasons: string[];
  truncated: boolean;
};

function digestPathList(
  workspaceRoot: string,
  paths: string[],
  limit: number,
): PathContentResult {
  const incompleteReasons: string[] = [];
  const entries: Array<[string, string]> = [];
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  const truncated = unique.length > limit;
  if (truncated) {
    incompleteReasons.push(`path_list_truncated:${unique.length}>${limit}`);
  }
  for (const path of unique.slice(0, limit)) {
    if (isSecretishPath(path)) {
      entries.push([path, "skipped:secretish"]);
      continue;
    }
    const abs = join(workspaceRoot, path);
    try {
      if (!existsSync(abs)) {
        entries.push([path, "missing"]);
        continue;
      }
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        incompleteReasons.push(`symlink:${path}`);
        entries.push([path, "unreadable:symlink"]);
        continue;
      }
      if (!st.isFile()) {
        entries.push([path, "nonfile"]);
        continue;
      }
      if (st.size > MAX_FILE_BYTES) {
        incompleteReasons.push(`oversized:${path}:${st.size}`);
        entries.push([path, `unreadable:oversized:${st.size}`]);
        continue;
      }
      entries.push([path, digestBytes(readFileSync(abs))]);
    } catch {
      incompleteReasons.push(`unreadable:${path}`);
      entries.push([path, "unreadable"]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return { entries, incompleteReasons, truncated };
}

function walkNonGitSources(workspaceRoot: string): PathContentResult {
  const found: string[] = [];
  const incompleteReasons: string[] = [];
  const stack = [workspaceRoot];
  while (stack.length && found.length <= MAX_NONGIT_FILES) {
    const dir = stack.pop()!;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      incompleteReasons.push(`unreadable_dir:${relative(workspaceRoot, dir) || "."}`);
      continue;
    }
    for (const name of names) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        incompleteReasons.push(`unreadable:${relative(workspaceRoot, abs)}`);
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!st.isFile() || st.isSymbolicLink()) continue;
      const rel = relative(workspaceRoot, abs).split(sep).join("/");
      const dot = rel.lastIndexOf(".");
      const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : "";
      if (!SOURCE_EXT.has(ext)) continue;
      found.push(rel);
      if (found.length > MAX_NONGIT_FILES) break;
    }
  }
  if (found.length > MAX_NONGIT_FILES || stack.length > 0) {
    incompleteReasons.push(
      `nongit_walk_truncated:files=${found.length},pendingDirs=${stack.length}`,
    );
  }
  return digestPathList(
    workspaceRoot,
    found.slice(0, MAX_NONGIT_FILES),
    MAX_NONGIT_FILES,
  );
}

/**
 * Resolve workspace identity + content digests.
 * identityDigest ≠ codeDigest for non-git (path hash must not pretend to be content).
 */
export function captureWorkspaceIdentity(
  workspaceRoot: string,
  declaredBranch?: string,
): WorkspaceIdentitySnapshot {
  const gitDir = join(workspaceRoot, ".git");
  const hasGit = existsSync(gitDir);
  const identityDigest = hashText(`identity:${workspaceRoot}`);

  if (!hasGit) {
    const walked = walkNonGitSources(workspaceRoot);
    const incompleteReasons = [...walked.incompleteReasons];
    if (walked.entries.length === 0 && incompleteReasons.length === 0) {
      incompleteReasons.push("nongit_no_source_files");
    }
    const contentMaterial = stableStringify(walked.entries);
    const codeDigest = hashText(`nongit-content:${contentMaterial}`);
    const status: CodeDigestStatus =
      incompleteReasons.length === 0 ? "complete" : "incomplete";
    return {
      identityKind: "workspace_path",
      workspaceRoot,
      repo: `workspace:${workspaceRoot}`,
      branchSource: declaredBranch ? "declared_unverified" : "none",
      ...(declaredBranch ? { branch: declaredBranch, declaredBranch } : {}),
      identityDigest,
      workspaceDirtyDigest: codeDigest,
      codeDigest,
      codeDigestStatus: status,
      incompleteReasons,
    };
  }

  const headSha = gitCapture(workspaceRoot, ["rev-parse", "HEAD"]) ?? undefined;
  const verifiedBranch =
    gitCapture(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) ??
    undefined;
  const remoteUrl =
    gitCapture(workspaceRoot, ["remote", "get-url", "origin"]) ?? undefined;
  const porcelain =
    gitCapture(workspaceRoot, ["status", "--porcelain", "-uall"]) ?? "";

  const identityKind: RepoIdentityKind = remoteUrl ? "git_remote" : "git_local";
  const repo = remoteUrl
    ? remoteUrl
    : `git-local:${workspaceRoot}@${headSha ?? "nohead"}`;
  const branchSource: BranchSource = verifiedBranch
    ? "verified_git"
    : declaredBranch
      ? "declared_unverified"
      : "none";
  const branch = verifiedBranch ?? declaredBranch;

  const lines = porcelain.split("\n").filter(Boolean);
  const incompleteReasons: string[] = [];

  if (!porcelain.trim()) {
    // Clean tree: content matches HEAD for tracked + no untracked (-uall).
    if (!headSha) {
      incompleteReasons.push("git_head_unavailable");
    }
    const codeDigest = hashText(`git-clean-head:${headSha ?? "unknown"}`);
    return {
      identityKind,
      workspaceRoot,
      repo,
      ...(remoteUrl ? { remoteUrl } : {}),
      ...(headSha ? { headSha } : {}),
      ...(branch ? { branch } : {}),
      branchSource,
      ...(declaredBranch && declaredBranch !== verifiedBranch
        ? { declaredBranch }
        : {}),
      identityDigest: hashText(`identity:${identityKind}:${repo}`),
      workspaceDirtyDigest: hashText("git-clean"),
      codeDigest,
      codeDigestStatus: incompleteReasons.length === 0 ? "complete" : "incomplete",
      incompleteReasons,
    };
  }

  const paths = lines
    .map(parsePorcelainPath)
    .filter((p): p is string => Boolean(p));
  const digested = digestPathList(workspaceRoot, paths, MAX_DIRTY_PATHS);
  incompleteReasons.push(...digested.incompleteReasons);
  // Content entries change when path A→B even if porcelain status letters stay " M".
  // Prefer content-only material for dirty digest so porcelain letter noise cannot
  // mask OR replace byte digests; still include path list for rename/add/delete.
  const dirtyMaterial = stableStringify({
    paths: digested.entries.map(([p]) => p),
    contents: digested.entries,
  });
  const workspaceDirtyDigest = hashText(dirtyMaterial);
  const codeDigest = hashText(
    stableStringify({
      headSha: headSha ?? null,
      dirty: workspaceDirtyDigest,
    }),
  );

  return {
    identityKind,
    workspaceRoot,
    repo,
    ...(remoteUrl ? { remoteUrl } : {}),
    ...(headSha ? { headSha } : {}),
    ...(branch ? { branch } : {}),
    branchSource,
    ...(declaredBranch && declaredBranch !== verifiedBranch
      ? { declaredBranch }
      : {}),
    identityDigest: hashText(`identity:${identityKind}:${repo}`),
    workspaceDirtyDigest,
    codeDigest,
    codeDigestStatus: incompleteReasons.length === 0 ? "complete" : "incomplete",
    incompleteReasons,
  };
}

export function collectCredentialRefIds(
  document: LoopGraphDocument,
  spec: LoopSpec,
): string[] {
  return [
    ...new Set(
      [
        ...document.draft.nodes.map((node) => node.credentialRefId),
        ...spec.nodes.map((node) =>
          "credentialRefId" in node
            ? (node as { credentialRefId?: string }).credentialRefId
            : undefined,
        ),
      ].filter((id): id is string => Boolean(id && id.trim())),
    ),
  ].slice(0, 32);
}

export function freezeRunBudget(spec: LoopSpec): FrozenRunBudget {
  const agent = resolveAgentCallBudgetLimits(spec);
  return {
    maxRounds: Math.max(1, spec.stopPolicy?.maxRounds ?? 1),
    maxRetries: Math.max(0, spec.retryPolicy?.maxAutoRetries ?? 0),
    maxAgentCalls: agent.maxAgentCalls,
    maxAgentCallDepth: agent.maxAgentCallDepth,
  };
}

export function freezePermissionSet(
  credentialRefIds: string[],
): FrozenPermissionSet {
  return {
    credentialRefIds: [...credentialRefIds],
    requireHitlForHighRisk: true,
  };
}

export function digestDefinitionVersions(
  document: LoopGraphDocument,
  spec: LoopSpec,
): string {
  return hashText(
    stableStringify({
      draftRevision: document.draft.revision,
      draftPrompt: document.draft.graphPrompt ?? "",
      nodeIds: document.draft.nodes.map((n) => n.id).sort(),
      specVersion: spec.version,
      specGoal: spec.goal,
      stop: spec.stopPolicy,
      retry: spec.retryPolicy,
    }),
  );
}

export function digestMaterials(materials: LoopTaskMaterial[] | undefined): string {
  if (!materials?.length) return hashText("materials:none");
  return hashText(
    stableStringify(
      materials.map((m) => ({
        id: m.id,
        kind: m.kind,
        version: m.version ?? 1,
        bytesHash: m.bytesHash ?? null,
        contentRef: m.contentRef ?? null,
        parseLevel: m.parseLevel ?? null,
        title: m.title,
      })),
    ),
  );
}

export function digestFrozenBudget(budget: FrozenRunBudget): string {
  return hashText(stableStringify(budget));
}

export function digestFrozenPermissions(
  permissionSet: FrozenPermissionSet,
): string {
  return hashText(stableStringify(permissionSet));
}

/**
 * Context fingerprint frozen into approval bindings — materials / definition /
 * code / budget / permission changes invalidate prior approvals.
 */
export function digestRunApprovalContext(
  binding: Pick<
    LoopRunBinding,
    | "codeDigest"
    | "materialsDigest"
    | "definitionDigest"
    | "budget"
    | "permissionSet"
    | "codeDigestStatus"
  >,
): string {
  return hashText(
    stableStringify({
      codeDigest: binding.codeDigest ?? null,
      codeDigestStatus: binding.codeDigestStatus ?? null,
      materialsDigest: binding.materialsDigest ?? null,
      definitionDigest: binding.definitionDigest ?? null,
      budget: binding.budget ?? null,
      permissionSet: binding.permissionSet ?? null,
    }),
  );
}

export function buildRunBindingSnapshot(
  input: BuildRunBindingInput,
): LoopRunBinding {
  const identity = captureWorkspaceIdentity(
    input.workspaceRoot,
    input.declaredBranch,
  );
  const credentialRefIds = collectCredentialRefIds(input.document, input.spec);
  const budget = freezeRunBudget(input.spec);
  const permissionSet = freezePermissionSet(credentialRefIds);
  const definitionDigest = digestDefinitionVersions(input.document, input.spec);
  const materialsDigest = digestMaterials(input.materials);
  const notes = [
    ...(input.preflightNotes ?? []),
    `identity=${identity.identityKind}`,
    `branchSource=${identity.branchSource}`,
    `launch=${input.launchKind}`,
    `codeDigestStatus=${identity.codeDigestStatus}`,
    `definitionDigest=${definitionDigest}`,
    `materialsDigest=${materialsDigest}`,
    `identityDigest=${identity.identityDigest}`,
    ...(identity.headSha ? [`headSha=${identity.headSha.slice(0, 12)}`] : []),
    ...(identity.remoteUrl ? [`remote=${identity.remoteUrl}`] : []),
    ...identity.incompleteReasons.slice(0, 8).map((r) => `incomplete:${r}`),
  ].slice(0, 40);

  return {
    projectId: input.projectId,
    workspaceRoot: identity.workspaceRoot,
    repo: identity.repo,
    ...(identity.branch ? { branch: identity.branch } : {}),
    codeDigest: identity.codeDigest,
    codeDigestStatus: identity.codeDigestStatus,
    ...(identity.incompleteReasons.length
      ? { incompleteReasons: identity.incompleteReasons.slice(0, 20) }
      : {}),
    identityDigest: identity.identityDigest,
    specVersion: input.spec.version,
    ...(input.materials?.length
      ? {
          taskInputId: `task_${hashText(materialsDigest).slice(0, 12)}`,
          materials: input.materials,
        }
      : {}),
    ...(credentialRefIds.length ? { credentialRefIds } : {}),
    preflightNotes: notes,
    createdAt: input.createdAt,
    identityKind: identity.identityKind,
    branchSource: identity.branchSource,
    ...(identity.headSha ? { headSha: identity.headSha } : {}),
    ...(identity.remoteUrl ? { remoteUrl: identity.remoteUrl } : {}),
    ...(identity.declaredBranch
      ? { declaredBranch: identity.declaredBranch }
      : {}),
    workspaceDirtyDigest: identity.workspaceDirtyDigest,
    definitionDigest,
    materialsDigest,
    budget,
    permissionSet,
  };
}

export function assertLaunchContextForBinding(input: {
  projectId?: string;
  requirePreflight?: boolean;
  launchKind: "manual" | "params" | "event";
}): void {
  if (!input.projectId?.trim()) {
    throw new Error(
      `Loop ${input.launchKind} start blocked: missing projectId for RunBinding`,
    );
  }
  if (input.requirePreflight !== true) {
    throw new Error(
      `Loop ${input.launchKind} start blocked: preflight required for production binding`,
    );
  }
}

/** Production start must not proceed on incomplete content digests. */
export function assertCodeDigestComplete(binding: LoopRunBinding): void {
  if (binding.codeDigestStatus === "incomplete") {
    const reasons = (binding.incompleteReasons ?? []).slice(0, 6).join("; ");
    throw new Error(
      `Loop start blocked: incomplete codeDigest (${reasons || "unspecified"})`,
    );
  }
}

/** Credential used at action time must be in the frozen permission set. */
export function assertCredentialAllowedByFreeze(
  binding: LoopRunBinding | undefined,
  credentialRefId: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!binding?.permissionSet || !credentialRefId) return { ok: true };
  if (binding.permissionSet.credentialRefIds.includes(credentialRefId)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Credential ref '${credentialRefId}' not in frozen permissionSet`,
  };
}
