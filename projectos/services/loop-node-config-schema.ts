/**
 * Shared node configuration schema for manual DutyCard forms and AI authoring.
 * Connector capability params are validated against the trusted catalog — never invented.
 */
import { z } from "zod";
import {
  LOOP_ACTION_INTEGRATIONS,
  LOOP_AGENT_ROLES,
  LOOP_HUMAN_MODES,
  LOOP_LOGIC_KINDS,
  type LoopActionIntegration,
  type LoopLogicKind,
  type LoopNodeType,
} from "../contracts/loop-node-architecture.js";
import type {
  IntentGraph,
  IntentGraphEdge,
  IntentGraphNode,
} from "../contracts/loop-graph.js";
import { IntentEdgeKindSchema } from "../contracts/loop-graph.js";
import { getConnectorVendor } from "./loop-connectors/catalog.js";

export const LoopNodeScalarParamSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
]);

export const LoopNodeActionParamsSchema = z
  .record(z.string().min(1).max(80), LoopNodeScalarParamSchema)
  .refine((value) => Object.keys(value).length <= 32, {
    message: "actionParams supports at most 32 keys",
  });

/** Fields shared by Intent nodes for typed config (manual + AI). */
export const LoopNodeTypedConfigSchema = z
  .object({
    credentialRefId: z.string().trim().min(1).max(120).optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    retryLimit: z.number().int().positive().max(20).optional(),
    waitMs: z.number().int().nonnegative().max(3_600_000).optional(),
    humanAssignee: z.string().trim().min(1).max(120).optional(),
    humanAllowedActions: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .optional(),
    actionParams: LoopNodeActionParamsSchema.optional(),
  })
  .strict();

export type LoopNodeTypedConfig = z.infer<typeof LoopNodeTypedConfigSchema>;

export type NodeConfigValidationIssue = {
  path: string;
  message: string;
  code:
    | "required"
    | "type"
    | "range"
    | "unknown_field"
    | "unknown_connector"
    | "unknown_capability"
    | "credential_missing"
    | "dependency";
};

export type NodeConfigValidationResult = {
  ok: boolean;
  issues: NodeConfigValidationIssue[];
  /** True when missing credentials would block honest "runnable" UI. */
  blocksRun: boolean;
};

const GITHUB_OPS = new Set([
  "create_branch",
  "commit",
  "push",
  "create_pr",
  "update_pr",
  "get_issue",
  "create_issue",
  "get_pr_status",
]);

const SENTRY_OPS = new Set(["list_issues", "get_issue"]);
const SLACK_OPS = new Set([
  "chat_postMessage",
  "incoming_webhook_notify",
  "post_message",
]);
const FEISHU_LARK_OPS = new Set([
  "im_message_create",
  "custom_bot_notify",
  "post_message",
]);
const GMAIL_OPS = new Set([
  "messages_search",
  "messages_get",
  "threads_get",
  "attachments_get",
  "poll_history",
  "users_watch",
  "draft_plan",
  "messages_send",
]);

function allowedOperations(
  integration: LoopActionIntegration | undefined,
): Set<string> | null {
  if (!integration) return null;
  if (integration === "github") return GITHUB_OPS;
  if (integration === "sentry") return SENTRY_OPS;
  if (integration === "slack") return SLACK_OPS;
  if (integration === "feishu" || integration === "lark") return FEISHU_LARK_OPS;
  if (integration === "gmail") return GMAIL_OPS;
  if (integration === "test" || integration === "terminal") return null;
  return null;
}

/**
 * Validate a node's typed config against architecture + connector catalog.
 * Does not invent connectors/fields; unknown keys and capabilities are rejected.
 */
