import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import type { LoopApprovalBinding } from "../contracts/loop-artifacts.js";
import {
  LoopChangeSetSchema,
  LoopReviewResultSchema,
  LoopTestReportSchema,
} from "../contracts/loop-artifacts.js";
import type { LoopInstance, LoopInstanceArtifact } from "../contracts/loop-graph.js";
import type { LoopExecutionHooks } from "./loop-execution.js";
import { stableStringify } from "./loop-intent-graph-diff.js";

export { diffIntentGraphs, stableStringify } from "./loop-intent-graph-diff.js";

const ENGINEERING_ARTIFACT_KINDS = [
  "change_set",
  "test_report",
  "review_result",
] as const;

/** Empty workspace / empty ChangeSet files digest (stable). */
export const EMPTY_CODE_DIGEST = createHash("sha256")
  .update("[]", "utf8")
  .digest("hex")
  .slice(0, 32);

export type WorkspacePathDigestResult = {
  digests: Record<string, string>;
  missing: string[];
  unreadable: string[];
};

export type EngineeringBaselineSnapshot = {
  /** Combined hash of code + artifact ids + evidence validation stamps. */
  baseline: string;
  artifactIds: string[];
  artifacts: LoopInstanceArtifact[];
  /** Hash of current workspace bytes for ChangeSet.files (fail-closed when unread). */
  codeDigest: string;
  /** TestReport.validatedCodeDigest when present. */
  testValidatedCodeDigest?: string;
  /** ReviewResult.validatedCodeDigest when present. */
  reviewValidatedCodeDigest?: string;
  /**
   * False when files cannot be read, ChangeSet lacks a content stamp while
   * claiming files, or Test/Review stamps do not match current codeDigest.
   */
  evidenceFresh: boolean;
  failClosedReason?: string;
};

function latestOf(
  instance: LoopInstance,
  kind: LoopInstanceArtifact["kind"],
): LoopInstanceArtifact | undefined {
  const list = instance.artifacts ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]!;
    if (item.kind === kind) return item;
  }
  return undefined;
}

export function digestOperationPayload(
  payload: Record<string, unknown> | undefined,
): string {
  return createHash("sha256")
    .update(stableStringify(payload ?? {}), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function digestBytes(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/**
 * Resolve a relative workspace path without escaping the root.
 * Absolute / `..` escapes → null (fail-closed).
 */
export function resolveContainedWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
): string | null {
  const trimmed = relativePath.trim();
  if (!trimmed || isAbsolute(trimmed)) return null;
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, normalize(trimmed));
  const rel = relative(root, candidate);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return null;
  return candidate;
}

/** Default digester for product hooks — reads real files under workspaceRoot. */
export function createWorkspacePathDigester(
  workspaceRoot: string,
): (paths: string[]) => WorkspacePathDigestResult {
  return (paths: string[]) => {
    const digests: Record<string, string> = {};
    const missing: string[] = [];
    const unreadable: string[] = [];
    const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    for (const path of unique) {
      const absolute = resolveContainedWorkspacePath(workspaceRoot, path);
      if (!absolute) {
        unreadable.push(path);
        continue;
      }
      try {
        const stat = statSync(absolute);
        if (!stat.isFile()) {
          unreadable.push(path);
          continue;
        }
        digests[path] = digestBytes(readFileSync(absolute));
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "ENOENT") missing.push(path);
        else unreadable.push(path);
      }
    }
    return { digests, missing, unreadable };
  };
}

