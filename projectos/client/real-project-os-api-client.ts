import type { AgentRun } from "../contracts/agent-run.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "../contracts/agent-conversation.js";
import type { Disposable, ProjectOSApi } from "../contracts/api.js";
import type { ContextPayload, CurrentWorkState } from "../contracts/context.js";
import type { ApplyResult, GeneratedDiff, RestoreApplyResult } from "../contracts/diff.js";
import type {
  FileTimelineEntry,
  FileTimelineSnapshotContent,
  SaveFileWithHistoryResult,
} from "../contracts/file-timeline.js";
import type {
  ChatSessionHead,
  ChatSessionIndex,
  ChatSessionRecord,
} from "../contracts/chat-session.js";
import type { VerificationRunResult } from "../contracts/exec-command.js";
import type { VerificationCommandApprovalStatus } from "../contracts/verification-command-approval.js";
import type { AgentRunEvent, AgentTransientTrace } from "../contracts/events.js";
import type { ProjectGraph, StructureScanOptions } from "../contracts/graph.js";
import type { HarnessRecord } from "../contracts/harness.js";
import type {
  CreatePlanRequest,
  ImplementationPlan,
  UpdatePlanRequest,
} from "../contracts/implementation-plan.js";
import type {
  DebugSession,
  StartDebugSessionRequest,
  SubmitDebugReproRequest,
} from "../contracts/debug-session.js";
import type { ProjectOSProject } from "../contracts/project.js";
import type { ProjectDescription } from "../contracts/project-description.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../contracts/prompt-refinement.js";
import type { SemanticTree } from "../contracts/semantic-tree.js";
import type { WorkspaceDirectoryEntry } from "../contracts/workspace-directory.js";
import type {
  CreateMapArtifactInput,
  MapArtifact,
  MapContentDocument,
  UpdateMapArtifactPatch,
} from "../contracts/map-content.js";
import type { ListSkillsResult, SkillContent } from "../contracts/skills.js";
import type { ApiTransport } from "./transport/ApiTransport.js";
import { NotConnectedTransport } from "./transport/NotConnectedTransport.js";

export interface RealProjectOSApiClientOptions {
  transport?: ApiTransport;
}

export class RealProjectOSApiClient implements ProjectOSApi {
  private readonly transport: ApiTransport;

  constructor(options: RealProjectOSApiClientOptions = {}) {
    this.transport = options.transport ?? new NotConnectedTransport();
  }

  openSampleWorkspace(): Promise<ProjectOSProject> {
    return this.transport.openSampleWorkspace();
  }

  openWorkspace(path: string): Promise<ProjectOSProject> {
    return this.transport.openWorkspace(path);
  }

  analyzeWorkspace(projectId: string, options?: StructureScanOptions): Promise<ProjectGraph> {
    return this.transport.analyzeWorkspace(projectId, options);
  }

  getProjectGraph(projectId: string): Promise<ProjectGraph> {
    return this.transport.getProjectGraph(projectId);
  }

  getSemanticTree(projectId: string): Promise<SemanticTree> {
    return this.transport.getSemanticTree(projectId);
  }

  listWorkspaceDirectory(
    projectId: string,
    relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]> {
    return this.transport.listWorkspaceDirectory(projectId, relativePath);
  }

  getNodeContext(projectId: string, nodeId: string): Promise<ContextPayload> {
    return this.transport.getNodeContext(projectId, nodeId);
  }

  getFileContext(projectId: string, path: string): Promise<ContextPayload> {
    return this.transport.getFileContext(projectId, path);
  }

  getFileContent(projectId: string, path: string): Promise<string> {
    return this.transport.getFileContent(projectId, path);
  }

  getWorkspaceFileDataUrl(projectId: string, path: string): Promise<string> {
    return this.transport.getWorkspaceFileDataUrl(projectId, path);
  }

  writeFileContent(projectId: string, path: string, content: string): Promise<void> {
    return this.transport.writeFileContent(projectId, path, content);
  }

  saveFileWithHistory(
    projectId: string,
    path: string,
    content: string,
  ): Promise<SaveFileWithHistoryResult> {
    return this.transport.saveFileWithHistory(projectId, path, content);
  }

  listFileTimeline(projectId: string, filePath: string): Promise<FileTimelineEntry[]> {
    return this.transport.listFileTimeline(projectId, filePath);
  }

  getFileTimelineSnapshot(
    projectId: string,
    entryId: string,
  ): Promise<FileTimelineSnapshotContent> {
    return this.transport.getFileTimelineSnapshot(projectId, entryId);
  }

  recordProposedFileTimeline(
    projectId: string,
    runId: string,
    files: Array<{ path: string; before?: string; after?: string }>,
  ): Promise<FileTimelineEntry[]> {
    return this.transport.recordProposedFileTimeline(projectId, runId, files);
  }

