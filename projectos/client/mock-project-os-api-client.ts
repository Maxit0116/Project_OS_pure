import {
  CurrentWorkStateSchema,
  type CurrentWorkState,
} from "../contracts/context.js";
import { ProjectGraphSchema } from "../contracts/graph.js";
import {
  HarnessRecordSchema,
  type HarnessRecord,
} from "../contracts/harness.js";
import { ProjectOSProjectSchema } from "../contracts/project.js";
import {
  ProjectDescriptionSchema,
  type ProjectDescription,
} from "../contracts/project-description.js";
import { ProjectOSSettingsSchema } from "../contracts/settings.js";
import { SemanticTreeSchema } from "../contracts/semantic-tree.js";
import { MapContentDocumentSchema } from "../contracts/map-content.js";
import type { DemoScenario } from "../validation/index.js";
import {
  DemoResetSchema,
  DemoScenarioSchema,
} from "../validation/index.js";
import {
  type LoadedProjectOSWorkspace,
  ProjectOSWorkspaceStore,
} from "../persistence/index.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "../contracts/agent-conversation.js";
import type { RestoreApplyResult } from "../contracts/diff.js";
import type { VerificationRunResult } from "../contracts/exec-command.js";
import type { ModelGateway } from "../services/model-gateway/index.js";
import {
  type AgentRunEventPersistence,
  ProjectOSLocalApi,
} from "../services/index.js";
import type { LocalContextAssemblerDependency } from "../services/project-os-local-api.js";
import { cloneJson } from "../utils/json.js";
import { getSampleFileContent } from "./fixtures/sample-file-contents.js";
import authBugfixScenarioFixture from "./sample-projectos-fixtures/demo-scenarios/auth-bugfix.json" with { type: "json" };
import googleLoginScenarioFixture from "./sample-projectos-fixtures/demo-scenarios/google-login.json" with { type: "json" };
import currentWorkFixture from "./sample-projectos-fixtures/current-work.json" with { type: "json" };
import demoResetFixture from "./sample-projectos-fixtures/demo-reset.json" with { type: "json" };
import graphFixture from "./sample-projectos-fixtures/graph.json" with { type: "json" };
import authHarnessFixture from "./sample-projectos-fixtures/harness/err_auth_provider_callback.json" with { type: "json" };
import projectFixture from "./sample-projectos-fixtures/project.json" with { type: "json" };
import settingsFixture from "./sample-projectos-fixtures/settings.json" with { type: "json" };
import semanticTreeFixture from "./sample-projectos-fixtures/semantic-tree.json" with { type: "json" };
import mapContentFixture from "./sample-projectos-fixtures/map-content.json" with { type: "json" };
import {
  mockClearChatSessions,
  mockDeleteChatSession,
  mockGetChatSession,
  mockGetChatSessionIndex,
  mockListChatSessionHeads,
  mockRenameChatSession,
  mockSaveChatSessionContext,
  mockSetChatSessionArchived,
  mockSetChatSessionClassification,
  mockSetChatSessionPinned,
  mockSetLastActiveChatSession,
  mockUpsertChatSession,
} from "./mock-chat-session-store.js";
import {
  mockDeleteSpatialPin,
  mockGetSpatialPin,
  mockListSpatialPins,
  mockResolveSpatialPins,
  mockUpsertSpatialPin,
} from "./mock-spatial-pin-store.js";
import {
  mockDeleteSpatialCaptureSession,
  mockGetSpatialCaptureSession,
  mockListSpatialCaptureSessions,
  mockUpsertSpatialCaptureSession,
} from "./mock-spatial-capture-session-store.js";
import {
  mockAcceptLoopGraphEditOffer,
  mockAdvanceLoopInstance,
  mockAnswerLoopGoalClarification,
  mockApproveLoopSpec,
  mockCompileLoopGraph,
  mockConfirmLoopGoalContext,
  mockCreateLoopGraph,
  mockDeleteLoopGraph,
  mockDismissLoopGraphEditOffer,
  mockGetLoopGraph,
  mockGetLoopGraphIndex,
  mockGetLoopInstanceEvents,
  mockLinkLoopGraphToSession,
  mockListLoopGraphs,
  mockPauseLoopInstance,
  mockResolveLoopHitl,
  mockResumeLoopInstance,
  mockSendLoopAuthoringTurn,
  mockSetLastActiveLoopGraph,
  mockSetLoopComposerMode,
  mockStartLoopInstance,
  mockUndoLoopDraft,
  mockUnlinkLoopGraphFromSession,
  mockUpsertLoopGraph,
} from "./mock-loop-graph-store.js";
import type {
  LoopAuthoringTurnRequest,
  LoopCompileResult,
  LoopComposerMode,
  LoopGoalClarificationAnswer,
  LoopGraphDocument,
  LoopGraphHead,
  LoopGraphIndex,
  LoopHitlAnswer,
  LoopInstanceEvent,
  LoopSpec,
} from "../contracts/loop-graph.js";
import type {
  ChatSessionHead,
  ChatSessionIndex,
  ChatSessionRecord,
} from "../contracts/chat-session.js";
import type {
  LocationHint,
  ResolvedSpatialPin,
  SpatialPin,
  SpatialPinHead,
} from "../contracts/spatial-pin.js";
import {
  buildForkedChatSession,
  messagesThroughFork,
} from "../contracts/chat-session-context.js";
import { summarizeChatSessionContextForRecord } from "../services/chat-session-title-summarize.js";

