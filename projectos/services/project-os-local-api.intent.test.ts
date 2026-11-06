import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSampleWorkspace, MockProjectOSApiClient } from "../client/mock-project-os-api-client.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { ModelGateway } from "./model-gateway/gateway.js";
import { createExecutorRegistry } from "./harness/default-executors.js";
import { ExecutorRegistry } from "./harness/executor-registry.js";
import { FakeExecutorAdapter } from "./harness/fake-executor.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** DiscoveryActionSchema requires `{ action: "final", intent }` — bare intent drafts are invalid. */
function finalIntentOutput(intent: Record<string, unknown>): string {
  return JSON.stringify({ action: "final", intent });
}

const DEFAULT_RECEIPT_INTENT = {
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
};

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
  const complete = vi.spyOn(gateway, "complete").mockImplementation(async (profile) => ({
    requestId: "intent-test",
    projectId: workspace.project.projectId,
    provider: profile.provider,
    model: profile.model,
    latencyMs: 1,
    output: finalIntentOutput(DEFAULT_RECEIPT_INTENT),
    usage: { inputTokens: 100, outputTokens: 80 },
  }));
  const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway });
  const project = await api.openSampleWorkspace();
  return { api, project, complete, workspace };
}

describe("RequestIntent API", () => {
  it("drills into the selected graph branch before finalizing intent scope", async () => {
    const { api, project, complete } = await setup();
    const base = {
      requestId: "intent-drilldown-test",
      projectId: project.projectId,
      provider: "ollama",
      model: "model_1",
      latencyMs: 1,
      usage: { inputTokens: 20, outputTokens: 30 },
    };
    complete.mockImplementationOnce(async () => ({
      ...base,
      output: JSON.stringify({
        action: "list_children",
        nodeId: "system_saas_starter",
        reason: "Locate the checkout surface under the product system",
      }),
    }));
    complete.mockImplementationOnce(async (_profile, request) => {
      expect(request.input).toHaveProperty("observations");
      return {
        ...base,
        output: finalIntentOutput({
          goal: "Send one receipt after a successful payment",
          kind: "change",
          touches: [{
            nodeId: "feat_checkout",
            reason: "Owns the receipt flow",
            allow: { editExisting: true, addParts: false, deletePartIds: [] },
          }],
          structuralProposals: [],
          assumptions: [],
          outOfScope: [],
          acceptance: ["A successful payment sends one receipt"],
          questions: [],
        }),
      };
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

    const internal = api as unknown as { maybeStartPendingOrchestratorRun: (runId: string) => void };
    vi.spyOn(internal, "maybeStartPendingOrchestratorRun").mockImplementation(() => {});
    const [first, concurrentRetry] = await Promise.all([
      api.confirmExecution(refinement.id),
      api.confirmExecution(refinement.id),
    ]);
    const laterRetry = await api.confirmExecution(refinement.id);
    expect(concurrentRetry.runId).toBe(first.runId);
    expect(laterRetry.runId).toBe(first.runId);
    await expect(api.listRunDecisions(project.projectId, first.runId)).resolves.toHaveLength(1);
  });

  it("fails closed when extraction selects an unavailable runtime", async () => {
    const { api, project, complete } = await setup();
    await expect(api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Change checkout",
      executorSelection: { kind: "runtime", runtimeProfileId: "not-installed" },
    })).rejects.toThrow(/not available in this build/);
    expect(complete).not.toHaveBeenCalled();
  });

  it("records proposed node level and wiring in the intent card contract", async () => {
    const { api, project, complete } = await setup();
    complete.mockImplementationOnce(async (profile) => ({
      requestId: "intent-node-wiring",
      projectId: project.projectId,
      provider: profile.provider,
      model: profile.model,
      latencyMs: 1,
      output: finalIntentOutput({
        goal: "Add receipt delivery",
        kind: "add_node",
        touches: [{
          nodeId: "feat_checkout",
          reason: "Owns the successful payment event",
          allow: { editExisting: true, addParts: false, deletePartIds: [] },
        }],
        structuralProposals: [{
          kind: "add_node",
          parentNodeId: "container_next_web",
          name: "Receipt delivery",
          level: "component",
          wiring: [{
            existingNodeId: "feat_checkout",
            direction: "from_new",
            relation: "calls",
            label: "send receipt",
          }],
        }],
        assumptions: [],
        outOfScope: [],
        acceptance: ["A successful payment sends one receipt"],
        questions: [],
      }),
      usage: { inputTokens: 20, outputTokens: 20 },
    }));

    const intent = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Add receipt delivery after payment success",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    expect(intent.structuralEffects).toContainEqual({
      kind: "add_node",
      parentNodeId: "container_next_web",
      name: "Receipt delivery",
      level: "component",
      wiring: [{
        existingNodeId: "feat_checkout",
        direction: "from_new",
        relation: "calls",
        label: "send receipt",
      }],
      source: "model_proposed",
    });
  });

  // INTERNAL: unit-covers assertApprovedIntentAllowsPublication directly.
  // Public OOS apply coverage lives in approved-intent-public-apply / publication-scope.
  it("INTERNAL: rejects publication plans outside the approved files and scaffold wiring", async () => {
    const { api, project, complete, workspace } = await setup();
    complete.mockImplementationOnce(async (profile) => ({
      requestId: "intent-structural-review",
      projectId: project.projectId,
      provider: profile.provider,
      model: profile.model,
      latencyMs: 1,
      output: finalIntentOutput({
        goal: "Add receipt delivery",
        kind: "mixed",
        touches: [{
          nodeId: "feat_checkout",
          reason: "Owns the successful payment flow",
          allow: { editExisting: true, addParts: false, deletePartIds: [] },
        }],
        structuralProposals: [{
          kind: "add_node",
          parentNodeId: "container_next_web",
          name: "Receipt delivery",
          level: "component",
          wiring: [{
            existingNodeId: "feat_checkout",
            direction: "from_new",
            relation: "calls",
            label: "send receipt",
          }],
        }],
        assumptions: [],
        outOfScope: [],
        acceptance: ["A successful payment sends one receipt"],
        questions: [],
      }),
      usage: { inputTokens: 20, outputTokens: 20 },
    }));
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      rawRequest: "Add receipt delivery after payment success",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    });
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const internals = api as unknown as {
      assertApprovedIntentAllowsPublication(state: unknown, workspace: unknown, diff?: unknown): Promise<void>
    };
    const filePlan = {
      approvedIntent: approved,
      run: { scope: { kind: "leaf-file", nodeId: "feat_checkout", filePath: "app/checkout/page.tsx" } },
    };
    await expect(internals.assertApprovedIntentAllowsPublication(
      filePlan,
      workspace,
      { runId: "run_auto", summary: "out of scope", files: [{ path: "app/notifications/page.tsx", changeType: "modify", before: "old", after: "new" }] },
    )).rejects.toThrow(/exceeds the approved intent/u);

    const scaffoldPlan = {
      approvedIntent: approved,
      run: { scope: { kind: "container", nodeId: "container_next_web" } },
      nodeScaffoldPlan: {
        parentScope: { kind: "container", nodeId: "container_next_web" },
        node: { name: "Receipt delivery", level: "component" },
        wiring: [{
          existingNodeId: "feat_checkout",
          direction: "from_new",
          relation: "calls",
          label: "also notify admin",
        }],
        files: [],
      },
    };
    await expect(internals.assertApprovedIntentAllowsPublication(scaffoldPlan, workspace))
      .rejects.toThrow(/outside the approved structural intent/u);
  });

  // INTERNAL: private assert helper. Public missing-intent reject is in
  // approved-intent-public-apply (confirmExecution without approve).
  it("INTERNAL: rejects model publication when the run has no server-approved intent", async () => {
    const { api, workspace } = await setup();
    const internals = api as unknown as {
      assertApprovedIntentAllowsPublication(state: unknown, workspace: unknown, diff?: unknown): Promise<void>
    };

    await expect(internals.assertApprovedIntentAllowsPublication({
      run: { kind: "feature_change", scope: { kind: "leaf-file", nodeId: "feat_checkout", filePath: "app/checkout/page.tsx" } },
      refinement: { mode: "model" },
      modelProfile: { id: "model_1" },
    }, workspace, {
      runId: "run_unapproved_model",
      summary: "Unauthorized change",
      files: [{ path: "app/checkout/page.tsx", changeType: "modify", before: "old", after: "new" }],
    })).rejects.toThrow(/no approved request intent/u);
  });
});

