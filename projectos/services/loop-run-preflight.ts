/**
 * Project workflow preflight — confirm before start.
 * Approval presence ≠ authorization to run; missing creds/config blocks honest start.
 */
import type {
  IntentGraphNode,
  LoopGraphDocument,
  LoopSpec,
} from "../contracts/loop-graph.js";
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";
import type { ModelProfile } from "../contracts/settings.js";
import {
  materialsRequireVision,
  resolveLoopVisionCapability,
} from "../contracts/loop-material-vision-capability.js";
import { validateApprovalGateWiring } from "./loop-approval-insert.js";
import { validateLoopNodeConfig } from "./loop-node-config-schema.js";
import { classifyLoopMaterialUrl } from "./loop-url-fetch-policy.js";

export type LoopPreflightItem = {
  id: string;
  severity: "blocker" | "warning" | "info";
  code:
    | "no_approved_spec"
    | "missing_credential"
    | "node_config_invalid"
    | "human_gate"
    | "material_parse"
    | "material_url_ssrf"
    | "material_unsupported"
    | "material_vision_blocked"
    | "material_rereview_required"
    | "branch_unspecified"
    | "ok";
  message: string;
  nodeId?: string;
  materialId?: string;
};

export type LoopPreflightResult = {
  ok: boolean;
  /** True only when zero blockers — warnings alone do not block. */
  canStart: boolean;
  items: LoopPreflightItem[];
};

function draftNodesForSpec(
  doc: LoopGraphDocument,
  spec: LoopSpec,
): IntentGraphNode[] {
  // Prefer current draft architecture fields when ids align; else synthesize from spec.
  const byId = new Map(doc.draft.nodes.map((node) => [node.id, node]));
  return spec.nodes.map((specNode) => {
    const draft = byId.get(specNode.id);
    if (draft) return draft;
    return {
      id: specNode.id,
      title: specNode.goal.slice(0, 120) || specNode.id,
      prompt: specNode.goal,
      type: specNode.type,
      agentRole: specNode.agentRole,
      humanMode: specNode.humanMode,
      actionIntegration: specNode.actionIntegration,
      actionOperation: specNode.actionOperation,
      logicKind: specNode.logicKind,
      maxIterations: specNode.maxIterations,
      position: { x: 0, y: 0 },
    } as IntentGraphNode;
  });
}

/**
 * Build a preflight checklist for starting a project-bound Loop run.
 * Does not start the run and does not mutate the document.
 */
export function preflightLoopRunStart(input: {
  document: LoopGraphDocument;
  specVersion?: string;
  branch?: string;
  materials?: LoopTaskMaterial[];
  /** Active model profile — used for vision attach / block decisions. */
  modelProfile?: ModelProfile | null;
}): LoopPreflightResult {
  const items: LoopPreflightItem[] = [];
  const specs = input.document.approvedSpecs ?? [];
  const spec =
    (input.specVersion
      ? specs.find((item) => item.version === input.specVersion)
      : specs[specs.length - 1]) ?? null;

  if (!spec) {
    items.push({
      id: "pf_no_spec",
      severity: "blocker",
      code: "no_approved_spec",
      message: "No approved LoopSpec — compile and approve before starting a run",
    });
    return { ok: false, canStart: false, items };
  }

  // TM-8: material change writeback must be acknowledged before start.
  const rereview = input.document.taskPack?.materialRereview;
  if (rereview?.requiresRereview && !rereview.acknowledgedAt) {
    items.push({
      id: "pf_material_rereview",
      severity: "blocker",
      code: "material_rereview_required",
      message: `TM-8 plan/approval evidence stale after material change — re-review${
        rereview.affectedNodeIds.length
          ? ` nodes [${rereview.affectedNodeIds.join(", ")}]`
          : " run-level evidence"
      } then acknowledge (not a mechanical full re-run)`,
    });
  }

  if (!input.branch?.trim()) {
    items.push({
      id: "pf_branch",
      severity: "warning",
      code: "branch_unspecified",
      message: "Branch not specified — run binding will omit branch until confirmed",
    });
  }

  if (materialsRequireVision(input.materials)) {
    const vision = resolveLoopVisionCapability(input.modelProfile ?? null);
    if (!vision.supportsVision) {
      items.push({
        id: "pf_vision_blocked",
        severity: "blocker",
        code: "material_vision_blocked",
        message: `${vision.reason}. Replace image materials or switch model profile before start.`,
      });
    }
  }

  const nodes = draftNodesForSpec(input.document, spec);
  for (const node of nodes) {
    const validation = validateLoopNodeConfig(node);
    for (const issue of validation.issues) {
      items.push({
        id: `pf_node_${node.id}_${issue.path}_${issue.code}`,
        severity:
          issue.code === "credential_missing" || issue.code === "required"
            ? "blocker"
            : issue.code === "unknown_connector" ||
                issue.code === "unknown_capability"
              ? "blocker"
              : "warning",
        code:
          issue.code === "credential_missing"
            ? "missing_credential"
            : "node_config_invalid",
        message: `${node.title}: ${issue.message}`,
        nodeId: node.id,
      });
    }
    if (node.type === "human" && (node.humanMode === "approval" || node.humanMode === "decision")) {
      items.push({
        id: `pf_human_${node.id}`,
        severity: "info",
        code: "human_gate",
        message: `Human gate “${node.title}” (${node.humanMode}) — confirm is not auto-run authorization`,
        nodeId: node.id,
      });
    }
  }

  // Approval gates must sit on depends paths — orphan decoration is a blocker.
  for (const issue of validateApprovalGateWiring(input.document.draft)) {
    items.push({
      id: `pf_gate_${issue.code}_${issue.nodeId ?? "graph"}`,
      severity: "blocker",
      code: "human_gate",
      message: issue.message,
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
    });
  }

  for (const material of input.materials ?? []) {
    if (material.parseStatus === "failed") {
      items.push({
        id: `pf_mat_${material.id}_failed`,
        severity: "blocker",
        code: "material_parse",
        message: `Material “${material.title}” failed to parse${
          material.parseMessage ? `: ${material.parseMessage}` : ""
        }`,
        materialId: material.id,
      });
    } else if (
      material.parseStatus === "unsupported" &&
      material.parseLevel !== "vision_attach"
    ) {
      const visionBlock =
        material.kind === "image" ||
        (material.mimeType ?? "").startsWith("image/");
      items.push({
        id: `pf_mat_${material.id}_unsupported`,
        severity: visionBlock ? "blocker" : "warning",
        code: visionBlock ? "material_vision_blocked" : "material_unsupported",
        message: visionBlock
          ? `Image “${material.title}” blocked — ${material.parseMessage ?? "model lacks vision; replace or change profile"}`
          : `Material “${material.title}” is unsupported by the current path — will not be sent as structured bytes`,
        materialId: material.id,
      });
    } else if (material.parseStatus === "partial") {
      items.push({
        id: `pf_mat_${material.id}_partial`,
        severity: "warning",
        code: "material_parse",
        message: `Material “${material.title}” only partially parsed`,
        materialId: material.id,
      });
    }

    if (material.kind === "url" && material.url?.href) {
      const classified = classifyLoopMaterialUrl(material.url.href);
      if (!classified.ok) {
        items.push({
          id: `pf_mat_${material.id}_ssrf`,
          severity: "blocker",
          code: "material_url_ssrf",
          message: `URL material “${material.title}”: ${classified.message}`,
          materialId: material.id,
        });
      }
    }
  }

  const blockers = items.filter((item) => item.severity === "blocker");
  return {
    ok: blockers.length === 0,
    canStart: blockers.length === 0,
    items,
  };
}