export const MOCK_SAMPLE_WORKSPACE_ROOT = "mock://sample-graph-saas";

export interface MockProjectOSApiClientOptions {
  workspace?: LoadedProjectOSWorkspace;
  runEventPersistence?: AgentRunEventPersistence;
  localContextAssembler?: LocalContextAssemblerDependency;
  modelGateway?: ModelGateway;
}

export class MockProjectOSApiClient extends ProjectOSLocalApi {
  constructor(options: MockProjectOSApiClientOptions = {}) {
    super({
      sampleWorkspaceRoot: options.workspace?.workspaceRoot ?? MOCK_SAMPLE_WORKSPACE_ROOT,
      workspaceStore: new InMemoryProjectOSWorkspaceStore(
        options.workspace ?? createMockSampleWorkspace(),
      ),
      runEventPersistence: options.runEventPersistence ?? "memory",
      ...(options.localContextAssembler
        ? { localContextAssembler: options.localContextAssembler }
        : {}),
      ...(options.modelGateway ? { modelGateway: options.modelGateway } : {}),
    });
  }

  override async getFileContent(_projectId: string, path: string): Promise<string> {
    return getSampleFileContent(path);
  }

  override async writeFileContent(_projectId: string, path: string, content: string): Promise<void> {
    void path
    void content
  }

