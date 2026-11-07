import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMockSampleWorkspace,
  MOCK_SAMPLE_WORKSPACE_ROOT,
  MockProjectOSApiClient,
} from "../client/mock-project-os-api-client.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { LocalContextAssemblerDependency } from "../services/project-os-local-api.js";
import { ModelGateway } from "../services/model-gateway/gateway.js";
import { discoveryFinalIntentOutput } from "../services/test-support/approved-intent-harness.js";

const googleLoginPrompt =
  "Add Google login and redirect users to profile after successful sign in.";
const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("MockProjectOSApiClient agent run streaming", () => {
  it("delivers step_started to stream callbacks before streamAgentRun returns", async () => {
    const mock = new MockProjectOSApiClient();
    const project = await mock.openSampleWorkspace();
    const refinement = await mock.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: googleLoginPrompt,
    });
    const run = await mock.confirmExecution(refinement.id);

    const received: string[] = [];
    mock.streamAgentRun(run.runId, (event) => {
      received.push(
        event.type + (event.step?.kind ? `:${event.step.kind}` : ""),
      );
    });

    expect(received.some((entry) => entry.startsWith("step_started:"))).toBe(true);
  });

  it("exposes orchestrator events through getAgentRunEvents", async () => {
    const { mock, projectId } = await openApprovedIntentStreamingClient();
    const run = await startApprovedStreamingRun(mock, projectId);

    const streamed: string[] = [];
    mock.streamAgentRun(run.runId, (event) => {
      streamed.push(event.type);
    });

    const snapshot = await mock.getAgentRunEvents(run.runId);
    expect(snapshot.some((event) => event.type === "run_started")).toBe(true);
    expect(snapshot.some((event) => event.type === "step_started")).toBe(true);
    expect(streamed).toContain("run_started");
    expect(streamed).toContain("step_started");
  });

  it("starts orchestrator work when clients poll without subscribing", async () => {
    const { mock, projectId } = await openApprovedIntentStreamingClient();
    const run = await startApprovedStreamingRun(mock, projectId);
    const events = await mock.getAgentRunEvents(run.runId);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["run_started", "step_started"]),
    );
  });

  it("replays orchestrator events without duplicate event ids", async () => {
    const { mock, projectId } = await openApprovedIntentStreamingClient();
    const run = await startApprovedStreamingRun(mock, projectId);
    const eventIds: string[] = [];

    mock.streamAgentRun(run.runId, (event) => eventIds.push(event.eventId));

    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("persists orchestrator events for filesystem-backed workspaces", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "projectos-run-events-"));
    temporaryRoots.push(workspaceRoot);
    const workspace = createMockSampleWorkspace();
    workspace.workspaceRoot = workspaceRoot;
    workspace.projectOSRoot = join(workspaceRoot, ".projectos");
    const { mock, projectId } = await openApprovedIntentStreamingClient({
      workspace,
      runEventPersistence: "filesystem",
    });
    const run = await startApprovedStreamingRun(mock, projectId);

    const streamed: string[] = [];
    const disposable = mock.streamAgentRun(run.runId, (event) => {
      streamed.push(event.type);
    });
    disposable.dispose();

    const runDirectory = join(workspaceRoot, ".projectos", "agent-runs");
    expect(existsSync(runDirectory)).toBe(true);
    const runFile = readdirSync(runDirectory).find((name) =>
      name.startsWith(run.runId),
    );
    expect(runFile).toBeDefined();
    const persistedEvents = readFileSync(join(runDirectory, runFile!), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    expect(persistedEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["run_started", "step_started"]),
    );
    expect(streamed).toEqual(expect.arrayContaining(["run_started", "step_started"]));
  });

  it("keeps mock:// orchestrator events in memory without writing run logs", async () => {
    const { mock, projectId } = await openApprovedIntentStreamingClient();
    const run = await startApprovedStreamingRun(mock, projectId);

    const streamed: string[] = [];
    const disposable = mock.streamAgentRun(run.runId, (event) => {
      streamed.push(event.type);
    });
    disposable.dispose();

    expect(streamed).toEqual(expect.arrayContaining(["run_started", "step_started"]));
    expect((await mock.getAgentRunEvents(run.runId)).map((event) => event.type)).toEqual(
      expect.arrayContaining(["run_started", "step_started"]),
    );
    expect(
      existsSync(
        join(
          MOCK_SAMPLE_WORKSPACE_ROOT,
          ".projectos",
          "agent-runs",
          `${run.runId}.jsonl`,
        ),
      ),
    ).toBe(false);
  });
});

