import type { AgentRun } from "../../contracts/agent-run.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "../../contracts/agent-conversation.js";
import type { Disposable } from "../../contracts/api.js";
import type { ContextPayload, CurrentWorkState } from "../../contracts/context.js";
import type { ApplyResult, GeneratedDiff, RestoreApplyResult } from "../../contracts/diff.js";
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
  CreatePlanRequest,
  ImplementationPlan,
  UpdatePlanRequest,
} from "../../contracts/implementation-plan.js";
import type {
  DebugSession,
  StartDebugSessionRequest,
  SubmitDebugReproRequest,
} from "../../contracts/debug-session.js";
import type { ProjectOSProject } from "../../contracts/project.js";
import type { ProjectDescription } from "../../contracts/project-description.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../../contracts/prompt-refinement.js";
import type {
  ConnectionTestResult,
  ModelOption,
  ProjectOSSettings,
  SettingsPatch,
} from "../../contracts/settings.js";
import type { SemanticTree } from "../../contracts/semantic-tree.js";
import type { WorkspaceDirectoryEntry } from "../../contracts/workspace-directory.js";
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
import type { ListSkillsResult, SkillContent } from "../../contracts/skills.js";
import type { AgentHarnessConfig } from "../../contracts/agent-harness-config.js";
import type {
  AgentMemoryDocument,
  MemoryAdmissionState,
  MemoryCandidate,
  MemorySettingsPatch,
} from "../../contracts/agent-memory.js";
import type {
  AgentWorktreeRecord,
  CreateAgentWorktreeOptions,
  MergeAgentWorktreeOptions,
} from "../../contracts/agent-worktree.js";
import type {
  LocationHint,
  ResolvedSpatialPin,
  SpatialPin,
  SpatialPinHead,
  SubmitSpatialPinResult,
} from "../../contracts/spatial-pin.js";
import type {
  CreateMapArtifactInput,
  MapArtifact,
  MapContentDocument,
  UpdateMapArtifactPatch,
} from "../../contracts/map-content.js";
import { ProjectOSError, type ProjectOSErrorCode } from "../../errors.js";
import type { ApiTransport } from "./ApiTransport.js";

interface SerializedProjectOSError {
  __projectOsError: true;
  code: ProjectOSErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

function readSerializedProjectOSError(
  value: unknown,
): SerializedProjectOSError | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as Partial<SerializedProjectOSError> & { message?: string };
  if (candidate.__projectOsError !== true || !candidate.code || !candidate.message) {
    return undefined;
  }

  return {
    __projectOsError: true,
    code: candidate.code,
    message: candidate.message,
    ...(candidate.details ? { details: candidate.details } : {}),
  };
}

function getBridge(): NonNullable<Window["projectOS"]> {
  if (typeof window === "undefined" || !window.projectOS) {
    throw new ProjectOSError(
      "transport_not_connected",
      "Desktop IPC bridge is not available",
    );
  }
  return window.projectOS;
}

export const DEFAULT_IPC_INVOKE_TIMEOUT_MS = 310_000;

export type AsyncIpcErrorHandler = (operation: string, error: unknown) => void;

function translateIpcError(error: unknown): unknown {
  const projectOsError = readSerializedProjectOSError(error);
  if (!projectOsError) return error;
  return new ProjectOSError(
    projectOsError.code,
    projectOsError.message,
    projectOsError.details ? { details: projectOsError.details } : {},
  );
}

function reportAsyncIpcError(operation: string, error: unknown): void {
  console.error(`[projectos] asynchronous IPC '${operation}' failed`, error);
}