  override askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return super.askAgent(request);
  }

  override getCurrentWork(projectId: string): Promise<CurrentWorkState> {
    return super.getCurrentWork(projectId);
  }

  override getProjectDescription(projectId: string): Promise<ProjectDescription> {
    return super.getProjectDescription(projectId);
  }

  override updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription> {
    return super.updateProjectDescription(projectId, conciseDescription);
  }

  override async ensureCodeFileUnderstanding(
    projectId: string,
    path: string,
  ): Promise<import("../contracts/code-file-understanding.js").CodeFileUnderstandingEntry> {
    const workspace = this.requireLoadedWorkspace(projectId);
    const content = await this.getFileContent(projectId, path);
    const { hashFileContent } = await import(
      "../services/code-file-understanding-service.js"
    );
    const {
      findCodeFileUnderstandingEntry,
      readCodeFileUnderstandingDocument,
      upsertCodeFileUnderstandingEntry,
      writeCodeFileUnderstandingDocument,
    } = await import("../services/code-file-understanding-store.js");
    const contentHash = hashFileContent(content);
    const document = readCodeFileUnderstandingDocument(
      workspace.workspaceRoot,
      projectId,
    );
    const cached = findCodeFileUnderstandingEntry(document, path);
    if (cached && cached.contentHash === contentHash) {
      return cached;
    }
    const basename = path.split(/[/\\]/).pop() ?? path;
    const entry = {
      path,
      description: `${basename} participates in the sample architecture as a linked source file. Callers and imports from the local graph define its boundary; it does not own unrelated product surfaces.`,
      role: `Owns the ${basename} module surface for this component.`,
      contentHash,
      updatedAt: new Date().toISOString(),
      source: "llm" as const,
    };
    writeCodeFileUnderstandingDocument(
      workspace.workspaceRoot,
      upsertCodeFileUnderstandingEntry(document, entry),
    );
    return entry;
  }

  override runVerification(runId: string): Promise<VerificationRunResult> {
    return super.runVerification(runId);
  }

  override restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult> {
    return super.restoreApplyBackup(projectId, backupId);
  }

  override undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult> {
    return super.undoGreenfieldInitialization(projectId, runId);
  }

  override consumeFallbackNotice(projectId: string): Promise<string | undefined> {
    return super.consumeFallbackNotice(projectId);
  }

  override listSpatialPins(projectId: string): Promise<SpatialPinHead[]> {
    return Promise.resolve(mockListSpatialPins(projectId));
  }

  override getSpatialPin(
    projectId: string,
    pinId: string,
  ): Promise<SpatialPin | null> {
    return Promise.resolve(mockGetSpatialPin(projectId, pinId));
  }

  override upsertSpatialPin(
    projectId: string,
    pin: SpatialPin,
  ): Promise<SpatialPin> {
    return Promise.resolve(mockUpsertSpatialPin(projectId, pin));
  }

  override deleteSpatialPin(projectId: string, pinId: string): Promise<boolean> {
    return Promise.resolve(mockDeleteSpatialPin(projectId, pinId));
  }

  override resolveSpatialPins(
    projectId: string,
    locationHint: LocationHint,
  ): Promise<ResolvedSpatialPin[]> {
    return Promise.resolve(mockResolveSpatialPins(projectId, locationHint));
  }

  override saveSpatialPinSnapshot(
    projectId: string,
    pinId: string,
    _pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }> {
    const snapshotAssetPath = `.projectos/spatial-pins/assets/${pinId}.png`;
    const existing = mockGetSpatialPin(projectId, pinId);
    if (existing) {
      mockUpsertSpatialPin(projectId, {
        ...existing,
        composer: { ...existing.composer, snapshotAssetPath },
      });
    }
    return Promise.resolve({ snapshotAssetPath });
  }

  override listSpatialCaptureSessions(projectId: string) {
    return Promise.resolve(mockListSpatialCaptureSessions(projectId));
  }

  override getSpatialCaptureSession(projectId: string, sessionId: string) {
    return Promise.resolve(mockGetSpatialCaptureSession(projectId, sessionId));
  }

  override upsertSpatialCaptureSession(
    projectId: string,
    session: import("../contracts/spatial-capture-session.js").SpatialCaptureSession,
  ) {
    return Promise.resolve(mockUpsertSpatialCaptureSession(projectId, session));
  }

  override deleteSpatialCaptureSession(projectId: string, sessionId: string) {
    return Promise.resolve(mockDeleteSpatialCaptureSession(projectId, sessionId));
  }

  override saveSpatialCaptureBackdrop(
    projectId: string,
    sessionId: string,
    _pngBase64: string,
  ): Promise<{ backdropAssetPath: string }> {
    const backdropAssetPath = `.projectos/spatial-captures/assets/${sessionId}-backdrop.png`;
    const existing = mockGetSpatialCaptureSession(projectId, sessionId);
    if (existing) {
      mockUpsertSpatialCaptureSession(projectId, {
        ...existing,
        backdropAssetPath,
        updatedAt: new Date().toISOString(),
      });
    }
    return Promise.resolve({ backdropAssetPath });
  }

  override readProjectAssetBase64(
    _projectId: string,
    _relativePath: string,
  ): Promise<{ base64: string; mimeType: string } | null> {
    // 1x1 transparent PNG
    return Promise.resolve({
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      mimeType: "image/png",
    });
  }

  override listLoopGraphs(projectId: string): Promise<LoopGraphHead[]> {
    return Promise.resolve(mockListLoopGraphs(projectId));
  }

  override getLoopGraphIndex(projectId: string): Promise<LoopGraphIndex> {
    return Promise.resolve(mockGetLoopGraphIndex(projectId));
  }

  override getLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<LoopGraphDocument | null> {
    return Promise.resolve(mockGetLoopGraph(projectId, loopId));
  }

  override upsertLoopGraph(
    projectId: string,
    document: LoopGraphDocument,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockUpsertLoopGraph(projectId, document));
  }

  override createLoopGraph(
    projectId: string,
    title?: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockCreateLoopGraph(projectId, title));
  }

  override deleteLoopGraph(projectId: string, loopId: string): Promise<boolean> {
    return Promise.resolve(mockDeleteLoopGraph(projectId, loopId));
  }

  override setLastActiveLoopGraph(projectId: string, loopId: string): Promise<void> {
    mockSetLastActiveLoopGraph(projectId, loopId);
    return Promise.resolve();
  }

  override linkLoopGraphToSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<LoopGraphDocument | null> {
    return Promise.resolve(mockLinkLoopGraphToSession(projectId, loopId, sessionId));
  }

  override unlinkLoopGraphFromSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<LoopGraphDocument | null> {
    return Promise.resolve(
      mockUnlinkLoopGraphFromSession(projectId, loopId, sessionId),
    );
  }

  override compileLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<LoopCompileResult> {
    return Promise.resolve(mockCompileLoopGraph(projectId, loopId));
  }

  override approveLoopSpec(
    projectId: string,
    loopId: string,
    spec: LoopSpec,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockApproveLoopSpec(projectId, loopId, spec));
  }

  override startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockStartLoopInstance(projectId, loopId, specVersion));
  }

  override pauseLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockPauseLoopInstance(projectId, loopId, instanceId));
  }

  override resumeLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockResumeLoopInstance(projectId, loopId, instanceId));
  }

  override resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: LoopHitlAnswer[],
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(
      mockResolveLoopHitl(projectId, loopId, instanceId, answers),
    );
  }

  override getLoopInstanceEvents(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopInstanceEvent[]> {
    return Promise.resolve(
      mockGetLoopInstanceEvents(projectId, loopId, instanceId),
    );
  }

  override advanceLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockAdvanceLoopInstance(projectId, loopId, instanceId));
  }

  override sendLoopAuthoringTurn(
    projectId: string,
    loopId: string,
    request: LoopAuthoringTurnRequest,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockSendLoopAuthoringTurn(projectId, loopId, request));
  }

  override answerLoopGoalClarification(
    projectId: string,
    loopId: string,
    answers: LoopGoalClarificationAnswer[],
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockAnswerLoopGoalClarification(projectId, loopId, answers));
  }

  override confirmLoopGoalContext(
    projectId: string,
    loopId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockConfirmLoopGoalContext(projectId, loopId));
  }

  override acceptLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockAcceptLoopGraphEditOffer(projectId, loopId));
  }

  override dismissLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockDismissLoopGraphEditOffer(projectId, loopId));
  }

  override undoLoopDraft(projectId: string, loopId: string): Promise<LoopGraphDocument> {
    return Promise.resolve(mockUndoLoopDraft(projectId, loopId));
  }

  override setLoopComposerMode(
    projectId: string,
    loopId: string,
    mode: LoopComposerMode,
  ): Promise<LoopGraphDocument> {
    return Promise.resolve(mockSetLoopComposerMode(projectId, loopId, mode));
  }

  override listChatSessionHeads(projectId: string): Promise<ChatSessionHead[]> {
    return Promise.resolve(mockListChatSessionHeads(projectId));
  }

  override getChatSessionIndex(projectId: string): Promise<ChatSessionIndex> {
    return Promise.resolve(mockGetChatSessionIndex(projectId));
  }

  override getChatSession(
    projectId: string,
    sessionId: string,
  ): Promise<ChatSessionRecord | null> {
    return Promise.resolve(mockGetChatSession(projectId, sessionId));
  }

  override upsertChatSession(
    projectId: string,
    record: ChatSessionRecord,
  ): Promise<ChatSessionRecord> {
    return Promise.resolve(mockUpsertChatSession(projectId, record));
  }

  override setChatSessionArchived(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ): Promise<ChatSessionHead | null> {
    return Promise.resolve(mockSetChatSessionArchived(projectId, sessionId, archived));
  }

  override setChatSessionPinned(
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ): Promise<ChatSessionIndex> {
    return Promise.resolve(mockSetChatSessionPinned(projectId, sessionId, pinned));
  }

  override renameChatSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionHead | null> {
    return Promise.resolve(mockRenameChatSession(projectId, sessionId, title));
  }

  override async summarizeChatSessionTitle(
    projectId: string,
    sessionId: string,
  ): Promise<ChatSessionHead | null> {
    const record = mockGetChatSession(projectId, sessionId);
    if (!record) return null;

    const workspace = this.requireLoadedWorkspace(projectId);
    if (!workspace) return null;

    const update = await summarizeChatSessionContextForRecord(projectId, record, {
      chatTitleService: this.chatTitleService,
      settingsService: this.settingsService,
      settings: workspace.settings,
    });
    if (!update) return record.head;
    return mockSaveChatSessionContext(projectId, sessionId, update);
  }

  override async forkChatSession(
    projectId: string,
    parentSessionId: string,
    forkMessageId: string,
  ): Promise<ChatSessionRecord | null> {
    const parent = mockGetChatSession(projectId, parentSessionId);
    if (!parent) return null;
    const workspace = this.requireLoadedWorkspace(projectId);
    if (!workspace) return null;
    const forkId = forkMessageId.trim() || undefined;
    let inherited = parent.contextDigest ?? null;
    if (forkId) {
      const slice = messagesThroughFork(parent.messages, forkId);
      if (!slice) return null;
      const update = await summarizeChatSessionContextForRecord(
        projectId,
        { ...parent, messages: slice },
        {
          chatTitleService: this.chatTitleService,
          settingsService: this.settingsService,
          settings: workspace.settings,
        },
      );
      inherited = update?.digest ?? null;
    }
    const child = buildForkedChatSession(parent, inherited, forkId);
    return mockUpsertChatSession(projectId, child);
  }

  override setChatSessionClassification(
    projectId: string,
    sessionId: string,
    classification: "topic" | "misc",
  ): Promise<ChatSessionHead | null> {
    return Promise.resolve(mockSetChatSessionClassification(projectId, sessionId, classification));
  }

  override deleteChatSession(projectId: string, sessionId: string): Promise<boolean> {
    return Promise.resolve(mockDeleteChatSession(projectId, sessionId));
  }

  override setLastActiveChatSession(projectId: string, sessionId: string): Promise<void> {
    mockSetLastActiveChatSession(projectId, sessionId);
    return Promise.resolve();
  }

}

