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
import type {
  StructureScanProgress,
  StructureScanProgressEvent,
} from "./structure-scan-progress.js";
import type { HarnessRecord } from "./harness.js";
import type {
  CreatePlanRequest,
  ImplementationPlan,
  UpdatePlanRequest,
  WorkspacePlanSummary,
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
  InstallMcpFromCatalogInput,
  McpCatalogView,
} from "./mcp-catalog.js";
import type {
  InstallSkillFromCatalogInput,
  SkillCatalogView,
  UninstallSkillFromCatalogInput,
} from "./skill-marketplace.js";
import type { SkillDescriptor } from "./skills.js";
import type {
  ConnectionTestResult,
  McpServerConfig,
  McpToolDescriptor,
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
import type { AgentHarnessConfig } from "./agent-harness-config.js";
import type {
  AgentMemoryDocument,
  MemoryAdmissionState,
  MemoryCandidate,
  MemorySettingsPatch,
} from "./agent-memory.js";
import type {
  AgentWorktreeRecord,
  CreateAgentWorktreeOptions,
  MergeAgentWorktreeOptions,
} from "./agent-worktree.js";

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
  /** Latest structure-scan progress snapshot for a loaded project (or null). */
  getStructureScanProgress(
    projectId: string,
  ): Promise<StructureScanProgress | null>;
  /** Live structure-scan progress events for a project. */
  streamStructureScan(
    projectId: string,
    cb: (event: StructureScanProgressEvent) => void,
  ): Disposable;
  /** Cancel an in-flight structure scan; keeps the previous graph on disk. */
  cancelStructureScan(projectId: string): Promise<boolean>;
  getProjectGraph(projectId: string): Promise<ProjectGraph>;
  getSemanticTree(projectId: string): Promise<SemanticTree>;
  listWorkspaceDirectory(
    projectId: string,
    relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]>;
  /** Current branch + dirty / ahead-behind for compose hub / status chrome. */
  getWorkspaceGitStatus(
    projectId: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitStatus>;
  listWorkspaceGitBranches(
    projectId: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitBranchList>;
  listWorkspaceGitCommits(
    projectId: string,
    input?: { limit?: number; tips?: string[] },
  ): Promise<import("./workspace-git.js").WorkspaceGitCommitList>;
  getWorkspaceGitCommit(
    projectId: string,
    sha: string,
    input?: { includePatch?: boolean },
  ): Promise<import("./workspace-git.js").WorkspaceGitCommitDetail>;
  /** Project OS Feature Tree store under `.projectos/github-graph/features.json`. */
  getGithubGraphStore(
    projectId: string,
  ): Promise<import("./github-graph-store.js").GithubGraphStoreDocument>;
  upsertGithubGraphFeature(
    projectId: string,
    feature: import("./github-domain.js").GithubFeature,
  ): Promise<import("./github-graph-store.js").GithubGraphStoreDocument>;
  deleteGithubGraphFeature(
    projectId: string,
    featureId: string,
  ): Promise<import("./github-graph-store.js").GithubGraphStoreDocument>;
  upsertGithubGraphRelation(
    projectId: string,
    relation: import("./github-domain.js").GithubRelation,
  ): Promise<import("./github-graph-store.js").GithubGraphStoreDocument>;
  removeGithubGraphRelation(
    projectId: string,
    relationId: string,
  ): Promise<import("./github-graph-store.js").GithubGraphStoreDocument>;
  checkoutWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  createWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      from?: string;
      checkout?: boolean;
      /** Push the new branch to origin (default true). */
      push?: boolean;
    },
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  renameWorkspaceBranch(
    projectId: string,
    input: {
      from: string;
      to: string;
      /** Push renamed branch and delete old remote (default true). */
      push?: boolean;
      deleteRemoteOld?: boolean;
    },
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  deleteWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      /** Also delete origin/<name> (default true). */
      remote?: boolean;
      force?: boolean;
    },
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  /** Reset a feature branch tip back to another tip (default: default branch). */
  rollbackWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      to?: string;
      mode?: "hard" | "mixed";
      /** Force-push with lease after reset (default true). */
      push?: boolean;
    },
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  /** Push a local branch to origin (sets upstream). */
  pushWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  /** Fast-forward pull a branch from origin. */
  pullWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  /** Create a revert commit for sha and optionally push (no force). */
  revertWorkspaceCommit(
    projectId: string,
    input: { sha: string; push?: boolean },
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  fetchWorkspaceGit(
    projectId: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitMutationResult>;
  listWorkspacePullRequests(
    projectId: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitPullRequestList>;
  createWorkspacePullRequest(
    projectId: string,
    input: { title: string; head?: string; base?: string; body?: string },
  ): Promise<{ ok: boolean; url?: string; number?: number; message: string }>;
  mergeWorkspacePullRequest(
    projectId: string,
    input: {
      number: number;
      mergeMethod?: "merge" | "squash" | "rebase";
    },
  ): Promise<
    import("./workspace-git.js").WorkspaceGitPullRequestMutationResult
  >;
  closeWorkspacePullRequest(
    projectId: string,
    input: { number: number },
  ): Promise<
    import("./workspace-git.js").WorkspaceGitPullRequestMutationResult
  >;
  listWorkspaceIssues(
    projectId: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitIssueList>;
  createWorkspaceIssue(
    projectId: string,
    input: { title: string; body?: string },
  ): Promise<import("./workspace-git.js").WorkspaceGitIssueMutationResult>;
  listWorkspaceCommitCheckRuns(
    projectId: string,
    sha: string,
  ): Promise<import("./workspace-git.js").WorkspaceGitCheckRunList>;
  /** Desktop GitHub OAuth status (local identity; no cloud session). */
  getGitHubAuthStatus(): Promise<import("./github-auth.js").GitHubAuthStatus>;
  /**
   * Start Device Flow (default) or loopback OAuth.
   * Returns pending device codes while background poll continues, or connected if already done.
   */
  beginGitHubOAuth(): Promise<import("./github-auth.js").BeginGitHubOAuthResult>;
  cancelGitHubOAuth(): Promise<import("./github-auth.js").GitHubAuthStatus>;
  disconnectGitHub(): Promise<import("./github-auth.js").GitHubAuthStatus>;
  /**
   * Local account profile imported from GitHub `/user`.
   * Future cloud `/v1/me` may merge here; this phase is local_github only.
   */
  getAccountProfile(): Promise<import("./github-auth.js").AccountProfile | null>;
  /** Persist OAuth App Client ID under userData (public; not a secret). */
  saveGitHubOAuthClientId(
    clientId: string,
  ): Promise<import("./github-auth.js").GitHubAuthStatus>;
  /** Import identity + token from an authenticated local `gh` CLI session. */
  importGitHubAuthFromGhCli(): Promise<
    import("./github-auth.js").BeginGitHubOAuthResult
  >;
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
  getComposerMentions(
    projectId: string,
    query: string,
  ): Promise<{ files: string[]; rules: Array<{ path: string; description: string }> }>;
  getSkill(projectId: string, skillId: string): Promise<SkillContent | null>;
  /** H4.C — list agent git worktrees under `.projectos/agent-worktrees/`. */
  listAgentWorktrees(projectId: string): Promise<AgentWorktreeRecord[]>;
  createAgentWorktree(
    projectId: string,
    options?: CreateAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord>;
  /** Requires `options.confirm === true`. Never auto-merges. */
  mergeAgentWorktree(
    projectId: string,
    options: MergeAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord>;
  removeAgentWorktree(
    projectId: string,
    worktreeId: string,
    options?: { deleteBranch?: boolean },
  ): Promise<AgentWorktreeRecord>;
  getAgentWorktreeDiff(projectId: string, worktreeId: string): Promise<string>;
  getAgentHarnessConfig(projectId: string): Promise<AgentHarnessConfig>;
  saveAgentHarnessConfig(
    projectId: string,
    config: AgentHarnessConfig,
  ): Promise<AgentHarnessConfig>;
  getAgentMemory(projectId: string): Promise<AgentMemoryDocument>;
  getAgentMemoryTopic(projectId: string, topicFile: string): Promise<string>;
  saveAgentMemorySettings(
    projectId: string,
    patch: MemorySettingsPatch,
  ): Promise<AgentMemoryDocument>;
  submitAgentMemory(
    projectId: string,
    candidate: MemoryCandidate,
  ): Promise<AgentMemoryDocument>;
  setAgentMemoryEntryState(
    projectId: string,
    text: string,
    state: MemoryAdmissionState,
  ): Promise<AgentMemoryDocument>;
  deleteAgentMemoryEntry(
    projectId: string,
    text: string,
  ): Promise<AgentMemoryDocument>;
  consolidateAgentMemory(projectId: string): Promise<AgentMemoryDocument>;
  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan>;
  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan>;
  /** Persist plan markdown under `.projectos/plans/` (DevPlan M2.A). */
  savePlanToWorkspace(planId: string): Promise<{ path: string }>;
  /** List saved plan markdown files under `.projectos/plans/`. */
  listWorkspacePlans(projectId: string): Promise<WorkspacePlanSummary[]>;
  /** Reload a saved plan markdown into the in-memory plan store + return it. */
  loadPlanFromWorkspace(projectId: string, planId: string): Promise<ImplementationPlan>;
  buildPlan(planId: string): Promise<PromptRefinement>;
  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement>;
  /** Persist user Alignment Card selections before confirmExecution. */
  confirmAlignment(request: import("./alignment-contract.js").ConfirmAlignmentRequest): Promise<PromptRefinement>;
  confirmExecution(refinementId: string): Promise<AgentRun>;
  /** Stop an in-flight agent run. Marks the run cancelled; does not apply half-written diffs. */
  cancelAgentRun(runId: string): Promise<AgentRun>;
  /**
   * Pause an in-flight run (Live Graph). Marks `interrupted` so continueAgentRun can resume.
   * Not the same as cancel — cancelled runs stay cancelled.
   */
  pauseAgentRun(runId: string): Promise<AgentRun>;
  /**
   * Continue an interrupted run. Applied runs are not written again.
   * Runs that never applied regenerate from the live pipeline.
   */
  continueAgentRun(runId: string): Promise<AgentRun>;
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
  confirmBugAlignment(
    request: import("./alignment-contract.js").ConfirmBugAlignmentRequest,
  ): Promise<DebugSession>;
  markBugFixed(
    request: import("./alignment-contract.js").MarkBugFixedRequest,
  ): Promise<DebugSession>;
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
  listMcpServers(projectId: string): Promise<McpServerConfig[]>;
  saveMcpServer(
    projectId: string,
    input: { config: McpServerConfig; authToken?: string },
  ): Promise<ProjectOSSettings>;
  deleteMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ProjectOSSettings>;
  testMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ConnectionTestResult>;
  refreshMcpTools(
    projectId: string,
    serverId: string,
  ): Promise<McpToolDescriptor[]>;
  listMcpCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<McpCatalogView>;
  refreshMcpCatalog(projectId: string): Promise<McpCatalogView>;
  installMcpFromCatalog(
    projectId: string,
    input: InstallMcpFromCatalogInput,
  ): Promise<ProjectOSSettings>;
  disableMcpCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings>;
  reportMcpCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings>;
  listSkillCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<SkillCatalogView>;
  refreshSkillCatalog(projectId: string): Promise<SkillCatalogView>;
  installSkillFromCatalog(
    projectId: string,
    input: InstallSkillFromCatalogInput,
  ): Promise<SkillDescriptor>;
  uninstallSkillFromCatalog(
    projectId: string,
    input: UninstallSkillFromCatalogInput,
  ): Promise<void>;
  disableSkillCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings>;
  reportSkillCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings>;
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
  /** Probe workspace for shadcn / Tailwind / motion (UI Stencil codegen honesty). */
  getRepoDesignSystem(
    projectId: string,
  ): Promise<import("./repo-design-system.js").RepoDesignSystemSnapshot>;
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
    featureNodeId?: string,
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
  cancelLoopGoalClarification(projectId: string, loopId: string): Promise<LoopGraphDocument>;
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