async function invoke<T>(
  timeoutMs: number,
  method: string,
  ...args: unknown[]
): Promise<T> {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("IPC invoke timeout must be a positive finite number");
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = getBridge().invoke(method, ...args);
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`IPC request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return (await Promise.race([response, deadline])) as T;
  } catch (error) {
    throw translateIpcError(error);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export class IpcTransport implements ApiTransport {
  constructor(
    private readonly invokeTimeoutMs = DEFAULT_IPC_INVOKE_TIMEOUT_MS,
    private readonly onAsyncError: AsyncIpcErrorHandler = reportAsyncIpcError,
  ) {
    if (!Number.isFinite(invokeTimeoutMs) || invokeTimeoutMs <= 0) {
      throw new Error("IPC invoke timeout must be a positive finite number");
    }
  }

  private invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    return invoke<T>(this.invokeTimeoutMs, method, ...args);
  }

  private handleAsyncError(operation: string, error: unknown): void {
    try {
      this.onAsyncError(operation, translateIpcError(error));
    } catch (reportingError) {
      reportAsyncIpcError(`${operation}:error-handler`, reportingError);
    }
  }

  openSampleWorkspace(): Promise<ProjectOSProject> {
    return this.invoke("openSampleWorkspace");
  }

  openWorkspace(path: string): Promise<ProjectOSProject> {
    return this.invoke("openWorkspace", path);
  }

  analyzeWorkspace(projectId: string, options?: StructureScanOptions): Promise<ProjectGraph> {
    return this.invoke("analyzeWorkspace", projectId, options ?? { mode: "regenerate" });
  }

  getStructureScanProgress(
    projectId: string,
  ): Promise<StructureScanProgress | null> {
    return this.invoke("getStructureScanProgress", projectId);
  }

  streamStructureScan(
    projectId: string,
    cb: (event: StructureScanProgressEvent) => void,
  ): Disposable {
    const bridge = getBridge();
    let disposed = false;

    const listener = (eventProjectId: string, event: StructureScanProgressEvent) => {
      if (!disposed && eventProjectId === projectId) {
        cb(event);
      }
    };

    const eventDisposable = bridge.onStructureScanEvent(listener);
    void bridge.structureScanSubscribe(projectId).catch((error: unknown) => {
      this.handleAsyncError("structureScanSubscribe", error);
    });

    const handleAsyncError = this.handleAsyncError.bind(this);

    return {
      dispose() {
        disposed = true;
        eventDisposable.dispose();
        void bridge.structureScanUnsubscribe(projectId).catch((error: unknown) => {
          handleAsyncError("structureScanUnsubscribe", error);
        });
      },
    };
  }

  cancelStructureScan(projectId: string): Promise<boolean> {
    return this.invoke("cancelStructureScan", projectId);
  }

  getProjectGraph(projectId: string): Promise<ProjectGraph> {
    return this.invoke("getProjectGraph", projectId);
  }

  getSemanticTree(projectId: string): Promise<SemanticTree> {
    return this.invoke("getSemanticTree", projectId);
  }

  listWorkspaceDirectory(
    projectId: string,
    relativePath: string,
  ): Promise<WorkspaceDirectoryEntry[]> {
    return this.invoke("listWorkspaceDirectory", projectId, relativePath);
  }

  getWorkspaceGitStatus(
    projectId: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitStatus> {
    return this.invoke("getWorkspaceGitStatus", projectId);
  }

  listWorkspaceGitBranches(
    projectId: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitBranchList> {
    return this.invoke("listWorkspaceGitBranches", projectId);
  }

  listWorkspaceGitCommits(
    projectId: string,
    input: { limit?: number; tips?: string[] } = {},
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitCommitList> {
    return this.invoke("listWorkspaceGitCommits", projectId, input);
  }

  getWorkspaceGitCommit(
    projectId: string,
    sha: string,
    input: { includePatch?: boolean } = {},
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitCommitDetail> {
    return this.invoke("getWorkspaceGitCommit", projectId, sha, input);
  }

  getGithubGraphStore(
    projectId: string,
  ): Promise<import("../../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    return this.invoke("getGithubGraphStore", projectId);
  }

  upsertGithubGraphFeature(
    projectId: string,
    feature: import("../../contracts/github-domain.js").GithubFeature,
  ): Promise<import("../../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    return this.invoke("upsertGithubGraphFeature", projectId, feature);
  }

  deleteGithubGraphFeature(
    projectId: string,
    featureId: string,
  ): Promise<import("../../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    return this.invoke("deleteGithubGraphFeature", projectId, featureId);
  }

  upsertGithubGraphRelation(
    projectId: string,
    relation: import("../../contracts/github-domain.js").GithubRelation,
  ): Promise<import("../../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    return this.invoke("upsertGithubGraphRelation", projectId, relation);
  }

  removeGithubGraphRelation(
    projectId: string,
    relationId: string,
  ): Promise<import("../../contracts/github-graph-store.js").GithubGraphStoreDocument> {
    return this.invoke("removeGithubGraphRelation", projectId, relationId);
  }

  checkoutWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("checkoutWorkspaceBranch", projectId, branch);
  }

  createWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      from?: string;
      checkout?: boolean;
      push?: boolean;
    },
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("createWorkspaceBranch", projectId, input);
  }

  renameWorkspaceBranch(
    projectId: string,
    input: {
      from: string;
      to: string;
      push?: boolean;
      deleteRemoteOld?: boolean;
    },
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("renameWorkspaceBranch", projectId, input);
  }

  deleteWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      remote?: boolean;
      force?: boolean;
    },
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("deleteWorkspaceBranch", projectId, input);
  }

  rollbackWorkspaceBranch(
    projectId: string,
    input: {
      name: string;
      to?: string;
      mode?: "hard" | "mixed";
      push?: boolean;
    },
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("rollbackWorkspaceBranch", projectId, input);
  }

  fetchWorkspaceGit(
    projectId: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("fetchWorkspaceGit", projectId);
  }

  pushWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("pushWorkspaceBranch", projectId, branch);
  }

  pullWorkspaceBranch(
    projectId: string,
    branch: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("pullWorkspaceBranch", projectId, branch);
  }

  revertWorkspaceCommit(
    projectId: string,
    input: { sha: string; push?: boolean },
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitMutationResult> {
    return this.invoke("revertWorkspaceCommit", projectId, input);
  }

  listWorkspacePullRequests(
    projectId: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitPullRequestList> {
    return this.invoke("listWorkspacePullRequests", projectId);
  }

  createWorkspacePullRequest(
    projectId: string,
    input: { title: string; head?: string; base?: string; body?: string },
  ): Promise<{ ok: boolean; url?: string; number?: number; message: string }> {
    return this.invoke("createWorkspacePullRequest", projectId, input);
  }

  mergeWorkspacePullRequest(
    projectId: string,
    input: {
      number: number;
      mergeMethod?: "merge" | "squash" | "rebase";
    },
  ): Promise<
    import("../../contracts/workspace-git.js").WorkspaceGitPullRequestMutationResult
  > {
    return this.invoke("mergeWorkspacePullRequest", projectId, input);
  }

  closeWorkspacePullRequest(
    projectId: string,
    input: { number: number },
  ): Promise<
    import("../../contracts/workspace-git.js").WorkspaceGitPullRequestMutationResult
  > {
    return this.invoke("closeWorkspacePullRequest", projectId, input);
  }

  listWorkspaceIssues(
    projectId: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitIssueList> {
    return this.invoke("listWorkspaceIssues", projectId);
  }

  createWorkspaceIssue(
    projectId: string,
    input: { title: string; body?: string },
  ): Promise<
    import("../../contracts/workspace-git.js").WorkspaceGitIssueMutationResult
  > {
    return this.invoke("createWorkspaceIssue", projectId, input);
  }

  listWorkspaceCommitCheckRuns(
    projectId: string,
    sha: string,
  ): Promise<import("../../contracts/workspace-git.js").WorkspaceGitCheckRunList> {
    return this.invoke("listWorkspaceCommitCheckRuns", projectId, sha);
  }

  getGitHubAuthStatus(): Promise<import("../../contracts/github-auth.js").GitHubAuthStatus> {
    return this.invoke("getGitHubAuthStatus");
  }

  beginGitHubOAuth(): Promise<import("../../contracts/github-auth.js").BeginGitHubOAuthResult> {
    return this.invoke("beginGitHubOAuth");
  }

  cancelGitHubOAuth(): Promise<import("../../contracts/github-auth.js").GitHubAuthStatus> {
    return this.invoke("cancelGitHubOAuth");
  }

  disconnectGitHub(): Promise<import("../../contracts/github-auth.js").GitHubAuthStatus> {
    return this.invoke("disconnectGitHub");
  }

  getAccountProfile(): Promise<import("../../contracts/github-auth.js").AccountProfile | null> {
    return this.invoke("getAccountProfile");
  }

  saveGitHubOAuthClientId(
    clientId: string,
  ): Promise<import("../../contracts/github-auth.js").GitHubAuthStatus> {
    return this.invoke("saveGitHubOAuthClientId", clientId);
  }

  importGitHubAuthFromGhCli(): Promise<
    import("../../contracts/github-auth.js").BeginGitHubOAuthResult
  > {
    return this.invoke("importGitHubAuthFromGhCli");
  }

  getNodeContext(projectId: string, nodeId: string): Promise<ContextPayload> {
    return this.invoke("getNodeContext", projectId, nodeId);
  }

  getFileContext(projectId: string, path: string): Promise<ContextPayload> {
    return this.invoke("getFileContext", projectId, path);
  }

  getFileContent(projectId: string, path: string): Promise<string> {
    return this.invoke("getFileContent", projectId, path);
  }

  getWorkspaceFileDataUrl(projectId: string, path: string): Promise<string> {
    return this.invoke("getWorkspaceFileDataUrl", projectId, path);
  }

  writeFileContent(projectId: string, path: string, content: string): Promise<void> {
    return this.invoke("writeFileContent", projectId, path, content);
  }

  saveFileWithHistory(
    projectId: string,
    path: string,
    content: string,
  ): Promise<SaveFileWithHistoryResult> {
    return this.invoke("saveFileWithHistory", projectId, path, content);
  }

  listFileTimeline(projectId: string, filePath: string): Promise<FileTimelineEntry[]> {
    return this.invoke("listFileTimeline", projectId, filePath);
  }

  getFileTimelineSnapshot(
    projectId: string,
    entryId: string,
  ): Promise<FileTimelineSnapshotContent> {
    return this.invoke("getFileTimelineSnapshot", projectId, entryId);
  }

  recordProposedFileTimeline(
    projectId: string,
    runId: string,
    files: Array<{ path: string; before?: string; after?: string }>,
  ): Promise<FileTimelineEntry[]> {
    return this.invoke("recordProposedFileTimeline", projectId, runId, files);
  }

  listChatSessionHeads(projectId: string): Promise<ChatSessionHead[]> {
    return this.invoke("listChatSessionHeads", projectId);
  }

  getChatSessionIndex(projectId: string): Promise<ChatSessionIndex> {
    return this.invoke("getChatSessionIndex", projectId);
  }

  getChatSession(projectId: string, sessionId: string): Promise<ChatSessionRecord | null> {
    return this.invoke("getChatSession", projectId, sessionId);
  }

  upsertChatSession(projectId: string, record: ChatSessionRecord): Promise<ChatSessionRecord> {
    return this.invoke("upsertChatSession", projectId, record);
  }

  setChatSessionArchived(
    projectId: string,
    sessionId: string,
    archived: boolean,
  ): Promise<ChatSessionHead | null> {
    return this.invoke("setChatSessionArchived", projectId, sessionId, archived);
  }

  setChatSessionPinned(
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ): Promise<ChatSessionIndex> {
    return this.invoke("setChatSessionPinned", projectId, sessionId, pinned);
  }

  renameChatSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionHead | null> {
    return this.invoke("renameChatSession", projectId, sessionId, title);
  }

  summarizeChatSessionTitle(
    projectId: string,
    sessionId: string,
  ): Promise<ChatSessionHead | null> {
    return this.invoke("summarizeChatSessionTitle", projectId, sessionId);
  }

  forkChatSession(
    projectId: string,
    parentSessionId: string,
    forkMessageId: string,
  ): Promise<ChatSessionRecord | null> {
    return this.invoke("forkChatSession", projectId, parentSessionId, forkMessageId);
  }

  setChatSessionClassification(
    projectId: string,
    sessionId: string,
    classification: "topic" | "misc",
  ): Promise<ChatSessionHead | null> {
    return this.invoke("setChatSessionClassification", projectId, sessionId, classification);
  }

  deleteChatSession(projectId: string, sessionId: string): Promise<boolean> {
    return this.invoke("deleteChatSession", projectId, sessionId);
  }

  setLastActiveChatSession(projectId: string, sessionId: string): Promise<void> {
    return this.invoke("setLastActiveChatSession", projectId, sessionId);
  }

  getCurrentWork(projectId: string): Promise<CurrentWorkState> {
    return this.invoke("getCurrentWork", projectId);
  }

  getProjectDescription(projectId: string): Promise<ProjectDescription> {
    return this.invoke("getProjectDescription", projectId);
  }

  updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription> {
    return this.invoke("updateProjectDescription", projectId, conciseDescription);
  }

  ensureCodeFileUnderstanding(
    projectId: string,
    path: string,
  ): Promise<import("../../contracts/code-file-understanding.js").CodeFileUnderstandingEntry> {
    return this.invoke("ensureCodeFileUnderstanding", projectId, path);
  }

  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return this.invoke("askAgent", request);
  }

  listSkills(projectId: string): Promise<ListSkillsResult> {
    return this.invoke("listSkills", projectId);
  }

  getComposerMentions(
    projectId: string,
    query: string,
  ): Promise<{ files: string[]; rules: Array<{ path: string; description: string }> }> {
    return this.invoke("getComposerMentions", projectId, query);
  }

  getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    return this.invoke("getSkill", projectId, skillId);
  }

  listAgentWorktrees(projectId: string): Promise<AgentWorktreeRecord[]> {
    return this.invoke("listAgentWorktrees", projectId);
  }

  createAgentWorktree(
    projectId: string,
    options: CreateAgentWorktreeOptions = {},
  ): Promise<AgentWorktreeRecord> {
    return this.invoke("createAgentWorktree", projectId, options ?? {});
  }

  mergeAgentWorktree(
    projectId: string,
    options: MergeAgentWorktreeOptions,
  ): Promise<AgentWorktreeRecord> {
    return this.invoke("mergeAgentWorktree", projectId, options);
  }

  removeAgentWorktree(
    projectId: string,
    worktreeId: string,
    options: { deleteBranch?: boolean } = {},
  ): Promise<AgentWorktreeRecord> {
    return this.invoke(
      "removeAgentWorktree",
      projectId,
      worktreeId,
      options ?? {},
    );
  }

  getAgentWorktreeDiff(projectId: string, worktreeId: string): Promise<string> {
    return this.invoke("getAgentWorktreeDiff", projectId, worktreeId);
  }

  getAgentHarnessConfig(projectId: string): Promise<AgentHarnessConfig> {
    return this.invoke("getAgentHarnessConfig", projectId);
  }

  saveAgentHarnessConfig(
    projectId: string,
    config: AgentHarnessConfig,
  ): Promise<AgentHarnessConfig> {
    return this.invoke("saveAgentHarnessConfig", projectId, config);
  }

  getAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    return this.invoke("getAgentMemory", projectId);
  }

  getAgentMemoryTopic(projectId: string, topicFile: string): Promise<string> {
    return this.invoke("getAgentMemoryTopic", projectId, topicFile);
  }

  saveAgentMemorySettings(
    projectId: string,
    patch: MemorySettingsPatch,
  ): Promise<AgentMemoryDocument> {
    return this.invoke("saveAgentMemorySettings", projectId, patch);
  }

  submitAgentMemory(
    projectId: string,
    candidate: MemoryCandidate,
  ): Promise<AgentMemoryDocument> {
    return this.invoke("submitAgentMemory", projectId, candidate);
  }

  setAgentMemoryEntryState(
    projectId: string,
    text: string,
    state: MemoryAdmissionState,
  ): Promise<AgentMemoryDocument> {
    return this.invoke("setAgentMemoryEntryState", projectId, text, state);
  }

  deleteAgentMemoryEntry(
    projectId: string,
    text: string,
  ): Promise<AgentMemoryDocument> {
    return this.invoke("deleteAgentMemoryEntry", projectId, text);
  }

  consolidateAgentMemory(projectId: string): Promise<AgentMemoryDocument> {
    return this.invoke("consolidateAgentMemory", projectId);
  }

  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan> {
    return this.invoke("createPlan", request);
  }

  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan> {
    return this.invoke("updatePlan", request);
  }

  savePlanToWorkspace(planId: string): Promise<{ path: string }> {
    return this.invoke("savePlanToWorkspace", planId);
  }

  listWorkspacePlans(projectId: string): Promise<import("../../contracts/implementation-plan.js").WorkspacePlanSummary[]> {
    return this.invoke("listWorkspacePlans", projectId);
  }

  loadPlanFromWorkspace(projectId: string, planId: string): Promise<ImplementationPlan> {
    return this.invoke("loadPlanFromWorkspace", projectId, planId);
  }

  buildPlan(planId: string): Promise<PromptRefinement> {
    return this.invoke("buildPlan", planId);
  }

  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    return this.invoke("refinePrompt", request);
  }

  confirmAlignment(request: import("../../contracts/alignment-contract.js").ConfirmAlignmentRequest): Promise<PromptRefinement> {
    return this.invoke("confirmAlignment", request);
  }

  confirmExecution(refinementId: string): Promise<AgentRun> {
    return this.invoke("confirmExecution", refinementId);
  }

  cancelAgentRun(runId: string): Promise<AgentRun> {
    return this.invoke("cancelAgentRun", runId);
  }

  pauseAgentRun(runId: string): Promise<AgentRun> {
    return this.invoke("pauseAgentRun", runId);
  }

  continueAgentRun(runId: string): Promise<AgentRun> {
    return this.invoke("continueAgentRun", runId);
  }

  getAgentRun(runId: string): Promise<AgentRun> {
    return this.invoke("getAgentRun", runId);
  }

  getAgentRunEvents(runId: string): Promise<AgentRunEvent[]> {
    return this.invoke("getAgentRunEvents", runId);
  }

  streamAgentRun(
    runId: string,
    cb: (event: AgentRunEvent) => void,
    transientCb?: (trace: AgentTransientTrace) => void,
  ): Disposable {
    const bridge = getBridge();
    let disposed = false;

    const listener = (eventRunId: string, event: AgentRunEvent) => {
      if (!disposed && eventRunId === runId) {
        cb(event);
      }
    };

    const runEventDisposable = bridge.onRunEvent(listener);
    const transientDisposable = transientCb
      ? bridge.onRunTransientTrace((eventRunId, trace) => {
          if (!disposed && eventRunId === runId) transientCb(trace);
        })
      : undefined;
    void bridge.streamSubscribe(runId).catch((error: unknown) => {
      this.handleAsyncError("streamSubscribe", error);
    });

    const handleAsyncError = this.handleAsyncError.bind(this);

    return {
      dispose() {
        disposed = true;
        runEventDisposable.dispose();
        transientDisposable?.dispose();
        void bridge.streamUnsubscribe(runId).catch((error: unknown) => {
          handleAsyncError("streamUnsubscribe", error);
        });
      },
    };
  }

  getDiff(runId: string): Promise<GeneratedDiff> {
    return this.invoke("getDiff", runId);
  }

  applyDiff(runId: string): Promise<ApplyResult> {
    return this.invoke("applyDiff", runId);
  }

  runVerification(runId: string): Promise<VerificationRunResult> {
    return this.invoke("runVerification", runId);
  }

  getVerificationCommandApproval(
    projectId: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return this.invoke("getVerificationCommandApproval", projectId);
  }

  approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return this.invoke("approveVerificationCommands", projectId, commandSetHash);
  }

  restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult> {
    return this.invoke("restoreApplyBackup", projectId, backupId);
  }

  undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult> {
    return this.invoke("undoGreenfieldInitialization", projectId, runId);
  }

  reportError(projectId: string, rawError: string): Promise<HarnessRecord> {
    return this.invoke("reportError", projectId, rawError);
  }

  startHarnessFix(errorId: string): Promise<AgentRun> {
    return this.invoke("startHarnessFix", errorId);
  }

  startDebugSession(request: StartDebugSessionRequest): Promise<DebugSession> {
    return this.invoke("startDebugSession", request);
  }

  submitDebugRepro(request: SubmitDebugReproRequest): Promise<DebugSession> {
    return this.invoke("submitDebugRepro", request);
  }

  proposeDebugFix(sessionId: string): Promise<DebugSession> {
    return this.invoke("proposeDebugFix", sessionId);
  }

  confirmDebugFix(sessionId: string): Promise<AgentRun> {
    return this.invoke("confirmDebugFix", sessionId);
  }

  cleanupDebugInstrumentation(sessionId: string): Promise<void> {
    return this.invoke("cleanupDebugInstrumentation", sessionId);
  }

  confirmBugAlignment(
    request: import("../../contracts/alignment-contract.js").ConfirmBugAlignmentRequest,
  ): Promise<import("../../contracts/debug-session.js").DebugSession> {
    return this.invoke("confirmBugAlignment", request);
  }

  markBugFixed(
    request: import("../../contracts/alignment-contract.js").MarkBugFixedRequest,
  ): Promise<import("../../contracts/debug-session.js").DebugSession> {
    return this.invoke("markBugFixed", request);
  }

  getDebugLogPort(): Promise<number> {
    return this.invoke("getDebugLogPort");
  }


  getSettings(projectId: string): Promise<ProjectOSSettings> {
    return this.invoke("getSettings", projectId);
  }

  updateSettings(
    projectId: string,
    patch: SettingsPatch,
  ): Promise<ProjectOSSettings> {
    return this.invoke("updateSettings", projectId, patch);
  }

  testModelConnection(
    projectId: string,
    profileId: string,
  ): Promise<ConnectionTestResult> {
    return this.invoke("testModelConnection", projectId, profileId);
  }

  listAvailableModels(
    projectId: string,
    profileId: string,
  ): Promise<ModelOption[]> {
    return this.invoke("listAvailableModels", projectId, profileId);
  }

  listMcpServers(projectId: string): Promise<import("../../contracts/settings.js").McpServerConfig[]> {
    return this.invoke("listMcpServers", projectId);
  }

  saveMcpServer(
    projectId: string,
    input: {
      config: import("../../contracts/settings.js").McpServerConfig;
      authToken?: string;
    },
  ): Promise<ProjectOSSettings> {
    return this.invoke("saveMcpServer", projectId, input);
  }

  deleteMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ProjectOSSettings> {
    return this.invoke("deleteMcpServer", projectId, serverId);
  }

  testMcpServer(
    projectId: string,
    serverId: string,
  ): Promise<ConnectionTestResult> {
    return this.invoke("testMcpServer", projectId, serverId);
  }

  refreshMcpTools(
    projectId: string,
    serverId: string,
  ): Promise<import("../../contracts/settings.js").McpToolDescriptor[]> {
    return this.invoke("refreshMcpTools", projectId, serverId);
  }

  listMcpCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../../contracts/mcp-catalog.js").McpCatalogView> {
    return this.invoke("listMcpCatalog", projectId, options ?? {});
  }

  refreshMcpCatalog(
    projectId: string,
  ): Promise<import("../../contracts/mcp-catalog.js").McpCatalogView> {
    return this.invoke("refreshMcpCatalog", projectId);
  }

  installMcpFromCatalog(
    projectId: string,
    input: import("../../contracts/mcp-catalog.js").InstallMcpFromCatalogInput,
  ): Promise<ProjectOSSettings> {
    return this.invoke("installMcpFromCatalog", projectId, input);
  }

  disableMcpCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    return this.invoke("disableMcpCatalogListing", projectId, listingId);
  }

  reportMcpCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    return this.invoke("reportMcpCatalogListing", projectId, input);
  }

  listSkillCatalog(
    projectId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<import("../../contracts/skill-marketplace.js").SkillCatalogView> {
    return this.invoke("listSkillCatalog", projectId, options ?? {});
  }

  refreshSkillCatalog(
    projectId: string,
  ): Promise<import("../../contracts/skill-marketplace.js").SkillCatalogView> {
    return this.invoke("refreshSkillCatalog", projectId);
  }

  installSkillFromCatalog(
    projectId: string,
    input: import("../../contracts/skill-marketplace.js").InstallSkillFromCatalogInput,
  ): Promise<import("../../contracts/skills.js").SkillDescriptor> {
    return this.invoke("installSkillFromCatalog", projectId, input);
  }

  uninstallSkillFromCatalog(
    projectId: string,
    input: import("../../contracts/skill-marketplace.js").UninstallSkillFromCatalogInput,
  ): Promise<void> {
    return this.invoke("uninstallSkillFromCatalog", projectId, input);
  }

  disableSkillCatalogListing(
    projectId: string,
    listingId: string,
  ): Promise<ProjectOSSettings> {
    return this.invoke("disableSkillCatalogListing", projectId, listingId);
  }

  reportSkillCatalogListing(
    projectId: string,
    input: { listingId: string; note?: string },
  ): Promise<ProjectOSSettings> {
    return this.invoke("reportSkillCatalogListing", projectId, input);
  }

  setSecret(ref: string, value: string): Promise<void> {
    return this.invoke("setSecret", ref, value);
  }

  deleteSecret(ref: string): Promise<void> {
    return this.invoke("deleteSecret", ref);
  }





  consumeFallbackNotice(projectId: string): Promise<string | undefined> {
    return this.invoke("consumeFallbackNotice", projectId);
  }

  getMapContent(projectId: string): Promise<MapContentDocument> {
    return this.invoke("getMapContent", projectId);
  }

  createMapArtifact(
    projectId: string,
    input: CreateMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.invoke("createMapArtifact", projectId, input);
  }

  createMapImageArtifact(
    projectId: string,
    input: import("../../contracts/map-content.js").CreateMapImageArtifactInput,
  ): Promise<MapArtifact> {
    return this.invoke("createMapImageArtifact", projectId, input);
  }

  getMapAssetDataUrl(projectId: string, assetPath: string): Promise<string> {
    return this.invoke("getMapAssetDataUrl", projectId, assetPath);
  }

  updateMapArtifact(
    projectId: string,
    artifactId: string,
    patch: UpdateMapArtifactPatch,
  ): Promise<MapArtifact> {
    return this.invoke("updateMapArtifact", projectId, artifactId, patch);
  }

  deleteMapArtifact(projectId: string, artifactId: string): Promise<void> {
    return this.invoke("deleteMapArtifact", projectId, artifactId);
  }

  listSpatialPins(projectId: string): Promise<SpatialPinHead[]> {
    return this.invoke("listSpatialPins", projectId);
  }

  getSpatialPin(projectId: string, pinId: string): Promise<SpatialPin | null> {
    return this.invoke("getSpatialPin", projectId, pinId);
  }

  upsertSpatialPin(projectId: string, pin: SpatialPin): Promise<SpatialPin> {
    return this.invoke("upsertSpatialPin", projectId, pin);
  }

  deleteSpatialPin(projectId: string, pinId: string): Promise<boolean> {
    return this.invoke("deleteSpatialPin", projectId, pinId);
  }

  resolveSpatialPins(
    projectId: string,
    locationHint: LocationHint,
  ): Promise<ResolvedSpatialPin[]> {
    return this.invoke("resolveSpatialPins", projectId, locationHint);
  }

  submitSpatialPin(
    projectId: string,
    pinId: string,
  ): Promise<SubmitSpatialPinResult> {
    return this.invoke("submitSpatialPin", projectId, pinId);
  }

  saveSpatialPinSnapshot(
    projectId: string,
    pinId: string,
    pngBase64: string,
  ): Promise<{ snapshotAssetPath: string }> {
    return this.invoke("saveSpatialPinSnapshot", projectId, pinId, pngBase64);
  }

  getRepoDesignSystem(
    projectId: string,
  ): Promise<import("../../contracts/repo-design-system.js").RepoDesignSystemSnapshot> {
    return this.invoke("getRepoDesignSystem", projectId);
  }

  listSpatialCaptureSessions(
    projectId: string,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSessionHead[]
  > {
    return this.invoke("listSpatialCaptureSessions", projectId);
  }

  getSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSession | null
  > {
    return this.invoke("getSpatialCaptureSession", projectId, sessionId);
  }

  upsertSpatialCaptureSession(
    projectId: string,
    session: import("../../contracts/spatial-capture-session.js").SpatialCaptureSession,
  ): Promise<
    import("../../contracts/spatial-capture-session.js").SpatialCaptureSession
  > {
    return this.invoke("upsertSpatialCaptureSession", projectId, session);
  }

  deleteSpatialCaptureSession(
    projectId: string,
    sessionId: string,
  ): Promise<boolean> {
    return this.invoke("deleteSpatialCaptureSession", projectId, sessionId);
  }

  saveSpatialCaptureBackdrop(
    projectId: string,
    sessionId: string,
    pngBase64: string,
  ): Promise<{ backdropAssetPath: string }> {
    return this.invoke(
      "saveSpatialCaptureBackdrop",
      projectId,
      sessionId,
      pngBase64,
    );
  }

  readProjectAssetBase64(
    projectId: string,
    relativePath: string,
  ): Promise<{ base64: string; mimeType: string } | null> {
    return this.invoke("readProjectAssetBase64", projectId, relativePath);
  }

  listLoopGraphs(projectId: string): Promise<import("../../contracts/loop-graph.js").LoopGraphHead[]> {
    return this.invoke("listLoopGraphs", projectId);
  }

  getLoopGraphIndex(projectId: string): Promise<import("../../contracts/loop-graph.js").LoopGraphIndex> {
    return this.invoke("getLoopGraphIndex", projectId);
  }

  getLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return this.invoke("getLoopGraph", projectId, loopId);
  }

  upsertLoopGraph(
    projectId: string,
    document: import("../../contracts/loop-graph.js").LoopGraphDocument,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("upsertLoopGraph", projectId, document);
  }

  createLoopGraph(
    projectId: string,
    title?: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("createLoopGraph", projectId).then(async (doc) => {
      if (!title?.trim()) return doc;
      return this.upsertLoopGraph(projectId, { ...doc, title: title.trim() });
    });
  }

  deleteLoopGraph(projectId: string, loopId: string): Promise<boolean> {
    return this.invoke("deleteLoopGraph", projectId, loopId);
  }

  setLastActiveLoopGraph(projectId: string, loopId: string): Promise<void> {
    return this.invoke("setLastActiveLoopGraph", projectId, loopId);
  }

  linkLoopGraphToSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return this.invoke("linkLoopGraphToSession", projectId, loopId, sessionId);
  }

  unlinkLoopGraphFromSession(
    projectId: string,
    loopId: string,
    sessionId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument | null> {
    return this.invoke("unlinkLoopGraphFromSession", projectId, loopId, sessionId);
  }

  compileLoopGraph(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopCompileResult> {
    return this.invoke("compileLoopGraph", projectId, loopId);
  }

  approveLoopSpec(
    projectId: string,
    loopId: string,
    spec: import("../../contracts/loop-graph.js").LoopSpec,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("approveLoopSpec", projectId, loopId, spec);
  }

  startLoopInstance(
    projectId: string,
    loopId: string,
    specVersion?: string,
    featureNodeId?: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke(
      "startLoopInstance",
      projectId,
      loopId,
      specVersion ?? "",
      featureNodeId ?? "",
    );
  }

  pauseLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("pauseLoopInstance", projectId, loopId, instanceId);
  }

  resumeLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("resumeLoopInstance", projectId, loopId, instanceId);
  }

  resolveLoopHitl(
    projectId: string,
    loopId: string,
    instanceId: string,
    answers: import("../../contracts/loop-graph.js").LoopHitlAnswer[],
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("resolveLoopHitl", projectId, loopId, instanceId, answers);
  }

  getLoopInstanceEvents(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopInstanceEvent[]> {
    return this.invoke("getLoopInstanceEvents", projectId, loopId, instanceId);
  }

  advanceLoopInstance(
    projectId: string,
    loopId: string,
    instanceId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("advanceLoopInstance", projectId, loopId, instanceId);
  }

  sendLoopAuthoringTurn(
    projectId: string,
    loopId: string,
    request: import("../../contracts/loop-graph.js").LoopAuthoringTurnRequest,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("sendLoopAuthoringTurn", projectId, loopId, request);
  }

  answerLoopGoalClarification(
    projectId: string,
    loopId: string,
    answers: import("../../contracts/loop-graph.js").LoopGoalClarificationAnswer[],
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("answerLoopGoalClarification", projectId, loopId, answers);
  }

  cancelLoopGoalClarification(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("cancelLoopGoalClarification", projectId, loopId);
  }

  confirmLoopGoalContext(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("confirmLoopGoalContext", projectId, loopId);
  }

  acceptLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("acceptLoopGraphEditOffer", projectId, loopId);
  }

  dismissLoopGraphEditOffer(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("dismissLoopGraphEditOffer", projectId, loopId);
  }

  undoLoopDraft(
    projectId: string,
    loopId: string,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("undoLoopDraft", projectId, loopId);
  }

  setLoopComposerMode(
    projectId: string,
    loopId: string,
    mode: import("../../contracts/loop-graph.js").LoopComposerMode,
  ): Promise<import("../../contracts/loop-graph.js").LoopGraphDocument> {
    return this.invoke("setLoopComposerMode", projectId, loopId, mode);
  }

  initMapArtifactStack(
    projectId: string,
    artifactId: string,
    stackId: string,
  ): Promise<MapArtifact> {
    return this.invoke("initMapArtifactStack", projectId, artifactId, stackId);
  }

  attachMapArtifactToStack(
    projectId: string,
    artifactId: string,
    input: import("../../contracts/map-content.js").AttachMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.invoke("attachMapArtifactToStack", projectId, artifactId, input);
  }

  detachMapArtifactFromStack(
    projectId: string,
    artifactId: string,
    input: import("../../contracts/map-content.js").DetachMapArtifactInput,
  ): Promise<MapArtifact> {
    return this.invoke("detachMapArtifactFromStack", projectId, artifactId, input);
  }

  setMapArtifactStackActive(
    projectId: string,
    stackId: string,
    artifactId: string,
  ): Promise<MapArtifact> {
    return this.invoke("setMapArtifactStackActive", projectId, stackId, artifactId);
  }

  reorderMapArtifactStack(
    projectId: string,
    stackId: string,
    input: import("../../contracts/map-content.js").ReorderMapArtifactStackInput,
  ): Promise<MapArtifact> {
    return this.invoke("reorderMapArtifactStack", projectId, stackId, input);
  }

  applyMapWorkGroupMutation(
    projectId: string,
    input: import("../../contracts/map-work-group.js").MapWorkGroupMutationInput,
  ): Promise<MapContentDocument> {
    return this.invoke("applyMapWorkGroupMutation", projectId, input);
  }

  updateMapWorkGroup(
    projectId: string,
    workGroupId: string,
    patch: import("../../contracts/map-work-group.js").UpdateMapWorkGroupPatch,
  ): Promise<MapContentDocument> {
    return this.invoke("updateMapWorkGroup", projectId, workGroupId, patch);
  }

  transcribeAudio(
    request: import("../../contracts/voice-input.js").TranscribeAudioRequest,
  ): Promise<import("../../contracts/voice-input.js").TranscribeAudioResult> {
    return this.invoke("transcribeAudio", request);
  }
}