export function createMockSampleWorkspace(): LoadedProjectOSWorkspace {
  const project = ProjectOSProjectSchema.parse(projectFixture);
  const settings = ProjectOSSettingsSchema.parse(settingsFixture);
  const graph = ProjectGraphSchema.parse(graphFixture);
  const projectDescription = ProjectDescriptionSchema.parse({
    version: "0.1.0",
    projectId: project.projectId,
    conciseDescription: `${project.displayName} is a ${project.framework} project represented by its functional graph.`,
    source: "derived",
    updatedAt: graph.analyzedAt,
  });
  const semanticTree = SemanticTreeSchema.parse(semanticTreeFixture);
  const currentWork = CurrentWorkStateSchema.parse(currentWorkFixture);
  const demoReset = DemoResetSchema.parse(demoResetFixture);
  const googleLoginScenario = DemoScenarioSchema.parse(googleLoginScenarioFixture);
  const authBugfixScenario = DemoScenarioSchema.parse(authBugfixScenarioFixture);
  const authHarness = HarnessRecordSchema.parse(authHarnessFixture);
  const mapContent = MapContentDocumentSchema.parse(mapContentFixture);

  return {
    workspaceRoot: MOCK_SAMPLE_WORKSPACE_ROOT,
    projectOSRoot: `${MOCK_SAMPLE_WORKSPACE_ROOT}/.projectos`,
    project,
    projectDescription,
    settings,
    graph,
    semanticTree,
    currentWork,
    demoReset,
    demoScenarios: new Map<string, DemoScenario>([
      ["google-login.json", googleLoginScenario],
      ["auth-bugfix.json", authBugfixScenario],
    ]),
    harnessRecords: new Map<string, HarnessRecord>([
      ["err_auth_provider_callback.json", authHarness],
    ]),
    mapContent,
    openingMapContent: cloneJson(mapContent),
    mapAssets: new Map(),
  };
}