export function combineFileDigests(digests: Record<string, string>): string {
  const entries = Object.entries(digests).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return EMPTY_CODE_DIGEST;
  return createHash("sha256")
    .update(stableStringify(entries), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function computeEngineeringBaseline(
  instance: LoopInstance,
  execution?: LoopExecutionHooks,
): EngineeringBaselineSnapshot {
  const artifacts: LoopInstanceArtifact[] = [];
  for (const kind of ENGINEERING_ARTIFACT_KINDS) {
    const artifact = latestOf(instance, kind);
    if (artifact) artifacts.push(artifact);
  }

  const changeSetArt = latestOf(instance, "change_set");
  const testArt = latestOf(instance, "test_report");
  const reviewArt = latestOf(instance, "review_result");

  const changeSet = changeSetArt
    ? LoopChangeSetSchema.safeParse(changeSetArt.data)
    : null;
  const testReport = testArt
    ? LoopTestReportSchema.safeParse(testArt.data)
    : null;
  const reviewResult = reviewArt
    ? LoopReviewResultSchema.safeParse(reviewArt.data)
    : null;

  const files = changeSet?.success ? changeSet.data.files : [];
  let codeDigest = EMPTY_CODE_DIGEST;
  let evidenceFresh = true;
  let failClosedReason: string | undefined;

  if (files.length > 0) {
    const digester = execution?.digestWorkspacePaths;
    if (!digester) {
      evidenceFresh = false;
      failClosedReason =
        "Cannot verify workspace file digests (no digester); fail-closed";
      codeDigest = "unavailable";
    } else {
      const result = digester(files);
      if (result.missing.length > 0 || result.unreadable.length > 0) {
        evidenceFresh = false;
        failClosedReason = `Workspace paths missing/unreadable: ${[
          ...result.missing,
          ...result.unreadable,
        ]
          .slice(0, 8)
          .join(", ")}`;
        codeDigest = "unavailable";
      } else {
        codeDigest = combineFileDigests(result.digests);
        const stamped = changeSet?.success
          ? changeSet.data.contentDigest
          : undefined;
        if (stamped && stamped !== codeDigest) {
          evidenceFresh = false;
          failClosedReason =
            "Workspace content drifted from ChangeSet.contentDigest (dirty/untracked edit)";
        }
        if (!stamped) {
          // ChangeSet claimed files but never stamped bytes — cannot assert code binding.
          evidenceFresh = false;
          failClosedReason =
            "ChangeSet has files but no contentDigest; fail-closed until re-verified";
        }
      }
    }
  } else if (changeSet?.success && changeSet.data.contentDigest) {
    codeDigest = changeSet.data.contentDigest;
  }

  const testValidatedCodeDigest = testReport?.success
    ? testReport.data.validatedCodeDigest
    : undefined;
  const reviewValidatedCodeDigest = reviewResult?.success
    ? reviewResult.data.validatedCodeDigest
    : undefined;

  if (
    testArt &&
    codeDigest !== "unavailable" &&
    codeDigest !== EMPTY_CODE_DIGEST
  ) {
    if (!testValidatedCodeDigest) {
      evidenceFresh = false;
      failClosedReason =
        failClosedReason ??
        "TestReport lacks validatedCodeDigest for current code";
    } else if (testValidatedCodeDigest !== codeDigest) {
      evidenceFresh = false;
      failClosedReason =
        failClosedReason ??
        "TestReport validated a different codeDigest than current ChangeSet";
    }
  }

  if (
    reviewArt &&
    codeDigest !== "unavailable" &&
    codeDigest !== EMPTY_CODE_DIGEST
  ) {
    if (!reviewValidatedCodeDigest) {
      evidenceFresh = false;
      failClosedReason =
        failClosedReason ??
        "ReviewResult lacks validatedCodeDigest for current code";
    } else if (reviewValidatedCodeDigest !== codeDigest) {
      evidenceFresh = false;
      failClosedReason =
        failClosedReason ??
        "ReviewResult validated a different codeDigest than current ChangeSet";
    }
  }

  const material = {
    artifactIds: artifacts.map((artifact) => artifact.id),
    codeDigest,
    testValidatedCodeDigest: testValidatedCodeDigest ?? null,
    reviewValidatedCodeDigest: reviewValidatedCodeDigest ?? null,
    evidenceFresh,
  };

  return {
    baseline: createHash("sha256")
      .update(stableStringify(material), "utf8")
      .digest("hex")
      .slice(0, 32),
    artifactIds: artifacts.map((artifact) => artifact.id),
    artifacts,
    codeDigest,
    ...(testValidatedCodeDigest ? { testValidatedCodeDigest } : {}),
    ...(reviewValidatedCodeDigest ? { reviewValidatedCodeDigest } : {}),
    evidenceFresh,
    ...(failClosedReason ? { failClosedReason } : {}),
  };
}

export function buildDefaultActionPayload(input: {
  actionIntegration?: string;
  actionOperation?: string;
  nodeId: string;
}): Record<string, unknown> {
  return {
    approved: true,
    nodeId: input.nodeId,
    integration: input.actionIntegration ?? null,
    operation: input.actionOperation ?? "run",
  };
}

export function buildApprovalBinding(input: {
  instanceId: string;
  /** Human gate node or self-gated Action node that recorded the decision. */
  decisionNodeId: string;
  /** Action node that must execute under this approval. */
  actionNodeId: string;
  actionIntegration?: string;
  actionOperation?: string;
  engineering: EngineeringBaselineSnapshot;
  operationDigest: string;
  actor?: string;
}): LoopApprovalBinding {
  return {
    instanceId: input.instanceId,
    nodeId: input.actionNodeId,
    decisionNodeId: input.decisionNodeId,
    artifactIds: [...input.engineering.artifactIds],
    engineeringBaseline: input.engineering.baseline,
    codeDigest: input.engineering.codeDigest,
    operationDigest: input.operationDigest,
    ...(input.actionIntegration
      ? { actionIntegration: input.actionIntegration }
      : {}),
    ...(input.actionOperation ? { actionOperation: input.actionOperation } : {}),
    status: "valid",
    actorKind: input.actor ? "local_declared" : "unspecified",
  };
}

export function isApprovalChoice(choice: string): boolean {
  const normalized = choice.trim().toLowerCase();
  if (
    normalized === "not approved" ||
    normalized === "not_approved" ||
    normalized === "unapproved" ||
    normalized === "disapprove" ||
    normalized === "不同意" ||
    normalized === "不批准"
  ) {
    return false;
  }
  return (
    normalized === "approve" ||
    normalized === "approved" ||
    normalized === "edit" ||
    normalized === "批准" ||
    normalized === "同意"
  );
}

export function isApprovalBindingCurrent(input: {
  binding:
    | NonNullable<LoopInstance["pendingApprovalBinding"]>
    | LoopApprovalBinding;
  instance: LoopInstance;
  payload: Record<string, unknown> | undefined;
  actionNodeId: string;
  actionIntegration?: string;
  actionOperation?: string;
  execution?: LoopExecutionHooks;
}): boolean {
  if ("status" in input.binding && input.binding.status === "invalidated") {
    return false;
  }
  if (
    "instanceId" in input.binding &&
    input.binding.instanceId !== input.instance.id
  ) {
    return false;
  }
  const boundNodeId =
    "nodeId" in input.binding ? input.binding.nodeId : undefined;
  if (boundNodeId && boundNodeId !== input.actionNodeId) return false;

  const boundIntegration =
    "actionIntegration" in input.binding
      ? input.binding.actionIntegration
      : undefined;
  const boundOperation =
    "actionOperation" in input.binding
      ? input.binding.actionOperation
      : undefined;
  if (
    boundIntegration !== undefined &&
    boundIntegration !== (input.actionIntegration ?? undefined)
  ) {
    return false;
  }
  if (
    boundOperation !== undefined &&
    boundOperation !== (input.actionOperation ?? undefined)
  ) {
    return false;
  }

  const current = computeEngineeringBaseline(input.instance, input.execution);
  if (!current.evidenceFresh) return false;
  if (input.binding.engineeringBaseline !== current.baseline) return false;
  if (
    "codeDigest" in input.binding &&
    input.binding.codeDigest &&
    input.binding.codeDigest !== current.codeDigest
  ) {
    return false;
  }
  if (input.binding.artifactIds.length !== current.artifactIds.length) {
    return false;
  }
  for (let i = 0; i < current.artifactIds.length; i += 1) {
    if (input.binding.artifactIds[i] !== current.artifactIds[i]) return false;
  }
  return (
    input.binding.operationDigest === digestOperationPayload(input.payload)
  );
}

export function invalidatePendingApproval(
  instance: LoopInstance,
  reason: string,
): LoopInstance {
  if (!instance.pendingApprovalBinding && !instance.pendingActionPayload) {
    return instance;
  }
  const invalidatedAt = new Date().toISOString();
  const artifacts = (instance.artifacts ?? []).map((artifact) => {
    if (artifact.kind !== "human_decision") return artifact;
    if (
      instance.pendingApprovalBinding &&
      artifact.id !== instance.pendingApprovalBinding.decisionArtifactId
    ) {
      return artifact;
    }
    const data =
      artifact.data && typeof artifact.data === "object"
        ? (artifact.data as Record<string, unknown>)
        : {};
    const binding =
      data.binding && typeof data.binding === "object"
        ? (data.binding as Record<string, unknown>)
        : undefined;
    if (!binding) return artifact;
    return {
      ...artifact,
      data: {
        ...data,
        binding: {
          ...binding,
          status: "invalidated",
          invalidatedReason: reason,
          invalidatedAt,
        },
      },
    };
  });
  return {
    ...instance,
    artifacts,
    pendingActionPayload: undefined,
    pendingApprovalBinding: undefined,
  };
}

export function shouldInvalidateApprovalOnArtifactKind(
  kind: LoopInstanceArtifact["kind"],
): boolean {
  return (ENGINEERING_ARTIFACT_KINDS as readonly string[]).includes(kind);
}
