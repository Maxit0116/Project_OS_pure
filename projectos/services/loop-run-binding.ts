/**
 * Shared RunBinding snapshot for every Loop start entry (manual / params / event).
 * Freezes workspace identity, content digest, approved budget/permissions, and
 * material/definition versions so later Intent/Spec edits cannot rewrite the run.
 *
 * Credentials: ref ids only — never tokens.
 * Git: verified remote/HEAD/branch when .git exists; otherwise explicit non-git identity.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

export type FrozenRunBudget = {
  maxRounds: number;
  maxRetries: number;
  maxAgentCalls: number;
  maxAgentCallDepth: number;
};

export type FrozenPermissionSet = {
  credentialRefIds: string[];
  /** High-risk terminal/external actions require HITL — frozen at start. */
  requireHitlForHighRisk: true;
};

export type WorkspaceIdentitySnapshot = {
  identityKind: RepoIdentityKind;
  workspaceRoot: string;
  /** Human + machine identity: remote URL, or `workspace:<abs>`, never a bare pretend-git name. */
  repo: string;
  remoteUrl?: string;
  headSha?: string;
  /** Verified git branch when available; otherwise omitted or declared-only. */
  branch?: string;
  branchSource: BranchSource;
  /** Porcelain + dirty path content fingerprint (or clean marker). */
  workspaceDirtyDigest: string;
  /** Declared branch from UI/event when it differs from verified git branch. */
  declaredBranch?: string;
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
  /** When event/params omit required launch context, callers must block before this. */
  launchKind: "manual" | "params" | "event";
};

function gitCapture(
  workspaceRoot: string,
  args: string[],
): string | null {
  try {
    return execFileSync("git", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    })
      .trim();
  } catch {
    return null;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

/**
 * Resolve workspace identity without pretending a non-git folder is a git repo.
 */
export function captureWorkspaceIdentity(
  workspaceRoot: string,
  declaredBranch?: string,
): WorkspaceIdentitySnapshot {
  const gitDir = join(workspaceRoot, ".git");
  const hasGit = existsSync(gitDir);
  if (!hasGit) {
    return {
      identityKind: "workspace_path",
      workspaceRoot,
      repo: `workspace:${workspaceRoot}`,
      branchSource: declaredBranch ? "declared_unverified" : "none",
      ...(declaredBranch ? { branch: declaredBranch, declaredBranch } : {}),
      workspaceDirtyDigest: hashText(`nongit:${workspaceRoot}`),
    };
  }

  const headSha = gitCapture(workspaceRoot, ["rev-parse", "HEAD"]) ?? undefined;
  const verifiedBranch =
    gitCapture(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? undefined;
  const remoteUrl =
    gitCapture(workspaceRoot, ["remote", "get-url", "origin"]) ?? undefined;
  const porcelain =
    gitCapture(workspaceRoot, ["status", "--porcelain", "-uall"]) ?? "";

  let dirtyMaterial = `clean:${headSha ?? "unknown"}`;
  if (porcelain.trim()) {
    const lines = porcelain.split("\n").filter(Boolean).slice(0, 200);
    const pathDigests: string[] = [];
    for (const line of lines) {
      const path = line.slice(3).trim().replace(/^.* -> /, "");
      if (!path || path.includes(".env") || path.includes("credential")) continue;
      try {
        const abs = join(workspaceRoot, path);
        if (!existsSync(abs)) {
          pathDigests.push(`${path}:missing`);
          continue;
        }
        pathDigests.push(`${path}:${digestBytes(readFileSync(abs))}`);
      } catch {
        pathDigests.push(`${path}:unreadable`);
      }
    }
    dirtyMaterial = hashText(
      stableStringify({ porcelain: lines, pathDigests }),
    );
  }

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

  return {
    identityKind,
    workspaceRoot,
    repo,
    ...(remoteUrl ? { remoteUrl } : {}),
    ...(headSha ? { headSha } : {}),
    ...(branch ? { branch } : {}),
    branchSource,
    workspaceDirtyDigest:
      typeof dirtyMaterial === "string" && dirtyMaterial.length === 32
        ? dirtyMaterial
        : hashText(dirtyMaterial),
    ...(declaredBranch && declaredBranch !== verifiedBranch
      ? { declaredBranch }
      : {}),
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
    maxRetries: Math.max(0, spec.retryPolicy?.maxAttempts ?? 0),
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

/**
 * Content-oriented code digest at start:
 * git HEAD (+ dirty tree) when git; otherwise workspace path identity hash.
 * Not a path-only featureNode fingerprint.
 */
export function buildCodeDigest(identity: WorkspaceIdentitySnapshot): string {
  return hashText(
    stableStringify({
      identityKind: identity.identityKind,
      repo: identity.repo,
      headSha: identity.headSha ?? null,
      branch: identity.branch ?? null,
      dirty: identity.workspaceDirtyDigest,
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
  const codeDigest = buildCodeDigest(identity);
  const notes = [
    ...(input.preflightNotes ?? []),
    `identity=${identity.identityKind}`,
    `branchSource=${identity.branchSource}`,
    `launch=${input.launchKind}`,
    `definitionDigest=${definitionDigest}`,
    `materialsDigest=${materialsDigest}`,
    ...(identity.headSha ? [`headSha=${identity.headSha.slice(0, 12)}`] : []),
    ...(identity.remoteUrl ? [`remote=${identity.remoteUrl}`] : []),
  ].slice(0, 40);

  return {
    projectId: input.projectId,
    workspaceRoot: identity.workspaceRoot,
    repo: identity.repo,
    ...(identity.branch ? { branch: identity.branch } : {}),
    codeDigest,
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
    // Extended freeze fields (schema-extended below)
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
  } as LoopRunBinding;
}

/**
 * Event/params starts must not sneak past missing project or preflight context.
 */
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