class InMemoryProjectOSWorkspaceStore extends ProjectOSWorkspaceStore {
  private workspace: LoadedProjectOSWorkspace;

  constructor(workspace: LoadedProjectOSWorkspace) {
    super();
    this.workspace = cloneWorkspace(workspace);
  }

  override loadWorkspace(workspaceRoot: string): LoadedProjectOSWorkspace {
    return {
      ...cloneWorkspace(this.workspace),
      workspaceRoot,
      projectOSRoot: `${workspaceRoot}/.projectos`,
    };
  }

  override async writeCurrentWork(
    _workspaceRoot: string,
    currentWork: CurrentWorkState,
  ): Promise<CurrentWorkState> {
    const parsed = CurrentWorkStateSchema.parse(cloneJson(currentWork));
    this.workspace.currentWork = parsed;
    return cloneJson(parsed);
  }

  override writeSettings(
    _workspaceRoot: string,
    settings: LoadedProjectOSWorkspace["settings"],
  ): LoadedProjectOSWorkspace["settings"] {
    const parsed = ProjectOSSettingsSchema.parse(cloneJson(settings));
    this.workspace.settings = parsed;
    return cloneJson(parsed);
  }

  override async writeProjectDescription(
    _workspaceRoot: string,
    projectDescription: ProjectDescription,
  ): Promise<ProjectDescription> {
    const parsed = ProjectDescriptionSchema.parse(cloneJson(projectDescription));
    this.workspace.projectDescription = parsed;
    return cloneJson(parsed);
  }

