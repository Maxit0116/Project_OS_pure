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
import { resolveModelStructuredOutput } from "./model-json-output.js";
import type { ModelGateway } from "./model-gateway/index.js";
import type { ModelExecutionSnapshot } from "./harness/executor-selection.js";
import { RequestIntentService } from "./request-intent-service.js";

const SYSTEM_PROMPT = `You convert a software change request into an editable intent draft.
Use only node ids supplied in the immediate graph. The person approves product effects, not file paths.
Ask questions only for material choices the repository cannot resolve. Make reasonable minor assumptions explicit.
Return JSON matching the supplied schema. Do not claim files were read or tests were run.`;

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
  }): Promise<RequestIntent> {
    const { request, graph, globalContext, execution } = input;
    const modelInput = {
        rawRequest: request.rawRequest,
        selectedNodeHint: request.nodeId,
        selectedFileHint: request.filePath,
        immediateGraph: globalContext.immediateNodes ?? globalContext.topLevelNodes,
        immediateRelations: globalContext.immediateRelations ?? [],
        executorSelection: request.executorSelection,
        outputSchema: {
          goal: "string",
          kind: "change | add_node | delete_node | mixed",
          touches: [{ nodeId: "known node id", reason: "string", allow: { editExisting: "boolean", addParts: "boolean", deletePartIds: ["known descendant id"] } }],
          structuralProposals: ["add_node | delete_node | connect_nodes"],
          assumptions: ["string"],
          outOfScope: ["string"],
          acceptance: ["observable outcome"],
          questions: [{ id: "string", text: "material user choice", options: [{ id: "string", label: "string" }], recommendation: "string" }],
        },
      };
    const complete = (value: unknown) => this.gateway.complete(execution.profile, {
      projectId: request.projectId,
      requestKind: "request_intent",
      modelPreference: execution.profile.id,
      systemPrompt: SYSTEM_PROMPT,
      input: value,
      thinkingDepth: execution.thinkingDepth,
      redactionPolicy: "secrets_and_paths",
    });
    const parseDraft = async (value: unknown) => {
      const response = await complete(value);
      const jsonOutput = resolveModelStructuredOutput(response.output, response.reasoning)
        .replace(/^```(?:json)?\s*/iu, "")
        .replace(/\s*```$/u, "");
      return RequestIntentDraftSchema.parse(JSON.parse(jsonOutput));
    };
    let draft = await parseDraft(modelInput);
    const drilldownIds = [...new Set(draft.touches
      .map((touch) => touch.nodeId)
      .filter((nodeId) => {
        const node = graph.nodes.find((candidate) => candidate.id === nodeId);
        return Boolean(input.inspectNode && node?.level && ["context", "container"].includes(node.level) && node.children?.length);
      }))].slice(0, 6);
    if (drilldownIds.length && input.inspectNode) {
      const discovered = await Promise.all(drilldownIds.map(async (nodeId) => ({
        selectedNodeId: nodeId,
        context: await input.inspectNode!(nodeId),
      })));
      draft = await parseDraft({
        ...modelInput,
        initialIntent: draft,
        discoveredNodeContexts: discovered,
        instruction: "Use discovered repository facts to refine touched nodes and resolve answerable questions. Keep only user choices that remain materially ambiguous.",
      });
    }
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
          const visit = (nodeId: string) => {
            const parent = graph.nodes.find((candidate) => candidate.id === nodeId);
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
      kind: draft.kind,
      entryNodeId: null,
      touches: draft.touches,
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
