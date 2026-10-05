import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  GlobalContextBundle,
  LocalContextBundle,
  NodeContextBundle,
} from "../contracts/local-context.js";
import type { ModelGatewayRequest } from "../contracts/model-gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/index.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ProjectOSLocalApi grounded ask", () => {
  it("answers at global scope from zero-write project planning context", async () => {
    const gateway = new AskGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: { kind: "global" },
      question: "请概括这个项目",
      language: { mode: "auto" },
    });

    expect(answer.scope).toEqual({ kind: "global" });
    expect(answer.contextSummary).toMatchObject({
      files: [],
      synopsisPresent: true,
      bundleHash: answer.contextBundleHash,
    });
    const request = gateway.requests.find(
      (candidate) => candidate.requestKind === "question_answer",
    )!;
    const bundle = (request.input as { localContext: GlobalContextBundle }).localContext;
    expect(bundle).toMatchObject({
      scope: { kind: "global" },
      projectId: project.projectId,
      allowedReadPaths: [],
      allowedWritePaths: [],
      bundleHash: bundle.contextHash,
    });
    expect(bundle.conciseDescription.length).toBeGreaterThan(0);
    expect(bundle.topLevelNodes.length).toBeGreaterThan(0);
    expect(request.systemPrompt).toContain("whole project");
    expect(request.systemPrompt).toContain("No file write authority exists");
    expect(internals(api).orchestrator.runs.size).toBe(0);
    expect(internals(api).boundRunAuthorizations.size).toBe(0);
  });

  it("answers at node scope without file-owner resolution or write authorization", async () => {
    const gateway = new AskGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: { kind: "node", nodeId: "feat_login" },
      question: "请解释这个功能节点",
      language: { mode: "auto" },
    });

    expect(answer.scope).toEqual({ kind: "node", nodeId: "feat_login" });
    const request = gateway.requests.find(
      (candidate) => candidate.requestKind === "question_answer",
    )!;
    const bundle = (request.input as { localContext: NodeContextBundle }).localContext;
    expect(bundle.scope).toEqual({ kind: "node", nodeId: "feat_login" });
    expect(bundle.neighborhood.selected).toMatchObject({
      id: "feat_login",
      summary: expect.any(String),
    });
    expect(bundle.fileManifest.length).toBeGreaterThan(0);
    expect(bundle.fileManifest.every((file) => file.relationship === "connected"))
      .toBe(true);
    expect(bundle.allowedWritePaths).toEqual([]);
    expect(bundle.project.description.content.length).toBeGreaterThan(0);
    expect(request.systemPrompt).toContain("untrusted <project_metadata> data boundary");
    expect(request.systemPrompt).toContain("No file write authority exists");
    expect(internals(api).orchestrator.runs.size).toBe(0);
    expect(internals(api).boundRunAuthorizations.size).toBe(0);
  });

  it("returns a grounded answer without creating execution or write state", async () => {
    const workspaceRoot = copySampleWorkspace();
    const gateway = new AskGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);
    const currentWorkBefore = readFileSync(
      join(workspaceRoot, ".projectos", "current-work.json"),
      "utf8",
    );

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: {
        kind: "file",
        nodeId: "feat_login",
        selectedFilePath: "app/login/page.tsx",
      },
      question: "请解释这个登录页面如何工作",
      language: { mode: "auto" },
    });

    expect(answer).toMatchObject({
      projectId: project.projectId,
      scope: {
        kind: "file",
        nodeId: "feat_login",
        selectedFilePath: "app/login/page.tsx",
      },
      answer: "这个登录页面负责展示并提交用户认证信息。",
      backend: "model",
      modelProfileId: "ask-model",
      contextBundleHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      responseLanguage: {
        tag: "zh",
        source: "detected",
        validation: "passed",
      },
    });
    const askRequest = gateway.requests.find(
      (request) => request.requestKind === "question_answer",
    )!;
    expect(askRequest.input).toMatchObject({
      mode: "ask",
      writeCapability: false,
      question: "请解释这个登录页面如何工作",
      localContext: {
        scope: {
          nodeId: "feat_login",
          selectedFilePath: "app/login/page.tsx",
        },
      },
    });
    const bundle = (askRequest.input as { localContext: LocalContextBundle }).localContext;
    expect(bundle.fileManifest.find((file) => file.relationship === "selected"))
      .toMatchObject({ disposition: "exact", content: expect.any(String) });
    expect(bundle.fileManifest.some(
      (file) => file.relationship === "connected" && file.content,
    )).toBe(true);
    expect(bundle.project.description).toMatchObject({
      content: expect.any(String),
      source: "derived",
      estimatedTokens: expect.any(Number),
    });
    expect(answer.contextSummary).toEqual({
      files: bundle.fileManifest.map((file) => ({
        path: file.path,
        disposition: file.disposition,
        ...(file.byteLength === undefined ? {} : { byteLength: file.byteLength }),
        ...(file.includedByteLength === undefined
          ? {}
          : { includedByteLength: file.includedByteLength }),
        ...(file.omissionReason === undefined
          ? {}
          : { omissionReason: file.omissionReason }),
      })),
      synopsisPresent: true,
      childrenCoverage: {
        totalCount: bundle.neighborhood.childrenCoverage.totalCount,
        includedCount: bundle.neighborhood.childrenCoverage.includedCount,
        omittedCount: bundle.neighborhood.childrenCoverage.omittedCount,
      },
      bundleHash: bundle.bundleHash,
    });
    expect(answer.contextSummary.files.every((file) => !("content" in file))).toBe(true);
    const selectedContent = bundle.fileManifest.find(
      (file) => file.relationship === "selected",
    )?.content;
    expect(selectedContent).toBeTruthy();
    expect(JSON.stringify(answer)).not.toContain(selectedContent);

    const state = internals(api);
    expect(state.orchestrator.runs.size).toBe(0);
    expect(state.boundRunAuthorizations.size).toBe(0);
    expect(state.pendingOrchestratorStarts.size).toBe(0);
    expect(state.externalRunsByRunId.size).toBe(0);
    expect(state.registeredRunsByRunId.size).toBe(0);
    expect(readFileSync(join(workspaceRoot, ".projectos", "current-work.json"), "utf8"))
      .toBe(currentWorkBefore);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects ask when no model profile is configured", async () => {
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new AskGateway(),
    });
    const project = await api.openSampleWorkspace();

    await expect(api.askAgent({
      projectId: project.projectId,
      scope: {
        kind: "file",
        nodeId: "feat_login",
        selectedFilePath: "app/login/page.tsx",
      },
      question: "What does this file do?",
      language: { mode: "auto" },
    })).rejects.toMatchObject({ code: "agent_answer_unavailable" });
  });

  it("passes a final language mismatch through as a usable answer", async () => {
    const gateway = new AskGateway("The retried answer remains in English.");
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: { kind: "node", nodeId: "feat_login" },
      question: "请回答这个问题",
      language: { mode: "auto" },
    });

    expect(answer.answer).toBe("The retried answer remains in English.");
    expect(answer.responseLanguage).toEqual({
      tag: "zh",
      source: "detected",
      validation: "mismatch_after_retry",
    });
    expect(gateway.requests.filter(
      (request) => request.requestKind === "question_answer",
    )).toHaveLength(2);
  });

  it("returns only redacted provider reasoning and metadata-only context", async () => {
    const answerSecret = `sk-proj-${"a".repeat(32)}`;
    const gateway = new AskGateway(
      `这是安全答案 ${answerSecret}。`,
      "Bearer private-token 分析了 /Users/rui/private.ts",
    );
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);

    const answer = await api.askAgent({
      projectId: project.projectId,
      scope: { kind: "node", nodeId: "feat_login" },
      question: "请解释这个功能节点",
      language: { mode: "auto" },
    });
    const serialized = JSON.stringify(answer);

    expect(answer.answer).toContain("[REDACTED]");
    expect(answer.reasoning).toEqual({
      content: "[REDACTED] 分析了 [PATH]",
      source: "provider_supplied",
      truncated: false,
    });
    expect(serialized).not.toContain(answerSecret);
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("/Users/rui/private.ts");
    expect(answer.contextSummary.files.every((file) => !("content" in file))).toBe(true);
  });

  it("uses the same scoped assembly path for ask and live change", async () => {
    const gateway = new AskGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModel(api, project.projectId);
    await api.askAgent({
      projectId: project.projectId,
      scope: {
        kind: "file",
        nodeId: "feat_login",
        selectedFilePath: "app/login/page.tsx",
      },
      question: "请解释这个登录页面",
      language: { mode: "auto" },
    });
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "请修改这个登录页面",
    });
    const state = internals(api);
    const stored = state.refinementsById.get(refinement.id)!;
    const workspace = state.workspacesByProjectId.get(project.projectId)!;
    const changeBundle = state.prepareLiveRunContext(workspace, stored).bundle;
    const askBundle = (gateway.requests.find(
      (request) => request.requestKind === "question_answer",
    )!.input as { localContext: LocalContextBundle }).localContext;

    expect(stored.responseLanguage).toBe("zh");
    expect(gateway.requests.find(
      (request) => request.requestKind === "prompt_refinement",
    )?.systemPrompt).toContain("Respond in zh");
    expect(comparableBundle(changeBundle)).toEqual(comparableBundle(askBundle));
  });
});

class AskGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(
    private readonly answerOutput = "这个登录页面负责展示并提交用户认证信息。",
    private readonly answerReasoning?: string,
  ) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(_profile: ModelProfile, request: ModelGatewayRequest) {
    this.requests.push(request);
    const output = request.requestKind === "prompt_refinement"
      ? JSON.stringify({
          understood: "修改登录页面",
          ambiguities: [],
          suggestions: [],
          affectedNodeIds: ["feat_login"],
          affectedFiles: ["app/login/page.tsx"],
          confidence: 1,
        })
      : this.answerOutput;
    return {
      requestId: `request_${this.requests.length}`,
      provider: "test",
      model: "test-model",
      output,
      ...(request.requestKind === "question_answer" && this.answerReasoning
        ? { reasoning: this.answerReasoning }
        : {}),
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

type StoredRefinementForTest = {
  responseLanguage: string;
  requestedScope: { nodeId?: string; selectedFilePath?: string };
};

function internals(api: ProjectOSLocalApi) {
  return api as unknown as {
    orchestrator: { runs: Map<string, unknown> };
    boundRunAuthorizations: Map<string, unknown>;
    pendingOrchestratorStarts: Map<string, unknown>;
    externalRunsByRunId: Map<string, unknown>;
    registeredRunsByRunId: Map<string, unknown>;
    refinementsById: Map<string, StoredRefinementForTest>;
    workspacesByProjectId: Map<string, LoadedProjectOSWorkspace>;
    prepareLiveRunContext(
      workspace: LoadedProjectOSWorkspace,
      stored: StoredRefinementForTest,
    ): { bundle: LocalContextBundle };
  };
}

function comparableBundle(bundle: LocalContextBundle) {
  const { assembledAt: _assembledAt, bundleHash: _bundleHash, ...comparable } = bundle;
  return comparable;
}

async function enableModel(api: ProjectOSLocalApi, projectId: string): Promise<void> {
  await api.updateSettings(projectId, {
    presentationMode: false,
    execution: {
      mode: "model",
      defaultModelProfileId: "ask-model",
      defaultAgentProfileId: "default-feature",
      thinkingDepth: "off",
      changeExecutionPolicy: "review_first",
    },
    modelProfiles: [{
      id: "ask-model",
      name: "Ask Model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:ask-model",
      isDefault: true,
    }],
  });
}

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-ask-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), {
    recursive: true,
    force: true,
  });
  return workspaceRoot;
}
