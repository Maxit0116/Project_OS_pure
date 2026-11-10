/**
 * Real provider path for Loop Ask/Edit authoring.
 * Heuristic stubs remain fallback when no gateway is injected / configured.
 * This round: injectable complete + loopback verification; no auto-read of user keys / paid live.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  IntentGraphSchema,
  type IntentGraph,
  type LoopAuthoringTraceStep,
  type LoopGoalContext,
  type LoopOpenQuestion,
} from "../contracts/loop-graph.js";
import type { ModelGateway } from "./model-gateway/gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { listConnectorVendors } from "./loop-connectors/catalog.js";
import {
  applyIntentNodePatch,
  mergePreservingUntargeted,
  validateLoopNodeConfig,
  type IntentGraphNodePatch,
} from "./loop-node-config-schema.js";
import {
  insertApprovalGate,
  validateApprovalGateWiring,
} from "./loop-approval-insert.js";

function nowIso(): string {
  return new Date().toISOString();
}

function step(
  kind: LoopAuthoringTraceStep["kind"],
  label: string,
): LoopAuthoringTraceStep {
  return {
    id: `step_${randomUUID()}`,
    kind,
    label,
    at: nowIso(),
  };
}

const ProviderAskResponseSchema = z
  .object({
    kind: z.literal("ask"),
    goal: z.string().trim().min(1).max(1000),
    constraints: z.array(z.string().max(500)).max(20).optional(),
    doneWhen: z.array(z.string().max(500)).max(20).optional(),
    outOfScope: z.array(z.string().max(500)).max(20).optional(),
    openQuestions: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(500),
            options: z.array(z.string().max(240)).max(6).optional(),
          })
          .strict(),
      )
      .max(6)
      .optional(),
    assistantMessage: z.string().trim().min(1).max(2000),
  })
  .strict();

const ProviderNodePatchSchema = z
  .object({
    kind: z.literal("node_patch"),
    nodeId: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
    summary: z.string().trim().min(1).max(500),
    assistantMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

const ProviderGraphReplaceSchema = z
  .object({
    kind: z.literal("graph"),
    draft: IntentGraphSchema,
    summary: z.string().trim().min(1).max(500),
    targetedNodeIds: z.array(z.string().min(1)).max(64).optional(),
    assistantMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

const ProviderApprovalInsertSchema = z
  .object({
    kind: z.literal("approval_insert"),
    afterNodeId: z.string().min(1).optional(),
    approvalNodeId: z.string().min(1).optional(),
    summary: z.string().trim().min(1).max(500),
    assistantMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

const ProviderClarifySchema = z
  .object({
    kind: z.literal("clarify"),
    openQuestions: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(500),
            options: z.array(z.string().max(240)).max(6).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    assistantMessage: z.string().trim().min(1).max(2000),
  })
  .strict();

const ProviderRejectSchema = z
  .object({
    kind: z.literal("reject"),
    code: z.enum([
      "unknown_connector",
      "unknown_field",
      "invalid_patch",
      "insufficient_context",
    ]),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export const LoopAuthoringProviderResponseSchema = z.discriminatedUnion("kind", [
  ProviderAskResponseSchema,
  ProviderNodePatchSchema,
  ProviderGraphReplaceSchema,
  ProviderApprovalInsertSchema,
  ProviderClarifySchema,
  ProviderRejectSchema,
]);

export type LoopAuthoringProviderResponse = z.infer<
  typeof LoopAuthoringProviderResponseSchema
>;

export type LoopAuthoringCompleteFn = (input: {
  system: string;
  user: string;
  signal?: AbortSignal;
}) => Promise<string>;

export type LoopAuthoringProviderDeps = {
  /** Injected complete — tests use loopback; production wires ModelGateway. */
  complete: LoopAuthoringCompleteFn;
  signal?: AbortSignal;
};

export function buildConnectorCapabilityContext(): string {
  const vendors = listConnectorVendors();
  return vendors
    .map((vendor) => {
      const caps = vendor.capabilities
        .map((cap) => {
          const surface = cap.apiSurface ? ` api=${cap.apiSurface}` : "";
          const notes = cap.notes ? ` notes=${cap.notes}` : "";
          return `${cap.id}{kind:${cap.kind},risk:${cap.risk},impl:${vendor.implStatus}${surface}${notes}}`;
        })
        .join("; ");
      return `${vendor.id} [${vendor.implStatus}/${vendor.liveStatus}]: ${caps}`;
    })
    .join("\n");
}

