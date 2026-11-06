/**
 * Public-API harness for approved-intent → prepare → confirm.
 * Discovery mocks must emit DiscoveryActionSchema `{ action: "final", intent }`.
 * Do not inject removed private maps (e.g. externalRunsByRunId).
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
import { createDefaultSettings } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "../model-gateway/gateway.js";

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

export async function openIntentModelWorkspace(options?: {
  rootPrefix?: string;
  nodeId?: string;
  filePath?: string;
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
  writeFileSync(absoluteFile, "export default function Page() { return null }\n");

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
  gateway.complete = async (profile) => ({
    requestId: "approved-intent-harness",
    projectId: workspace.project.projectId,
    provider: profile.provider,
    model: profile.model,
    latencyMs: 1,
    output: discoveryFinalIntentOutput({
      goal: "Update the selected surface",
      nodeId,
      files: [filePath],
    }),
    usage: { inputTokens: 8, outputTokens: 8 },
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