describe('H0 request routing',()=>{
 it('preserves a selected file through approval and execution',async()=>{
  const {api,project,workspace}=await setup();
  mkdirSync(join(workspace.workspaceRoot,"app/checkout"),{recursive:true});
  writeFileSync(join(workspace.workspaceRoot,"app/checkout/page.tsx"),"export default function Checkout() { return null; }\n");
  vi.spyOn(api as any,'maybeStartPendingOrchestratorRun').mockImplementation(()=>{});
  const draft=await api.extractRequestIntent({projectId:project.projectId,nodeId:'feat_checkout',filePath:'app/checkout/page.tsx',rawRequest:'Change this file heading',executorSelection:{kind:'model',modelProfileId:'model_1'}});
  await api.approveRequestIntent(project.projectId,draft.id,draft.revision,[{questionId:'recipient',answer:'Account email',selectedOptionId:'account'}]);
  const refinement=await api.prepareIntentExecution(project.projectId,draft.id);
  const run=await api.confirmExecution(refinement.id);
  expect(draft.requestedFile).toEqual({nodeId:'feat_checkout',path:'app/checkout/page.tsx'});
  expect(refinement.affectedFiles).toEqual(['app/checkout/page.tsx']);
  expect(run.scope).toEqual({kind:'leaf-file',nodeId:'feat_checkout',filePath:'app/checkout/page.tsx'});
 });
 it('an accepted edit-only plan can reach a queued model run',async()=>{
  const {api,project,complete}=await setup();
  vi.spyOn(api as any,'maybeStartPendingOrchestratorRun').mockImplementation(()=>{});
  complete.mockImplementation(async(profile,request)=>({requestId:'h0-plan',provider:profile.provider,model:profile.model,latencyMs:1,usage:{inputTokens:1,outputTokens:1},output:JSON.stringify(request.requestKind==='implementation_plan'?{
   objective:'Update checkout heading',steps:[{id:'step_1',description:'Edit heading',affectedFiles:['app/checkout/page.tsx'],acceptanceCriteria:['Heading updated']}],todos:[],ambiguities:[],clarifyingQuestions:[],rationale:'Edit the existing heading'
  }:{understood:'Update checkout heading',ambiguities:[],suggestions:[],affectedNodeIds:['feat_checkout'],affectedFiles:['app/checkout/page.tsx'],confidence:1})}));
  const plan=await api.createPlan({projectId:project.projectId,scope:{kind:'global'},objective:'Update checkout heading',executorSelection:{kind:'model',modelProfileId:'model_1'}});
  const refinement=await api.buildPlan(plan.id);
  expect((api as any).plansById.get(plan.id).status).toBe('ready');
  const run=await api.confirmExecution(refinement.id);
  expect(run.status).toBe('queued');
  expect(run.approvedIntent).toBeDefined();
  expect((api as any).plansById.get(plan.id).status).toBe('building');
 });
});

