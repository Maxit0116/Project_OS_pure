/**
 * Real-API repro: missing approved intent still rejects confirmExecution.
 * Cross-scope getDiff/applyDiff coverage lives in publication-scope.public-api.test.ts
 * (public bound-authorization checks — not private assertApprovedIntentAllowsPublication).
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/gateway.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import {
  approveAndConfirmIntentExecution,
  openIntentModelWorkspace,
} from "./test-support/approved-intent-harness.js";

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

  it("legal extract→approve→prepare→confirm attaches approvedIntent on the run", async () => {
    const { root, api, projectId } = await openIntentModelWorkspace({
      rootPrefix: "intent-legal-",
      nodeId: "feat_checkout",
      filePath: "app/checkout/page.tsx",
    });
    void root;
    const { intent, run } = await approveAndConfirmIntentExecution(
      api,
      projectId,
      "Send a receipt after payment succeeds",
      { nodeId: "feat_checkout", filePath: "app/checkout/page.tsx" },
    );
    expect(intent.status).toBe("approved");
    expect(intent.approvalHash).toMatch(/^sha256:/);
    expect(run.approvedIntent).toBeDefined();
    expect(run.runId).toMatch(/^run_/);
  });
});
