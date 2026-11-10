import { createHash } from "node:crypto";

import type { LoopApprovalBinding } from "../contracts/loop-artifacts.js";
import {
  LoopChangeSetSchema,
  LoopReviewResultSchema,
  LoopTestReportSchema,
} from "../contracts/loop-artifacts.js";
import type { LoopInstance, LoopInstanceArtifact } from "../contracts/loop-graph.js";
import type { LoopExecutionHooks } from "./loop-execution.js";
import { stableStringify } from "./loop-intent-graph-diff.js";
import {
  combineFileDigests,
  createWorkspacePathDigester,
  EMPTY_CODE_DIGEST,
  type WorkspacePathDigestResult,
} from "./loop-workspace-digest.js";

export { diffIntentGraphs, stableStringify } from "./loop-intent-graph-diff.js";
export {
  combineFileDigests,
  createWorkspacePathDigester,
  digestBytes,
  EMPTY_CODE_DIGEST,
  resolveContainedWorkspacePath,
  type WorkspacePathDigestResult,
} from "./loop-workspace-digest.js";

const ENGINEERING_ARTIFACT_KINDS = [
  "change_set",
  "test_report",
  "review_result",
] as const;

export type EngineeringBaselineSnapshot = {
  /** Combined hash of code + artifact content material + evidence stamps. */
  baseline: string;
  artifactIds: string[];
  artifacts: LoopInstanceArtifact[];
  /** Hash of delivery-scope workspace bytes (fail-closed when unread). */
  codeDigest: string;
  /** Accumulated present paths in delivery scope. */
  deliveryFiles: string[];
  /** Accumulated tombstone paths. */
  deletedFiles: string[];
  testValidatedCodeDigest?: string;
  reviewValidatedCodeDigest?: string;
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

/** All ChangeSet artifacts in chronological order. */
export function listChangeSetArtifacts(
  instance: LoopInstance,
): LoopInstanceArtifact[] {
  return (instance.artifacts ?? []).filter((item) => item.kind === "change_set");
}

/**
 * Accumulate delivery scope across every ChangeSet (multi-agent / multi-leaf).
 * Later ChangeSets can tombstone earlier paths via deletedFiles.
 */
export function accumulateDeliveryScope(instance: LoopInstance): {
  files: string[];
  deletedFiles: string[];
  parseFailed: boolean;
  emptyIllegal: boolean;
  latestContentDigest?: string;
} {
  const present = new Set<string>();
  const deleted = new Set<string>();
  let parseFailed = false;
  let emptyIllegal = false;
  let latestContentDigest: string | undefined;
  let sawChangeSet = false;

  for (const art of listChangeSetArtifacts(instance)) {
    sawChangeSet = true;
    const parsed = LoopChangeSetSchema.safeParse(art.data);
    if (!parsed.success) {
      parseFailed = true;
      continue;
    }
    const data = parsed.data;
    if (
      data.files.length === 0 &&
      !(data.deletedFiles && data.deletedFiles.length > 0) &&
      !data.contentDigest
    ) {
      emptyIllegal = true;
    }
    for (const path of data.deletedFiles ?? []) {
      present.delete(path);
      deleted.add(path);
    }
    for (const path of data.files) {
      deleted.delete(path);
      present.add(path);
    }
    if (data.contentDigest) latestContentDigest = data.contentDigest;
  }

  if (!sawChangeSet) {
    return { files: [], deletedFiles: [], parseFailed: false, emptyIllegal: false };
  }

  return {
    files: [...present].sort(),
    deletedFiles: [...deleted].sort(),
    parseFailed,
    emptyIllegal,
    ...(latestContentDigest ? { latestContentDigest } : {}),
  };
}

/** Stable fingerprint of engineering artifact bodies (status/content), not ids alone. */
export function digestArtifactMaterial(
  artifacts: LoopInstanceArtifact[],
): string {
  const material = artifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    nodeId: artifact.nodeId,
    data: artifact.data,
  }));
  return createHash("sha256")
    .update(stableStringify(material), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function digestOperationPayload(
  payload: Record<string, unknown> | undefined,
): string {
  return createHash("sha256")
    .update(stableStringify(payload ?? {}), "utf8")
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

  const testArt = latestOf(instance, "test_report");
  const reviewArt = latestOf(instance, "review_result");
  const testReport = testArt
    ? LoopTestReportSchema.safeParse(testArt.data)
    : null;
  const reviewResult = reviewArt
    ? LoopReviewResultSchema.safeParse(reviewArt.data)
    : null;

  const scope = accumulateDeliveryScope(instance);
  let codeDigest = EMPTY_CODE_DIGEST;
  let evidenceFresh = true;
  let failClosedReason: string | undefined;

  if (scope.parseFailed) {
    evidenceFresh = false;
    failClosedReason = "ChangeSet artifact failed schema validation; fail-closed";
    codeDigest = "unavailable";
  } else if (scope.emptyIllegal) {
    evidenceFresh = false;
    failClosedReason =
      "Empty/illegal ChangeSet (no files, deletions, or contentDigest); fail-closed";
    codeDigest = "unavailable";
  } else if (scope.files.length > 0 || scope.deletedFiles.length > 0) {
    const digester = execution?.digestWorkspacePaths;
    if (!digester) {
      evidenceFresh = false;
      failClosedReason =
        "Cannot verify workspace file digests (no digester); fail-closed";
      codeDigest = "unavailable";
    } else {
      const result = digester(scope.files, {
        deletedPaths: scope.deletedFiles,
      }) as WorkspacePathDigestResult;
      const undeleted = result.undeleted ?? [];
      const unexpectedMissing = result.missing ?? [];
      const unreadable = result.unreadable ?? [];
      if (
        unexpectedMissing.length > 0 ||
        unreadable.length > 0 ||
        undeleted.length > 0
      ) {
        evidenceFresh = false;
        failClosedReason = `Workspace delivery scope invalid: ${[
          ...unexpectedMissing.map((path) => `missing:${path}`),
          ...undeleted.map((path) => `undeleted:${path}`),
          ...unreadable.map((path) => `unreadable:${path}`),
        ]
          .slice(0, 8)
          .join(", ")}`;
        codeDigest = "unavailable";
      } else {
        // Include tombstone markers in digest material so delete-only deliveries bind.
        const withTombs = {
          ...result.digests,
          ...Object.fromEntries(
            (result.tombstones ?? []).map((path) => [`tombstone:${path}`, "deleted"]),
          ),
        };
        codeDigest = combineFileDigests(withTombs);
        if (scope.latestContentDigest && scope.latestContentDigest !== codeDigest) {
          evidenceFresh = false;
          failClosedReason =
            "Workspace content drifted from accumulated ChangeSet.contentDigest";
        }
        if (
          scope.files.length > 0 &&
          !scope.latestContentDigest &&
          Object.keys(result.digests).length > 0
        ) {
          evidenceFresh = false;
          failClosedReason =
            "ChangeSet has files but no contentDigest; fail-closed until re-verified";
        }
      }
    }
  } else if (scope.latestContentDigest) {
    codeDigest = scope.latestContentDigest;
  }

  // Prefer live verification snapshot when present (Verify start/end capture).
  if (
    instance.verificationCodeDigest &&
    codeDigest !== "unavailable" &&
    instance.verificationCodeDigest !== codeDigest
  ) {
    evidenceFresh = false;
    failClosedReason =
      failClosedReason ??
      "Live workspace digest differs from verificationCodeDigest snapshot";
  }

  const testValidatedCodeDigest = testReport?.success
    ? testReport.data.validatedCodeDigest
    : undefined;
  const reviewValidatedCodeDigest = reviewResult?.success
    ? reviewResult.data.validatedCodeDigest
    : undefined;

  if (testArt && !testReport?.success) {
    evidenceFresh = false;
    failClosedReason =
      failClosedReason ?? "TestReport artifact failed schema validation";
  }
  if (reviewArt && !reviewResult?.success) {
    evidenceFresh = false;
    failClosedReason =
      failClosedReason ?? "ReviewResult artifact failed schema validation";
  }

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
        "TestReport validated a different codeDigest than current delivery scope";
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
        "ReviewResult validated a different codeDigest than current delivery scope";
    }
  }

  const artifactMaterial = digestArtifactMaterial(artifacts);
  const material = {
    artifactIds: artifacts.map((artifact) => artifact.id),
    artifactMaterial,
    codeDigest,
    deliveryFiles: scope.files,
    deletedFiles: scope.deletedFiles,
    testValidatedCodeDigest: testValidatedCodeDigest ?? null,
    reviewValidatedCodeDigest: reviewValidatedCodeDigest ?? null,
    testStatus: testReport?.success ? testReport.data.status : null,
    reviewVerdict: reviewResult?.success ? reviewResult.data.verdict : null,
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
    deliveryFiles: scope.files,
    deletedFiles: scope.deletedFiles,
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
