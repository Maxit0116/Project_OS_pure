import type { AgentRun } from "./agent-run.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "./agent-conversation.js";
import type { ContextPayload, CurrentWorkState } from "./context.js";
import type { ApplyResult, GeneratedDiff, RestoreApplyResult } from "./diff.js";
import type { VerificationRunResult } from "./exec-command.js";
import type { VerificationCommandApprovalStatus } from "./verification-command-approval.js";
import type { AgentRunEvent, AgentTransientTrace } from "./events.js";
import type { ProjectGraph, StructureScanOptions } from "./graph.js";
import type { HarnessRecord } from "./harness.js";
import type {
  CreatePlanRequest,
  ImplementationPlan,
  UpdatePlanRequest,
} from "./implementation-plan.js";
import type {
  DebugSession,
  StartDebugSessionRequest,
  SubmitDebugReproRequest,
} from "./debug-session.js";
import type { ProjectOSProject } from "./project.js";
import type { ProjectDescription } from "./project-description.js";
import type { CodeFileUnderstandingEntry } from "./code-file-understanding.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "./prompt-refinement.js";
import type {
  ConnectionTestResult,
  ModelOption,
  ProjectOSSettings,
  SettingsPatch,
} from "./settings.js";
import type { SemanticTree } from "./semantic-tree.js";
import type { WorkspaceDirectoryEntry } from "./workspace-directory.js";
import type {
  CreateMapArtifactInput,
  CreateMapImageArtifactInput,
  MapArtifact,
  MapContentDocument,
  UpdateMapArtifactPatch,
  AttachMapArtifactInput,
  DetachMapArtifactInput,
} from "./map-content.js";
import type {
  MapWorkGroupMutationInput,
  UpdateMapWorkGroupPatch,
} from "./map-work-group.js";
import type {
  TranscribeAudioRequest,
  TranscribeAudioResult,
} from "./voice-input.js";
import type {
  FileTimelineEntry,
  FileTimelineSnapshotContent,
  SaveFileWithHistoryResult,
} from "./file-timeline.js";
import type {
  ChatSessionHead,
  ChatSessionIndex,
  ChatSessionRecord,
} from "./chat-session.js";
import type { ListSkillsResult, SkillContent } from "./skills.js";
import type {
  LocationHint,
  ResolvedSpatialPin,
  SpatialPin,
  SpatialPinHead,
  SubmitSpatialPinResult,
} from "./spatial-pin.js";
import type {
  SpatialCaptureSession,
  SpatialCaptureSessionHead,
} from "./spatial-capture-session.js";
import type {
  LoopCompileResult,
  LoopGraphDocument,
  LoopGraphHead,
  LoopGraphIndex,
  LoopHitlAnswer,
  LoopInstanceEvent,
  LoopSpec,
} from "./loop-graph.js";

export interface Disposable {
  dispose(): void;
}

