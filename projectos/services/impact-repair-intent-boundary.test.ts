/**
 * INTERNAL boundary coverage for server-derived impact-repair exemption on
 * assertApprovedIntentAllowsPublication.
 *
 * Exemption applies ONLY when all of:
 *   - delegationPlan.impactAnalysis.kind === "file_delete"
 *   - task/file operation is modify
 *   - path is listed in impactAnalysis.directImporters
 *
 * A non-importer modify still exceeds approved intent.
 *
 * Note: greenfield forceGlobalPlanner in project-os-local-api.test.ts is a test
 * seam for empty-graph routing, not a full public E2E claim of greenfield
 * product-surface coverage.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSampleWorkspace, MockProjectOSApiClient } from "../client/mock-project-os-api-client.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { ModelGateway } from "./model-gateway/gateway.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function finalIntentOutput(intent: Record<string, unknown>): string {
  return JSON.stringify({ action: "final", intent });
}

const CHECKOUT_ONLY_INTENT = {
  goal: "Delete a checkout module and repair its importers",
  kind: "change",
  touches: [{
    nodeId: "feat_checkout",
    reason: "Owns the deleted checkout surface",
    allow: { editExisting: true, addParts: false, deletePartIds: [] },
  }],
  structuralProposals: [],
  assumptions: [],
  outOfScope: [],
  acceptance: ["Importers of the deleted module are repaired"],
  questions: [],
};

/** Notifications page — owned by feat_notifications, outside checkout-only intent. */
const IMPORTER_PATH = "app/notifications/page.tsx";
/** Login page — also outside checkout intent and not listed as a direct importer. */
const NON_IMPORTER_PATH = "app/login/page.tsx";
const DELETE_TARGET = "app/billing/page.tsx";

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "impact-repair-intent-"));
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
  vi.spyOn(gateway, "complete").mockImplementation(async (profile) => ({
    requestId: "impact-repair-intent",
    projectId: workspace.project.projectId,
    provider: profile.provider,
    model: profile.model,
    latencyMs: 1,
    output: finalIntentOutput(CHECKOUT_ONLY_INTENT),
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
  const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
  const project = await api.openSampleWorkspace();
  return { api, project, workspace };
}

type PublicationInternals = {
  assertApprovedIntentAllowsPublication(
    state: unknown,
    workspace: unknown,
    diff?: unknown,
  ): Promise<void>;
};

function fileDeleteImpact(directImporters: string[]) {
  return {
    kind: "file_delete" as const,
    scanner: "typescript_javascript_static_imports_v1" as const,
    targetPath: DELETE_TARGET,
    directImporters,
    reverseTransitiveClosure: [...directImporters],
  };
}

describe("impact repair intent boundary", () => {
  // INTERNAL: unit-covers assertApprovedIntentAllowsPublication directly.
  it("INTERNAL: exempts modify of a directImporter only under file_delete impactAnalysis", async () => {
    const { api, project, workspace } = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Delete a checkout module and repair importers",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as PublicationInternals;

    await expect(internals.assertApprovedIntentAllowsPublication({
      approvedIntent: approved,
      run: { scope: { kind: "component", nodeId: "feat_checkout" } },
      refinement: { mode: "model" },
      delegationPlan: {
        nodeId: "feat_checkout",
        tasks: [{
          taskId: "repair_importer",
          filePath: IMPORTER_PATH,
          operation: "modify",
          objective: "Remove the broken import",
          acceptanceCriteria: ["Import removed"],
        }],
        impactAnalysis: fileDeleteImpact([IMPORTER_PATH]),
      },
    }, workspace)).resolves.toBeUndefined();
  });

  it("INTERNAL: rejects non-importer modify even when file_delete impactAnalysis is present", async () => {
    const { api, project, workspace } = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Delete a checkout module and repair importers",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as PublicationInternals;

    await expect(internals.assertApprovedIntentAllowsPublication({
      approvedIntent: approved,
      run: { scope: { kind: "component", nodeId: "feat_checkout" } },
      refinement: { mode: "model" },
      delegationPlan: {
        nodeId: "feat_checkout",
        tasks: [{
          taskId: "stray_modify",
          filePath: NON_IMPORTER_PATH,
          operation: "modify",
          objective: "Edit an unrelated file",
          acceptanceCriteria: ["Changed"],
        }],
        impactAnalysis: fileDeleteImpact([IMPORTER_PATH]),
      },
    }, workspace)).rejects.toThrow(/exceeds approved intent/u);
  });

  it("INTERNAL: rejects importer modify when impactAnalysis.kind is not file_delete", async () => {
    const { api, project, workspace } = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Delete a checkout module and repair importers",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as PublicationInternals;

    await expect(internals.assertApprovedIntentAllowsPublication({
      approvedIntent: approved,
      run: { scope: { kind: "component", nodeId: "feat_checkout" } },
      refinement: { mode: "model" },
      delegationPlan: {
        nodeId: "feat_checkout",
        tasks: [{
          taskId: "repair_importer",
          filePath: IMPORTER_PATH,
          operation: "modify",
          objective: "Remove the broken import",
          acceptanceCriteria: ["Import removed"],
        }],
        impactAnalysis: {
          ...fileDeleteImpact([IMPORTER_PATH]),
          kind: "not_file_delete",
        },
      },
    }, workspace)).rejects.toThrow(/exceeds approved intent/u);
  });

  it("INTERNAL: rejects create on a directImporter path (exemption is modify-only)", async () => {
    const { api, project, workspace } = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Delete a checkout module and repair importers",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as PublicationInternals;

    await expect(internals.assertApprovedIntentAllowsPublication({
      approvedIntent: approved,
      run: { scope: { kind: "component", nodeId: "feat_checkout" } },
      refinement: { mode: "model" },
      delegationPlan: {
        nodeId: "feat_checkout",
        tasks: [{
          taskId: "create_on_importer",
          filePath: IMPORTER_PATH,
          operation: "create",
          objective: "Create at importer path",
          acceptanceCriteria: ["Created"],
        }],
        impactAnalysis: fileDeleteImpact([IMPORTER_PATH]),
      },
    }, workspace)).rejects.toThrow(/exceeds approved intent/u);
  });

  it("INTERNAL: rejects diff modify of a non-importer under file_delete impactAnalysis", async () => {
    const { api, project, workspace } = await setup();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Delete a checkout module and repair importers",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as PublicationInternals;

    await expect(internals.assertApprovedIntentAllowsPublication(
      {
        approvedIntent: approved,
        run: { scope: { kind: "component", nodeId: "feat_checkout" } },
        refinement: { mode: "model" },
        delegationPlan: {
          nodeId: "feat_checkout",
          tasks: [{
            taskId: "repair_importer",
            filePath: IMPORTER_PATH,
            operation: "modify",
            objective: "Remove the broken import",
            acceptanceCriteria: ["Import removed"],
          }],
          impactAnalysis: fileDeleteImpact([IMPORTER_PATH]),
        },
      },
      workspace,
      {
        runId: "run_impact_repair_diff",
        summary: "stray non-importer edit",
        files: [{
          path: NON_IMPORTER_PATH,
          changeType: "modify",
          before: "old",
          after: "new",
        }],
      },
    )).rejects.toThrow(/exceeds the approved intent/u);
  });
});
