import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSampleWorkspace, MockProjectOSApiClient } from "../client/mock-project-os-api-client.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { ModelGateway } from "./model-gateway/gateway.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "request-intent-api-"));
  roots.push(root);
  mkdirSync(join(root, ".projectos"));
  const workspace = createMockSampleWorkspace();
  workspace.workspaceRoot = root;
  workspace.projectOSRoot = join(root, ".projectos");
  const settings = createDefaultSettings(workspace.project.projectId);
  settings.presentationMode = false;
  settings.execution = { ...settings.execution, mode: "model", defaultModelProfileId: "model_1" };
  settings.modelProfiles = [{
    id: "model_1", name: "Intent model", provider: "ollama", model: "model_1", apiKeyRef: "",
  }];
  workspace.settings = settings;
  const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
  const complete = vi.spyOn(gateway, "complete").mockImplementation(async (profile, request) => ({
    requestId: "intent-test",
    projectId: workspace.project.projectId,
    provider: profile.provider,
    model: profile.model,
    latencyMs: 1,
    output: JSON.stringify({
      goal: "Send one receipt after a successful payment",
      kind: "change",
      touches: [{
        nodeId: "feat_checkout",
        reason: "Owns subscription payment success",
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      }],
      structuralProposals: [],
      assumptions: ["Use the existing receipt template"],
      outOfScope: ["Do not change payment processing"],
      acceptance: ["A successful subscription payment sends one receipt"],
      questions: [{
        id: "recipient",
        text: "Which receipt address should be used?",
        options: [{ id: "account", label: "Account email" }, { id: "custom", label: "Another address" }],
        recommendation: "Use the account email",
      }],
    }),
    usage: { inputTokens: 100, outputTokens: 80 },
  }));
  const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
  const project = await api.openSampleWorkspace();
  return { api, project, complete };
}

describe("RequestIntent API", () => {
  it("drills into the selected graph branch before finalizing intent scope", async () => {
    const { api, project, complete } = await setup();
    const responseFor = (nodeId: string) => ({
      requestId: "intent-drilldown-test",
      projectId: project.projectId,
      provider: "ollama",
      model: "model_1",
      latencyMs: 1,
      output: JSON.stringify({
        goal: "Send one receipt after a successful payment",
        kind: "change",
        touches: [{ nodeId, reason: "Owns the receipt flow", allow: { editExisting: true, addParts: false, deletePartIds: [] } }],
        structuralProposals: [],
        assumptions: [],
        outOfScope: [],
        acceptance: ["A successful payment sends one receipt"],
        questions: [],
      }),
      usage: { inputTokens: 20, outputTokens: 30 },
    });
    complete.mockImplementationOnce(async () => responseFor("container_next_web"));
    complete.mockImplementationOnce(async (_profile, request) => {
      expect(request.input).toHaveProperty("discoveredNodeContexts");
      return responseFor("feat_checkout");
    });

    const intent = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Send a receipt after payment succeeds",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(intent).toMatchObject({ entryNodeId: "feat_checkout", touches: [{ nodeId: "feat_checkout" }] });
  });

  it("extracts, derives routing, approves, and prepares execution from one frozen model binding", async () => {
    const { api, project, complete } = await setup();
    const intent = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Send a receipt after payment succeeds",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(intent).toMatchObject({
      status: "draft",
      entryNodeId: "feat_checkout",
      executorSnapshot: { profile: { id: "model_1" }, thinkingDepth: "medium" },
    });
    await expect(api.prepareIntentExecution(project.projectId, intent.id)).rejects.toThrow(/approved intent/);

    const approved = await api.approveRequestIntent(project.projectId, intent.id, intent.revision, [
      { questionId: "recipient", answer: "Account email", selectedOptionId: "account" },
    ]);
    expect(approved).toMatchObject({ status: "approved", revision: 1, questions: [{ answer: "Account email" }] });
    expect(approved.approvalHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    const repeated = await api.approveRequestIntent(project.projectId, intent.id, intent.revision);
    expect(repeated.approvalHash).toBe(approved.approvalHash);

    const refinement = await api.prepareIntentExecution(project.projectId, intent.id);
    expect(refinement).toMatchObject({ mode: "model", executionPolicy: "automatic", understood: approved.goal });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("fails closed when extraction selects an unavailable runtime", async () => {
    const { api, project, complete } = await setup();
    await expect(api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Change checkout",
      executorSelection: { kind: "runtime", runtimeProfileId: "not-installed" },
    })).rejects.toThrow(/not installed/);
    expect(complete).not.toHaveBeenCalled();
  });
});