export interface ProjectOSApi {
  openSampleWorkspace(): Promise<ProjectOSProject>;
  openWorkspace(path: string): Promise<ProjectOSProject>;
  analyzeWorkspace(
    projectId: string,
    options?: StructureScanOptions,
  ): Promise<ProjectGraph>;
  getProjectGraph(projectId: string): Promise<ProjectGraph>;
  getSemanticTree(projectId: string): Promise<SemanticTree>;
  listWorkspaceDirectory(
    projectId: string,
    relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]>;
  getNodeContext(projectId: string, nodeId: string): Promise<ContextPayload>;
  getFileContext(projectId: string, path: string): Promise<ContextPayload>;
  getFileContent(projectId: string, path: string): Promise<string>;
  getWorkspaceFileDataUrl(projectId: string, path: string): Promise<string>;
  writeFileContent(projectId: string, path: string, content: string): Promise<void>;
  saveFileWithHistory(projectId: string, path: string, content: string): Promise<SaveFileWithHistoryResult>;
  listFileTimeline(projectId: string, filePath: string): Promise<FileTimelineEntry[]>;
  getFileTimelineSnapshot(
    projectId: string,
    entryId: string,
  ): Promise<FileTimelineSnapshotContent>;
  recordProposedFileTimeline(
    projectId: string,
    runId: string,
    files: Array<{ path: string; before?: string; after?: string }>,
  ): Promise<FileTimelineEntry[]>;
  listChatSessionHeads(projectId: string): Promise<ChatSessionHead[]>;
  getChatSessionIndex(projectId: string): Promise<ChatSessionIndex>;
  getChatSession(projectId: string, sessionId: string): Promise<ChatSessionRecord | null>;
  upsertChatSession(projectId: string, record: ChatSessionRecord): Promise<ChatSessionRecord>;
  setChatSessionArchived(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ): Promise<ChatSessionHead | null>;
  setChatSessionPinned(
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ): Promise<ChatSessionIndex>;
  renameChatSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionHead | null>;
  summarizeChatSessionTitle(
    projectId: string,
    sessionId: string,
  ): Promise<ChatSessionHead | null>;
  forkChatSession(
    projectId: string,
    parentSessionId: string,
    forkMessageId: string,
  ): Promise<ChatSessionRecord | null>;
  setChatSessionClassification(
    projectId: string,
    sessionId: string,
    classification: "topic" | "misc",
  ): Promise<ChatSessionHead | null>;
  deleteChatSession(projectId: string, sessionId: string): Promise<boolean>;
  setLastActiveChatSession(projectId: string, sessionId: string): Promise<void>;
  getCurrentWork(projectId: string): Promise<CurrentWorkState>;
  getProjectDescription(projectId: string): Promise<ProjectDescription>;
  updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription>;
  /**
   * Return cached LLM file understanding, or generate+persist on first click
   * (or when file content hash changed).
   */
  ensureCodeFileUnderstanding(
    projectId: string,
    path: string,
  ): Promise<CodeFileUnderstandingEntry>;
  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult>;
  listSkills(projectId: string): Promise<ListSkillsResult>;
  getSkill(projectId: string, skillId: string): Promise<SkillContent | null>;
  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan>;
  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan>;
  buildPlan(planId: string): Promise<PromptRefinement>;
  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement>;
  confirmExecution(refinementId: string): Promise<AgentRun>;
  getAgentRun(runId: string): Promise<AgentRun>;
  getAgentRunEvents(runId: string): Promise<AgentRunEvent[]>;
  streamAgentRun(
    runId: string,
    cb: (event: AgentRunEvent) => void,
    transientCb?: (trace: AgentTransientTrace) => void,
  ): Disposable;
  getDiff(runId: string): Promise<GeneratedDiff>;
  applyDiff(runId: string): Promise<ApplyResult>;
  runVerification(runId: string): Promise<VerificationRunResult>;
  getVerificationCommandApproval(projectId: string): Promise<VerificationCommandApprovalStatus>;
  approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus>;
  restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult>;
  undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult>;
  reportError(projectId: string, rawError: string): Promise<HarnessRecord>;
  startHarnessFix(errorId: string): Promise<AgentRun>;
  startDebugSession(request: StartDebugSessionRequest): Promise<DebugSession>;
  submitDebugRepro(request: SubmitDebugReproRequest): Promise<DebugSession>;
  proposeDebugFix(sessionId: string): Promise<DebugSession>;
  confirmDebugFix(sessionId: string): Promise<AgentRun>;
  cleanupDebugInstrumentation(sessionId: string): Promise<void>;
  getDebugLogPort(): Promise<number>;
  getSettings(projectId: string): Promise<ProjectOSSettings>;
  updateSettings(
    projectId: string,
    patch: SettingsPatch,
  ): Promise<ProjectOSSettings>;
  testModelConnection(
    projectId: string,
    profileId: string,
  ): Promise<ConnectionTestResult>;
  listAvailableModels(
    projectId: string,
    profileId: string,
  ): Promise<ModelOption[]>;
  setSecret(ref: string, value: string): Promise<void>;
  deleteSecret(ref: string): Promise<void>;
  consumeFallbackNotice(projectId: string): Promise<string | undefined>;
  getMapContent(projectId: string): Promise<MapContentDocument>;
  createMapArtifact(
    projectId: string,
    input: CreateMapArtifactInput,
  ): Promise<MapArtifact>;
  createMapImageArtifact(
    projectId: string,
    input: CreateMapImageArtifactInput,
  ): Promise<MapArtifact>;
  getMapAssetDataUrl(projectId: string, assetPath: string): Promise<string>;
  updateMapArtifact(
    projectId: string,
    artifactId: string,
    patch: UpdateMapArtifactPatch,
  ): Promise<MapArtifact>;
  initMapArtifactStack(projectId: string, artifactId: string, stackId: string): Promise<MapArtifact>;
  attachMapArtifactToStack(
    projectId: string,
    artifactId: string,
    input: AttachMapArtifactInput,
  ): Promise<MapArtifact>;
  detachMapArtifactFromStack(
    projectId: string,
    artifactId: string,
    input: DetachMapArtifactInput,
  ): Promise<MapArtifact>;
  setMapArtifactStackActive(
    projectId: string,
    stackId: string,
    artifactId: string,
  ): Promise<MapArtifact>;
  reorderMapArtifactStack(
    projectId: string,
    stackId: string,
    input: import("./map-content.js").ReorderMapArtifactStackInput,
  ): Promise<MapArtifact>;
  applyMapWorkGroupMutation(
    projectId: string,
    input: MapWorkGroupMutationInput,
  ): Promise<MapContentDocument>;
  updateMapWorkGroup(
    projectId: string,
    workGroupId: string,
    patch: UpdateMapWorkGroupPatch,
  ): Promise<MapContentDocument>;
  deleteMapArtifact(projectId: string, artifactId: string): Promise<void>;
  listSpatialPins(projectId: string): Promise<SpatialPinHead[]>;
  getSpatialPin(projectId: string, pinId: string): Promise<SpatialPin | null>;
  upsertSpatialPin(projectId: string, pin: SpatialPin): Promise<SpatialPin>;
  deleteSpatialPin(projectId: string, pinId: string): Promise<boolean>;
  resolveSpatialPins(
    projectId: string,
    locationHint: LocationHint,
  ): Promise<ResolvedSpatialPin[]>;
  submitSpatialPin(projectId: string, pinId: string): Promise<SubmitSpatialPinResult>;
  saveSpatialPinSnapshot(
    projectId: string,
    pinId: string,
    pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }>;
  listSpatialCaptureSessions(
    projectId: string,
  ): Promise<SpatialCaptureSessionHead[]>;
  getSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<SpatialCaptureSession | null>;
  upsertSpatialCaptureSession(
    projectId: string,
    session: SpatialCaptureSession,
  ): Promise<SpatialCaptureSession>;
  deleteSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<boolean>;
  saveSpatialCaptureBackdrop(
    projectId: string,
    sessionId: string,
    pngBase64: string,
  ): Promise<{ backdropAssetPath: string }>;
  readProjectAssetBase64(
    projectId: string,
    relativePath: string,
  ): Promise<{ base64: string; mimeType: string } | null>;
  listLoopGraphs(projectId: string): Promise<LoopGraphHead[]>;
  getLoopGraphIndex(projectId: string): Promise<LoopGraphIndex>;
  getLoopGraph(projectId: string, loopId: string): Promise<LoopGraphDocument | null>;
  upsertLoopGraph(projectId: string, document: LoopGraphDocument): Promise<LoopGraphDocument>;
  createLoopGraph(projectId: string, title?: string): Promise<LoopGraphDocument>;
  deleteLoopGraph(projectId: string, loopId: string): Promise<boolean>;
  setLastActiveLoopGraph(projectId: string, loopId: string): Promise<void>;
  linkLoopGraphToSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<LoopGraphDocument | null>;
  unlinkLoopGraphFromSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<LoopGraphDocument | null>;
  compileLoopGraph(projectId: string, loopId: string): Promise<LoopCompileResult>;
  approveLoopSpec(
    projectId: string,
    loopId: string,
    spec: LoopSpec,
  ): Promise<LoopGraphDocument>;
  startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
  ): Promise<LoopGraphDocument>;
  pauseLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument>;
  resumeLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument>;
  resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: LoopHitlAnswer[],
  ): Promise<LoopGraphDocument>;
  getLoopInstanceEvents(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopInstanceEvent[]>;
  advanceLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<LoopGraphDocument>;
  sendLoopAuthoringTurn(
    projectId: string,
    loopId: string,
    request: import("./loop-graph.js").LoopAuthoringTurnRequest,
  ): Promise<LoopGraphDocument>;
  answerLoopGoalClarification(
    projectId: string,
    loopId: string,
    answers: import("./loop-graph.js").LoopGoalClarificationAnswer[],
  ): Promise<LoopGraphDocument>;
  confirmLoopGoalContext(projectId: string, loopId: string): Promise<LoopGraphDocument>;
  acceptLoopGraphEditOffer(projectId: string, loopId: string): Promise<LoopGraphDocument>;
  dismissLoopGraphEditOffer(projectId: string, loopId: string): Promise<LoopGraphDocument>;
  undoLoopDraft(projectId: string, loopId: string): Promise<LoopGraphDocument>;
  setLoopComposerMode(
    projectId: string,
    loopId: string,
    mode: import("./loop-graph.js").LoopComposerMode,
  ): Promise<LoopGraphDocument>;
  transcribeAudio(request: TranscribeAudioRequest): Promise<TranscribeAudioResult>;
}
