/**
 * SYNTHETIC deterministic gateway for empty-graph greenfield Electron probes.
 * Enabled only when:
 *   PROJECTOS_DETERMINISTIC_AGENT_GATEWAY=1
 *   PROJECTOS_DETERMINISTIC_GREENFIELD=1
 * Never used by default desktop; produces no outbound HTTP.
 *
 * Mirrors the LocalApi unit-test GreenfieldInitializationGateway shape so the
 * real Electron → LocalApi → orchestrator path can pause at
 * greenfield_tranche_uncertain_awaiting_review for Apply/backup/Undo proof.
 */
import type { ModelGatewayRequest, ModelGatewayResponse } from "../../contracts/model-gateway.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "./gateway.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeGreenfieldProposal(): Record<string, unknown> {
  const nodes: Array<Record<string, unknown>> = [{
    tempRef: "context_product",
    parentTempRef: null,
    node: {
      name: "Greenfield Product",
      summary: "The initialized product boundary.",
      responsibility: "Own the complete greenfield product.",
      level: "context",
      tags: ["greenfield"],
    },
    files: [],
  }];
  for (let container = 1; container <= 2; container += 1) {
    nodes.push({
      tempRef: `container_${container}`,
      parentTempRef: "context_product",
      node: {
        name: `Product Area ${container}`,
        summary: `Owns product area ${container}.`,
        responsibility: `Coordinate product area ${container}.`,
        level: "container",
        tags: [],
      },
      files: [],
    });
    for (let component = 1; component <= 4; component += 1) {
      const path = `greenfield-${container}-${component}.ts`;
      nodes.push({
        tempRef: `component_${container}_${component}`,
        parentTempRef: `container_${container}`,
        node: {
          name: `Capability ${container}.${component}`,
          summary: `Implements capability ${container}.${component}.`,
          responsibility: `Own capability ${container}.${component}.`,
          level: "component",
          tags: [],
        },
        files: [{
          filePath: path,
          responsibility: `Implement capability ${container}.${component}.`,
          objective: `Create ${path}.`,
          acceptanceCriteria: [`${path} exports GREENFIELD_FILE`],
        }],
      });
    }
  }
  return {
    version: "0.1.0",
    objective: "Initialize the complete greenfield product.",
    nodes,
    wiring: [{
      tempRef: "edge_product_flow",
      sourceTempRef: "component_1_1",
      targetTempRef: "component_2_4",
      relation: "data_flows_to",
      label: "Product flow",
      purpose: "Connect the entry and completion capabilities.",
    }],
    rationale: "Two product areas provide a bounded initial architecture.",
  };
}

export class DeterministicGreenfieldGateway extends ModelGateway {
  readonly synthetic = true as const;
  private readonly uncertainCriteria: boolean;
  private batchCount = 0;

  constructor(options: { uncertainCriteria?: boolean } = {}) {
    super({ secretStore: new InMemorySecretStore() });
    this.uncertainCriteria = options.uncertainCriteria === true;
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;

    if (request.requestKind === "chat_title") {
      output = JSON.stringify({
        title: "Greenfield initialization",
        substantive: true,
        digest: { decisions: [], openQuestions: [], throughMessageId: "deterministic" },
      });
    } else if (request.requestKind === "request_intent") {
      output = JSON.stringify({
        action: "final",
        intent: {
          goal: "Initialize the complete product graph and scaffold its files.",
          kind: "change",
          touches: [],
          structuralProposals: [],
          assumptions: ["The project graph starts empty and must be initialized."],
          outOfScope: ["Do not preserve a prior product graph"],
          acceptance: ["The product graph and scaffold files are initialized"],
          questions: [],
        },
      });
    } else if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Initialize the complete product graph and files.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_graph_delegation") {
      output = JSON.stringify(makeGreenfieldProposal());
    } else if (mode === "create_file") {
      const context = isRecord(input.createContext) ? input.createContext : {};
      const scope = isRecord(context.scope) ? context.scope : {};
      const path = typeof scope.intendedFilePath === "string" ? scope.intendedFilePath : "missing.ts";
      output = JSON.stringify({
        summary: `Create ${path}`,
        path,
        content: `export const GREENFIELD_FILE = ${JSON.stringify(path)};\n`,
      });
    } else if (mode === "validate_created_file") {
      const proposal = isRecord(input.proposal) && Array.isArray(input.proposal.files)
        ? input.proposal.files[0]
        : undefined;
      const path = isRecord(proposal) && typeof proposal.path === "string" ? proposal.path : "missing.ts";
      const criteria = Array.isArray(input.acceptanceCriteria)
        ? input.acceptanceCriteria.filter((value): value is string => typeof value === "string")
        : [];
      output = JSON.stringify({
        path,
        verdict: "valid",
        criteria: criteria.map((criterion) => ({
          criterion,
          status: "satisfied",
          explanation: "The bounded file implements its declared responsibility.",
        })),
        scopeAssessment: { status: "compliant", explanation: "Exactly one authorized file is proposed." },
        summary: "The greenfield file is valid.",
        rationale: "The proposal matches its server-owned file task.",
      });
    } else if (mode === "validate_delegated_batch") {
      this.batchCount += 1;
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan.tasks
        : [];
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      const uncertain = this.uncertainCriteria;
      output = JSON.stringify({
        verdict: "valid",
        tasks: plan.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((value): value is string => typeof value === "string")
            : [];
          return {
            taskId: task.taskId,
            childRunId: child.childRunId,
            path: task.filePath,
            status: "consistent",
            criteria: criteria.map((criterion) => ({
              criterion,
              status: uncertain ? "uncertain" : "satisfied",
              explanation: uncertain
                ? "The validator cannot confirm this greenfield criterion from the available evidence."
                : "The independently validated leaf satisfies this criterion.",
            })),
            summary: "The leaf is consistent with the tranche.",
          };
        }),
        crossFileAssessment: { status: "consistent", summary: "All tranche files are mutually consistent." },
        summary: uncertain
          ? "The initialization tranche is reviewable but some criteria remain uncertain."
          : "The initialization tranche is valid.",
        rationale: "Every server-derived task passed independent validation.",
      });
    } else {
      output = "{}";
    }

    return {
      requestId: `deterministic_greenfield_${Date.now()}`,
      provider: "deterministic-fixture",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

export function createDeterministicGreenfieldGatewayFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ModelGateway | undefined {
  if (env.PROJECTOS_DETERMINISTIC_AGENT_GATEWAY !== "1") return undefined;
  if (env.PROJECTOS_DETERMINISTIC_GREENFIELD !== "1") return undefined;
  return new DeterministicGreenfieldGateway({
    uncertainCriteria: env.PROJECTOS_DETERMINISTIC_UNCERTAIN_CRITERIA === "1",
  });
}
