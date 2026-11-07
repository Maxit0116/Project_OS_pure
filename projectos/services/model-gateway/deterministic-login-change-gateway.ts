/**
 * SYNTHETIC deterministic model stand-in for isolate/Electron probes.
 * Enabled only when PROJECTOS_DETERMINISTIC_AGENT_GATEWAY=1.
 * Never used by default desktop; produces no outbound HTTP.
 *
 * Covers: chat_title, single-file login heading change, and feat_login
 * delegated multi-file automatic apply (sample-graph-saas).
 */
import type { ModelGatewayRequest, ModelGatewayResponse } from "../../contracts/model-gateway.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "./gateway.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DELEGATED_PATHS = ["app/login/page.tsx", "components/LoginForm.tsx"] as const;

function discoveryFinalIntentOutput(input: {
  goal: string;
  nodeId: string;
  files: readonly string[];
}): string {
  return JSON.stringify({
    action: "final",
    intent: {
      goal: input.goal,
      kind: "change",
      touches: [{
        nodeId: input.nodeId,
        reason: `Edit ${input.files.join(", ")}`,
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      }],
      structuralProposals: [],
      assumptions: [],
      outOfScope: ["Other files"],
      acceptance: [input.goal],
      questions: [],
    },
  });
}

export class DeterministicLoginChangeGateway extends ModelGateway {
  readonly synthetic = true as const;

  constructor() {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope) ? localContext.scope : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;

    let output: string;

    if (request.requestKind === "chat_title") {
      output = JSON.stringify({
        title: "Login heading change",
        substantive: true,
        digest: {
          decisions: [],
          openQuestions: [],
          throughMessageId: "deterministic",
        },
      });
    } else if (request.requestKind === "request_intent") {
      // Prefer delegated node intent so Electron node selection works without a file pick.
      output = discoveryFinalIntentOutput({
        goal: "Update the login experience across its owned files.",
        nodeId: "feat_login",
        files: DELEGATED_PATHS,
      });
    } else if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Update the login experience across its owned files.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: [...DELEGATED_PATHS],
        confidence: 1,
      });
    } else if (mode === "plan_node_delegation" || mode === "plan_graph_delegation") {
      output = JSON.stringify({
        objective: "Update the login experience across delegated files",
        tasks: DELEGATED_PATHS.map((path) => ({
          path,
          objective: `Apply the delegated login change in ${path}`,
          acceptanceCriteria: [`Delegated change for ${path} is present`],
        })),
        contracts: [],
        rationale: "The tasks map the node request to its owned files.",
      });
    } else if (mode === "locate_plan") {
      const path = selectedPath ?? "app/login/page.tsx";
      output = JSON.stringify({
        path,
        objective: path === "app/login/page.tsx"
          ? "Welcome returning users on the login page"
          : `Apply the delegated login change in ${path}`,
        targetDescription: "The exact delegated file target",
        anchors: [
          path === "app/login/page.tsx" ? "LoginPage heading" : "Enter demo workspace button",
        ],
        constraints: ["Modify only the authorized file"],
        acceptanceCriteria: [
          path === "app/login/page.tsx"
            ? "The login heading welcomes returning users"
            : `Delegated change for ${path} is present`,
        ],
        rationale: "The server-authorized file owns this part of the delegated task.",
      });
    } else if (mode === "validate_proposal") {
      const path = selectedPath ?? "app/login/page.tsx";
      const criterion = path === "app/login/page.tsx"
        ? "The login heading welcomes returning users"
        : `Delegated change for ${path} is present`;
      output = JSON.stringify({
        path,
        verdict: "valid",
        criteria: [{
          criterion,
          status: "satisfied",
          explanation: "The scoped proposal implements the delegated objective.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the authorized file is modified.",
        },
        summary: "The delegated proposal is scoped and satisfies its criterion.",
        rationale: "The proposed exact replacement matches the delegated task.",
      });
    } else if (mode === "validate_delegated_batch" || mode === "validate_whole_tree_batch") {
      const plan = mode === "validate_whole_tree_batch"
        ? (isRecord(input.transactionPlan) && Array.isArray(input.transactionPlan.leaves)
          ? input.transactionPlan.leaves as unknown[]
          : [])
        : (isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
          ? input.delegationPlan.tasks as unknown[]
          : []);
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      output = JSON.stringify({
        verdict: "valid",
        tasks: plan.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((item): item is string => typeof item === "string")
            : [];
          return {
            taskId: task.taskId ?? task.transactionTaskId,
            childRunId: child.childRunId ?? task.childRunId,
            path: task.filePath ?? task.path,
            status: "consistent",
            criteria: criteria.map((item) => ({
              criterion: item,
              status: "satisfied",
              explanation: "The independently validated proposal satisfies this criterion.",
            })),
            summary: "The child proposal is consistent with its delegated task.",
          };
        }),
        crossFileAssessment: {
          status: "consistent",
          summary: "The delegated proposals are mutually consistent.",
        },
        summary: "The complete delegated batch is valid.",
        rationale: "All tasks and interfaces were reviewed together.",
      });
    } else if (selectedPath === "app/login/page.tsx" || (!selectedPath && mode === undefined)) {
      output = JSON.stringify({
        summary: "Update the delegated login heading",
        path: "app/login/page.tsx",
        edits: [{ search: "<h1>Demo access</h1>", replace: "<h1>Welcome Back</h1>" }],
      });
    } else if (selectedPath === "components/LoginForm.tsx") {
      output = JSON.stringify({
        summary: "Update the delegated demo-entry label",
        path: selectedPath,
        edits: [{
          search: "Enter demo workspace",
          replace: "Open demo workspace",
        }],
      });
    } else {
      output = JSON.stringify({
        summary: "Deterministic fixture fallback",
        path: selectedPath ?? "app/login/page.tsx",
        edits: [{ search: "<h1>Demo access</h1>", replace: "<h1>Welcome Back</h1>" }],
      });
    }

    return {
      requestId: `deterministic_${Date.now()}`,
      provider: "deterministic-fixture",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

export function createDeterministicAgentGatewayFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ModelGateway | undefined {
  if (env.PROJECTOS_DETERMINISTIC_AGENT_GATEWAY !== "1") return undefined;
  return new DeterministicLoginChangeGateway();
}
