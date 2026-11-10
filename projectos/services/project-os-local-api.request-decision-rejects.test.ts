import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutorRegistry } from "./harness/executor-registry.js";
import { FakeExecutorAdapter } from "./harness/fake-executor.js";
import { DurableRunStateStore } from "./harness/durable-run-state.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import type { RequestIntent } from "../contracts/request-intent.js";
import type { LocalContextBundle } from "../contracts/local-context.js";
import type { PromptRefinement } from "../contracts/prompt-refinement.js";
import type { AgentOrchestrator } from "./agent-orchestrator/index.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import type { RunDecision } from "../contracts/run-state.js";
import { copySampleTree } from "../test-support/copy-sample.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copySampleWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "local-api-decision-reject-"));
  roots.push(root);
  copySampleTree(sampleWorkspaceRoot, root);
  mkdirSync(join(root, ".projectos"), { recursive: true });
  return root;
}

function apiOrchestrator(api: ProjectOSLocalApi): AgentOrchestrator {
  return (api as unknown as { orchestrator: AgentOrchestrator }).orchestrator;
}

function apiWorkspace(api: ProjectOSLocalApi, projectId: string): LoadedProjectOSWorkspace {
  return (api as unknown as {
    requireLoadedWorkspace: (id: string) => LoadedProjectOSWorkspace;
  }).requireLoadedWorkspace(projectId);
}

function approvedIntent(projectId: string, intentId = "intent_api_decision"): RequestIntent {
  return {
    version: "0.1.0",
    id: intentId,
    projectId,
    rawRequest: "Change the login page",
    goal: "Change the login page",
    kind: "change",
    entryNodeId: null,
    touches: [{
      nodeId: "feat_login",
      reason: "Owns the login page",
      allow: { editExisting: true, addParts: false, deletePartIds: [] },
    }],
    structuralEffects: [],
    assumptions: [],
    outOfScope: [],
    acceptance: ["The login page is changed"],
    questions: [],
    executorSelection: { kind: "runtime", runtimeProfileId: "fake" },
    baseGraphHash: "sha256:approved_graph",
    revision: 1,
    status: "approved",
    approvalHash: "sha256:approved_intent",
    approvedAt: new Date().toISOString(),
  };
}

function refinement(): PromptRefinement {
  return {
    id: "ref_api_decision",
    understood: "Change the login page",
    ambiguities: [],
    suggestions: [],
    affectedNodeIds: ["feat_login"],
    affectedFiles: ["app/login/page.tsx"],
    confidence: 1,
    mode: "model",
  };
}

function localContext(
  projectId: string,
  displayName: string,
  framework: "unknown" | "nextjs-app" | "nextjs-pages" | "node",
): LocalContextBundle {
  return {
    version: "0.2.0",
    projectId,
    assembledAt: new Date().toISOString(),
    scope: { nodeId: "feat_login", selectedFilePath: "app/login/page.tsx" },
    responseLanguage: "und",
    project: {
      displayName,
      framework,
      description: { content: "login", source: "derived", estimatedTokens: 1 },
      synopsis: "login",
      synopsisSource: "derived_project_graph",
      graphAnalyzedAt: new Date().toISOString(),
      graphAnalysisStatus: "complete",
      synopsisOmittedNodeCount: 0,
    },
    neighborhood: {
      selected: {
        id: "feat_login",
        name: "Login",
        summary: "Login",
        status: "active",
      },
      parent: null,
      children: [],
      childrenCoverage: {
        totalCount: 0,
        includedCount: 0,
        omittedCount: 0,
        estimatedTokensIncluded: 0,
      },
      upstream: [],
      downstream: [],
      unresolvedNodeIds: [],
    },
    fileManifest: [{
      path: "app/login/page.tsx",
      relationship: "selected",
      linkedRole: "primary",
      disposition: "exact",
      byteLength: 23,
      sha256: `sha256:${"1".repeat(64)}`,
      includedByteLength: 23,
      content: "SELECTED_CONTEXT_MARKER",
    }],
    allowedReadPaths: ["app/login/page.tsx"],
    allowedWritePaths: ["app/login/page.tsx"],
    budget: {
      estimator: "unicode_chars_div_4_v1",
      descriptionEstimatedTokens: 1,
      selectedEstimatedTokens: 6,
      connectedTokenLimit: 8_000,
      connectedEstimatedTokensIncluded: 0,
      connectedFileLimit: 8,
    },
    bundleHash: `sha256:${"9".repeat(64)}`,
  };
}

