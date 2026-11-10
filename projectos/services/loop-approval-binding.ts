import { createHash } from "node:crypto";

import type { LoopApprovalBinding } from "../contracts/loop-artifacts.js";
import type { LoopInstance, LoopInstanceArtifact } from "../contracts/loop-graph.js";

const ENGINEERING_ARTIFACT_KINDS = [
  "change_set",
  "test_report",
  "review_result",
] as const;

export type EngineeringBaselineSnapshot = {
  baseline: string;
  artifactIds: string[];
  artifacts: LoopInstanceArtifact[];
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
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
): EngineeringBaselineSnapshot {
  const artifacts: LoopInstanceArtifact[] = [];
  for (const kind of ENGINEERING_ARTIFACT_KINDS) {
    const artifact = latestOf(instance, kind);
    if (artifact) artifacts.push(artifact);
  }
  const material = artifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    nodeId: artifact.nodeId,
    data: artifact.data,
  }));
  return {
    baseline: createHash("sha256")
      .update(stableStringify(material), "utf8")
      .digest("hex")
      .slice(0, 32),
    artifactIds: artifacts.map((artifact) => artifact.id),
    artifacts,
  };
}

export function buildApprovalBinding(input: {
  instanceId: string;
  nodeId: string;
  engineering: EngineeringBaselineSnapshot;
  operationDigest: string;
}): LoopApprovalBinding {
  return {
    instanceId: input.instanceId,
    nodeId: input.nodeId,
    artifactIds: [...input.engineering.artifactIds],
    engineeringBaseline: input.engineering.baseline,
    operationDigest: input.operationDigest,
    status: "valid",
  };
}

export function isApprovalBindingCurrent(input: {
  binding:
    | NonNullable<LoopInstance["pendingApprovalBinding"]>
    | LoopApprovalBinding;
  instance: LoopInstance;
  payload: Record<string, unknown> | undefined;
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
  const current = computeEngineeringBaseline(input.instance);
  if (input.binding.engineeringBaseline !== current.baseline) return false;
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
