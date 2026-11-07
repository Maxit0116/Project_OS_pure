/**
 * Public-API harness for approved-intent → prepare → confirm.
 * Discovery mocks must emit DiscoveryActionSchema `{ action: "final", intent }`.
 * Do not inject removed private maps (e.g. externalRunsByRunId).
 *
 * Default `deferOrchestratorStart` stays true (spy noop) for confirm-only
 * tests. Pass explicit `false` for real orchestration; the workspace gateway
 * then routes locate/generate/validate (controllable mock — not DeepSeek).
 * Do not rebuild the approved-intent-public-apply gold standard here.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import {
  createMockSampleWorkspace,
  MockProjectOSApiClient,
} from "../../client/mock-project-os-api-client.js";
import type { AgentRun, RequestIntent } from "../../contracts/index.js";
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
} from "../../contracts/model-gateway.js";
import { createDefaultSettings } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "../model-gateway/gateway.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function discoveryFinalIntentOutput(input: {
  goal: string;
  nodeId: string;
  files?: string[];
  questions?: Array<{
    id: string;
    text: string;
    options?: Array<{ id: string; label: string }>;
    recommendation?: string;
  }>;
}): string {
  return JSON.stringify({
    action: "final",
    intent: {
      goal: input.goal,
      kind: "change",
      touches: [{
        nodeId: input.nodeId,
        reason: "Owns the change surface",
        ...(input.files ? { files: input.files } : {}),
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      }],
      structuralProposals: [],
      assumptions: [],
      outOfScope: ["Do not touch unrelated modules"],
      acceptance: ["The requested change is visible"],
      questions: input.questions ?? [],
    },
  });
}

/**
 * Controllable mock complete() that can drive discovery plus
 * locate/generate/validate for real orchestration when defer=false.
 */
export function createOrchestrationCapableComplete(options: {
  projectId: string;
  nodeId: string;
  filePath: string;
  goal?: string;
  search?: string;
  replace?: string;
}): (
  profile: Parameters<ModelGateway["complete"]>[0],
  request: ModelGatewayRequest,
) => Promise<ModelGatewayResponse> {
  const goal = options.goal ?? "Update the selected surface";
  let sequence = 0;
  return async (profile, request) => {
    sequence += 1;
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;
    if (request.requestKind === "request_intent") {
      output = discoveryFinalIntentOutput({
        goal,
        nodeId: options.nodeId,
        files: [options.filePath],
      });
    } else if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: goal,
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [options.nodeId],
        affectedFiles: [options.filePath],
        confidence: 1,
      });
    } else if (mode === "locate_plan") {
      output = JSON.stringify({
        path: options.filePath,
        objective: goal,
        targetDescription: "The authorized selected file",
        anchors: ["selected surface"],
        constraints: ["Modify only the authorized file"],
        acceptanceCriteria: ["The requested change is visible"],
        rationale: "The selected file owns the requested surface.",
      });
    } else if (mode === "validate_proposal") {
      output = JSON.stringify({
        path: options.filePath,
        verdict: "valid",
        criteria: [{
          criterion: "The requested change is visible",
          status: "satisfied",
          explanation: "The scoped proposal stays on the authorized file.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the authorized file changes.",
        },
        summary: "The scoped proposal meets its acceptance criterion.",
        rationale: "The exact edit implements the requested outcome.",
      });
    } else {
      const search = options.search ?? "export default function Page() { return null }\n";
      const replace = options.replace
        ?? "export default function Page() { return <h1>Updated</h1> }\n";
      output = JSON.stringify({
        summary: goal,
        path: options.filePath,
        edits: [{ search, replace }],
      });
    }
    return {
      requestId: `approved-intent-harness_${sequence}`,
      projectId: options.projectId,
      provider: profile.provider,
      model: profile.model,
      latencyMs: 1,
      output,
      usage: { inputTokens: 8, outputTokens: 8 },
    };
  };
}

export async function openIntentModelWorkspace(options?: {
  rootPrefix?: string;
  nodeId?: string;
  filePath?: string;
  goal?: string;
  fileContents?: string;
  search?: string;
  replace?: string;
}): Promise<{
  root: string;
  api: MockProjectOSApiClient;
  projectId: string;
  gateway: ModelGateway;
}> {
  const root = mkdtempSync(join(tmpdir(), options?.rootPrefix ?? "approved-intent-harness-"));
  mkdirSync(join(root, ".projectos"));
  const filePath = options?.filePath ?? "app/checkout/page.tsx";
  const absoluteFile = join(root, filePath);
  mkdirSync(dirname(absoluteFile), { recursive: true });
  writeFileSync(
    absoluteFile,
    options?.fileContents ?? "export default function Page() { return null }\n",
  );

  const workspace = createMockSampleWorkspace();
  workspace.workspaceRoot = root;
  workspace.projectOSRoot = join(root, ".projectos");
  const settings = createDefaultSettings(workspace.project.projectId);
  settings.presentationMode = false;
  settings.execution = {
    ...settings.execution,
    mode: "model",
    defaultModelProfileId: "model_1",
  };
  settings.modelProfiles = [{
    id: "model_1",
    name: "Intent model",
    provider: "ollama",
    model: "model_1",
    apiKeyRef: "",
  }];
  workspace.settings = settings;

  const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
  const nodeId = options?.nodeId ?? "feat_checkout";
  gateway.complete = createOrchestrationCapableComplete({
    projectId: workspace.project.projectId,
    nodeId,
    filePath,
    ...(options?.goal ? { goal: options.goal } : {}),
    ...(options?.search ? { search: options.search } : {}),
    ...(options?.replace ? { replace: options.replace } : {}),
  });

  const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
  const project = await api.openSampleWorkspace();
  return { root, api, projectId: project.projectId, gateway };
}

export async function approveAndConfirmIntentExecution(
  api: MockProjectOSApiClient,
  projectId: string,
  rawRequest: string,
  options?: {
    nodeId?: string;
    filePath?: string;
    answers?: Array<{ questionId: string; answer: string; selectedOptionId?: string }>;
    /**
     * Default true: spy noop maybeStartPendingOrchestratorRun (confirm-only).
     * Pass false for real orchestration; gateway must be orchestration-capable.
     */
    deferOrchestratorStart?: boolean;
  },
): Promise<{ intent: RequestIntent; refinementId: string; run: AgentRun }> {
  const draft = await api.extractRequestIntent({
    projectId,
    rawRequest,
    ...(options?.nodeId ? { nodeId: options.nodeId } : {}),
    ...(options?.filePath ? { filePath: options.filePath } : {}),
    executorSelection: { kind: "model", modelProfileId: "model_1" },
  });
  const intent = await api.approveRequestIntent(
    projectId,
    draft.id,
    draft.revision,
    options?.answers,
  );
  if (options?.deferOrchestratorStart !== false) {
    const maybeStart = api as unknown as {
      maybeStartPendingOrchestratorRun: (runId: string) => void;
    };
    vi.spyOn(maybeStart, "maybeStartPendingOrchestratorRun").mockImplementation(() => {});
  }
  const refinement = await api.prepareIntentExecution(projectId, intent.id);
  const run = await api.confirmExecution(refinement.id);
  return { intent, refinementId: refinement.id, run };
}