describe("SH-2 runtime executor selection", () => {
  async function setupRuntime(scripted = true, withModel = false) {
    const root = mkdtempSync(join(tmpdir(), "runtime-intent-api-"));
    roots.push(root);
    mkdirSync(join(root, ".projectos"));
    mkdirSync(join(root, "app/checkout"), { recursive: true });
    const original = "export default function Checkout() { return null; }\n";
    writeFileSync(join(root, "app/checkout/page.tsx"), original);
    const workspace = createMockSampleWorkspace();
    workspace.workspaceRoot = root;
    workspace.projectOSRoot = join(root, ".projectos");
    const settings = createDefaultSettings(workspace.project.projectId);
    settings.presentationMode = false;
    settings.execution = { ...settings.execution, mode: "model" };
    settings.modelProfiles = withModel
      ? [{ id: "model_1", name: "Default", provider: "ollama", model: "model_1", apiKeyRef: "" }]
      : [];
    if (withModel) settings.execution = { ...settings.execution, defaultModelProfileId: "model_1" };
    workspace.settings = settings;
    const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
    const complete = vi.spyOn(gateway, "complete").mockRejectedValue(new Error("no model may be called"));
    const api = new MockProjectOSApiClient({
      workspace,
      modelGateway: gateway,
      executors: createExecutorRegistry({ scripted }),
    });
    const project = await api.openSampleWorkspace();
    return { api, project, complete, root, original };
  }
  const selection = { kind: "runtime" as const, runtimeProfileId: "scripted" };

  it("lists the scripted executor, labelled as dev-only, when the build registers it", async () => {
    const { api, project } = await setupRuntime();
    expect(await api.listExecutors(project.projectId)).toEqual([
      expect.objectContaining({ kind: "runtime", executorId: "scripted", devOnly: true, label: expect.stringMatching(/dev/iu) }),
    ]);
    const bare = await setupRuntime(false);
    expect(await bare.api.listExecutors(bare.project.projectId)).toEqual([]);
  });

  it("takes a selected file from intent card to a reviewable proposal with no model", async () => {
    const { api, project, complete, root, original } = await setupRuntime();
    const draft = await api.extractRequestIntent({
      projectId: project.projectId, nodeId: "feat_checkout", filePath: "app/checkout/page.tsx",
      rawRequest: "Change the checkout heading", executorSelection: selection,
    });
    expect(draft.executorSelection).toEqual(selection);
    expect(draft.executorSnapshot).toBeUndefined();
    expect(draft.questions).toEqual([]);
    expect(draft.touches.map((touch) => touch.nodeId)).toEqual(["feat_checkout"]);

    await api.approveRequestIntent(project.projectId, draft.id, draft.revision, []);
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const run = await api.confirmExecution(refinement.id);
    expect(run.executor).toMatchObject({ kind: "runtime", executorId: "scripted" });

    const finished = await vi.waitFor(async () => {
      const current = await api.getAgentRun(run.runId);
      expect(current.status).toBe("awaiting_review");
      return current;
    });
    expect(finished.executor).toMatchObject({ kind: "runtime", executorId: "scripted" });
    expect(complete).not.toHaveBeenCalled();
    // Review only: the proposal is staged, apply is refused, and the file on disk is untouched.
    await expect(api.applyDiff(run.runId)).rejects.toThrow(/independent validation/u);
    expect(readFileSync(join(root, "app/checkout/page.tsx"), "utf8")).toBe(original);
    const diff = await api.getDiff(run.runId);
    expect(diff.files).toEqual([
      expect.objectContaining({ path: "app/checkout/page.tsx", changeType: "modify", before: original }),
    ]);
    expect(diff.files[0]!.after).toMatch(/Scripted executor \(no model\)/u);
  });

  it("names no validator for a dev stand-in even when a default model exists", async () => {
    const { api, project } = await setupRuntime(true, true);
    const draft = await api.extractRequestIntent({
      projectId: project.projectId, nodeId: "feat_checkout", filePath: "app/checkout/page.tsx",
      rawRequest: "Change the checkout heading", executorSelection: selection,
    });
    expect(draft.validatorSnapshot).toBeUndefined();
  });

  it("refuses a runtime choice that has no selected file, an unregistered runtime, and surfaces that need a model", async () => {
    const { api, project } = await setupRuntime();
    await expect(api.extractRequestIntent({
      projectId: project.projectId, rawRequest: "Rework billing", executorSelection: selection,
    })).rejects.toThrow(/one selected file/u);
    await expect(api.extractRequestIntent({
      projectId: project.projectId, nodeId: "feat_checkout", filePath: "app/checkout/page.tsx",
      rawRequest: "x", executorSelection: { kind: "runtime", runtimeProfileId: "missing" },
    })).rejects.toThrow(/not available in this build/u);
    await expect(api.askAgent({
      projectId: project.projectId, question: "What does checkout do?", scope: { kind: "global" },
      language: { mode: "auto" }, executorSelection: selection,
    } as never)).rejects.toThrow(/need a model profile/u);
  });
});