async function startPendingDecision(input: {
  runId: string;
  parkAfterDecision?: boolean;
  pipelineBudget?: { maxWallClockMs: number };
}): Promise<{
  api: ProjectOSLocalApi;
  projectId: string;
  workspaceRoot: string;
  pending: RunDecision;
  started: Promise<unknown>;
  store: DurableRunStateStore;
  orchestrator: AgentOrchestrator;
  state: ReturnType<AgentOrchestrator["createRun"]>;
}> {
  const workspaceRoot = copySampleWorkspace();
  const executors = new ExecutorRegistry();
  executors.register(new FakeExecutorAdapter({
    decisionQuestion: "Confirm the login edit before proposing?",
    parkAfterDecision: input.parkAfterDecision ?? true,
  }));
  const api = new ProjectOSLocalApi({
    sampleWorkspaceRoot: workspaceRoot,
    executors,
    runEventPersistence: "memory",
    ...(input.pipelineBudget ? { pipelineBudget: input.pipelineBudget } : {}),
  });
  const project = await api.openWorkspace(workspaceRoot);
  const workspace = apiWorkspace(api, project.projectId);
  const store = new DurableRunStateStore(workspace.projectOSRoot);
  const orchestrator = apiOrchestrator(api);
  const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
    runId: input.runId,
    runtimeExecutor: { executorId: "fake", label: "Fake" },
    approvedIntent: approvedIntent(project.projectId),
    localContext: localContext(project.projectId, project.displayName, project.framework),
    executionPolicy: "review_first",
  });
  const started = orchestrator.startRun(workspace, input.runId);
  let pending = (await api.listRunDecisions(project.projectId, input.runId))
    .find((decision) => decision.status === "pending");
  for (let attempt = 0; attempt < 100 && !pending; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    pending = (await api.listRunDecisions(project.projectId, input.runId))
      .find((decision) => decision.status === "pending");
  }
  if (!pending) throw new Error("expected pending decision");
  return {
    api,
    projectId: project.projectId,
    workspaceRoot,
    pending,
    started,
    store,
    orchestrator,
    state,
  };
}

