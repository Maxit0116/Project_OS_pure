import type { AgentRun } from "../../contracts/agent-run.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "../../contracts/agent-conversation.js";
import type { Disposable, ProjectOSApi } from "../../contracts/api.js";
import type { ContextPayload, CurrentWorkState } from "../../contracts/context.js";
import type { ApplyResult, GeneratedDiff, RestoreApplyResult } from "../../contracts/diff.js";
import type {
  FileTimelineEntry,
  FileTimelineSnapshotContent,
  SaveFileWithHistoryResult,
} from "../../contracts/file-timeline.js";
import type {
  ChatSessionHead,
  ChatSessionIndex,
  ChatSessionRecord,
} from "../../contracts/chat-session.js";
import type { VerificationRunResult } from "../../contracts/exec-command.js";
import type { VerificationCommandApprovalStatus } from "../../contracts/verification-command-approval.js";
import type { AgentRunEvent, AgentTransientTrace } from "../../contracts/events.js";
import type { ProjectGraph, StructureScanOptions } from "../../contracts/graph.js";
import type {
  StructureScanProgress,
  StructureScanProgressEvent,
} from "../../contracts/structure-scan-progress.js";
import type { HarnessRecord } from "../../contracts/harness.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../../contracts/prompt-refinement.js";
import type { ProjectOSProject } from "../../contracts/project.js";
import type { ProjectDescription } from "../../contracts/project-description.js";
import type {
  ConnectionTestResult,
  ModelOption,
  ProjectOSSettings,
  SettingsPatch,
} from "../../contracts/settings.js";
import type { SemanticTree } from "../../contracts/semantic-tree.js";
import type { WorkspaceDirectoryEntry } from "../../contracts/workspace-directory.js";
import { ProjectOSError } from "../../errors.js";

const TRANSPORT_MESSAGE =
  "Project OS backend transport is not connected. Set VITE_PROJECTOS_API_URL when the HTTP adapter is available, or use VITE_PROJECTOS_CLIENT=mock for the presentation demo. See docs/backend-integration-handoff.md.";

function transportNotConnected(): never {
  throw new ProjectOSError("transport_not_connected", TRANSPORT_MESSAGE);
}

export class NotConnectedTransport implements ProjectOSApi {
  async openSampleWorkspace(): Promise<ProjectOSProject> {
    return transportNotConnected();
  }

  async openWorkspace(_path: string): Promise<ProjectOSProject> {
    return transportNotConnected();
  }

  async analyzeWorkspace(
    _projectId: string,
    _options?: StructureScanOptions,
  ): Promise<ProjectGraph> {
    return transportNotConnected();
  }

  async getStructureScanProgress(
    _projectId: string,
  ): Promise<StructureScanProgress | null> {
    return transportNotConnected();
  }

  streamStructureScan(
    _projectId: string,
    _cb: (event: StructureScanProgressEvent) => void,
  ): Disposable {
    transportNotConnected();
  }

  async cancelStructureScan(_projectId: string): Promise<boolean> {
    return transportNotConnected();
  }

  async getProjectGraph(_projectId: string): Promise<ProjectGraph> {
    return transportNotConnected();
  }

  async getSemanticTree(_projectId: string): Promise<SemanticTree> {
    return transportNotConnected();
  }

  async listWorkspaceDirectory(
    _projectId: string,
    _relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]> {
    return transportNotConnected();
  }

  async getNodeContext(
    _projectId: string,
    _nodeId: string,
  ): Promise<ContextPayload> {
    return transportNotConnected();
  }

  async getFileContext(
    _projectId: string,
    _path: string,
  ): Promise<ContextPayload> {
    return transportNotConnected();
  }

  async getFileContent(_projectId: string, _path: string): Promise<string> {
    return transportNotConnected();
  }

  async getWorkspaceFileDataUrl(_projectId: string, _path: string): Promise<string> {
    return transportNotConnected();
  }

  async writeFileContent(_projectId: string, _path: string, _content: string): Promise<void> {
    return transportNotConnected();
  }

  async saveFileWithHistory(
    _projectId: string,
    _path: string,
    _content: string,
  ): Promise<SaveFileWithHistoryResult> {
    return transportNotConnected();
  }

  async listFileTimeline(_projectId: string, _filePath: string): Promise<FileTimelineEntry[]> {
    return transportNotConnected();
  }

