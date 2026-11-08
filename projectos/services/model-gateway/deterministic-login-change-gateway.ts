/**
 * SYNTHETIC deterministic model stand-in for isolate/Electron probes.
 * Enabled only when PROJECTOS_DETERMINISTIC_AGENT_GATEWAY=1.
 * Never used by default desktop; produces no outbound HTTP.
 *
 * Covers: chat_title, single-file login heading change, and feat_login
 * delegated multi-file automatic apply (sample-graph-saas).
 */
import type { ModelGatewayRequest, ModelGatewayResponse } from "../../contracts/model-gateway.js";
import { ProjectOSError } from "../../errors.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { createDeterministicGreenfieldGatewayFromEnv } from "./deterministic-greenfield-gateway.js";
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
  private readonly uncertainCriteria: boolean;
  private readonly midRunClarification: boolean;
  /** Opt-in: fail one delegated leaf with a dirty diagnostic for sanitize DOM proof. */
  private readonly forceChildFail: boolean;
  private midRunClarificationAsked = false;
  private childFailTriggered = false;

  constructor(options: {
    uncertainCriteria?: boolean;
    midRunClarification?: boolean;
    forceChildFail?: boolean;
  } = {}) {
    super({ secretStore: new InMemorySecretStore() });
    this.uncertainCriteria = options.uncertainCriteria === true;
    this.midRunClarification = options.midRunClarification === true;
    this.forceChildFail = options.forceChildFail === true;
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    // Opt-in hold so Electron Stop probes can click while flowStatus===running.
    const slowMsRaw = process.env.PROJECTOS_DETERMINISTIC_SLOW_MS?.trim();
    if (slowMsRaw && /^\d+$/u.test(slowMsRaw)) {
      const slowMs = Number(slowMsRaw);
      if (slowMs > 0 && slowMs <= 30_000) {
        await new Promise((resolve) => setTimeout(resolve, slowMs));
      }
    }
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope) ? localContext.scope : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;
    const stepOutputs = Array.isArray(input.stepOutputs)
      ? input.stepOutputs.filter((item): item is string => typeof item === "string")
      : [];
    const hasClarificationAnswer = stepOutputs.some((item) =>
      /User clarification for the authorized edit/i.test(item),
    );

    let output: string;

    // H3 synthetic: one material missing-intent ask (not Continue), then edit after answer.
    if (
      this.midRunClarification &&
      !this.midRunClarificationAsked &&
      !hasClarificationAnswer &&
      request.requestKind === "change_generation"
    ) {
      this.midRunClarificationAsked = true;
      output = JSON.stringify({
        action: "clarify",
        question:
          "Login heading copy is not fixed by the approved intent or the current file snapshot. Which heading should the login page use?",
        options: [
          { id: "welcome_back", label: "Welcome Back" },
          { id: "sign_in", label: "Sign in" },
        ],
      });
      return {
        requestId: `deterministic_${Date.now()}`,
        provider: "deterministic-fixture",
        model: "fixture-model",
        output,
        usage: { inputTokens: 10, outputTokens: 10 },
        latencyMs: 1,
      };
    }

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
    } else if (mode === "plan_node_delegation") {
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
    } else if (mode === "plan_graph_delegation") {
      // Mirror RecursiveHierarchyGateway: recurse by architecture level until leaf-file.
      const immediateTargets = isRecord(input.immediateTargets) ? input.immediateTargets : {};
      const kind = immediateTargets.kind;
      const level = immediateTargets.level;
      if (kind === "leaf-file") {
        output = JSON.stringify({
          objective: "Update both login implementation files",
          tasks: DELEGATED_PATHS.map((path) => ({
            path,
            objective: `Apply the login change in ${path}`,
            acceptanceCriteria: [`Delegated change for ${path} is present`],
          })),
          rationale: "The component owns both leaf files.",
        });
      } else {
        const nodeId = level === "context"
          ? "system_saas_starter"
          : level === "container"
            ? "container_next_web"
            : "feat_login";
        output = JSON.stringify({
          objective: `Delegate the login change to ${nodeId}`,
          tasks: [{
            nodeId,
            objective: `Plan the login change in ${nodeId}`,
            acceptanceCriteria: ["The delegated login behavior is updated"],
          }],
          rationale: "The task follows one immediate architecture layer.",
        });
      }
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
      const criterionStatus = this.uncertainCriteria ? "uncertain" : "satisfied";
      output = JSON.stringify({
        path,
        verdict: "valid",
        criteria: [{
          criterion,
          status: criterionStatus,
          explanation: this.uncertainCriteria
            ? "Criteria remain uncertain; human review must authorize apply."
            : "The scoped proposal implements the delegated objective.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the authorized file is modified.",
        },
        summary: this.uncertainCriteria
          ? "Proposal is reviewable with uncertain criteria."
          : "The delegated proposal is scoped and satisfies its criterion.",
        rationale: this.uncertainCriteria
          ? "Synthetic uncertain-criteria path for desktop review/apply proof."
          : "The proposed exact replacement matches the delegated task.",
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
      const criterionStatus = this.uncertainCriteria ? "uncertain" : "satisfied";
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
              status: criterionStatus,
              explanation: this.uncertainCriteria
                ? "Criteria remain uncertain; human review must authorize apply."
                : "The independently validated proposal satisfies this criterion.",
            })),
            summary: this.uncertainCriteria
              ? "Child proposal is reviewable with uncertain criteria."
              : "The child proposal is consistent with its delegated task.",
          };
        }),
        crossFileAssessment: {
          status: "consistent",
          summary: "The delegated proposals are mutually consistent.",
        },
        summary: this.uncertainCriteria
          ? "Delegated batch is reviewable with uncertain criteria."
          : "The complete delegated batch is valid.",
        rationale: this.uncertainCriteria
          ? "Synthetic uncertain-criteria path for desktop review/apply proof."
          : "All tasks and interfaces were reviewed together.",
      });
    } else if (selectedPath === "app/login/page.tsx" || (!selectedPath && mode === undefined)) {
      const heading = hasClarificationAnswer && stepOutputs.some((item) => /Sign in/i.test(item))
        ? "Sign in"
        : "Welcome Back";
      output = JSON.stringify({
        summary: "Update the delegated login heading",
        path: "app/login/page.tsx",
        edits: [{ search: "<h1>Demo access</h1>", replace: `<h1>${heading}</h1>` }],
      });
    } else if (selectedPath === "components/LoginForm.tsx") {
      // Opt-in dirty child failure: throw unsanitized diagnostics so the real
      // orchestrator → renderer sanitize chain can be proven in Electron DOM.
      if (this.forceChildFail && !this.childFailTriggered) {
        this.childFailTriggered = true;
        throw new ProjectOSError(
          "agent_orchestration_failed",
          "Delegated file task failed; /Users/terran/secret/proj/components/LoginForm.tsx api_key=sk-abcdefghijklmnop Bearer tok_live_123",
        );
      }
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
  // Empty-graph greenfield takes precedence when explicitly opted in.
  if (env.PROJECTOS_DETERMINISTIC_GREENFIELD === "1") {
    return createDeterministicGreenfieldGatewayFromEnv(env);
  }
  return new DeterministicLoginChangeGateway({
    // Opt-in only: synthetic Electron/desktop proof of automatic→awaiting_review
    // when criteria are uncertain. Does not invent mid-run Continue cards.
    uncertainCriteria: env.PROJECTOS_DETERMINISTIC_UNCERTAIN_CRITERIA === "1",
    // Opt-in only: one substantive missing-intent clarify → waiting-decision → same-root resume.
    midRunClarification: env.PROJECTOS_DETERMINISTIC_MIDRUN_CLARIFICATION === "1",
    // Opt-in only: dirty child-fail diagnostic for chat/toast sanitize DOM proof.
    forceChildFail: env.PROJECTOS_DETERMINISTIC_FORCE_CHILD_FAIL === "1",
  });
}