describe("ProjectOSLocalApi requestDecision rejection boundaries", () => {
  it("wall-clock timeout supersedes the wait and never stages a write", async () => {
    const { api, pending, started, store, state, orchestrator } = await startPendingDecision({
      runId: "run_decision_timeout",
      pipelineBudget: { maxWallClockMs: 40 },
    });
    // Decision-wait and executor wall-clock deadlines race; either phrasing is a budget timeout.
    // Keep the security asserts below — no staged write / superseded wait — regardless of which wins.
    await expect(started).rejects.toThrow(
      /timed out within the run budget|did not finish within the run's time budget|pipeline_budget|no files were written/i,
    );
    expect(state.diff).toBeUndefined();
    expect(store.loadDecision(pending.id)?.status).toBe("superseded");
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
    expect(store.loadCheckpoint(`checkpoint_decision_wait_${pending.rootRunId}`)?.pendingDecisionIds)
      .toEqual([]);
    await expect(api.applyDiff(pending.runId)).rejects.toThrow();
  });

  it("stale revision refuse does not wake a write and leaves the pending wait", async () => {
    const { api, projectId, pending, started, orchestrator } = await startPendingDecision({
      runId: "run_decision_stale",
    });
    await expect(api.resolveRunDecision(
      projectId,
      pending.id,
      pending.revision + 5,
      { optionId: "continue" },
    )).rejects.toMatchObject({ code: "agent_orchestration_failed" });
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(true);
    const answered = await api.resolveRunDecision(
      projectId,
      pending.id,
      pending.revision,
      { optionId: "continue" },
    );
    expect(answered.status).toBe("resolved");
    await started;
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
  });

  it("cross-workspace resolve refuses and does not wake the foreign waiter", async () => {
    const first = await startPendingDecision({ runId: "run_decision_ws_a" });
    const otherRoot = copySampleWorkspace();
    const otherApi = new ProjectOSLocalApi({
      sampleWorkspaceRoot: otherRoot,
      runEventPersistence: "memory",
    });
    const other = await otherApi.openWorkspace(otherRoot);
    await expect(otherApi.resolveRunDecision(
      other.projectId,
      first.pending.id,
      first.pending.revision,
      { optionId: "continue" },
    )).rejects.toMatchObject({ code: "decision_not_found" });
    expect(first.orchestrator.hasActiveDecisionWait(first.pending.id)).toBe(true);
    const answered = await first.api.resolveRunDecision(
      first.projectId,
      first.pending.id,
      first.pending.revision,
      { optionId: "continue" },
    );
    expect(answered.status).toBe("resolved");
    await first.started;
  });

  it("scopeBindingHash mismatch rejects the waiter without staging a write", async () => {
    const { api, projectId, pending, started, store, state, orchestrator } = await startPendingDecision({
      runId: "run_decision_scope",
    });
    const current = store.loadDecision(pending.id)!;
    store.saveDecision({
      ...current,
      scopeBindingHash: "b".repeat(64),
    });
    const answered = await api.resolveRunDecision(
      projectId,
      pending.id,
      pending.revision,
      { optionId: "continue" },
    );
    expect(answered.status).toBe("resolved");
    await expect(started).rejects.toThrow(/scope binding/i);
    expect(state.diff).toBeUndefined();
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
  });

  it("authorizedIntentId mismatch rejects the waiter without staging a write", async () => {
    const { api, projectId, pending, started, store, state, orchestrator } = await startPendingDecision({
      runId: "run_decision_intent",
    });
    const current = store.loadDecision(pending.id)!;
    store.saveDecision({
      ...current,
      authorizedIntentId: "intent_tampered_other",
    });
    const answered = await api.resolveRunDecision(
      projectId,
      pending.id,
      pending.revision,
      { optionId: "continue" },
    );
    expect(answered.status).toBe("resolved");
    await expect(started).rejects.toThrow(/authorization identity/i);
    expect(state.diff).toBeUndefined();
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
  });

  it("cancel supersedes the wait and later apply/continue refuse write", async () => {
    const { api, pending, started, store, state, orchestrator } = await startPendingDecision({
      runId: "run_decision_cancel",
      parkAfterDecision: false,
    });
    await api.cancelAgentRun(pending.runId);
    await started;
    expect(store.loadDecision(pending.id)?.status).toBe("superseded");
    expect(state.diff).toBeUndefined();
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
    await expect(api.applyDiff(pending.runId)).rejects.toThrow();
    await expect(api.continueAgentRun(pending.runId)).rejects.toThrow();
  });

  it("notifyDecisionAnswer for a foreign root refuses to invent a waiter resume", async () => {
    const { pending, store, orchestrator, started, api, projectId, state } = await startPendingDecision({
      runId: "run_decision_root",
    });
    const resolved = store.resolveDecision(pending.id, pending.revision, { optionId: "continue" });
    const foreign: RunDecision = {
      ...resolved,
      rootRunId: "run_foreign_root",
    };
    expect(orchestrator.notifyDecisionAnswer(foreign)).toBe(true);
    await expect(started).rejects.toThrow(/binding does not match/i);
    expect(state.diff).toBeUndefined();
    expect(orchestrator.hasActiveDecisionWait(pending.id)).toBe(false);
    const listed = await api.listRunDecisions(projectId, pending.runId);
    expect(listed.some((decision) => decision.id === pending.id && decision.status === "resolved")).toBe(true);
  });
});
