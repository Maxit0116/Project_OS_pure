/**
 * Stable regressions for t65 node-plan sibling clarify share + Stop skip.
 * Synthetic ModelGateway only — no live HTTP / no ledger burn.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSSettingsSchema } from "../../contracts/settings.js";
import type { LocalContextBundle, NodeContextBundle } from "../../contracts/local-context.js";
import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import type { PromptRefinement } from "../../contracts/prompt-refinement.js";
import type { RequestIntent } from "../../contracts/request-intent.js";
import { ProjectOSError } from "../../errors.js";
import { DurableRunStateStore } from "../harness/durable-run-state.js";
import type { ModelGateway } from "../model-gateway/index.js";
import { InMemorySecretStore } from "../../persistence/index.js";
import { ProjectOSWorkspaceStore } from "../../persistence/workspace-store.js";
import { SettingsService } from "../settings-service.js";
import { AgentOrchestrator } from "./index.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const PAGE = "app/login/page.tsx";
const FORM = "components/LoginForm.tsx";

function refinement(): PromptRefinement {
  return {
    id: "ref_sibling_clarify",
    understood: "Refresh login page heading and login form demo control",
    ambiguities: [],
    suggestions: [],
    affectedNodeIds: ["feat_login"],
    affectedFiles: [PAGE, FORM],
    confidence: 1,
    mode: "model",
  };
}

function approvedIntent(projectId: string): RequestIntent {
  return {
    version: "0.1.0",
    id: "intent_sibling_clarify",
    projectId,
    rawRequest: "Update login heading and form control; confirm heading during edit",
    goal: "Update login heading and form control",
    kind: "change",
    entryNodeId: "feat_login",
    touches: [{
      nodeId: "feat_login",
      reason: "Owns login page and form",
      allow: { editExisting: true, addParts: false, deletePartIds: [] },
      files: [PAGE, FORM],
    }],
    structuralEffects: [],
    assumptions: [],
    outOfScope: [],
    acceptance: ["Heading and form control stay coherent"],
    questions: [],
    executorSelection: { kind: "model", modelProfileId: "test-model" },
    baseGraphHash: "sha256:approved_graph",
    revision: 1,
    status: "approved",
    approvalHash: "sha256:approved_intent_sibling",
    approvedAt: new Date().toISOString(),
  };
}

function leafContext(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
  filePath: string,
): LocalContextBundle {
  const content = `SOURCE:${filePath}`;
  const byteLength = new TextEncoder().encode(content).byteLength;
  return {
    version: "0.2.0",
    projectId: workspace.project.projectId,
    assembledAt: "2026-07-18T00:00:00.000Z",
    scope: { nodeId: "feat_login", selectedFilePath: filePath },
    responseLanguage: "und",
    project: {
      displayName: workspace.project.displayName,
      framework: workspace.project.framework,
      description: { content: "Login project.", source: "derived", estimatedTokens: 4 },
      synopsis: "Login",
      synopsisSource: "derived_project_graph",
      graphAnalyzedAt: workspace.graph.analyzedAt,
      graphAnalysisStatus: workspace.graph.analysisStatus,
      synopsisOmittedNodeCount: 0,
    },
    neighborhood: {
      selected: { id: "feat_login", name: "Identity & Access", summary: "Login", status: "active" },
      parent: null,
      children: [],
      childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0, estimatedTokensIncluded: 0 },
      upstream: [],
      downstream: [],
      unresolvedNodeIds: [],
    },
    fileManifest: [{
      path: filePath,
      relationship: "selected",
      linkedRole: "primary",
      disposition: "exact",
      byteLength,
      sha256: `sha256:${filePath === PAGE ? "1" : "2"}${"a".repeat(63)}`,
      includedByteLength: byteLength,
      content,
    }],
    allowedReadPaths: [filePath],
    allowedWritePaths: [filePath],
    budget: {
      estimator: "unicode_chars_div_4_v1",
      descriptionEstimatedTokens: 4,
      selectedEstimatedTokens: 4,
      connectedTokenLimit: 8_000,
      connectedEstimatedTokensIncluded: 0,
      connectedFileLimit: 8,
    },
    bundleHash: `sha256:${filePath === PAGE ? "b" : "c"}${"d".repeat(63)}`,
  };
}

function nodeContext(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
): NodeContextBundle {
  const leafPage = leafContext(workspace, PAGE);
  const leafForm = leafContext(workspace, FORM);
  return {
    version: "0.2.0",
    projectId: workspace.project.projectId,
    assembledAt: "2026-07-18T00:00:00.000Z",
    scope: { kind: "node", nodeId: "feat_login" },
    responseLanguage: "und",
    project: leafPage.project,
    neighborhood: leafPage.neighborhood,
    fileManifest: [
      { ...leafPage.fileManifest[0]!, relationship: "connected", linkedRole: "primary" },
      { ...leafForm.fileManifest[0]!, relationship: "connected", linkedRole: "primary" },
    ],
    allowedReadPaths: [PAGE, FORM],
    allowedWritePaths: [],
    budget: leafPage.budget,
    bundleHash: `sha256:${"e".repeat(64)}`,
  };
}

function modelWorkspace() {
  const workspace = new ProjectOSWorkspaceStore().loadWorkspace(sampleWorkspaceRoot);
  workspace.settings = ProjectOSSettingsSchema.parse({
    ...workspace.settings,
    execution: {
      ...workspace.settings.execution,
      mode: "model",
      defaultAgentProfileId: "default-feature",
      defaultModelProfileId: "test-model",
      thinkingDepth: "off",
      changeExecutionPolicy: "review_first",
    },
    modelProfiles: [{
      id: "test-model",
      name: "Test Model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:test-model",
      isDefault: true,
    }],
    agentProfiles: workspace.settings.agentProfiles.map((profile) =>
      profile.id === "default-feature"
        ? { ...profile, modelProfileId: "test-model", enabledTools: [], stepSequence: [] }
        : profile,
    ),
  });
  return workspace;
}

function delegationPlanOutput() {
  return JSON.stringify({
    objective: "Update login heading and form control",
    tasks: [
      {
        path: PAGE,
        objective: "Set the confirmed login heading",
        acceptanceCriteria: ["Heading uses the confirmed wording"],
      },
      {
        path: FORM,
        objective: "Align the demo-entry control label",
        acceptanceCriteria: ["Demo-entry control label matches the heading framing"],
      },
    ],
    rationale: "Both owned files must stay coherent.",
  });
}

function editOutput(path: string) {
  return JSON.stringify({
    summary: `Update ${path}`,
    path,
    edits: [{ search: `SOURCE:${path}`, replace: `UPDATED:${path}` }],
  });
}

function locatePlanOutput(path: string) {
  return JSON.stringify({
    path,
    objective: `Change ${path}`,
    targetDescription: "The exact synthetic source marker",
    anchors: [`SOURCE:${path}`],
    constraints: ["Modify only the authorized file"],
    acceptanceCriteria: path === PAGE
      ? ["Heading uses the confirmed wording"]
      : ["Demo-entry control label matches the heading framing"],
    rationale: "The leaf owns its marker.",
  });
}

function proposalValidationOutput(path: string) {
  const criterion = path === PAGE
    ? "Heading uses the confirmed wording"
    : "Demo-entry control label matches the heading framing";
  return JSON.stringify({
    path,
    verdict: "valid",
    criteria: [{ criterion, status: "satisfied", explanation: "Marker updated." }],
    scopeAssessment: { status: "compliant", explanation: "Single authorized file." },
    summary: "Valid",
    rationale: "In scope.",
  });
}

function batchValidationOutput(
  children: Array<{ taskId: string; runId: string; path: string }>,
) {
  return JSON.stringify({
    verdict: "valid",
    tasks: children.map((child) => ({
      taskId: child.taskId,
      childRunId: child.runId,
      path: child.path,
      status: "consistent",
      criteria: [{
        criterion: child.path === PAGE
          ? "Heading uses the confirmed wording"
          : "Demo-entry control label matches the heading framing",
        status: "satisfied",
        explanation: "ok",
      }],
      summary: "ok",
    })),
    crossFileAssessment: { status: "consistent", summary: "ok" },
    summary: "ok",
    rationale: "ok",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requestMode(request: ModelGatewayRequest): string | undefined {
  return isRecord(request.input) && typeof request.input.mode === "string"
    ? request.input.mode
    : undefined;
}

function selectedPath(request: ModelGatewayRequest): string | undefined {
  const input = request.input;
  if (!isRecord(input)) return undefined;
  if (typeof input.selectedFilePath === "string") return input.selectedFilePath;
  const plan = input.fileEditPlan;
  if (isRecord(plan) && typeof plan.path === "string") return plan.path;
  const local = input.localContext;
  if (isRecord(local) && isRecord(local.scope) && typeof local.scope.selectedFilePath === "string") {
    return local.scope.selectedFilePath;
  }
  const scope = input.scope;
  if (isRecord(scope) && typeof scope.selectedFilePath === "string") return scope.selectedFilePath;
  return undefined;
}

function hasSharedClarify(request: ModelGatewayRequest): boolean {
  const input = request.input;
  if (!isRecord(input)) return false;
  const outputs = Array.isArray(input.stepOutputs) ? input.stepOutputs : [];
  if (outputs.some((item) => typeof item === "string" && /User clarification for the authorized edit/i.test(item))) {
    return true;
  }
  const ctx = input.approvedIntentContext;
  if (!isRecord(ctx) || !Array.isArray(ctx.answers)) return false;
  return ctx.answers.some((answer) =>
    isRecord(answer)
    && typeof answer.answer === "string"
    && /User clarification for the authorized edit/i.test(answer.answer));
}

type HarnessMode = "share" | "stop";
let harnessSeq = 0;

function createSiblingHarness(mode: HarnessMode) {
  const harnessId = ++harnessSeq;
  const root = mkdtempSync(join(tmpdir(), `orch-sibling-clarify-${mode}-`));
  temporaryRoots.push(root);
  const store = new DurableRunStateStore(join(root, ".projectos"));
  const workspace = modelWorkspace();
  const requests: ModelGatewayRequest[] = [];
  const startedChildRunIds: string[] = [];
  const childMeta: Array<{ taskId: string; runId: string; path: string }> = [];
  let orchestrator!: AgentOrchestrator;
  let childSeq = 0;
  const pageClarify = JSON.stringify({
    action: "clarify",
    question: "Which exact heading should the login page use?",
    options: [
      { id: "demo_signin", label: "Demo sign-in" },
      { id: "enter_demo", label: "Enter the demo workspace" },
    ],
  });

  const gateway = {
    async complete(_profile: unknown, request: ModelGatewayRequest) {
      requests.push(request);
      const modeName = requestMode(request);
      const path = selectedPath(request);
      if (
        modeName === "plan_node_delegation"
        || (!modeName && !path && /Every modify task must target one distinct existing candidate file/i.test(request.systemPrompt ?? ""))
      ) {
        return {
          requestId: "req_plan_node",
          provider: "test",
          model: "test-model",
          output: delegationPlanOutput(),
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      if (modeName === "validate_batch" || /Independently validate this complete delegated/i.test(request.systemPrompt ?? "")) {
        return {
          requestId: "req_batch",
          provider: "test",
          model: "test-model",
          output: batchValidationOutput(childMeta),
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      if (modeName === "locate_plan" && path) {
        return {
          requestId: `req_locate_${path}`,
          provider: "test",
          model: "test-model",
          output: locatePlanOutput(path),
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      if (modeName === "validate_proposal" && path) {
        return {
          requestId: `req_validate_${path}`,
          provider: "test",
          model: "test-model",
          output: proposalValidationOutput(path),
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      // change generation
      if (path === PAGE && mode === "share" && !hasSharedClarify(request)) {
        return {
          requestId: "req_clarify_page",
          provider: "test",
          model: "test-model",
          output: pageClarify,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      if (path === PAGE && mode === "stop") {
        return {
          requestId: "req_clarify_stop",
          provider: "test",
          model: "test-model",
          output: pageClarify,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      if (path === FORM && mode === "share" && !hasSharedClarify(request)) {
        // Product must supply shared notes; if absent, fail loudly.
        throw new ProjectOSError(
          "agent_orchestration_failed",
          "Second leaf generated without shared clarification notes",
        );
      }
      if (!path) {
        return {
          requestId: "req_empty",
          provider: "test",
          model: "test-model",
          output: "{}",
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      }
      return {
        requestId: `req_edit_${path}`,
        provider: "test",
        model: "test-model",
        output: editOutput(path),
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  } as unknown as ModelGateway;

  orchestrator = new AgentOrchestrator({
    gateway,
    settingsService: new SettingsService(new InMemorySecretStore()),
    eventPersistence: "memory",
    createDecisionStore: () => store,
    pipelineBudget: { maxWallClockMs: 30_000 },
    nodeDelegation: {
      async createChildRuns(_ws, parentRun, plan) {
        const children = plan.tasks.map((task) => {
          const runId = `run_sibling_child_${harnessId}_${++childSeq}`;
          childMeta.push({ taskId: task.taskId, runId, path: task.filePath });
          orchestrator.createRun(workspace, {
            ...refinement(),
            id: `ref_child_${harnessId}_${childSeq}`,
            understood: task.objective,
            affectedFiles: [task.filePath],
          }, "feature_change", {
            runId,
            localContext: leafContext(workspace, task.filePath),
            executionPolicy: "review_first",
            scope: { kind: "leaf-file", nodeId: "feat_login", filePath: task.filePath },
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role: "leaf_file_editor",
            approvedIntent: approvedIntent(workspace.project.projectId),
          });
          return { taskId: task.taskId, runId };
        });
        return { plan, children };
      },
    },
    validateGeneratedDiffScope(runId, diff) {
      const scope = orchestrator.getRun(runId)?.run.scope;
      if (
        scope?.kind !== "leaf-file"
        || diff.files.length !== 1
        || diff.files[0]?.path !== scope.filePath
      ) {
        throw new ProjectOSError("diff_scope_violation", "Leaf escaped scope");
      }
    },
  });

  // Wrap startRun to observe which child runs actually start.
  const originalStart = orchestrator.startRun.bind(orchestrator);
  orchestrator.startRun = async (ws, runId, tools) => {
    if (runId.startsWith(`run_sibling_child_${harnessId}_`)) startedChildRunIds.push(runId);
    return originalStart(ws, runId, tools);
  };

  const parentRunId = `run_sibling_parent_${mode}_${harnessId}`;
  const parent = orchestrator.createRun(workspace, refinement(), "feature_change", {
    runId: parentRunId,
    approvedIntent: approvedIntent(workspace.project.projectId),
    // NodeContextBundle must arrive via localContext (isNodeContextBundle).
    localContext: nodeContext(workspace),
    executionPolicy: "review_first",
    scope: { kind: "node-plan", nodeId: "feat_login" },
    role: "node_planner",
    rootRunId: parentRunId,
  });

  return {
    orchestrator,
    workspace,
    store,
    parent,
    parentRunId,
    requests,
    startedChildRunIds,
    childMeta,
  };
}

async function waitForPending(
  store: DurableRunStateStore,
  rootRunId: string,
  timeoutMs = 8_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pending = store.listDecisions(rootRunId).find((decision) => decision.status === "pending");
    if (pending) return pending;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return undefined;
}

describe("AgentOrchestrator sibling clarify share (node-plan)", () => {
  it("shares one mid-run answer to the second leaf without changing approvalHash/touches/scope", async () => {
    const harness = createSiblingHarness("share");
    const { orchestrator, workspace, store, parent, parentRunId, requests, startedChildRunIds } = harness;
    const intentBefore = structuredClone(parent.approvedIntent);
    const scopeBefore = structuredClone(parent.run.scope);

    const started = orchestrator.startRun(workspace, parentRunId, {
      getNodeContext: async () => {
        throw new Error("unused");
      },
      getFileContext: async () => {
        throw new Error("unused");
      },
    } as never);

    const pending = await waitForPending(store, parentRunId);
    expect(pending).toMatchObject({ kind: "clarification", rootRunId: parentRunId });
    const resolved = store.resolveDecision(pending!.id, pending!.revision, { optionId: "demo_signin" });
    expect(orchestrator.notifyDecisionAnswer(resolved)).toBe(true);
    await started;

    expect(parent.run.status).toBe("awaiting_review");
    expect(startedChildRunIds).toHaveLength(2);
    expect(startedChildRunIds[0]).toMatch(/^run_sibling_child_\d+_1$/);
    expect(startedChildRunIds[1]).toMatch(/^run_sibling_child_\d+_2$/);
    expect(parent.approvedIntent?.approvalHash).toBe(intentBefore?.approvalHash);
    expect(parent.approvedIntent?.touches).toEqual(intentBefore?.touches);
    expect(parent.run.scope).toEqual(scopeBefore);

    const formGenerations = requests.filter((request) =>
      request.requestKind === "change_generation"
      && selectedPath(request) === FORM);
    expect(formGenerations.length).toBeGreaterThanOrEqual(1);
    expect(formGenerations.every((request) => hasSharedClarify(request))).toBe(true);

    const clarifyDecisions = store.listDecisions(parentRunId).filter((d) => d.kind === "clarification");
    expect(clarifyDecisions).toHaveLength(1);
    expect(clarifyDecisions[0]?.status).toBe("resolved");
  }, 30_000);

  it("Stop/decline skips later siblings without starting them or staging their proposals", async () => {
    const harness = createSiblingHarness("stop");
    const { orchestrator, workspace, store, parent, parentRunId, startedChildRunIds, childMeta } = harness;

    const started = orchestrator.startRun(workspace, parentRunId, {
      getNodeContext: async () => {
        throw new Error("unused");
      },
      getFileContext: async () => {
        throw new Error("unused");
      },
    } as never);

    const pending = await waitForPending(store, parentRunId);
    expect(pending).toBeTruthy();
    const declined = store.resolveDecision(
      pending!.id,
      pending!.revision,
      { optionId: "stop" },
      "declined",
    );
    expect(orchestrator.notifyDecisionAnswer(declined)).toBe(true);
    await expect(started).rejects.toMatchObject({ code: "operation_cancelled" });
    expect(parent.run.status).toBe("cancelled");

    expect(startedChildRunIds).toHaveLength(1);
    expect(startedChildRunIds[0]).toMatch(/^run_sibling_child_\d+_1$/);
    expect(childMeta).toHaveLength(2);
    const firstId = childMeta[0]!.runId;
    const secondId = childMeta[1]!.runId;
    expect(orchestrator.getRun(firstId)?.run.status).toBe("cancelled");
    const second = orchestrator.getRun(secondId);
    expect(second?.diff).toBeUndefined();
    expect(second?.run.status).not.toBe("awaiting_review");
    expect(parent.events.some((event) =>
      event.type === "child_run_started" && event.payload &&
      (event.payload as { childRunId?: string }).childRunId === secondId)).toBe(false);
    expect(parent.events.some((event) =>
      event.type === "child_run_completed"
      && (event.payload as { childRunId?: string; failureCategory?: string }).childRunId === secondId
      && (event.payload as { failureCategory?: string }).failureCategory === "cancelled")).toBe(true);
  }, 30_000);

  it("does not leak shared clarification answers across different roots", async () => {
    const first = createSiblingHarness("share");
    const second = createSiblingHarness("share");
    // Answer only on first root.
    const started1 = first.orchestrator.startRun(first.workspace, first.parentRunId, {
      getNodeContext: async () => {
        throw new Error("unused");
      },
      getFileContext: async () => {
        throw new Error("unused");
      },
    } as never);
    const pending1 = await waitForPending(first.store, first.parentRunId);
    const resolved = first.store.resolveDecision(
      pending1!.id,
      pending1!.revision,
      { optionId: "demo_signin" },
    );
    expect(first.orchestrator.notifyDecisionAnswer(resolved)).toBe(true);
    await started1;

    // Second root must still ask (no shared notes from first orchestrator).
    const started2 = second.orchestrator.startRun(second.workspace, second.parentRunId, {
      getNodeContext: async () => {
        throw new Error("unused");
      },
      getFileContext: async () => {
        throw new Error("unused");
      },
    } as never);
    const pending2 = await waitForPending(second.store, second.parentRunId);
    expect(pending2).toBeTruthy();
    expect(pending2!.rootRunId).toBe(second.parentRunId);
    expect(pending2!.rootRunId).not.toBe(first.parentRunId);
    const declined = second.store.resolveDecision(
      pending2!.id,
      pending2!.revision,
      { optionId: "stop" },
      "declined",
    );
    expect(second.orchestrator.notifyDecisionAnswer(declined)).toBe(true);
    await expect(started2).rejects.toMatchObject({ code: "operation_cancelled" });
    expect(second.parent.run.status).toBe("cancelled");
  }, 45_000);
});

describe("AgentOrchestrator mid-run answers without inventing intent touches", () => {
  it("injects mid-run clarification answers without inventing touches or write authorization", async () => {
    const root = mkdtempSync(join(tmpdir(), "orch-no-intent-clarify-"));
    temporaryRoots.push(root);
    const store = new DurableRunStateStore(join(root, ".projectos"));
    const workspace = modelWorkspace();
    const requests: ModelGatewayRequest[] = [];
    let generationIndex = 0;
    const clarifyOutput = JSON.stringify({
      action: "clarify",
      question: "Which heading?",
      options: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
      ],
    });
    const editOutputJson = JSON.stringify({
      summary: "Apply heading",
      path: PAGE,
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "Alpha" }],
    });
    const gateway = {
      async complete(_profile: unknown, request: ModelGatewayRequest) {
        requests.push(request);
        const mode = requestMode(request);
        if (mode === "locate_plan") {
          return {
            requestId: "req_plan",
            provider: "test",
            model: "test-model",
            output: JSON.stringify({
              path: PAGE,
              objective: "Update heading",
              targetDescription: "selected marker",
              anchors: ["SELECTED_CONTEXT_MARKER"],
              constraints: ["Keep change inside the selected file"],
              acceptanceCriteria: ["Heading updated"],
              rationale: "Selected file owns heading",
            }),
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
          };
        }
        if (mode === "validate_proposal") {
          return {
            requestId: "req_validate",
            provider: "test",
            model: "test-model",
            output: JSON.stringify({
              path: PAGE,
              verdict: "valid",
              criteria: [{ criterion: "Heading updated", status: "satisfied", explanation: "ok" }],
              scopeAssessment: { status: "compliant", explanation: "ok" },
              summary: "ok",
              rationale: "ok",
            }),
            usage: { inputTokens: 1, outputTokens: 1 },
            latencyMs: 1,
          };
        }
        const outputs = [clarifyOutput, editOutputJson];
        const selected = outputs[Math.min(generationIndex++, outputs.length - 1)]!;
        return {
          requestId: `req_gen_${generationIndex}`,
          provider: "test",
          model: "test-model",
          output: selected,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    } as unknown as ModelGateway;

    const orchestrator = new AgentOrchestrator({
      gateway,
      settingsService: new SettingsService(new InMemorySecretStore()),
      eventPersistence: "memory",
      createDecisionStore: () => store,
      pipelineBudget: { maxWallClockMs: 20_000 },
      validateGeneratedDiffScope(runId, diff) {
        if (diff.files.length !== 1 || diff.files[0]?.path !== PAGE) {
          throw new ProjectOSError("diff_scope_violation", "bad scope");
        }
      },
    });

    const runId = "run_no_intent_clarify";
    const content = "SELECTED_CONTEXT_MARKER";
    const localContext: LocalContextBundle = {
      ...leafContext(workspace, PAGE),
      fileManifest: [{
        path: PAGE,
        relationship: "selected",
        linkedRole: "primary",
        disposition: "exact",
        byteLength: content.length,
        sha256: `sha256:${"9".repeat(64)}`,
        includedByteLength: content.length,
        content,
      }],
    };
    // Intentionally omit approvedIntent — mid-run answers must not invent touches/authorization.
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      runId,
      localContext,
      executionPolicy: "review_first",
    });

    const started = orchestrator.startRun(workspace, runId, {
      getNodeContext: async () => {
        throw new Error("unused");
      },
      getFileContext: async () => {
        throw new Error("unused");
      },
    } as never);
    const pending = await waitForPending(store, runId);
    expect(pending).toBeTruthy();
    const resolved = store.resolveDecision(pending!.id, pending!.revision, { optionId: "a" });
    expect(orchestrator.notifyDecisionAnswer(resolved)).toBe(true);
    await started;

    expect(state.approvedIntent).toBeUndefined();
    const resumed = requests.find((request) =>
      request.requestKind === "change_generation" && hasSharedClarify(request));
    expect(resumed).toBeTruthy();
    const ctx = (resumed!.input as { approvedIntentContext?: Record<string, unknown> })
      .approvedIntentContext;
    expect(ctx).toMatchObject({
      touches: [],
      answers: [expect.objectContaining({
        answer: expect.stringMatching(/User clarification for the authorized edit/),
      })],
    });
    expect(ctx).not.toHaveProperty("approvalHash");
    expect(state.localContext?.allowedWritePaths).toEqual([PAGE]);
  }, 20_000);
});