describe("SH-3 validated runtime proposal", () => {
  it("applies and undoes a runtime proposal only after the validator model accepts it", async () => {
    const root = mkdtempSync(join(tmpdir(), "runtime-validated-api-"));
    roots.push(root);
    mkdirSync(join(root, ".projectos"));
    mkdirSync(join(root, "app/checkout"), { recursive: true });
    const original = "export default function Checkout() { return null; }\n";
    const target = join(root, "app/checkout/page.tsx");
    writeFileSync(target, original);
    const workspace = createMockSampleWorkspace();
    workspace.workspaceRoot = root;
    workspace.projectOSRoot = join(root, ".projectos");
    const settings = createDefaultSettings(workspace.project.projectId);
    settings.presentationMode = false;
    settings.execution = { ...settings.execution, mode: "model", defaultModelProfileId: "validator_1" };
    settings.modelProfiles = [{ id: "validator_1", name: "Validator", provider: "ollama", model: "validator_1", apiKeyRef: "" }];
    workspace.settings = settings;
    // Apply journals current work against the project document on disk.
    writeFileSync(join(root, ".projectos", "project.json"), JSON.stringify(workspace.project));
    const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
    const requests: Array<{ requestKind: string; modelPreference: string | undefined }> = [];
    vi.spyOn(gateway, "complete").mockImplementation(async (profile, request) => {
      requests.push({ requestKind: request.requestKind, modelPreference: request.modelPreference });
      return {
        requestId: "validator-test", projectId: workspace.project.projectId, provider: profile.provider,
        model: profile.model, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 },
        output: JSON.stringify({
          path: "app/checkout/page.tsx", verdict: "valid",
          criteria: [{ criterion: "Add a short note", status: "satisfied", explanation: "Done." }],
          scopeAssessment: { status: "compliant", explanation: "Only the selected file changed." },
          summary: "Accepted.", rationale: "Matches the request.",
        }),
      };
    });
    const after = `${original}// executor change\n`;
    // A non-dev executor that proposes the same appended line for whichever task it is given.
    const executors = new ExecutorRegistry();
    executors.register({
      id: "fake",
      describe: () => new FakeExecutorAdapter().describe(),
      start: (task, host) => new FakeExecutorAdapter({
        proposal: {
          proposalId: `proposal_${task.taskId}`, taskId: task.taskId,
          diff: { runId: task.runId, summary: "Append a note", files: [{ path: "app/checkout/page.tsx", changeType: "modify", before: original, after }] },
        },
      }).start(task, host),
    });
    const api = new MockProjectOSApiClient({ workspace, modelGateway: gateway, executors });
    const project = await api.openSampleWorkspace();

    const draft = await api.extractRequestIntent({
      projectId: project.projectId, nodeId: "feat_checkout", filePath: "app/checkout/page.tsx",
      rawRequest: "Add a short note", executorSelection: { kind: "runtime", runtimeProfileId: "fake" },
    });
    expect(draft.validatorSnapshot?.profile.id).toBe("validator_1");
    const approved = await api.approveRequestIntent(project.projectId, draft.id, draft.revision, []);
    const approvalService = (api as unknown as { requestIntentService: { isApprovalValid(intent: unknown): boolean } }).requestIntentService;
    expect(approvalService.isApprovalValid(approved)).toBe(true);
    // The validator is part of what the user approved: swapping it voids the approval.
    expect(approvalService.isApprovalValid({
      ...approved,
      validatorSnapshot: { ...approved.validatorSnapshot!, profile: { ...approved.validatorSnapshot!.profile, model: "another-model" } },
    })).toBe(false);
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const run = await api.confirmExecution(refinement.id);
    await vi.waitFor(async () => expect((await api.getAgentRun(run.runId)).status).toBe("awaiting_review"));
    expect(requests).toEqual([expect.objectContaining({ modelPreference: "validator_1" })]);
    expect(readFileSync(target, "utf8")).toBe(original);

    const applied = await api.applyDiff(run.runId);
    expect(applied.applied).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(after);
    const restored = await api.restoreApplyBackup(project.projectId, applied.backupId!);
    expect(restored.restored).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(original);
  });
});