export function validateLoopNodeConfig(
  node: IntentGraphNode,
): NodeConfigValidationResult {
  const issues: NodeConfigValidationIssue[] = [];
  const typedParse = LoopNodeTypedConfigSchema.safeParse({
    ...(node.credentialRefId ? { credentialRefId: node.credentialRefId } : {}),
    ...(typeof node.timeoutMs === "number" ? { timeoutMs: node.timeoutMs } : {}),
    ...(typeof node.retryLimit === "number" ? { retryLimit: node.retryLimit } : {}),
    ...(typeof node.waitMs === "number" ? { waitMs: node.waitMs } : {}),
    ...(node.humanAssignee ? { humanAssignee: node.humanAssignee } : {}),
    ...(node.humanAllowedActions
      ? { humanAllowedActions: node.humanAllowedActions }
      : {}),
    ...(node.actionParams ? { actionParams: node.actionParams } : {}),
  });
  if (!typedParse.success) {
    for (const issue of typedParse.error.issues) {
      issues.push({
        path: issue.path.join(".") || "config",
        message: issue.message,
        code: issue.code === "unrecognized_keys" ? "unknown_field" : "type",
      });
    }
  }

  const type = (node.type ?? undefined) as LoopNodeType | undefined;

  if (type === "action") {
    const integration = node.actionIntegration;
    if (!integration) {
      issues.push({
        path: "actionIntegration",
        message: "Action node requires an integration",
        code: "required",
      });
    } else if (
      !(LOOP_ACTION_INTEGRATIONS as readonly string[]).includes(integration)
    ) {
      issues.push({
        path: "actionIntegration",
        message: `Unknown connector ${integration}`,
        code: "unknown_connector",
      });
    } else {
      const vendor = getConnectorVendor(integration);
      const ops = allowedOperations(integration);
      if (node.actionOperation && ops && !ops.has(node.actionOperation)) {
        // Prefer catalog capability ids when present.
        const catalogOk =
          vendor?.capabilities.some((cap) => cap.id === node.actionOperation) ??
          false;
        if (!catalogOk) {
          issues.push({
            path: "actionOperation",
            message: `Unknown operation ${node.actionOperation} for ${integration}`,
            code: "unknown_capability",
          });
        }
      }
      if (
        vendor &&
        vendor.implStatus === "catalog_only" &&
        node.actionOperation
      ) {
        issues.push({
          path: "actionOperation",
          message: `${vendor.displayName} is catalog_only — not executable`,
          code: "dependency",
        });
      }
      const needsCred =
        integration === "slack" ||
        integration === "feishu" ||
        integration === "lark" ||
        integration === "sentry" ||
        integration === "github" ||
        integration === "gmail";
      if (needsCred && !node.credentialRefId) {
        issues.push({
          path: "credentialRefId",
          message: "Credential reference required before this Action can run",
          code: "credential_missing",
        });
      }
    }
  }

  if (type === "logic") {
    const kind = node.logicKind as LoopLogicKind | undefined;
    if (kind && !(LOOP_LOGIC_KINDS as readonly string[]).includes(kind)) {
      issues.push({
        path: "logicKind",
        message: `Unknown logic kind ${kind}`,
        code: "unknown_field",
      });
    }
    if (kind === "loop" && (node.maxIterations == null || node.maxIterations < 1)) {
      issues.push({
        path: "maxIterations",
        message: "Loop requires maxIterations ≥ 1",
        code: "required",
      });
    }
    if (kind === "retry" && (node.retryLimit == null || node.retryLimit < 1)) {
      issues.push({
        path: "retryLimit",
        message: "Retry logic requires retryLimit ≥ 1",
        code: "required",
      });
    }
    if (kind === "wait" && node.waitMs == null) {
      issues.push({
        path: "waitMs",
        message: "Wait logic requires waitMs",
        code: "required",
      });
    }
  }

  if (type === "human") {
    const mode = node.humanMode;
    if (mode && !(LOOP_HUMAN_MODES as readonly string[]).includes(mode)) {
      issues.push({
        path: "humanMode",
        message: `Unknown human mode ${mode}`,
        code: "unknown_field",
      });
    }
    if ((mode === "approval" || mode === "decision") && !node.humanAssignee) {
      issues.push({
        path: "humanAssignee",
        message: "Approver / assignee is required for approval/decision",
        code: "required",
      });
    }
  }

  if (type === "agent" && node.agentRole) {
    if (!(LOOP_AGENT_ROLES as readonly string[]).includes(node.agentRole)) {
      issues.push({
        path: "agentRole",
        message: `Unknown agent role ${node.agentRole}`,
        code: "unknown_field",
      });
    }
  }

  const blocksRun = issues.some(
    (issue) =>
      issue.code === "credential_missing" ||
      issue.code === "unknown_connector" ||
      issue.code === "unknown_capability" ||
      issue.code === "required",
  );

  return { ok: issues.length === 0, issues, blocksRun };
}

export type IntentGraphNodePatch = Partial<
  Omit<IntentGraphNode, "id" | "position">
> & {
  /** Optional position update — omitted preserves canvas layout. */
  position?: IntentGraphNode["position"];
};

/**
 * Apply a typed node patch without inventing ids or dropping unrelated fields.
 * Unknown top-level keys are rejected; target node id must already exist.
 */
export function applyIntentNodePatch(
  draft: IntentGraph,
  nodeId: string,
  patch: IntentGraphNodePatch,
):
  | { ok: true; draft: IntentGraph }
  | { ok: false; issues: NodeConfigValidationIssue[] } {
  const index = draft.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) {
    return {
      ok: false,
      issues: [
        {
          path: "id",
          message: `Unknown node id ${nodeId}`,
          code: "unknown_field",
        },
      ],
    };
  }
  if ("id" in patch && (patch as { id?: string }).id !== nodeId) {
    return {
      ok: false,
      issues: [
        {
          path: "id",
          message: "Patch must not change node id",
          code: "unknown_field",
        },
      ],
    };
  }

  const current = draft.nodes[index]!;
  const merged: IntentGraphNode = {
    ...current,
    ...patch,
    id: current.id,
    position: patch.position ?? current.position,
  };

  // Drop undefined optional keys from patch (explicit clear uses null where schema allows).
  for (const key of Object.keys(patch) as Array<keyof IntentGraphNodePatch>) {
    if (patch[key] === undefined) {
      // leave prior value
      (merged as Record<string, unknown>)[key as string] = (
        current as Record<string, unknown>
      )[key as string];
    }
  }

  const validation = validateLoopNodeConfig(merged);
  if (!validation.ok) {
    // Soft-allow draft edits with issues except unknown connector/field.
    const hard = validation.issues.filter((issue) =>
      ["unknown_connector", "unknown_capability", "unknown_field", "type"].includes(
        issue.code,
      ),
    );
    if (hard.length > 0) {
      return { ok: false, issues: hard };
    }
  }

  const nodes = draft.nodes.slice();
  nodes[index] = merged;
  return {
    ok: true,
    draft: {
      ...draft,
      nodes,
      revision: draft.revision + 1,
    },
  };
}