  override async writeMapContent(
    _workspaceRoot: string,
    mapContent: LoadedProjectOSWorkspace["mapContent"],
  ): Promise<LoadedProjectOSWorkspace["mapContent"]> {
    const parsed = MapContentDocumentSchema.parse(cloneJson(mapContent));
    this.workspace.mapContent = parsed;
    return cloneJson(parsed);
  }

}

function cloneWorkspace(
  workspace: LoadedProjectOSWorkspace,
): LoadedProjectOSWorkspace {
  return {
    workspaceRoot: workspace.workspaceRoot,
    projectOSRoot: workspace.projectOSRoot,
    project: cloneJson(workspace.project),
    projectDescription: cloneJson(workspace.projectDescription),
    settings: cloneJson(workspace.settings),
    graph: cloneJson(workspace.graph),
    semanticTree: cloneJson(workspace.semanticTree),
    currentWork: cloneJson(workspace.currentWork),
    demoReset: workspace.demoReset ? cloneJson(workspace.demoReset) : undefined,
    demoScenarios: cloneMap(workspace.demoScenarios),
    harnessRecords: cloneMap(workspace.harnessRecords),
    mapContent: cloneJson(workspace.mapContent),
    openingMapContent: cloneJson(workspace.openingMapContent),
    mapAssets: new Map(workspace.mapAssets),
  };
}

function cloneMap<T>(map: Map<string, T>): Map<string, T> {
  return new Map([...map.entries()].map(([key, value]) => [key, cloneJson(value)]));
}
