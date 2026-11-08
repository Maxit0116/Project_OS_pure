import { z } from "zod";
import { ProjectOSError } from "../errors.js";
import type { ProjectGraph } from "../contracts/graph.js";
import {
  RequestIntentDraftSchema,
  RequestIntentSchema,
  type ExtractRequestIntentRequest,
  type IntentStructuralEffect,
  type RequestIntent,
} from "../contracts/request-intent.js";
import type { GlobalContextBundle, NodeContextBundle } from "../contracts/local-context.js";
import { computeProjectGraphHash } from "./graph-change-set-engine.js";
import { isTruncatedModelOutput, resolveModelStructuredOutput } from "./model-json-output.js";
import type { ModelGateway } from "./model-gateway/index.js";
import type { ModelExecutionSnapshot } from "./harness/executor-selection.js";
import { RequestIntentService } from "./request-intent-service.js";

const DISCOVERY_SYSTEM_PROMPT = `You are the master agent planning a software change from repository evidence.
Begin with the immediate graph. You may inspect a node, list its children, read a file present in an inspected node's context, or consult a node for a focused read-only answer. Choose one action at a time and use only supplied node ids and file paths. After enough evidence, return a final intent. Ask the user only about material product choices that code and repository evidence cannot answer. Do not claim a file was read unless it appears in observations or that tests were run.
Prefer questions: [] when the only open choice is customer-facing copy/wording (heading text, button label, microcopy). Those choices are resolved after intent approval by the authorized edit step's action:"clarify" card; blocking them at planning prevents the same-root clarify→resume path. Reserve intent.questions for scope, approach, or structural decisions that change which capabilities or files are touched.
structuralProposals is only for adding a node, deleting a node, or connecting two existing nodes (kinds add_node, delete_node, connect_nodes); a code-level dependency between existing capabilities is not a structural change, so leave it empty. In each touch, list under files the existing files you expect that capability's change to edit, with paths exactly as supplied. Write the human-readable text of a final intent (goal, touch reasons, assumptions, out of scope, acceptance criteria, questions) in the language of the user's request, while keeping node ids, file paths and code identifiers exactly as supplied.
Return exactly one JSON object matching the supplied action schema.`;
const CONSULT_SYSTEM_PROMPT = `You are a read-only specialist answering one focused question about a software node. Use only the supplied node context, cite relevant file paths when possible, and say when evidence is insufficient. Do not propose changes, invoke tools, or claim checks were run. Return a concise plain-text answer.`;

const DiscoveryActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("inspect_node"),
    nodeId: z.string().min(1),
    reason: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("list_children"),
    nodeId: z.string().min(1),
    reason: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("read_source"),
    nodeId: z.string().min(1),
    path: z.string().min(1),
    question: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("consult_node"),
    nodeId: z.string().min(1),
    question: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("final"),
    intent: RequestIntentDraftSchema,
  }),
]);