/** Compact authoritative response schema for the model (must match Zod). */
export function buildAuthoringResponseSchemaDoc(): string {
  return [
    "RESPONSE_SCHEMA (exactly one object; additionalProperties forbidden):",
    '{ "kind":"ask", "goal":string, "constraints"?:string[], "doneWhen"?:string[], "outOfScope"?:string[], "openQuestions"?:{question,options?}[], "assistantMessage":string }',
    '{ "kind":"node_patch", "nodeId":existingId, "patch":{allowedNodeFields}, "summary":string, "assistantMessage"?:string }',
    '{ "kind":"graph", "draft":IntentGraph{revision,graphPrompt,nodes[],edges[]}, "summary":string, "targetedNodeIds"?:string[], "assistantMessage"?:string }',
    '{ "kind":"clarify", "openQuestions":[{question,options?},…1..6], "assistantMessage":string }',
    '{ "kind":"reject", "code":"unknown_connector"|"unknown_field"|"invalid_patch"|"insufficient_context", "message":string }',
  ].join("\n");
}

/** Node / edge field constraints the model may patch — mirrors validateLoopNodeConfig. */
export function buildAuthoringNodeFieldSchemaDoc(): string {
  return [
    "NODE_FIELDS (patch/graph nodes): id(stable), title, prompt, type(agent|human|action|logic),",
    "  agentRole?, humanMode?, humanAssignee?, humanAllowedActions?,",
    "  actionIntegration?(catalog vendor id), actionOperation?(catalog capability id),",
    "  credentialRefId?, actionParams?(≤32 scalar keys; must match capability — never invent keys),",
    "  logicKind?(condition|loop|merge|exit|retry|wait), maxIterations?, retryLimit?, waitMs?,",
    "  timeoutMs?, position{x,y}. Do not rename/delete untargeted ids or edges.",
    "EDGES: id, source, target, kind(depends|…). Preserve untargeted edges exactly.",
  ].join("\n");
}

export function buildAuthoringSystemPrompt(): string {
  return [
    "You author Project OS Loops IntentGraphs.",
    "Return ONE JSON object that validates against RESPONSE_SCHEMA below.",
    "Never invent connectors, capability ids, or parameter keys outside the catalog.",
    "Never claim credentials exist. Configured ≠ authorized to run.",
    "For local edits, prefer kind=node_patch and preserve all non-target node ids, edges, and manual fields.",
    "If information is missing, use kind=clarify — do not guess.",
    "Generation/edit never executes the loop.",
    "",
    buildAuthoringResponseSchemaDoc(),
    "",
    buildAuthoringNodeFieldSchemaDoc(),
    "",
    "CONNECTOR_CATALOG (trusted; capability params must match apiSurface/notes — no invented keys):",
    buildConnectorCapabilityContext(),
  ].join("\n");
}

/** UI/assistant facing — never leak Zod issue dumps or provider raw JSON. */
export function redactAuthoringProviderError(_error: unknown): string {
  return "Provider response did not match the Loop authoring schema. Retry with a valid JSON object.";
}