  async getFileTimelineSnapshot(
    _projectId: string,
    _entryId: string,
  ): Promise<FileTimelineSnapshotContent> {
    return transportNotConnected();
  }

  async recordProposedFileTimeline(
    _projectId: string,
    _runId: string,
    _files: Array<{ path: string; before?: string; after?: string }>,
  ): Promise<FileTimelineEntry[]> {
    return transportNotConnected();
  }

  async listChatSessionHeads(_projectId: string): Promise<ChatSessionHead[]> {
    return transportNotConnected();
  }

  async getChatSessionIndex(_projectId: string): Promise<ChatSessionIndex> {
    return transportNotConnected();
  }

  async getChatSession(
    _projectId: string,
    _sessionId: string,
  ): Promise<ChatSessionRecord | null> {
    return transportNotConnected();
  }

  async upsertChatSession(
    _projectId: string,
    _record: ChatSessionRecord,
  ): Promise<ChatSessionRecord> {
    return transportNotConnected();
  }

  async setChatSessionArchived(
    _projectId: string,
    _sessionId: string,
    _archived: boolean,
  ): Promise<ChatSessionHead | null> {
    return transportNotConnected();
  }

  async setChatSessionPinned(
    _projectId: string,
    _sessionId: string,
    _pinned: boolean,
  ): Promise<ChatSessionIndex> {
    return transportNotConnected();
  }

  async renameChatSession(
    _projectId: string,
    _sessionId: string,
    _title: string,
  ): Promise<ChatSessionHead | null> {
    return transportNotConnected();
  }

  async summarizeChatSessionTitle(
    _projectId: string,
    _sessionId: string,
  ): Promise<ChatSessionHead | null> {
    return transportNotConnected();
  }

  async forkChatSession(
    _projectId: string,
    _parentSessionId: string,
    _forkMessageId: string,
  ): Promise<ChatSessionRecord | null> {
    return transportNotConnected();
  }

  async setChatSessionClassification(
    _projectId: string,
    _sessionId: string,
    _classification: "topic" | "misc",
  ): Promise<ChatSessionHead | null> {
    return transportNotConnected();
  }

  async deleteChatSession(_projectId: string, _sessionId: string): Promise<boolean> {
    return transportNotConnected();
  }

  async setLastActiveChatSession(_projectId: string, _sessionId: string): Promise<void> {
    return transportNotConnected();
  }

  async getCurrentWork(_projectId: string): Promise<CurrentWorkState> {
    return transportNotConnected();
  }

  async getProjectDescription(_projectId: string): Promise<ProjectDescription> {
    return transportNotConnected();
  }

  async updateProjectDescription(
    _projectId: string,
    _conciseDescription: string,
  ): Promise<ProjectDescription> {
    return transportNotConnected();
  }

  async ensureCodeFileUnderstanding(
    _projectId: string,
    _path: string,
  ): Promise<import("../../contracts/code-file-understanding.js").CodeFileUnderstandingEntry> {
    return transportNotConnected();
  }

  async askAgent(_request: AgentAskRequest): Promise<AgentAnswerResult> {
    return transportNotConnected();
  }

  async listSkills(_projectId: string) {
    return transportNotConnected();
  }

  async getComposerMentions(_projectId: string, _query: string) {
    return transportNotConnected();
  }

  async getSkill(_projectId: string, _skillId: string) {
    return transportNotConnected();
  }

  async listAgentWorktrees(_projectId: string) {
    return transportNotConnected();
  }

  async createAgentWorktree(
    _projectId: string,
    _options?: import("../../contracts/agent-worktree.js").CreateAgentWorktreeOptions,
  ) {
    return transportNotConnected();
  }

  async mergeAgentWorktree(
    _projectId: string,
    _options: import("../../contracts/agent-worktree.js").MergeAgentWorktreeOptions,
  ) {
    return transportNotConnected();
  }

  async removeAgentWorktree(
    _projectId: string,
    _worktreeId: string,
    _options?: { deleteBranch?: boolean },
  ) {
    return transportNotConnected();
  }

  async getAgentWorktreeDiff(_projectId: string, _worktreeId: string) {
    return transportNotConnected();
  }

  async getAgentHarnessConfig(_projectId: string) {
    return transportNotConnected();
  }