const MAX_DISCOVERY_ACTIONS = 24;
// The gateway's own default is 2048 output tokens. A reasoning model spends most of that thinking
// and the JSON step (the final intent above all) is cut off, so discovery states its own budget and
// asks once more with a larger one when a reply is cut off.
const DISCOVERY_STEP_MAX_OUTPUT_TOKENS = 8192;
const DISCOVERY_STEP_RETRY_MAX_OUTPUT_TOKENS = 16_384;
const CONSULTATION_MAX_OUTPUT_TOKENS = 4096;
const CONSULTATION_RETRY_MAX_OUTPUT_TOKENS = 8192;
const DISCOVERY_OUTPUT_SCHEMA = {
  oneOf: [
    { type: "object", properties: { action: { const: "inspect_node" }, nodeId: { type: "string" }, reason: { type: "string" } }, required: ["action", "nodeId", "reason"], additionalProperties: false },
    { type: "object", properties: { action: { const: "list_children" }, nodeId: { type: "string" }, reason: { type: "string" } }, required: ["action", "nodeId", "reason"], additionalProperties: false },
    { type: "object", properties: { action: { const: "read_source" }, nodeId: { type: "string" }, path: { type: "string" }, question: { type: "string" } }, required: ["action", "nodeId", "path", "question"], additionalProperties: false },
    { type: "object", properties: { action: { const: "consult_node" }, nodeId: { type: "string" }, question: { type: "string" } }, required: ["action", "nodeId", "question"], additionalProperties: false },
    {
      type: "object",
      properties: {
        action: { const: "final" },
        intent: {
          type: "object",
          properties: {
            goal: { type: "string" },
            kind: { enum: ["change", "add_node", "delete_node", "mixed"] },
            touches: { type: "array", items: { type: "object", properties: { nodeId: { type: "string" }, reason: { type: "string" }, files: { type: "array", items: { type: "string" } }, allow: { type: "object", properties: { editExisting: { type: "boolean" }, addParts: { type: "boolean" }, deletePartIds: { type: "array", items: { type: "string" } } }, required: ["editExisting", "addParts", "deletePartIds"], additionalProperties: false } }, required: ["nodeId", "reason", "allow"], additionalProperties: false } },
            structuralProposals: { type: "array", items: { oneOf: [
              { type: "object", properties: { kind: { const: "add_node" }, parentNodeId: { type: "string" }, name: { type: "string" }, level: { enum: ["context", "container", "component"] }, wiring: { type: "array", items: { type: "object", properties: { existingNodeId: { type: "string" }, direction: { enum: ["from_new", "to_new"] }, relation: { type: "string" }, label: { type: "string" }, purpose: { type: "string" } }, required: ["existingNodeId", "direction", "relation", "label"] } } }, required: ["kind", "parentNodeId", "name", "level", "wiring"] },
              { type: "object", properties: { kind: { const: "delete_node" }, nodeId: { type: "string" } }, required: ["kind", "nodeId"] },
              { type: "object", properties: { kind: { const: "connect_nodes" }, sourceNodeId: { type: "string" }, targetNodeId: { type: "string" } }, required: ["kind", "sourceNodeId", "targetNodeId"] },
            ] } },
            assumptions: { type: "array", items: { type: "string" } },
            outOfScope: { type: "array", items: { type: "string" } },
            acceptance: { type: "array", items: { type: "string" } },
            questions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } }, recommendation: { type: "string" } }, required: ["id", "text"], additionalProperties: false } },
          },
          required: ["goal", "kind", "touches", "structuralProposals", "assumptions", "outOfScope", "acceptance", "questions"],
          additionalProperties: false,
        },
      },
      required: ["action", "intent"],
      additionalProperties: false,
    },
  ],
} as const;

