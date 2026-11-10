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
import { copySampleTree } from "../test-support/copy-sample.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copySampleWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "local-api-request-decision-"));
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

describe("ProjectOSLocalApi requestDecision product path", () => {
  it("creates a wait through the orchestrator host and resumes via resolveRunDecision", async () => {
    const workspaceRoot = copySampleWorkspace();
    const runId = "run_api_decision_resume";
    const executors = new ExecutorRegistry();
    executors.register(new FakeExecutorAdapter({
      decisionQuestion: "Confirm the login edit before proposing?",
      // Park after the answered decision so this proves API wake/resume without
      // needing a bound write authorization for a follow-on proposal.
      parkAfterDecision: true,
    }));
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      executors,
      runEventPersistence: "memory",
    });
    const project = await api.openWorkspace(workspaceRoot);
    const workspace = apiWorkspace(api, project.projectId);
    const store = new DurableRunStateStore(workspace.projectOSRoot);
    const orchestrator = apiOrchestrator(api);

    const intent: RequestIntent = {
      version: "0.1.0",
      id: "intent_api_decision",
      projectId: project.projectId,
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
    const refinement: PromptRefinement = {
      id: "ref_api_decision",
      understood: "Change the login page",
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: ["feat_login"],
      affectedFiles: ["app/login/page.tsx"],
      confidence: 1,
      mode: "model",
    };
    const localContext: LocalContextBundle = {
      version: "0.2.0",
      projectId: project.projectId,
      assembledAt: new Date().toISOString(),
      scope: { nodeId: "feat_login", selectedFilePath: "app/login/page.tsx" },
      responseLanguage: "und",
      project: {
        displayName: project.displayName,
        framework: project.framework,
        description: { content: "login", source: "derived", estimatedTokens: 1 },
        synopsis: "login",
        synopsisSource: "derived_project_graph",
        graphAnalyzedAt: workspace.graph.analyzedAt,
        graphAnalysisStatus: workspace.graph.analysisStatus,
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

    const state = orchestrator.createRun(workspace, refinement, "feature_change", {
      runId,
      runtimeExecutor: { executorId: "fake", label: "Fake" },
      approvedIntent: intent,
      localContext,
      executionPolicy: "review_first",
    });

    const started = orchestrator.startRun(workspace, runId);
    let pending = (await api.listRunDecisions(project.projectId, runId))
      .find((decision) => decision.status === "pending");
    for (let attempt = 0; attempt < 100 && !pending; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      pending = (await api.listRunDecisions(project.projectId, runId))
        .find((decision) => decision.status === "pending");
    }
    expect(pending).toBeTruthy();
    expect(orchestrator.hasActiveDecisionWait(pending!.id)).toBe(true);

    const answered = await api.resolveRunDecision(
      project.projectId,
      pending!.id,
      pending!.revision,
      { optionId: "continue" },
    );
    expect(answered.status).toBe("resolved");
    await started;

    expect(state.diff).toBeUndefined();
    expect(state.run.status).toBe("awaiting_review");
    expect(store.loadDecision(pending!.id)?.status).toBe("resolved");
    expect(store.loadCheckpoint(`checkpoint_decision_wait_${runId}`)?.pendingDecisionIds)
      .toEqual([]);
    expect(state.events.some((event) => event.type === "decision_summary")).toBe(true);
  });

  it("refuses a second answer and keeps restart resolves from auto-writing", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      runEventPersistence: "memory",
    });
    const project = await api.openWorkspace(workspaceRoot);
    api.recordRunDecision({
      version: "0.1.0",
      id: "decision_api_once",
      projectId: project.projectId,
      rootRunId: "run_once",
      runId: "run_once",
      kind: "clarification",
      question: "Only once?",
      options: [{ id: "continue", label: "Continue" }, { id: "stop", label: "Stop" }],
      status: "pending",
      revision: 1,
      createdAt: new Date().toISOString(),
    });

    await expect(api.resolveRunDecision(
      project.projectId,
      "decision_api_once",
      1,
      { optionId: "continue" },
    )).resolves.toMatchObject({ status: "resolved", revision: 2 });

    await expect(api.resolveRunDecision(
      project.projectId,
      "decision_api_once",
      2,
      { optionId: "continue" },
    )).rejects.toThrow(/cannot be answered again|no longer pending/i);

    const restarted = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      runEventPersistence: "memory",
    });
    await restarted.openWorkspace(workspaceRoot);
    const listed = await restarted.listRunDecisions(project.projectId, "run_once");
    expect(listed[0]?.status).toBe("resolved");
    expect(apiOrchestrator(restarted).hasActiveDecisionWait("decision_api_once")).toBe(false);
  });
});