const mockLocalContextAssembler: LocalContextAssemblerDependency = {
  assemble(input) {
    const node = input.workspace.graph.nodes.find(
      (candidate) => candidate.id === input.nodeId,
    )!;
    return {
      version: "0.2.0",
      projectId: input.workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        nodeId: input.nodeId,
        selectedFilePath: input.selectedFilePath,
      },
      responseLanguage: input.responseLanguage,
      project: {
        displayName: input.workspace.project.displayName,
        framework: input.workspace.project.framework,
        description: {
          content: "Browser-safe mock context.",
          source: "derived",
          estimatedTokens: 7,
        },
        synopsis: "Browser-safe mock local context.",
        synopsisSource: "derived_project_graph",
        graphAnalyzedAt: input.workspace.graph.analyzedAt,
        graphAnalysisStatus: input.workspace.graph.analysisStatus,
        synopsisOmittedNodeCount: 0,
      },
      neighborhood: {
        selected: {
          id: node.id,
          name: node.nameEn ?? node.name,
          summary: node.summary,
          status: node.status,
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
        path: input.selectedFilePath,
        relationship: "selected",
        linkedRole: "primary",
        disposition: "exact",
        byteLength: 4,
        sha256: `sha256:${"0".repeat(64)}`,
        includedByteLength: 4,
        content: "mock",
      }],
      allowedReadPaths: [input.selectedFilePath],
      allowedWritePaths: [input.selectedFilePath],
      budget: {
        estimator: "unicode_chars_div_4_v1",
        descriptionEstimatedTokens: 7,
        selectedEstimatedTokens: 1,
        connectedTokenLimit: 8_000,
        connectedEstimatedTokensIncluded: 0,
        connectedFileLimit: 8,
      },
      bundleHash: `sha256:${"1".repeat(64)}`,
    };
  },
  assembleNode() {
    throw new Error("Node context is not used by these streaming tests");
  },
  resolveAllowedWriteTarget(workspaceRoot, relativePath) {
    return {
      relativePath,
      canonicalPath: `${workspaceRoot}/${relativePath}`,
      device: 1,
      inode: 1,
    };
  },
};

async function openApprovedIntentStreamingClient(options?: {
  workspace?: ReturnType<typeof createMockSampleWorkspace>;
  runEventPersistence?: "memory" | "filesystem";
}): Promise<{ mock: MockProjectOSApiClient; projectId: string }> {
  const gateway = new ModelGateway({ secretStore: new InMemorySecretStore() });
  gateway.complete = async (profile, request) => {
    const output = request.requestKind === "request_intent"
      ? discoveryFinalIntentOutput({
        goal: googleLoginPrompt,
        nodeId: "feat_login",
        files: ["app/login/page.tsx"],
      })
      : JSON.stringify({
        summary: "Streaming fixture edit",
        path: "app/login/page.tsx",
        edits: [{ search: "Demo access", replace: "Welcome Back" }],
      });
    return {
      requestId: "streaming-intent",
      projectId: "sample",
      provider: profile.provider,
      model: profile.model,
      latencyMs: 1,
      output,
      usage: { inputTokens: 4, outputTokens: 4 },
    };
  };
  const mock = new MockProjectOSApiClient({
    ...(options?.workspace ? { workspace: options.workspace } : {}),
    ...(options?.runEventPersistence ? { runEventPersistence: options.runEventPersistence } : {}),
    localContextAssembler: mockLocalContextAssembler,
    modelGateway: gateway,
  });
  const project = await mock.openSampleWorkspace();
  await enableModelExecution(mock, project.projectId);
  return { mock, projectId: project.projectId };
}

async function startApprovedStreamingRun(
  mock: MockProjectOSApiClient,
  projectId: string,
) {
  const draft = await mock.extractRequestIntent({
    projectId,
    nodeId: "feat_login",
    filePath: "app/login/page.tsx",
    rawRequest: googleLoginPrompt,
    executorSelection: { kind: "model", modelProfileId: "fixture-model" },
  });
  await mock.approveRequestIntent(projectId, draft.id, draft.revision);
  // Real orchestration (no defer): streaming coverage needs run_started/step_started.
  const refinement = await mock.prepareIntentExecution(projectId, draft.id);
  return mock.confirmExecution(refinement.id);
}

async function enableModelExecution(
  mock: MockProjectOSApiClient,
  projectId: string,
): Promise<void> {
  await mock.updateSettings(projectId, {
    presentationMode: false,
    execution: {
      mode: "model",
      defaultModelProfileId: "fixture-model",
      defaultAgentProfileId: "default-feature",
      thinkingDepth: "off",
      changeExecutionPolicy: "review_first",
    },
    modelProfiles: [
      {
        id: "fixture-model",
        name: "Fixture Model",
        provider: "custom",
        apiFormat: "openai_chat",
        displayName: "Fixture Model",
        model: "fixture-model",
        baseUrl: "https://example.invalid",
        apiKeyRef: "model_profile:fixture-model",
        isDefault: true,
      },
    ],
  });
}