  listChatSessionHeads(projectId: string): Promise<ChatSessionHead[]> {
    return this.transport.listChatSessionHeads(projectId);
  }

  getChatSessionIndex(projectId: string): Promise<ChatSessionIndex> {
    return this.transport.getChatSessionIndex(projectId);
  }

  getChatSession(projectId: string, sessionId: string): Promise<ChatSessionRecord | null> {
    return this.transport.getChatSession(projectId, sessionId);
  }

  upsertChatSession(projectId: string, record: ChatSessionRecord): Promise<ChatSessionRecord> {
    return this.transport.upsertChatSession(projectId, record);
  }

  setChatSessionArchived(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ): Promise<ChatSessionHead | null> {
    return this.transport.setChatSessionArchived(projectId, sessionId, archived);
  }

  setChatSessionPinned(
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ): Promise<ChatSessionIndex> {
    return this.transport.setChatSessionPinned(projectId, sessionId, pinned);
  }

  renameChatSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionHead | null> {
    return this.transport.renameChatSession(projectId, sessionId, title);
  }

  summarizeChatSessionTitle(
    projectId: string,
    sessionId: string,
  ): Promise<ChatSessionHead | null> {
    return this.transport.summarizeChatSessionTitle(projectId, sessionId);
  }

  forkChatSession(
    projectId: string,
    parentSessionId: string,
    forkMessageId: string,
  ): Promise<ChatSessionRecord | null> {
    return this.transport.forkChatSession(projectId, parentSessionId, forkMessageId);
  }

  setChatSessionClassification(
    projectId: string,
    sessionId: string,
    classification: "topic" | "misc",
  ): Promise<ChatSessionHead | null> {
    return this.transport.setChatSessionClassification(projectId, sessionId, classification);
  }

  deleteChatSession(projectId: string, sessionId: string): Promise<boolean> {
    return this.transport.deleteChatSession(projectId, sessionId);
  }

  setLastActiveChatSession(projectId: string, sessionId: string): Promise<void> {
    return this.transport.setLastActiveChatSession(projectId, sessionId);
  }

  getCurrentWork(projectId: string): Promise<CurrentWorkState> {
    return this.transport.getCurrentWork(projectId);
  }

  getProjectDescription(projectId: string): Promise<ProjectDescription> {
    return this.transport.getProjectDescription(projectId);
  }

  updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription> {
    return this.transport.updateProjectDescription(projectId, conciseDescription);
  }

  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return this.transport.askAgent(request);
  }

  listSkills(projectId: string): Promise<ListSkillsResult> {
    return this.transport.listSkills(projectId);
  }

  getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    return this.transport.getSkill(projectId, skillId);
  }

  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan> {
    return this.transport.createPlan(request);
  }

  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan> {
    return this.transport.updatePlan(request);
  }

  buildPlan(planId: string): Promise<PromptRefinement> {
    return this.transport.buildPlan(planId);
  }

  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    return this.transport.refinePrompt(request);
  }

  confirmExecution(refinementId: string): Promise<AgentRun> {
    return this.transport.confirmExecution(refinementId);
  }

  getAgentRun(runId: string): Promise<AgentRun> {
    return this.transport.getAgentRun(runId);
  }

  getAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
    return this.transport.getAgentRunEvents(runId);
  }

  streamAgentRun(
    runId: string,
    cb: (event: AgentRunEvent) => void,
    transientCb?: (trace: AgentTransientTrace) => void,
  ): Disposable {
    return this.transport.streamAgentRun(runId, cb, transientCb);
  }

  getDiff(runId: string): Promise<GeneratedDiff> {
    return this.transport.getDiff(runId);
  }

  applyDiff(runId: string): Promise<ApplyResult> {
    return this.transport.applyDiff(runId);
  }

  runVerification(runId: string): Promise<VerificationRunResult> {
    return this.transport.runVerification(runId);
  }

  getVerificationCommandApproval(
    projectId: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return this.transport.getVerificationCommandApproval(projectId);
  }

  approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return this.transport.approveVerificationCommands(projectId, commandSetHash);
  }

  restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult> {
    return this.transport.restoreApplyBackup(projectId, backupId);
  }

  undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult> {
    return this.transport.undoGreenfieldInitialization(projectId, runId);
  }

  reportError(projectId: string, rawError: string): Promise<HarnessRecord> {
    return this.transport.reportError(projectId, rawError);
  }

  startHarnessFix(errorId: string): Promise<AgentRun> {
    return this.transport.startHarnessFix(errorId);
  }

  startDebugSession(request: StartDebugSessionRequest): Promise<DebugSession> {
    return this.transport.startDebugSession(request);
  }

  submitDebugRepro(request: SubmitDebugReproRequest): Promise<DebugSession> {
    return this.transport.submitDebugRepro(request);
  }

  proposeDebugFix(sessionId: string): Promise<DebugSession> {
    return this.transport.proposeDebugFix(sessionId);
  }

  confirmDebugFix(sessionId: string): Promise<AgentRun> {
    return this.transport.confirmDebugFix(sessionId);
  }

  cleanupDebugInstrumentation(sessionId: string): Promise<void> {
    return this.transport.cleanupDebugInstrumentation(sessionId);
  }

  getDebugLogPort(): Promise<number> {
    return this.transport.getDebugLogPort();
  }


  getSettings(projectId: string): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.getSettings(projectId);
  }

  updateSettings(
    projectId: string,
    patch: import("../contracts/settings.js").SettingsPatch,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.updateSettings(projectId, patch);
  }

  testModelConnection(
    projectId: string,
    profileId: string,
  ): Promise<import("../contracts/settings.js").ConnectionTestResult> {
    return this.transport.testModelConnection(projectId, profileId);
  }

  listAvailableModels(
    projectId: string,
    profileId: string,
  ): Promise<import("../contracts/settings.js").ModelOption[]> {
    return this.transport.listAvailableModels(projectId, profileId);
  }

  setSecret(ref: string, value: string): Promise<void> {
    return this.transport.setSecret(ref, value);
  }

  deleteSecret(ref: string): Promise<void> {
    return this.transport.deleteSecret(ref);
  }





  consumeFallbackNotice(projectId: string): Promise<string | undefined> {
    return this.transport.consumeFallbackNotice(projectId);
  }

  getMapContent(projectId: string): Promise<MapContentDocument> {
    return this.transport.getMapContent(projectId);
  }

  createMapArtifact(
    projectId: string,
    input: CreateMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.transport.createMapArtifact(projectId, input);
  }

  createMapImageArtifact(
    projectId: string,
    input: import("../contracts/map-content.js").CreateMapImageArtifactInput,
  ): Promise<MapArtifact> {
    return this.transport.createMapImageArtifact(projectId, input);
  }

  getMapAssetDataUrl(projectId: string, assetPath: string): Promise<string> {
    return this.transport.getMapAssetDataUrl(projectId, assetPath);
  }

  updateMapArtifact(
    projectId: string,
    artifactId: string,
    patch: UpdateMapArtifactPatch,
  ): Promise<MapArtifact> {
    return this.transport.updateMapArtifact(projectId, artifactId, patch);
  }

  deleteMapArtifact(projectId: string, artifactId: string): Promise<void> {
    return this.transport.deleteMapArtifact(projectId, artifactId);
  }

  initMapArtifactStack(
    projectId: string,
    artifactId: string,
    stackId: string,
  ): Promise<MapArtifact> {
    return this.transport.initMapArtifactStack(projectId, artifactId, stackId);
  }

  attachMapArtifactToStack(
    projectId: string,
    artifactId: string,
    input: import("../contracts/map-content.js").AttachMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.transport.attachMapArtifactToStack(projectId, artifactId, input);
  }

  detachMapArtifactFromStack(
    projectId: string,
    artifactId: string,
    input: import("../contracts/map-content.js").DetachMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.transport.detachMapArtifactFromStack(projectId, artifactId, input);
  }

  setMapArtifactStackActive(
    projectId: string,
    stackId: string,
    artifactId: string,
  ): Promise<MapArtifact> {
    return this.transport.setMapArtifactStackActive(projectId, stackId, artifactId);
  }

  reorderMapArtifactStack(
    projectId: string,
    stackId: string,
    input: import("../contracts/map-content.js").ReorderMapArtifactStackInput,
  ): Promise<MapArtifact> {
    return this.transport.reorderMapArtifactStack(projectId, stackId, input);
  }

  applyMapWorkGroupMutation(
    projectId: string,
    input: import("../contracts/map-work-group.js").MapWorkGroupMutationInput,
  ): Promise<MapContentDocument> {
    return this.transport.applyMapWorkGroupMutation(projectId, input);
  }

  updateMapWorkGroup(
    projectId: string,
    workGroupId: string,
    patch: import("../contracts/map-work-group.js").UpdateMapWorkGroupPatch,
  ): Promise<MapContentDocument> {
    return this.transport.updateMapWorkGroup(projectId, workGroupId, patch);
  }

  transcribeAudio(
    request: import("../contracts/voice-input.js").TranscribeAudioRequest,
  ): Promise<import("../contracts/voice-input.js").TranscribeAudioResult> {
    return this.transport.transcribeAudio(request);
  }
}