/** Edge fields the focused planning agent may rewrite (never topology). */
export type IntentGraphEdgePatch = Partial<
  Pick<IntentGraphEdge, "prompt" | "kind" | "branchKey">
>;

/**
 * Apply a typed edge patch without changing endpoints, ports, or id.
 * Used by focused Edit planning for transfer / handoff descriptions.
 */
export function applyIntentEdgePatch(
  draft: IntentGraph,
  edgeId: string,
  patch: IntentGraphEdgePatch,
):
  | { ok: true; draft: IntentGraph }
  | { ok: false; issues: NodeConfigValidationIssue[] } {
  const index = draft.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) {
    return {
      ok: false,
      issues: [
        {
          path: "id",
          message: `Unknown edge id ${edgeId}`,
          code: "unknown_field",
        },
      ],
    };
  }
  if (patch.kind !== undefined) {
    const kindParsed = IntentEdgeKindSchema.safeParse(patch.kind);
    if (!kindParsed.success) {
      return {
        ok: false,
        issues: [
          {
            path: "kind",
            message: "Invalid edge kind",
            code: "type",
          },
        ],
      };
    }
  }
  if (patch.prompt !== undefined && patch.prompt.length > 2000) {
    return {
      ok: false,
      issues: [
        {
          path: "prompt",
          message: "Edge prompt exceeds 2000 characters",
          code: "type",
        },
      ],
    };
  }
  if (patch.branchKey !== undefined && patch.branchKey.length > 80) {
    return {
      ok: false,
      issues: [
        {
          path: "branchKey",
          message: "branchKey exceeds 80 characters",
          code: "type",
        },
      ],
    };
  }

  const current = draft.edges[index]!;
  const merged: IntentGraphEdge = {
    ...current,
    ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.branchKey !== undefined ? { branchKey: patch.branchKey } : {}),
    id: current.id,
    source: current.source,
    target: current.target,
  };
  const edges = draft.edges.slice();
  edges[index] = merged;
  return {
    ok: true,
    draft: {
      ...draft,
      edges,
      revision: draft.revision + 1,
    },
  };
}

/**
 * Merge an AI-proposed draft while preserving non-targeted node ids, edges,
 * and unrelated manual fields when the proposal only patches listed ids.
 */
export function mergePreservingUntargeted(
  base: IntentGraph,
  proposed: IntentGraph,
  targetedNodeIds: string[] | null,
): IntentGraph {
  if (!targetedNodeIds || targetedNodeIds.length === 0) {
    // Full replace still keeps edge/node ids from proposal as-is (caller validates).
    return {
      ...proposed,
      revision: base.revision + 1,
    };
  }
  const targetSet = new Set(targetedNodeIds);
  const proposedById = new Map(proposed.nodes.map((node) => [node.id, node]));
  const baseIds = new Set(base.nodes.map((node) => node.id));
  const nodes = base.nodes.map((node) => {
    if (!targetSet.has(node.id)) return node;
    const next = proposedById.get(node.id);
    if (!next) return node;
    return {
      ...node,
      ...next,
      id: node.id,
      // Preserve canvas position unless proposal explicitly moves it differently.
      position: next.position ?? node.position,
    };
  });
  // Targeted inserts: append proposed nodes that are targeted but absent from base.
  for (const id of targetSet) {
    if (baseIds.has(id)) continue;
    const next = proposedById.get(id);
    if (next) nodes.push(next);
  }
  // Edges: keep base edges not touching only-target rewires; prefer proposed edges
  // that reference preserved endpoints.
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = proposed.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  // Retain base edges whose endpoints survive and were not rewritten.
  const proposedEdgeKeys = new Set(
    edges.map((edge) => `${edge.source}->${edge.target}:${edge.kind ?? ""}`),
  );
  for (const edge of base.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const key = `${edge.source}->${edge.target}:${edge.kind ?? ""}`;
    if (!proposedEdgeKeys.has(key)) {
      edges.push(edge);
    }
  }
  return {
    revision: base.revision + 1,
    graphPrompt: proposed.graphPrompt || base.graphPrompt,
    nodes,
    edges,
  };
}