  async saveAgentHarnessConfig(
    _projectId: string,
    _config: import("../../contracts/agent-harness-config.js").AgentHarnessConfig,
  ) {
    return transportNotConnected();
  }

  async getAgentMemory(_projectId: string) {
    return transportNotConnected();
  }

  async getAgentMemoryTopic(_projectId: string, _topicFile: string) {
    return transportNotConnected();
  }

  async saveAgentMemorySettings(
    _projectId: string,
    _patch: import("../../contracts/agent-memory.js").MemorySettingsPatch,
  ) {
    return transportNotConnected();
  }

  async submitAgentMemory(
    _projectId: string,
    _candidate: import("../../contracts/agent-memory.js").MemoryCandidate,
  ) {
    return transportNotConnected();
  }

  async setAgentMemoryEntryState(
    _projectId: string,
    _text: string,
    _state: import("../../contracts/agent-memory.js").MemoryAdmissionState,
  ) {
    return transportNotConnected();
  }

  async deleteAgentMemoryEntry(_projectId: string, _text: string) {
    return transportNotConnected();
  }

  async consolidateAgentMemory(_projectId: string) {
    return transportNotConnected();
  }

  async createPlan(_request: import("../../contracts/implementation-plan.js").CreatePlanRequest): Promise<import("../../contracts/implementation-plan.js").ImplementationPlan> {
    return transportNotConnected();
  }

  async updatePlan(_request: import("../../contracts/implementation-plan.js").UpdatePlanRequest): Promise<import("../../contracts/implementation-plan.js").ImplementationPlan> {
    return transportNotConnected();
  }

  async savePlanToWorkspace(_planId: string): Promise<{ path: string }> {
    return transportNotConnected();
  }

  async listWorkspacePlans(
    _projectId: string,
  ): Promise<import("../../contracts/implementation-plan.js").WorkspacePlanSummary[]> {
    return transportNotConnected();
  }

  async loadPlanFromWorkspace(
    _projectId: string,
    _planId: string,
  ): Promise<import("../../contracts/implementation-plan.js").ImplementationPlan> {
    return transportNotConnected();
  }

  async buildPlan(_planId: string): Promise<PromptRefinement> {
    return transportNotConnected();
  }

  async refinePrompt(_request: PromptRefineRequest): Promise<PromptRefinement> {
    return transportNotConnected();
  }

