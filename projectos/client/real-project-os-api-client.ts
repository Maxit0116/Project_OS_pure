import type { AgentRun } from "../contracts/agent-run.js";
import type { RunCheckpoint, RunDecision } from "../contracts/run-state.js";
import type { GlobalContextBundle, NodeContextBundle } from "../contracts/local-context.js";
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
import type {
  StructureScanProgress,
  StructureScanProgressEvent,
} from "../contracts/structure-scan-progress.js";
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
import type { ExecutorOption } from "../contracts/executor-selection.js";
import type { ListSkillsResult, SkillContent } from "../contracts/skills.js";
import type { AgentHarnessConfig } from "../contracts/agent-harness-config.js";
import type {
  AgentMemoryDocument,
  MemoryAdmissionState,
  MemoryCandidate,
  MemorySettingsPatch,
} from "../contracts/agent-memory.js";
import type {
  AgentWorktreeRecord,
  CreateAgentWorktreeOptions,
  MergeAgentWorktreeOptions,
} from "../contracts/agent-worktree.js";
import type {
  LocationHint,
  ResolvedSpatialPin,
  SpatialPin,
  SpatialPinHead,
  SubmitSpatialPinResult,
} from "../contracts/spatial-pin.js";
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

  getStructureScanProgress(
    projectId: string,
  ): Promise<StructureScanProgress | null> {
    return this.transport.getStructureScanProgress(projectId);
  }

  streamStructureScan(
    projectId: string,
    cb: (event: StructureScanProgressEvent) => void,
  ): Disposable {
    return this.transport.streamStructureScan(projectId, cb);
  }

  cancelStructureScan(projectId: string): Promise<boolean> {
    return this.transport.cancelStructureScan(projectId);
  }

  cancelAsk(projectId: string): Promise<boolean> {
    return this.transport.cancelAsk(projectId);
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

  assignFileOwner(projectId: string, filePath: string, nodeId: string): Promise<ProjectGraph> {
    return this.transport.assignFileOwner(projectId, filePath, nodeId);
  }

  getWorkspaceGitStatus(projectId: string) {
    return this.transport.getWorkspaceGitStatus(projectId);
  }

  listWorkspaceGitBranches(projectId: string) {
    return this.transport.listWorkspaceGitBranches(projectId);
  }

  listWorkspaceGitCommits(
    projectId: string,
    input: { limit?: number; tips?: string[] } = {},
  ) {
    return this.transport.listWorkspaceGitCommits(projectId, input);
  }

  getWorkspaceGitCommit(
    projectId: string,
    sha: string,
    input: { includePatch?: boolean } = {},
  ) {
    return this.transport.getWorkspaceGitCommit(projectId, sha, input);
  }

  getGithubGraphStore(projectId: string) {
    return this.transport.getGithubGraphStore(projectId);
  }

  upsertGithubGraphFeature(
    projectId: string,
    feature: import("../contracts/github-domain.js").GithubFeature,
  ) {
    return this.transport.upsertGithubGraphFeature(projectId, feature);
  }

  deleteGithubGraphFeature(projectId: string, featureId: string) {
    return this.transport.deleteGithubGraphFeature(projectId, featureId);
  }

  upsertGithubGraphRelation(
    projectId: string,
    relation: import("../contracts/github-domain.js").GithubRelation,
  ) {
    return this.transport.upsertGithubGraphRelation(projectId, relation);
  }

  removeGithubGraphRelation(projectId: string, relationId: string) {
    return this.transport.removeGithubGraphRelation(projectId, relationId);
  }

  checkoutWorkspaceBranch(projectId: string, branch: string) {
    return this.transport.checkoutWorkspaceBranch(projectId, branch);
  }

  createWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      from?: string;
      checkout?: boolean;
      push?: boolean;
    },
  ) {
    return this.transport.createWorkspaceBranch(projectId, input);
  }

  renameWorkspaceBranch(
    projectId: string,
    input: {
      from: string;
      to: string;
      push?: boolean;
      deleteRemoteOld?: boolean;
    },
  ) {
    return this.transport.renameWorkspaceBranch(projectId, input);
  }

  deleteWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      remote?: boolean;
      force?: boolean;
    },
  ) {
    return this.transport.deleteWorkspaceBranch(projectId, input);
  }

  rollbackWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      to?: string;
      mode?: "hard" | "mixed";
      push?: boolean;
    },
  ) {
    return this.transport.rollbackWorkspaceBranch(projectId, input);
  }

  fetchWorkspaceGit(projectId: string) {
    return this.transport.fetchWorkspaceGit(projectId);
  }

  pushWorkspaceBranch(projectId: string, branch: string) {
    return this.transport.pushWorkspaceBranch(projectId, branch);
  }

  pullWorkspaceBranch(projectId: string, branch: string) {
    return this.transport.pullWorkspaceBranch(projectId, branch);
  }

  revertWorkspaceCommit(
    projectId: string,
    input: { sha: string; push?: boolean },
  ) {
    return this.transport.revertWorkspaceCommit(projectId, input);
  }

  listWorkspacePullRequests(projectId: string) {
    return this.transport.listWorkspacePullRequests(projectId);
  }

  createWorkspacePullRequest(
    projectId: string,
    input: { title: string; head?: string; base?: string; body?: string },
  ) {
    return this.transport.createWorkspacePullRequest(projectId, input);
  }

  mergeWorkspacePullRequest(
    projectId: string,
    input: {
      number: number;
      mergeMethod?: "merge" | "squash" | "rebase";
    },
  ) {
    return this.transport.mergeWorkspacePullRequest(projectId, input);
  }

  closeWorkspacePullRequest(projectId: string, input: { number: number }) {
    return this.transport.closeWorkspacePullRequest(projectId, input);
  }

  listWorkspaceIssues(projectId: string) {
    return this.transport.listWorkspaceIssues(projectId);
  }

  createWorkspaceIssue(
    projectId: string,
    input: { title: string; body?: string },
  ) {
    return this.transport.createWorkspaceIssue(projectId, input);
  }

  listWorkspaceCommitCheckRuns(projectId: string, sha: string) {
    return this.transport.listWorkspaceCommitCheckRuns(projectId, sha);
  }

  getGitHubAuthStatus() {
    return this.transport.getGitHubAuthStatus();
  }

  beginGitHubOAuth() {
    return this.transport.beginGitHubOAuth();
  }

  cancelGitHubOAuth() {
    return this.transport.cancelGitHubOAuth();
  }

  disconnectGitHub() {
    return this.transport.disconnectGitHub();
  }

  getAccountProfile() {
    return this.transport.getAccountProfile();
  }

  saveGitHubOAuthClientId(clientId: string) {
    return this.transport.saveGitHubOAuthClientId(clientId);
  }

  importGitHubAuthFromGhCli() {
    return this.transport.importGitHubAuthFromGhCli();
  }

  getNodeContext(projectId: string, nodeId: string): Promise<ContextPayload> {
    return this.transport.getNodeContext(projectId, nodeId);
  }

  getFileContext(projectId: string, path: string): Promise<ContextPayload> {
    return this.transport.getFileContext(projectId, path);
  }

  getGlobalAgentContext(
    projectId: string,
    responseLanguage: string,
  ): Promise<GlobalContextBundle> {
    return this.transport.getGlobalAgentContext(projectId, responseLanguage);
  }

  extractRequestIntent(
    request: import("../contracts/request-intent.js").ExtractRequestIntentRequest,
  ): Promise<import("../contracts/request-intent.js").RequestIntent> {
    return this.transport.extractRequestIntent(request);
  }

  approveRequestIntent(
    projectId: string,
    intentId: string,
    expectedRevision: number,
    answers?: Array<{ questionId: string; answer: string; selectedOptionId?: string }>,
  ): Promise<import("../contracts/request-intent.js").RequestIntent> {
    return this.transport.approveRequestIntent(projectId, intentId, expectedRevision, answers);
  }

  prepareIntentExecution(
    projectId: string,
    intentId: string,
  ): Promise<PromptRefinement> {
    return this.transport.prepareIntentExecution(projectId, intentId);
  }

  inspectAgentNode(
    projectId: string,
    nodeId: string,
    responseLanguage: string,
  ): Promise<NodeContextBundle> {
    return this.transport.inspectAgentNode(projectId, nodeId, responseLanguage);
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

  judgeSessionAffinityHygiene(
    projectId: string,
    request: import("../contracts/session-affinity-llm.js").SessionAffinityHygieneJudgeRequest,
  ): Promise<import("../contracts/session-affinity-llm.js").SessionAffinityHygieneJudgeResponse> {
    return this.transport.judgeSessionAffinityHygiene(projectId, request);
  }

  judgeSessionAffinityRoute(
    projectId: string,
    request: import("../contracts/session-affinity-llm.js").SessionAffinityRouteJudgeRequest,
  ): Promise<import("../contracts/session-affinity-llm.js").SessionAffinityRouteJudgeResponse> {
    return this.transport.judgeSessionAffinityRoute(projectId, request);
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

  ensureCodeFileUnderstanding(
    projectId: string,
    path: string,
  ): Promise<import("../contracts/code-file-understanding.js").CodeFileUnderstandingEntry> {
    return this.transport.ensureCodeFileUnderstanding(projectId, path);
  }

  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return this.transport.askAgent(request);
  }

  listSkills(projectId: string): Promise<ListSkillsResult> {
    return this.transport.listSkills(projectId);
  }

  listExecutors(projectId: string): Promise<ExecutorOption[]> {
    return this.transport.listExecutors(projectId);
  }

  getComposerMentions(
    projectId: string,
    query: string,
  ): Promise<{ files: string[]; rules: Array<{ path: string; description: string }> }> {
    return this.transport.getComposerMentions(projectId, query);
  }

  getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    return this.transport.getSkill(projectId, skillId);
  }

  listAgentWorktrees(projectId: string): Promise<AgentWorktreeRecord[]> {
    return this.transport.listAgentWorktrees(projectId);
  }

  createAgentWorktree(
    projectId: string,
    options?: CreateAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord> {
    return this.transport.createAgentWorktree(projectId, options);
  }

  mergeAgentWorktree(
    projectId: string,
    options: MergeAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord> {
    return this.transport.mergeAgentWorktree(projectId, options);
  }

  removeAgentWorktree(
    projectId: string,
    worktreeId: string,
    options?: { deleteBranch?: boolean },
  ): Promise<AgentWorktreeRecord> {
    return this.transport.removeAgentWorktree(projectId, worktreeId, options);
  }

  getAgentWorktreeDiff(projectId: string, worktreeId: string): Promise<string> {
    return this.transport.getAgentWorktreeDiff(projectId, worktreeId);
  }

  getAgentHarnessConfig(projectId: string): Promise<AgentHarnessConfig> {
    return this.transport.getAgentHarnessConfig(projectId);
  }

  saveAgentHarnessConfig(
    projectId: string,
    config: AgentHarnessConfig,
  ): Promise<AgentHarnessConfig> {
    return this.transport.saveAgentHarnessConfig(projectId, config);
  }

  getAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    return this.transport.getAgentMemory(projectId);
  }

  getAgentMemoryTopic(projectId: string, topicFile: string): Promise<string> {
    return this.transport.getAgentMemoryTopic(projectId, topicFile);
  }

  saveAgentMemorySettings(
    projectId: string,
    patch: MemorySettingsPatch,
  ): Promise<AgentMemoryDocument> {
    return this.transport.saveAgentMemorySettings(projectId, patch);
  }

  submitAgentMemory(
    projectId: string,
    candidate: MemoryCandidate,
  ): Promise<AgentMemoryDocument> {
    return this.transport.submitAgentMemory(projectId, candidate);
  }

  setAgentMemoryEntryState(
    projectId: string,
    text: string,
    state: MemoryAdmissionState,
  ): Promise<AgentMemoryDocument> {
    return this.transport.setAgentMemoryEntryState(projectId, text, state);
  }

  deleteAgentMemoryEntry(
    projectId: string,
    text: string,
  ): Promise<AgentMemoryDocument> {
    return this.transport.deleteAgentMemoryEntry(projectId, text);
  }

  consolidateAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    return this.transport.consolidateAgentMemory(projectId);
  }

  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan> {
    return this.transport.createPlan(request);
  }

  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan> {
    return this.transport.updatePlan(request);
  }

  savePlanToWorkspace(planId: string): Promise<{ path: string }> {
    return this.transport.savePlanToWorkspace(planId);
  }

  listWorkspacePlans(projectId: string): Promise<import("../contracts/implementation-plan.js").WorkspacePlanSummary[]> {
    return this.transport.listWorkspacePlans(projectId);
  }

  loadPlanFromWorkspace(projectId: string, planId: string): Promise<ImplementationPlan> {
    return this.transport.loadPlanFromWorkspace(projectId, planId);
  }

  buildPlan(planId: string): Promise<PromptRefinement> {
    return this.transport.buildPlan(planId);
  }

  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    return this.transport.refinePrompt(request);
  }

  confirmAlignment(
    request: import("../contracts/alignment-contract.js").ConfirmAlignmentRequest,
  ): Promise<PromptRefinement> {
    return this.transport.confirmAlignment(request);
  }

  confirmExecution(refinementId: string): Promise<AgentRun> {
    return this.transport.confirmExecution(refinementId);
  }

  cancelAgentRun(runId: string): Promise<AgentRun> {
    return this.transport.cancelAgentRun(runId);
  }

  pauseAgentRun(runId: string): Promise<AgentRun> {
    return this.transport.pauseAgentRun(runId);
  }

  continueAgentRun(runId: string): Promise<AgentRun> {
    return this.transport.continueAgentRun(runId);
  }

  getAgentRun(runId: string): Promise<AgentRun> {
    return this.transport.getAgentRun(runId);
  }

  listRunDecisions(projectId: string, rootRunId: string): Promise<RunDecision[]> {
    return this.transport.listRunDecisions(projectId, rootRunId);
  }

  resolveRunDecision(
    projectId: string,
    decisionId: string,
    expectedRevision: number,
    answer: { optionId: string; text?: string },
    status?: "resolved" | "declined",
  ): Promise<RunDecision> {
    return this.transport.resolveRunDecision(
      projectId,
      decisionId,
      expectedRevision,
      answer,
      status,
    );
  }

  getRunCheckpoint(projectId: string, checkpointId: string): Promise<RunCheckpoint | null> {
    return this.transport.getRunCheckpoint(projectId, checkpointId);
  }

  getAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
    return this.transport.getAgentRunEvents(runId);
  }

  getAgentRunEventSnapshot(
    runId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunEventSnapshot> {
    return this.transport.getAgentRunEventSnapshot(runId);
  }

  ensureAgentPoolRun(
    request: import("../contracts/agent-pool-trace.js").EnsureAgentPoolRunRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentPoolRun> {
    return this.transport.ensureAgentPoolRun(request);
  }

  getAgentPoolRun(
    poolRunId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentPoolRun> {
    return this.transport.getAgentPoolRun(poolRunId);
  }

  listAgentRunsByDefinition(
    request: import("../contracts/agent-pool-trace.js").ListAgentRunsByDefinitionRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunIndexEntry[]> {
    return this.transport.listAgentRunsByDefinition(request);
  }

  setAgentRunAcceptance(
    request: import("../contracts/agent-pool-trace.js").SetAgentRunAcceptanceRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentRunIndexEntry> {
    return this.transport.setAgentRunAcceptance(request);
  }

  listWorkforceAgents(
    request: import("../contracts/agent-workforce.js").ListWorkforceAgentsRequest,
  ): Promise<import("../contracts/agent-workforce.js").ListWorkforceAgentsResult> {
    return this.transport.listWorkforceAgents(request);
  }

  draftWorkforceAgent(
    request: import("../contracts/agent-workforce.js").DraftWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-workforce.js").DraftWorkforceAgentResult> {
    return this.transport.draftWorkforceAgent(request);
  }

  assembleWorkforceAgent(
    request: import("../contracts/agent-assembly.js").AssembleWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-assembly.js").AssembleWorkforceAgentResult> {
    return this.transport.assembleWorkforceAgent(request);
  }

  createWorkforceAgent(
    request: import("../contracts/agent-workforce.js").CreateWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    return this.transport.createWorkforceAgent(request);
  }

  updateWorkforceAgent(
    request: import("../contracts/agent-workforce.js").UpdateWorkforceAgentRequest,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    return this.transport.updateWorkforceAgent(request);
  }

  getWorkforceAgent(
    projectId: string,
    definitionId: string,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    return this.transport.getWorkforceAgent(projectId, definitionId);
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

  applyDespiteUnmetRequirements(runId: string): Promise<ApplyResult> {
    return this.transport.applyDespiteUnmetRequirements(runId);
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

  confirmBugAlignment(
    request: import("../contracts/alignment-contract.js").ConfirmBugAlignmentRequest,
  ): Promise<import("../contracts/debug-session.js").DebugSession> {
    return this.transport.confirmBugAlignment(request);
  }

  markBugFixed(
    request: import("../contracts/alignment-contract.js").MarkBugFixedRequest,
  ): Promise<import("../contracts/debug-session.js").DebugSession> {
    return this.transport.markBugFixed(request);
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

  listMcpServers(
    projectId: string,
  ): Promise<import("../contracts/settings.js").McpServerConfig[]> {
    return this.transport.listMcpServers(projectId);
  }

  saveMcpServer(
    projectId: string,
    input: {
      config: import("../contracts/settings.js").McpServerConfig;
      authToken?: string;
    },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.saveMcpServer(projectId, input);
  }

  deleteMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.deleteMcpServer(projectId, serverId);
  }

  testMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<import("../contracts/settings.js").ConnectionTestResult> {
    return this.transport.testMcpServer(projectId, serverId);
  }

  refreshMcpTools(
    projectId: string,
    serverId: string,
  ): Promise<import("../contracts/settings.js").McpToolDescriptor[]> {
    return this.transport.refreshMcpTools(projectId, serverId);
  }

  listMcpCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/mcp-catalog.js").McpCatalogView> {
    return this.transport.listMcpCatalog(projectId, options);
  }

  refreshMcpCatalog(
    projectId: string,
  ): Promise<import("../contracts/mcp-catalog.js").McpCatalogView> {
    return this.transport.refreshMcpCatalog(projectId);
  }

  installMcpFromCatalog(
    projectId: string,
    input: import("../contracts/mcp-catalog.js").InstallMcpFromCatalogInput,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.installMcpFromCatalog(projectId, input);
  }

  disableMcpCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableMcpCatalogListing(projectId, listingId);
  }

  reportMcpCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportMcpCatalogListing(projectId, input);
  }

  listSkillCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/skill-marketplace.js").SkillCatalogView> {
    return this.transport.listSkillCatalog(projectId, options);
  }

  refreshSkillCatalog(
    projectId: string,
  ): Promise<import("../contracts/skill-marketplace.js").SkillCatalogView> {
    return this.transport.refreshSkillCatalog(projectId);
  }

  installSkillFromCatalog(
    projectId: string,
    input: import("../contracts/skill-marketplace.js").InstallSkillFromCatalogInput,
  ): Promise<import("../contracts/skills.js").SkillDescriptor> {
    return this.transport.installSkillFromCatalog(projectId, input);
  }

  uninstallSkillFromCatalog(
    projectId: string,
    input: import("../contracts/skill-marketplace.js").UninstallSkillFromCatalogInput,
  ): Promise<void> {
    return this.transport.uninstallSkillFromCatalog(projectId, input);
  }

  disableSkillCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableSkillCatalogListing(projectId, listingId);
  }

  reportSkillCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportSkillCatalogListing(projectId, input);
  }

  listRulesCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/rules-marketplace.js").RulesCatalogView> {
    return this.transport.listRulesCatalog(projectId, options);
  }

  refreshRulesCatalog(
    projectId: string,
  ): Promise<import("../contracts/rules-marketplace.js").RulesCatalogView> {
    return this.transport.refreshRulesCatalog(projectId);
  }

  installRulesFromCatalog(
    projectId: string,
    input: import("../contracts/rules-marketplace.js").InstallRulesFromCatalogInput,
  ): Promise<{ packId: string; relativeRoot: string }> {
    return this.transport.installRulesFromCatalog(projectId, input);
  }

  uninstallRulesFromCatalog(
    projectId: string,
    input: import("../contracts/rules-marketplace.js").UninstallRulesFromCatalogInput,
  ): Promise<void> {
    return this.transport.uninstallRulesFromCatalog(projectId, input);
  }

  disableRulesCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableRulesCatalogListing(projectId, listingId);
  }

  reportRulesCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportRulesCatalogListing(projectId, input);
  }

  listInstalledRulesPackIds(projectId: string): Promise<string[]> {
    return this.transport.listInstalledRulesPackIds(projectId);
  }

  listAgentCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/agent-marketplace.js").AgentCatalogView> {
    return this.transport.listAgentCatalog(projectId, options);
  }

  refreshAgentCatalog(
    projectId: string,
  ): Promise<import("../contracts/agent-marketplace.js").AgentCatalogView> {
    return this.transport.refreshAgentCatalog(projectId);
  }

  installAgentFromCatalog(
    projectId: string,
    input: import("../contracts/agent-marketplace.js").InstallAgentFromCatalogInput,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    return this.transport.installAgentFromCatalog(projectId, input);
  }

  uninstallAgentFromCatalog(
    projectId: string,
    input: import("../contracts/agent-marketplace.js").UninstallAgentFromCatalogInput,
  ): Promise<void> {
    return this.transport.uninstallAgentFromCatalog(projectId, input);
  }

  disableAgentCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableAgentCatalogListing(projectId, listingId);
  }

  reportAgentCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportAgentCatalogListing(projectId, input);
  }

  listInstalledMarketplaceAgentListingIds(projectId: string): Promise<string[]> {
    return this.transport.listInstalledMarketplaceAgentListingIds(projectId);
  }

  exportCapabilityPack(
    projectId: string,
    input: import("../contracts/agent-marketplace.js").ExportCapabilityPackInput,
  ): Promise<import("../contracts/agent-marketplace.js").ExportCapabilityPackResult> {
    return this.transport.exportCapabilityPack(projectId, input);
  }

  installAgentFromExportPack(
    projectId: string,
    input: import("../contracts/agent-marketplace.js").InstallAgentFromExportPackInput,
  ): Promise<import("../contracts/agent-pool-trace.js").AgentDefinition> {
    return this.transport.installAgentFromExportPack(projectId, input);
  }

  installRulesFromExportPack(
    projectId: string,
    input: import("../contracts/agent-marketplace.js").InstallRulesFromExportPackInput,
  ): Promise<{ packId: string; relativeRoot: string }> {
    return this.transport.installRulesFromExportPack(projectId, input);
  }

  listWorkflowCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/workflow-marketplace.js").WorkflowCatalogView> {
    return this.transport.listWorkflowCatalog(projectId, options);
  }

  refreshWorkflowCatalog(
    projectId: string,
  ): Promise<import("../contracts/workflow-marketplace.js").WorkflowCatalogView> {
    return this.transport.refreshWorkflowCatalog(projectId);
  }

  installWorkflowFromCatalog(
    projectId: string,
    input: import("../contracts/workflow-marketplace.js").InstallWorkflowFromCatalogInput,
  ): Promise<import("../contracts/loop-presets.js").LoopGraphPreset> {
    return this.transport.installWorkflowFromCatalog(projectId, input);
  }

  uninstallWorkflowFromCatalog(
    projectId: string,
    input: import("../contracts/workflow-marketplace.js").UninstallWorkflowFromCatalogInput,
  ): Promise<void> {
    return this.transport.uninstallWorkflowFromCatalog(projectId, input);
  }

  disableWorkflowCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableWorkflowCatalogListing(projectId, listingId);
  }

  reportWorkflowCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportWorkflowCatalogListing(projectId, input);
  }

  listInstalledWorkflowListingIds(projectId: string): Promise<string[]> {
    return this.transport.listInstalledWorkflowListingIds(projectId);
  }

  listLoopGraphPresets(projectId: string): Promise<{
    builtins: import("../contracts/loop-presets.js").LoopGraphPreset[];
    user: import("../contracts/loop-presets.js").LoopGraphPreset[];
  }> {
    return this.transport.listLoopGraphPresets(projectId);
  }

  resolveLoopGraphPreset(
    projectId: string,
    presetId: string,
  ): Promise<import("../contracts/loop-presets.js").LoopGraphPreset | null> {
    return this.transport.resolveLoopGraphPreset(projectId, presetId);
  }

  installWorkflowFromExportPack(
    projectId: string,
    input: import("../contracts/workflow-marketplace.js").InstallWorkflowFromExportPackInput,
  ): Promise<import("../contracts/loop-presets.js").LoopGraphPreset> {
    return this.transport.installWorkflowFromExportPack(projectId, input);
  }

  listStencilCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../contracts/stencil-marketplace.js").StencilCatalogView> {
    return this.transport.listStencilCatalog(projectId, options);
  }

  refreshStencilCatalog(
    projectId: string,
  ): Promise<import("../contracts/stencil-marketplace.js").StencilCatalogView> {
    return this.transport.refreshStencilCatalog(projectId);
  }

  installStencilFromCatalog(
    projectId: string,
    input: import("../contracts/stencil-marketplace.js").InstallStencilFromCatalogInput,
  ): Promise<import("../contracts/ui-stencil.js").StencilDefinition[]> {
    return this.transport.installStencilFromCatalog(projectId, input);
  }

  uninstallStencilFromCatalog(
    projectId: string,
    input: import("../contracts/stencil-marketplace.js").UninstallStencilFromCatalogInput,
  ): Promise<void> {
    return this.transport.uninstallStencilFromCatalog(projectId, input);
  }

  disableStencilCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.disableStencilCatalogListing(projectId, listingId);
  }

  reportStencilCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<import("../contracts/settings.js").ProjectOSSettings> {
    return this.transport.reportStencilCatalogListing(projectId, input);
  }

  listInstalledStencilListingIds(projectId: string): Promise<string[]> {
    return this.transport.listInstalledStencilListingIds(projectId);
  }

  listMergedStencilDefinitions(
    projectId: string,
  ): Promise<import("../contracts/ui-stencil.js").StencilDefinition[]> {
    return this.transport.listMergedStencilDefinitions(projectId);
  }

  installStencilFromExportPack(
    projectId: string,
    input: import("../contracts/stencil-marketplace.js").InstallStencilFromExportPackInput,
  ): Promise<import("../contracts/ui-stencil.js").StencilDefinition[]> {
    return this.transport.installStencilFromExportPack(projectId, input);
  }

  installFromGitUrl(
    projectId: string,
    input: import("../contracts/marketplace-git-install.js").InstallFromGitUrlInput,
  ): Promise<import("../contracts/marketplace-git-install.js").InstallFromGitUrlResult> {
    return this.transport.installFromGitUrl(projectId, input);
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

  listSpatialPins(projectId: string): Promise<SpatialPinHead[]> {
    return this.transport.listSpatialPins(projectId);
  }

  getSpatialPin(projectId: string, pinId: string): Promise<SpatialPin | null> {
    return this.transport.getSpatialPin(projectId, pinId);
  }

  upsertSpatialPin(projectId: string, pin: SpatialPin): Promise<SpatialPin> {
    return this.transport.upsertSpatialPin(projectId, pin);
  }

  deleteSpatialPin(projectId: string, pinId: string): Promise<boolean> {
    return this.transport.deleteSpatialPin(projectId, pinId);
  }

  resolveSpatialPins(
    projectId: string,
    locationHint: LocationHint,
  ): Promise<ResolvedSpatialPin[]> {
    return this.transport.resolveSpatialPins(projectId, locationHint);
  }

  submitSpatialPin(
    projectId: string,
    pinId: string,
  ): Promise<SubmitSpatialPinResult> {
    return this.transport.submitSpatialPin(projectId, pinId);
  }

  saveSpatialPinSnapshot(
    projectId: string,
    pinId: string,
    pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }> {
    return this.transport.saveSpatialPinSnapshot(projectId, pinId, pngBase64);
  }

  getRepoDesignSystem(projectId: string) {
    return this.transport.getRepoDesignSystem(projectId);
  }

  listSpatialCaptureSessions(projectId: string) {
    return this.transport.listSpatialCaptureSessions(projectId);
  }

  getSpatialCaptureSession(projectId: string, sessionId: string) {
    return this.transport.getSpatialCaptureSession(projectId, sessionId);
  }

  upsertSpatialCaptureSession(
    projectId: string,
    session: import("../contracts/spatial-capture-session.js").SpatialCaptureSession,
  ) {
    return this.transport.upsertSpatialCaptureSession(projectId, session);
  }

  deleteSpatialCaptureSession(projectId: string, sessionId: string) {
    return this.transport.deleteSpatialCaptureSession(projectId, sessionId);
  }

  listSpatialCaptureFolders(projectId: string) {
    return this.transport.listSpatialCaptureFolders(projectId);
  }

  placeSpatialCaptureSession(
    projectId: string,
    sessionId: string,
    placement: import("../contracts/spatial-capture-session.js").SpatialCapturePlacement,
  ) {
    return this.transport.placeSpatialCaptureSession(
      projectId,
      sessionId,
      placement,
    );
  }

  renameSpatialCaptureFolder(
    projectId: string,
    folderId: string,
    name: string,
  ) {
    return this.transport.renameSpatialCaptureFolder(
      projectId,
      folderId,
      name,
    );
  }

  deleteSpatialCaptureFolder(
    projectId: string,
    folderId: string,
    options: import("../contracts/spatial-capture-session.js").DeleteSpatialCaptureFolderOptions = {
      cascade: false,
    },
  ) {
    return this.transport.deleteSpatialCaptureFolder(
      projectId,
      folderId,
      options,
    );
  }

  mergeSpatialCaptureFolders(
    projectId: string,
    sourceFolderId: string,
    targetFolderId: string,
    options: import("../contracts/spatial-capture-session.js").MergeSpatialCaptureFoldersOptions = {},
  ) {
    return this.transport.mergeSpatialCaptureFolders(
      projectId,
      sourceFolderId,
      targetFolderId,
      options,
    );
  }

  suggestCaptureVersionTitle(
    projectId: string,
    target: { folderId: string } | { folderName: string },
  ) {
    return this.transport.suggestCaptureVersionTitle(projectId, target);
  }

  saveSpatialCaptureBackdrop(
    projectId: string,
    sessionId: string,
    pngBase64: string,
  ) {
    return this.transport.saveSpatialCaptureBackdrop(
      projectId,
      sessionId,
      pngBase64,
    );
  }

  readProjectAssetBase64(projectId: string, relativePath: string) {
    return this.transport.readProjectAssetBase64(projectId, relativePath);
  }

  listLoopGraphs(projectId: string) {
    return this.transport.listLoopGraphs(projectId);
  }

  getLoopGraphIndex(projectId: string) {
    return this.transport.getLoopGraphIndex(projectId);
  }

  getLoopGraph(projectId: string, loopId: string) {
    return this.transport.getLoopGraph(projectId, loopId);
  }

  upsertLoopGraph(
    projectId: string,
    document: import("../contracts/loop-graph.js").LoopGraphDocument,
  ) {
    return this.transport.upsertLoopGraph(projectId, document);
  }

  createLoopGraph(projectId: string, title?: string) {
    return this.transport.createLoopGraph(projectId, title);
  }

  deleteLoopGraph(projectId: string, loopId: string) {
    return this.transport.deleteLoopGraph(projectId, loopId);
  }

  setLastActiveLoopGraph(projectId: string, loopId: string) {
    return this.transport.setLastActiveLoopGraph(projectId, loopId);
  }

  linkLoopGraphToSession(projectId: string, loopId: string, sessionId: string) {
    return this.transport.linkLoopGraphToSession(projectId, loopId, sessionId);
  }

  unlinkLoopGraphFromSession(projectId: string, loopId: string, sessionId: string) {
    return this.transport.unlinkLoopGraphFromSession(projectId, loopId, sessionId);
  }

  compileLoopGraph(projectId: string, loopId: string) {
    return this.transport.compileLoopGraph(projectId, loopId);
  }

  approveLoopSpec(
    projectId: string,
    loopId: string,
    spec: import("../contracts/loop-graph.js").LoopSpec,
  ) {
    return this.transport.approveLoopSpec(projectId, loopId, spec);
  }

  preflightLoopRun(
    projectId: string,
    loopId: string,
    options?: {
      specVersion?: string;
      branch?: string;
      materials?: import("../contracts/loop-task-materials.js").LoopTaskMaterial[];
    },
  ) {
    return this.transport.preflightLoopRun(projectId, loopId, options);
  }

  startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
    featureNodeId?: string,
    options?: {
      branch?: string;
      materials?: import("../contracts/loop-task-materials.js").LoopTaskMaterial[];
      skipPreflight?: boolean;
    },
  ) {
    return this.transport.startLoopInstance(
      projectId,
      loopId,
      specVersion,
      featureNodeId,
      options,
    );
  }

  startLoopInstanceWithParams(
    projectId: string,
    loopId: string,
    params: Record<string, unknown>,
    options?: { specVersion?: string; idempotencyKey?: string },
  ) {
    return this.transport.startLoopInstanceWithParams(projectId, loopId, params, options);
  }

  startLoopInstanceFromEvent(
    projectId: string,
    loopId: string,
    event: { eventId: string; eventType: string; payload?: Record<string, unknown> },
  ) {
    return this.transport.startLoopInstanceFromEvent(projectId, loopId, event);
  }

  restoreLoopInstanceFromCheckpoint(
    projectId: string,
    loopId: string,
    instanceId: string,
  ) {
    return this.transport.restoreLoopInstanceFromCheckpoint(projectId, loopId, instanceId);
  }

  listLoopRunHistory(projectId: string, loopId: string) {
    return this.transport.listLoopRunHistory(projectId, loopId);
  }

  deriveDraftFromLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ) {
    return this.transport.deriveDraftFromLoopInstance(projectId, loopId, instanceId);
  }

  pauseLoopInstance(projectId: string, loopId: string, instanceId: string) {
    return this.transport.pauseLoopInstance(projectId, loopId, instanceId);
  }

  cancelLoopInstance(projectId: string, loopId: string, instanceId: string) {
    return this.transport.cancelLoopInstance(projectId, loopId, instanceId);
  }

  resumeLoopInstance(projectId: string, loopId: string, instanceId: string) {
    return this.transport.resumeLoopInstance(projectId, loopId, instanceId);
  }

  resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: import("../contracts/loop-graph.js").LoopHitlAnswer[],
  ) {
    return this.transport.resolveLoopHitl(projectId, loopId, instanceId, answers);
  }

  getLoopInstanceEvents(projectId: string, loopId: string, instanceId: string) {
    return this.transport.getLoopInstanceEvents(projectId, loopId, instanceId);
  }

  advanceLoopInstance(projectId: string, loopId: string, instanceId: string) {
    return this.transport.advanceLoopInstance(projectId, loopId, instanceId);
  }

  sendLoopAuthoringTurn(
    projectId: string,
    loopId: string,
    request: import("../contracts/loop-graph.js").LoopAuthoringTurnRequest,
  ) {
    return this.transport.sendLoopAuthoringTurn(projectId, loopId, request);
  }

  setLoopAuthoringLoopbackMode(mode: "off" | "demo_edit") {
    return this.transport.setLoopAuthoringLoopbackMode(mode);
  }

  answerLoopGoalClarification(
    projectId: string,
    loopId: string,
    answers: import("../contracts/loop-graph.js").LoopGoalClarificationAnswer[],
  ) {
    return this.transport.answerLoopGoalClarification(projectId, loopId, answers);
  }

  cancelLoopGoalClarification(projectId: string, loopId: string) {
    return this.transport.cancelLoopGoalClarification(projectId, loopId);
  }

  confirmLoopGoalContext(projectId: string, loopId: string) {
    return this.transport.confirmLoopGoalContext(projectId, loopId);
  }

  acceptLoopGraphEditOffer(projectId: string, loopId: string) {
    return this.transport.acceptLoopGraphEditOffer(projectId, loopId);
  }

  dismissLoopGraphEditOffer(projectId: string, loopId: string) {
    return this.transport.dismissLoopGraphEditOffer(projectId, loopId);
  }

  undoLoopDraft(projectId: string, loopId: string) {
    return this.transport.undoLoopDraft(projectId, loopId);
  }

  redoLoopDraft(projectId: string, loopId: string) {
    return this.transport.redoLoopDraft(projectId, loopId);
  }

  setLoopComposerMode(
    projectId: string,
    loopId: string,
    mode: import("../contracts/loop-graph.js").LoopComposerMode,
  ) {
    return this.transport.setLoopComposerMode(projectId, loopId, mode);
  }

  ensureDiagramDesignSkill(projectId: string) {
    return this.transport.ensureDiagramDesignSkill(projectId);
  }

  getDiagramSkillPackStatus(projectId: string) {
    return this.transport.getDiagramSkillPackStatus(projectId);
  }

  getDiagramIndex(projectId: string) {
    return this.transport.getDiagramIndex(projectId);
  }

  listDiagrams(projectId: string) {
    return this.transport.listDiagrams(projectId);
  }

  getDiagram(projectId: string, diagramId: string) {
    return this.transport.getDiagram(projectId, diagramId);
  }

  deleteDiagram(projectId: string, diagramId: string) {
    return this.transport.deleteDiagram(projectId, diagramId);
  }

  updateDiagramNotes(
    projectId: string,
    diagramId: string,
    input: import("../contracts/diagram-graph.js").UpdateDiagramNotesInput,
  ) {
    return this.transport.updateDiagramNotes(projectId, diagramId, input);
  }

  chooseDiagramStyle(
    projectId: string,
    input: import("../contracts/diagram-graph.js").ChooseDiagramStyleInput,
  ) {
    return this.transport.chooseDiagramStyle(projectId, input);
  }

  generateDiagram(
    projectId: string,
    input: import("../contracts/diagram-graph.js").GenerateDiagramInput,
  ) {
    return this.transport.generateDiagram(projectId, input);
  }

  listWireframePacks(projectId: string) {
    return this.transport.listWireframePacks(projectId);
  }

  getWireframePackIndex(projectId: string) {
    return this.transport.getWireframePackIndex(projectId);
  }

  getWireframePack(projectId: string, packId: string) {
    return this.transport.getWireframePack(projectId, packId);
  }

  generateWireframePack(
    projectId: string,
    input: import("../contracts/ui-wireframe-pack.js").GenerateWireframePackInput,
  ) {
    return this.transport.generateWireframePack(projectId, input);
  }

  updateWireframePackDraft(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").UpdateWireframePackDraftInput,
  ) {
    return this.transport.updateWireframePackDraft(projectId, packId, input);
  }

  deleteWireframeScreen(projectId: string, packId: string, screenId: string) {
    return this.transport.deleteWireframeScreen(projectId, packId, screenId);
  }

  freezeWireframePack(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").FreezeWireframePackInput = {},
  ) {
    return this.transport.freezeWireframePack(projectId, packId, input);
  }

  buildImplementAgainstPackBrief(projectId: string, packId: string) {
    return this.transport.buildImplementAgainstPackBrief(projectId, packId);
  }

  listWireframeGaps(projectId: string, packId: string) {
    return this.transport.listWireframeGaps(projectId, packId);
  }

  upsertWireframeGap(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").UpsertWireframeGapInput,
  ) {
    return this.transport.upsertWireframeGap(projectId, packId, input);
  }

  scanWireframeStructGaps(
    projectId: string,
    packId: string,
    input: import("../contracts/ui-wireframe-pack.js").ScanWireframeStructGapsInput = {},
  ) {
    return this.transport.scanWireframeStructGaps(projectId, packId, input);
  }

  bindWireframePackFeature(projectId: string, packId: string, featureId: string) {
    return this.transport.bindWireframePackFeature(projectId, packId, featureId);
  }

  markWireframePackRealized(projectId: string, packId: string) {
    return this.transport.markWireframePackRealized(projectId, packId);
  }

  deleteWireframePack(projectId: string, packId: string) {
    return this.transport.deleteWireframePack(projectId, packId);
  }

  getLabState(projectId: string) {
    return this.transport.getLabState(projectId);
  }

  upsertLabState(
    projectId: string,
    document: import("../contracts/product-lab.js").LabStateDocument,
  ) {
    return this.transport.upsertLabState(projectId, document);
  }

  getLabLaunchProfile(projectId: string) {
    return this.transport.getLabLaunchProfile(projectId);
  }

  listTheses(projectId: string) {
    return this.transport.listTheses(projectId);
  }

  getThesisSession(projectId: string, sessionId: string) {
    return this.transport.getThesisSession(projectId, sessionId);
  }

  upsertThesisSession(
    projectId: string,
    session: import("../contracts/first-principles.js").FirstPrinciplesSession,
  ) {
    return this.transport.upsertThesisSession(projectId, session);
  }

  startFirstPrinciplesSession(
    request: import("../contracts/first-principles.js").StartFirstPrinciplesRequest,
  ) {
    return this.transport.startFirstPrinciplesSession(request);
  }

  answerFirstPrinciplesTurn(
    request: import("../contracts/first-principles.js").AnswerFirstPrinciplesRequest,
  ) {
    return this.transport.answerFirstPrinciplesTurn(request);
  }

  resolveFirstPrinciplesConflict(
    request: import("../contracts/first-principles.js").ResolveFirstPrinciplesConflictRequest,
  ) {
    return this.transport.resolveFirstPrinciplesConflict(request);
  }

  writeFirstPrinciplesPlannedFeature(
    request: import("../contracts/first-principles.js").WriteFirstPrinciplesFeatureRequest,
  ) {
    return this.transport.writeFirstPrinciplesPlannedFeature(request);
  }

  getReminderTimeline(projectId: string) {
    return this.transport.getReminderTimeline(projectId);
  }

  syncReminderTimeline(projectId: string) {
    return this.transport.syncReminderTimeline(projectId);
  }

  reorderReminderItem(
    projectId: string,
    input: import("../contracts/reminder-graph.js").ReminderReorderInput,
  ) {
    return this.transport.reorderReminderItem(projectId, input);
  }

  acceptReminderEditOffer(projectId: string) {
    return this.transport.acceptReminderEditOffer(projectId);
  }

  dismissReminderEditOffer(projectId: string) {
    return this.transport.dismissReminderEditOffer(projectId);
  }

  setReminderMilestoneStatus(
    projectId: string,
    input: import("../contracts/reminder-graph.js").ReminderMilestoneCompleteInput,
  ) {
    return this.transport.setReminderMilestoneStatus(projectId, input);
  }

  sendReminderAuthoringTurn(
    projectId: string,
    request: import("../contracts/reminder-graph.js").ReminderAuthoringTurnRequest,
  ) {
    return this.transport.sendReminderAuthoringTurn(projectId, request);
  }

  setReminderComposerMode(
    projectId: string,
    mode: import("../contracts/reminder-graph.js").ReminderComposerMode,
  ) {
    return this.transport.setReminderComposerMode(projectId, mode);
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
