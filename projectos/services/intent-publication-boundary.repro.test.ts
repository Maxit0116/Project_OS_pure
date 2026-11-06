/**
 * Real-API repro for approved-intent + publication boundary (no private-map injection).
 * Harness evidence only — not a rewrite of the 78-fail cluster.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMockSampleWorkspace, MockProjectOSApiClient } from "../client/mock-project-os-api-client.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/gateway.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function finalDiscoveryStep(goal: string, nodeId: string): string {
  return JSON.stringify({
    action: "final",
    intent: {
      goal,
      kind: "change",
      touches: [{
        nodeId,
        reason: "Owns the change surface",
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      }],
      structuralProposals: [],
      assumptions: [],
      outOfScope: ["Do not touch unrelated modules"],
      acceptance: ["The requested change is visible"],
      questions: [],
    },
  });
}

describe("intent/publication boundary real-API repro", () => {
  it("rejects model confirmExecution when no approved intent is attached", async () => {
    const sampleWorkspaceRoot = join(process.cwd(), "..", "sample-graph-saas");
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new ModelGateway({ secretStore: new InMemorySecretStore() }),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await api.updateSettings(project.projectId, {
      presentationMode: false,
      execution: {
        mode: "model",
        defaultModelProfileId: "fixture-model",
        defaultAgentProfileId: "default-feature",
        thinkingDepth: "off",
        changeExecutionPolicy: "review_first",
      },
      modelProfiles: [{
        id: "fixture-model",
        name: "Fixture Model",
        provider: "custom",
        apiFormat: "openai_chat",
        displayName: "Fixture Model",
        model: "fixture-model",
        baseUrl: "https://example.invalid",
        apiKeyRef: "model_profile:fixture-model",
        isDefault: true,
      }],
    });

    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "Change the login heading.",
    });

    await expect(api.confirmExecution(refinement.id)).rejects.toMatchObject({
      code: "diff_scope_violation",
      message: expect.stringMatching(/approved request intent/i),
    });
  });

  it("approves intent, confirms execution, refuses cross-scope publication without private maps", async () => {
    const root = mkdtempSync(join(tmpdir(), "intent-boundary-repro-"));
    roots.push(root);
    mkdirSync(join(root, ".projectos"));
    mkdirSync(join(root, "app/checkout"), { recursive: true });
    writeFileSync(join(root, "app/checkout/page.tsx"), "export default function Checkout() { return null }\n");

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
    gateway.complete = async (profile) => ({
      requestId: "repro",
      projectId: workspace.project.projectId,
      provider: profile.provider,
      model: profile.model,
      latencyMs: 1,
      output: finalDiscoveryStep("Send one receipt after payment", "feat_checkout"),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
    const project = await api.openSampleWorkspace();

    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Send a receipt after payment succeeds",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    expect(approved.status).toBe("approved");
    expect(approved.approvalHash).toMatch(/^sha256:/);

    const internals = api as unknown as {
      assertApprovedIntentAllowsPublication(
        state: unknown,
        workspace: unknown,
        diff?: unknown,
      ): Promise<void>;
    };
    await expect(internals.assertApprovedIntentAllowsPublication(
      {
        approvedIntent: approved,
        run: { scope: { kind: "leaf-file", nodeId: "feat_checkout", filePath: "app/checkout/page.tsx" } },
      },
      workspace,
      {
        runId: "run_repro_oos",
        summary: "out of scope",
        files: [{ path: "app/notifications/page.tsx", changeType: "modify", before: "old", after: "new" }],
      },
    )).rejects.toThrow(/exceeds the approved intent/i);

    const maybeStart = api as unknown as { maybeStartPendingOrchestratorRun: (runId: string) => void };
    maybeStart.maybeStartPendingOrchestratorRun = () => {};
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const run = await api.confirmExecution(refinement.id);
    expect(run.approvedIntent).toBeDefined();
    expect(run.runId).toMatch(/^run_/);

    await expect(api.applyDiff("run_does_not_exist_at_publication_boundary")).rejects.toBeInstanceOf(ProjectOSError);
  });
});