  async confirmExecution(_refinementId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async cancelAgentRun(_runId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async pauseAgentRun(_runId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async continueAgentRun(_runId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async getAgentRun(_runId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async getAgentRunEvents(_runId: string): Promise<AgentRunEvent[]> {
    return transportNotConnected();
  }

  streamAgentRun(
    _runId: string,
    _cb: (event: AgentRunEvent) => void,
    _transientCb?: (trace: AgentTransientTrace) => void,
  ): Disposable {
    transportNotConnected();
  }

  async getDiff(_runId: string): Promise<GeneratedDiff> {
    return transportNotConnected();
  }

  async applyDiff(_runId: string): Promise<ApplyResult> {
    return transportNotConnected();
  }

  async runVerification(_runId: string): Promise<VerificationRunResult> {
    return transportNotConnected();
  }

  async getVerificationCommandApproval(
    _projectId: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return transportNotConnected();
  }

  async approveVerificationCommands(
    _projectId: string,
    _commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return transportNotConnected();
  }

  async restoreApplyBackup(_projectId: string, _backupId: string): Promise<RestoreApplyResult> {
    return transportNotConnected();
  }

  async undoGreenfieldInitialization(_projectId: string, _runId: string): Promise<RestoreApplyResult> {
    return transportNotConnected();
  }

  async reportError(
    _projectId: string,
    _rawError: string,
  ): Promise<HarnessRecord> {
    return transportNotConnected();
  }

  async startHarnessFix(_errorId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async startDebugSession(_request: import("../../contracts/debug-session.js").StartDebugSessionRequest): Promise<import("../../contracts/debug-session.js").DebugSession> {
    return transportNotConnected();
  }

  async submitDebugRepro(_request: import("../../contracts/debug-session.js").SubmitDebugReproRequest): Promise<import("../../contracts/debug-session.js").DebugSession> {
    return transportNotConnected();
  }

  async proposeDebugFix(_sessionId: string): Promise<import("../../contracts/debug-session.js").DebugSession> {
    return transportNotConnected();
  }

  async confirmDebugFix(_sessionId: string): Promise<AgentRun> {
    return transportNotConnected();
  }

  async cleanupDebugInstrumentation(_sessionId: string): Promise<void> {
    return transportNotConnected();
  }

  async getDebugLogPort(): Promise<number> {
    return transportNotConnected();
  }


  async getSettings(_projectId: string): Promise<ProjectOSSettings> {
    return transportNotConnected();
  }

  async updateSettings(
    _projectId: string,
    _patch: SettingsPatch,
  ): Promise<ProjectOSSettings> {
    return transportNotConnected();
  }

  async testModelConnection(
    _projectId: string,
    _profileId: string,
  ): Promise<ConnectionTestResult> {
    return transportNotConnected();
  }

  async listAvailableModels(
    _projectId: string,
    _profileId: string,
  ): Promise<ModelOption[]> {
    return transportNotConnected();
  }

  async setSecret(_ref: string, _value: string): Promise<void> {
    return transportNotConnected();
  }

  async deleteSecret(_ref: string): Promise<void> {
    return transportNotConnected();
  }





  async consumeFallbackNotice(_projectId: string): Promise<string | undefined> {
    return undefined;
  }

  async getMapContent(_projectId: string): Promise<import("../../contracts/map-content.js").MapContentDocument> {
    return transportNotConnected();
  }

  async createMapArtifact(
    _projectId: string,
    _input: import("../../contracts/map-content.js").CreateMapArtifactInput,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async createMapImageArtifact(
    _projectId: string,
    _input: import("../../contracts/map-content.js").CreateMapImageArtifactInput,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async getMapAssetDataUrl(_projectId: string, _assetPath: string): Promise<string> {
    return transportNotConnected();
  }

  async updateMapArtifact(
    _projectId: string,
    _artifactId: string,
    _patch: import("../../contracts/map-content.js").UpdateMapArtifactPatch,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async deleteMapArtifact(_projectId: string, _artifactId: string): Promise<void> {
    return transportNotConnected();
  }

  async listSpatialPins(_projectId: string): Promise<import("../../contracts/spatial-pin.js").SpatialPinHead[]> {
    return transportNotConnected();
  }

  async getSpatialPin(
    _projectId: string,
    _pinId: string,
  ): Promise<import("../../contracts/spatial-pin.js").SpatialPin | null> {
    return transportNotConnected();
  }

  async upsertSpatialPin(
    _projectId: string,
    _pin: import("../../contracts/spatial-pin.js").SpatialPin,
  ): Promise<import("../../contracts/spatial-pin.js").SpatialPin> {
    return transportNotConnected();
  }

  async deleteSpatialPin(_projectId: string, _pinId: string): Promise<boolean> {
    return transportNotConnected();
  }

  async resolveSpatialPins(
    _projectId: string,
    _locationHint: import("../../contracts/spatial-pin.js").LocationHint,
  ): Promise<import("../../contracts/spatial-pin.js").ResolvedSpatialPin[]> {
    return transportNotConnected();
  }

  async submitSpatialPin(
    _projectId: string,
    _pinId: string,
  ): Promise<import("../../contracts/spatial-pin.js").SubmitSpatialPinResult> {
    return transportNotConnected();
  }

  async saveSpatialPinSnapshot(
    _projectId: string,
    _pinId: string,
    _pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }> {
    return transportNotConnected();
  }

  async listSpatialCaptureSessions(
    _projectId: string,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSessionHead[]
  > {
    return transportNotConnected();
  }

  async getSpatialCaptureSession(
    _projectId: string,
    _sessionId: string,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSession | null
  > {
    return transportNotConnected();
  }

  async upsertSpatialCaptureSession(
    _projectId: string,
    _session: import("../../contracts/spatial-capture-session.js").SpatialCaptureSession,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSession
  > {
    return transportNotConnected();
  }

  async deleteSpatialCaptureSession(
    _projectId: string,
    _sessionId: string,
  ): Promise<boolean> {
    return transportNotConnected();
  }

  async saveSpatialCaptureBackdrop(
    _projectId: string,
    _sessionId: string,
    _pngBase64: string,
  ): Promise<{ backdropAssetPath: string }> {
    return transportNotConnected();
  }

  async readProjectAssetBase64(
    _projectId: string,
    _relativePath: string,
  ): Promise<{ base64: string; mimeType: string } | null> {
    return transportNotConnected();
  }

  async listLoopGraphs(
    _projectId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphHead[]> {
    return transportNotConnected();
  }

  async getLoopGraphIndex(
    _projectId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphIndex> {
    return transportNotConnected();
  }

  async getLoopGraph(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return transportNotConnected();
  }

  async upsertLoopGraph(
    _projectId: string,
    _document: import("../../contracts/loop-graph.js").LoopGraphDocument,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async createLoopGraph(
    _projectId: string,
    _title?: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async deleteLoopGraph(_projectId: string, _loopId: string): Promise<boolean> {
    return transportNotConnected();
  }

  async setLastActiveLoopGraph(_projectId: string, _loopId: string): Promise<void> {
    return transportNotConnected();
  }

  async linkLoopGraphToSession(
    _projectId: string,
    _loopId: string,
    _sessionId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return transportNotConnected();
  }

  async unlinkLoopGraphFromSession(
    _projectId: string,
    _loopId: string,
    _sessionId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return transportNotConnected();
  }

  async compileLoopGraph(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopCompileResult> {
    return transportNotConnected();
  }

  async approveLoopSpec(
    _projectId: string,
    _loopId: string,
    _spec: import("../../contracts/loop-graph.js").LoopSpec,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async startLoopInstance(
    _projectId: string,
    _loopId: string,
    _specVersion?: string,
    _featureNodeId?: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async pauseLoopInstance(
    _projectId: string,
    _loopId: string,
    _instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async resumeLoopInstance(
    _projectId: string,
    _loopId: string,
    _instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async resolveLoopHitl(
    _projectId: string,
    _loopId: string,
    _instanceId: string,
    _answers: import("../../contracts/loop-graph.js").LoopHitlAnswer[],
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async getLoopInstanceEvents(
    _projectId: string,
    _loopId: string,
    _instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopInstanceEvent[]> {
    return transportNotConnected();
  }

  async advanceLoopInstance(
    _projectId: string,
    _loopId: string,
    _instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async sendLoopAuthoringTurn(
    _projectId: string,
    _loopId: string,
    _request: import("../../contracts/loop-graph.js").LoopAuthoringTurnRequest,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async answerLoopGoalClarification(
    _projectId: string,
    _loopId: string,
    _answers: import("../../contracts/loop-graph.js").LoopGoalClarificationAnswer[],
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async confirmLoopGoalContext(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async acceptLoopGraphEditOffer(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async dismissLoopGraphEditOffer(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async undoLoopDraft(
    _projectId: string,
    _loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async setLoopComposerMode(
    _projectId: string,
    _loopId: string,
    _mode: import("../../contracts/loop-graph.js").LoopComposerMode,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return transportNotConnected();
  }

  async initMapArtifactStack(
    _projectId: string,
    _artifactId: string,
    _stackId: string,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async attachMapArtifactToStack(
    _projectId: string,
    _artifactId: string,
    _input: import("../../contracts/map-content.js").AttachMapArtifactInput,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async detachMapArtifactFromStack(
    _projectId: string,
    _artifactId: string,
    _input: import("../../contracts/map-content.js").DetachMapArtifactInput,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async setMapArtifactStackActive(
    _projectId: string,
    _stackId: string,
    _artifactId: string,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async reorderMapArtifactStack(
    _projectId: string,
    _stackId: string,
    _input: import("../../contracts/map-content.js").ReorderMapArtifactStackInput,
  ): Promise<import("../../contracts/map-content.js").MapArtifact> {
    return transportNotConnected();
  }

  async applyMapWorkGroupMutation(
    _projectId: string,
    _input: import("../../contracts/map-work-group.js").MapWorkGroupMutationInput,
  ): Promise<import("../../contracts/map-content.js").MapContentDocument> {
    return transportNotConnected();
  }

  async updateMapWorkGroup(
    _projectId: string,
    _workGroupId: string,
    _patch: import("../../contracts/map-work-group.js").UpdateMapWorkGroupPatch,
  ): Promise<import("../../contracts/map-content.js").MapContentDocument> {
    return transportNotConnected();
  }

  async transcribeAudio(
    _request: import("../../contracts/voice-input.js").TranscribeAudioRequest,
  ): Promise<import("../../contracts/voice-input.js").TranscribeAudioResult> {
    return transportNotConnected();
  }
}