export function buildAuthoringUserPrompt(input: {
  mode: "ask" | "edit";
  text: string;
  draft: IntentGraph;
  selectedNodeId?: string;
  goalContext?: LoopGoalContext | null;
}): string {
  const selected = input.selectedNodeId
    ? input.draft.nodes.find((node) => node.id === input.selectedNodeId)
    : undefined;
  return [
    `mode: ${input.mode}`,
    `user_request: ${input.text}`,
    input.goalContext
      ? `goal_context: ${JSON.stringify({
          goal: input.goalContext.goal,
          constraints: input.goalContext.constraints,
          doneWhen: input.goalContext.doneWhen,
          outOfScope: input.goalContext.outOfScope,
          revision: input.goalContext.revision,
        })}`
      : "goal_context: (none)",
    `selected_node_id: ${input.selectedNodeId ?? "(none)"}`,
    selected
      ? `selected_node: ${JSON.stringify(selected)}`
      : "selected_node: (none)",
    `workflow_draft_revision: ${input.draft.revision}`,
    `workflow_draft: ${JSON.stringify({
      revision: input.draft.revision,
      graphPrompt: input.draft.graphPrompt,
      nodes: input.draft.nodes,
      edges: input.draft.edges,
    })}`,
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Provider response did not include a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export async function runLoopAuthoringProvider(input: {
  mode: "ask" | "edit";
  text: string;
  draft: IntentGraph;
  selectedNodeId?: string;
  goalContext?: LoopGoalContext | null;
  threadLength: number;
  deps: LoopAuthoringProviderDeps;
}): Promise<{
  source: "provider";
  steps: LoopAuthoringTraceStep[];
  assistantMessage: string;
  draftGoalContext?: LoopGoalContext;
  needsClarification?: boolean;
  proposedDraft?: IntentGraph;
  summary?: string;
  rejected?: { code: string; message: string };
}> {
  const steps = [
    step("thinking", "Calling model provider for authoring"),
    step(
      input.mode === "ask" ? "writing_context" : "proposing_graph",
      input.mode === "ask" ? "Drafting goal context via provider" : "Proposing graph edit via provider",
    ),
  ];

  const raw = await input.deps.complete({
    system: buildAuthoringSystemPrompt(),
    user: buildAuthoringUserPrompt({
      mode: input.mode,
      text: input.text,
      draft: input.draft,
      ...(input.selectedNodeId ? { selectedNodeId: input.selectedNodeId } : {}),
      ...(input.goalContext ? { goalContext: input.goalContext } : {}),
    }),
    ...(input.deps.signal ? { signal: input.deps.signal } : {}),
  });

  let parsed: LoopAuthoringProviderResponse;
  try {
    parsed = LoopAuthoringProviderResponseSchema.parse(extractJsonObject(raw));
  } catch (error) {
    const message = redactAuthoringProviderError(error);
    return {
      source: "provider",
      steps,
      assistantMessage: message,
      rejected: { code: "invalid_patch", message },
    };
  }

  if (parsed.kind === "reject") {
    return {
      source: "provider",
      steps,
      assistantMessage: parsed.message,
      rejected: { code: parsed.code, message: parsed.message },
    };
  }

  if (parsed.kind === "clarify") {
    const openQuestions: LoopOpenQuestion[] = parsed.openQuestions.map((q) => ({
      id: `q_${randomUUID()}`,
      question: q.question,
      ...(q.options ? { options: q.options } : {}),
    }));
    const draftGoalContext: LoopGoalContext = {
      goal:
        input.goalContext?.goal ??
        (input.text.slice(0, 1000) || "Untitled loop goal"),
      constraints: input.goalContext?.constraints ?? [],
      doneWhen: input.goalContext?.doneWhen ?? [],
      outOfScope: input.goalContext?.outOfScope ?? [],
      openQuestions,
      status: "draft",
      revision: (input.goalContext?.revision ?? 0) + 1,
      updatedAt: nowIso(),
      sourceThreadLength: input.threadLength + 1,
    };
    return {
      source: "provider",
      steps,
      assistantMessage: parsed.assistantMessage,
      draftGoalContext,
      needsClarification: true,
    };
  }

  if (parsed.kind === "ask") {
    const openQuestions: LoopOpenQuestion[] = (parsed.openQuestions ?? []).map(
      (q) => ({
        id: `q_${randomUUID()}`,
        question: q.question,
        ...(q.options ? { options: q.options } : {}),
      }),
    );
    const draftGoalContext: LoopGoalContext = {
      goal: parsed.goal,
      constraints: parsed.constraints ?? [],
      doneWhen: parsed.doneWhen ?? [],
      outOfScope: parsed.outOfScope ?? [],
      openQuestions,
      status: "draft",
      revision: (input.goalContext?.revision ?? 0) + 1,
      updatedAt: nowIso(),
      sourceThreadLength: input.threadLength + 1,
    };
    return {
      source: "provider",
      steps,
      assistantMessage: parsed.assistantMessage,
      draftGoalContext,
      needsClarification: openQuestions.some((q) => !q.answer?.trim()),
    };
  }

  if (parsed.kind === "approval_insert") {
    try {
      const proposed = insertApprovalGate(input.draft, {
        ...(parsed.afterNodeId ? { afterNodeId: parsed.afterNodeId } : {}),
        ...(parsed.approvalNodeId
          ? { approvalNodeId: parsed.approvalNodeId }
          : {}),
      });
      const wiring = validateApprovalGateWiring(proposed);
      const blockers = wiring.filter((issue) => issue.code === "approval_orphaned");
      if (blockers.length > 0) {
        return {
          source: "provider",
          steps,
          assistantMessage: blockers.map((b) => b.message).join("; "),
          rejected: { code: "invalid_patch", message: blockers[0]!.message },
        };
      }
      return {
        source: "provider",
        steps,
        assistantMessage:
          parsed.assistantMessage ??
          `${parsed.summary} Review the proposed graph diff, then Accept or Dismiss.`,
        proposedDraft: {
          ...proposed,
          revision: input.draft.revision + 1,
        },
        summary: parsed.summary,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "approval insert failed";
      return {
        source: "provider",
        steps,
        assistantMessage: message,
        rejected: { code: "invalid_patch", message },
      };
    }
  }

  if (parsed.kind === "node_patch") {
    const applied = applyIntentNodePatch(
      input.draft,
      parsed.nodeId,
      parsed.patch as IntentGraphNodePatch,
    );
    if (!applied.ok) {
      const safe = applied.issues
        .map((i) => `${i.path}: ${i.code}`)
        .join("; ");
      return {
        source: "provider",
        steps,
        assistantMessage: `Rejected node patch (${safe || "invalid_patch"})`,
        rejected: {
          code: applied.issues[0]?.code ?? "invalid_patch",
          message: safe || "invalid_patch",
        },
      };
    }
    const target = applied.draft.nodes.find((node) => node.id === parsed.nodeId);
    if (target) {
      const validation = validateLoopNodeConfig(target);
      const hard = validation.issues.filter((issue) =>
        ["unknown_connector", "unknown_capability", "unknown_field"].includes(
          issue.code,
        ),
      );
      if (hard.length > 0) {
        return {
          source: "provider",
          steps,
          assistantMessage: `Rejected invalid fields: ${hard.map((i) => i.message).join("; ")}`,
          rejected: { code: hard[0]!.code, message: hard[0]!.message },
        };
      }
    }
    return {
      source: "provider",
      steps,
      assistantMessage:
        parsed.assistantMessage ??
        `${parsed.summary} Review the proposed graph diff, then Accept or Dismiss.`,
      proposedDraft: applied.draft,
      summary: parsed.summary,
    };
  }

  // graph replace with optional targeted merge
  const merged = mergePreservingUntargeted(
    input.draft,
    parsed.draft,
    parsed.targetedNodeIds ?? null,
  );
  for (const node of merged.nodes) {
    const validation = validateLoopNodeConfig(node);
    const hard = validation.issues.filter((issue) =>
      ["unknown_connector", "unknown_capability", "unknown_field"].includes(
        issue.code,
      ),
    );
    if (hard.length > 0) {
      return {
        source: "provider",
        steps,
        assistantMessage: `Rejected graph: ${hard.map((i) => i.message).join("; ")}`,
        rejected: { code: hard[0]!.code, message: hard[0]!.message },
      };
    }
  }
  return {
    source: "provider",
    steps,
    assistantMessage:
      parsed.assistantMessage ??
      `${parsed.summary} Review the proposed graph diff, then Accept or Dismiss.`,
    proposedDraft: merged,
    summary: parsed.summary,
  };
}

/** Wire ModelGateway.complete into authoring complete fn (no key auto-discovery). */
export function createGatewayAuthoringComplete(
  gateway: ModelGateway,
  profile: ModelProfile,
): LoopAuthoringCompleteFn {
  return async ({ system, user, signal }) => {
    const response = await gateway.complete(
      profile,
      {
        requestKind: "loop_authoring",
        systemPrompt: system,
        input: { prompt: user },
        redactionPolicy: "secrets_and_paths",
      },
      signal ? { signal } : undefined,
    );
    return response.output ?? "";
  };
}

/** Deterministic loopback complete for contract tests (no network). */
export function createLoopbackAuthoringComplete(
  script: LoopAuthoringProviderResponse | ((prompt: string) => LoopAuthoringProviderResponse),
): LoopAuthoringCompleteFn {
  return async ({ user }) => {
    const payload = typeof script === "function" ? script(user) : script;
    return JSON.stringify(payload);
  };
}
