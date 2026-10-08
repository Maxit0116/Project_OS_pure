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

  async getProjectGraph(_projectId: string): Promise<ProjectGraph> {
    return transportNotConnected();
  }

  async getSemanticTree(_projectId: string): Promise<SemanticTree> {
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

  async askAgent(_request: AgentAskRequest): Promise<AgentAnswerResult> {
    return transportNotConnected();
  }

  async listSkills(_projectId: string) {
    return transportNotConnected();
  }

  async getSkill(_projectId: string, _skillId: string) {
    return transportNotConnected();
  }

  async createPlan(_request: import("../../contracts/implementation-plan.js").CreatePlanRequest): Promise<import("../../contracts/implementation-plan.js").ImplementationPlan> {
    return transportNotConnected();
  }

  async updatePlan(_request: import("../../contracts/implementation-plan.js").UpdatePlanRequest): Promise<import("../../contracts/implementation-plan.js").ImplementationPlan> {
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