export class RequestIntentExtractionService {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly intentService = new RequestIntentService(),
  ) {}

  async extract(input: {
    request: ExtractRequestIntentRequest;
    graph: ProjectGraph;
    globalContext: GlobalContextBundle;
    execution: ModelExecutionSnapshot;
    inspectNode?: (nodeId: string) => Promise<NodeContextBundle>;
    /** When aborted (Stop during intent discovery), gateway settles cancelled. */
    signal?: AbortSignal;
  }): Promise<RequestIntent> {
    const { request, graph, globalContext, execution } = input;
    const initialInput = {
      rawRequest: request.rawRequest,
      selectedNodeHint: request.nodeId,
      selectedFileHint: request.filePath,
      immediateGraph: globalContext.immediateNodes ?? globalContext.topLevelNodes,
      immediateRelations: globalContext.immediateRelations ?? [],
      executorSelection: request.executorSelection,
      outputSchema: DISCOVERY_OUTPUT_SCHEMA,
    };
    const complete = (value: unknown, systemPrompt: string, maxOutputTokens: number) => {
      if (input.signal?.aborted) {
        throw new ProjectOSError(
          "operation_cancelled",
          "Model request cancelled",
        );
      }
      return this.gateway.complete(
        execution.profile,
        {
          projectId: request.projectId,
          requestKind: "request_intent",
          modelPreference: execution.profile.id,
          systemPrompt,
          input: value,
          thinkingDepth: execution.thinkingDepth,
          redactionPolicy: "secrets_and_paths",
          maxOutputTokens,
        },
        input.signal ? { signal: input.signal } : undefined,
      );
    };
    // Some providers occasionally answer a JSON-only request with something else (for example their
    // own tool-call markup). One corrective retry recovers that; a second miss is reported as such.
    const parseAction = async (value: unknown) => {
      let correction: { previousReply: string; problem: string } | undefined;
      let cutOff = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (input.signal?.aborted) {
          throw new ProjectOSError(
            "operation_cancelled",
            "Model request cancelled",
          );
        }
        const maxOutputTokens = attempt === 0 ? DISCOVERY_STEP_MAX_OUTPUT_TOKENS : DISCOVERY_STEP_RETRY_MAX_OUTPUT_TOKENS;
        const response = await complete(correction
          ? {
              ...(value as Record<string, unknown>),
              correction: {
                problem: correction.problem,
                previousReplyStartedWith: correction.previousReply,
                instruction: "Reply again with exactly one JSON object matching the action schema. No tool-call markup, no prose, no code fences.",
              },
            }
          : value, DISCOVERY_SYSTEM_PROMPT, maxOutputTokens);
        if (isTruncatedModelOutput(response, maxOutputTokens)) {
          // The reply ran out of room (usually the model's own reasoning used it). Nothing in it is
          // worth correcting; ask again with a larger budget.
          cutOff = true;
          continue;
        }
        const jsonOutput = resolveModelStructuredOutput(response.output, response.reasoning)
          .replace(/^```(?:json)?\s*/iu, "")
          .replace(/\s*```$/u, "");
        try {
          return DiscoveryActionSchema.parse(JSON.parse(jsonOutput));
        } catch (error) {
          // Say which part did not fit; "did not match" alone leaves the model nothing to fix.
          const issue = error instanceof z.ZodError ? error.issues[0] : undefined;
          correction = {
            previousReply: jsonOutput.trim().slice(0, 160),
            problem: error instanceof SyntaxError
              ? "the reply was not valid JSON"
              : `the JSON did not match the action schema${issue ? ` (${issue.path.join(".") || "root"}: ${issue.message})`.slice(0, 300) : ""}`,
          };
        }
      }
      throw new ProjectOSError(
        "model_output_invalid",
        cutOff
          ? "The model's planning step was cut off at its output limit, even after a retry with a larger one"
          : "The model did not return a usable planning step after a retry",
      );
    };
    const inspectNode = input.inspectNode;
    const observations: Array<Record<string, unknown>> = [];
    const inspectedContexts = new Map<string, NodeContextBundle>();
    const performedActions = new Set<string>();
    const knownNodeIds = new Set([
      ...(globalContext.immediateNodes ?? globalContext.topLevelNodes).map((node) => node.id),
      ...(request.nodeId ? [request.nodeId] : []),
    ]);
    let draft: z.infer<typeof RequestIntentDraftSchema> | undefined;
    let actionCount = 0;

    while (!draft) {
      if (input.signal?.aborted) {
        throw new ProjectOSError(
          "operation_cancelled",
          "Model request cancelled",
        );
      }
      const exhausted = actionCount >= MAX_DISCOVERY_ACTIONS;
      const action = await parseAction({
        ...initialInput,
        observations,
        discovery: {
          actionsTaken: actionCount,
          maxActions: MAX_DISCOVERY_ACTIONS,
          ...(exhausted ? {
            limitReached: true,
            instruction: "Stop exploring now. Return a final intent from the evidence collected, explicitly recording any unresolved repository fact as an assumption or user question.",
          } : {}),
        },
      });
      if (action.action === "final") {
        draft = action.intent;
        if (exhausted) {
          draft.assumptions.push("Repository discovery reached its per-request action limit; confirm any unresolved implementation details before execution.");
        }
        break;
      }
      if (exhausted) {
        throw new Error(`Master discovery reached its ${MAX_DISCOVERY_ACTIONS}-action limit without producing a plan`);
      }

      const node = graph.nodes.find((candidate) => candidate.id === action.nodeId);
      if (!node) throw new Error(`Master discovery referenced unknown node '${action.nodeId}'`);
      if (!knownNodeIds.has(action.nodeId)) {
        throw new Error(`Master discovery must discover node '${action.nodeId}' before inspecting it`);
      }
      if (!inspectNode) throw new Error("Node inspection is unavailable in this runtime");
      const actionKey = action.action === "read_source"
        ? `${action.action}:${action.nodeId}:${action.path}`
        : `${action.action}:${action.nodeId}${"question" in action ? `:${action.question}` : ""}`;
      if (performedActions.has(actionKey)) {
        observations.push({ action: action.action, nodeId: action.nodeId, result: "Repeated action skipped to prevent a discovery loop." });
        actionCount += 1;
        continue;
      }
      performedActions.add(actionKey);

      const context = inspectedContexts.get(action.nodeId) ?? await inspectNode(action.nodeId);
      inspectedContexts.set(action.nodeId, context);
      for (const related of [
        context.neighborhood.selected,
        ...context.neighborhood.children,
        ...(context.neighborhood.parent ? [context.neighborhood.parent] : []),
        ...context.neighborhood.upstream,
        ...context.neighborhood.downstream,
      ]) knownNodeIds.add(related.id);
      if (action.action === "inspect_node" || action.action === "list_children") {
        observations.push({ action: action.action, nodeId: action.nodeId, reason: action.reason, context });
      } else if (action.action === "read_source") {
        const file = context.fileManifest.find((candidate) => candidate.path === action.path);
        if (!file) {
          observations.push({ action: action.action, nodeId: action.nodeId, path: action.path, result: "File is not in this node's inspected context; choose a listed file or inspect another owning node." });
        } else if (file.content === undefined) {
          observations.push({ action: action.action, nodeId: action.nodeId, path: action.path, result: `Source unavailable: ${file.omissionReason ?? file.disposition}.` });
        } else {
          observations.push({ action: action.action, nodeId: action.nodeId, path: action.path, sha256: file.sha256, question: action.question, source: file.content });
        }
      } else {
        const consultation = {
          kind: "read_only_node_consultation",
          project: { name: globalContext.projectName, description: globalContext.conciseDescription },
          nodeContext: context,
          question: action.question,
        };
        let response = await complete(consultation, CONSULT_SYSTEM_PROMPT, CONSULTATION_MAX_OUTPUT_TOKENS);
        if (isTruncatedModelOutput(response, CONSULTATION_MAX_OUTPUT_TOKENS)) {
          response = await complete(consultation, CONSULT_SYSTEM_PROMPT, CONSULTATION_RETRY_MAX_OUTPUT_TOKENS);
        }
        observations.push({
          action: action.action,
          nodeId: action.nodeId,
          question: action.question,
          answer: resolveModelStructuredOutput(response.output, response.reasoning).slice(0, 6000),
          ...(isTruncatedModelOutput(response, CONSULTATION_RETRY_MAX_OUTPUT_TOKENS)
            ? { note: "This answer was cut off at the model's output limit; treat it as incomplete." }
            : {}),
        });
      }
      actionCount += 1;
    }

    if (!draft) throw new Error("Master discovery ended without a final intent");
    const structuralEffects: IntentStructuralEffect[] = draft.structuralProposals.map((effect) => {
      switch (effect.kind) {
        case "add_node":
          return { ...effect, source: "model_proposed" };
        case "connect_nodes":
          return { ...effect, source: "model_proposed" };
        case "delete_node": {
          const node = graph.nodes.find((candidate) => candidate.id === effect.nodeId);
          if (!node) throw new Error(`Intent references unknown node '${effect.nodeId}'`);
          const descendants = new Set<string>();
          const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
          const visit = (nodeId: string) => {
            const parent = nodesById.get(nodeId);
            for (const childId of parent?.children ?? []) {
              if (descendants.has(childId)) continue;
              descendants.add(childId);
              visit(childId);
            }
          };
          visit(node.id);
          const subtreeIds = new Set([node.id, ...descendants]);
          const ownedFileCount = graph.nodes
            .filter((candidate) => subtreeIds.has(candidate.id))
            .reduce((total, candidate) => total + candidate.linkedFiles.length, 0);
          return {
            kind: "delete_node",
            nodeId: node.id,
            descendantCount: descendants.size,
            ownedFileCount,
            source: "server_derived",
          };
        }
      }
    });
    const graphHash = await computeProjectGraphHash(graph);
    const candidate = RequestIntentSchema.parse({
      version: "0.1.0",
      id: `intent_${globalThis.crypto.randomUUID()}`,
      projectId: request.projectId,
      rawRequest: request.rawRequest,
      goal: draft.goal,
      ...(request.filePath && request.nodeId
        ? { requestedFile: { nodeId: request.nodeId, path: request.filePath } }
        : {}),
      kind: draft.kind,
      entryNodeId: null,
      // Only the server marks a touch as derived; whatever the model sent there is ignored.
      touches: draft.touches.map(({ derived: _ignored, ...touch }) => touch),
      structuralEffects,
      assumptions: draft.assumptions,
      outOfScope: draft.outOfScope,
      acceptance: draft.acceptance,
      questions: draft.questions,
      executorSelection: request.executorSelection,
      executorSnapshot: {
        kind: "model",
        profile: execution.profile,
        thinkingDepth: execution.thinkingDepth,
      },
      baseGraphHash: graphHash,
      revision: 1,
      status: "draft",
    });
    return this.intentService.normalizeDraft(graph, candidate);
  }
}
