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
import type { ProjectGraph } from "../../contracts/graph.js";
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

  analyzeWorkspace(projectId: string): Promise<ProjectGraph> {
    return this.invoke("analyzeWorkspace", projectId);
  }

  getProjectGraph(projectId: string): Promise<ProjectGraph> {
    return this.invoke("getProjectGraph", projectId);
  }

  getSemanticTree(projectId: string): Promise<SemanticTree> {
    return this.invoke("getSemanticTree", projectId);
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

  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return this.invoke("askAgent", request);
  }

  listSkills(projectId: string): Promise<ListSkillsResult> {
    return this.invoke("listSkills", projectId);
  }

  getSkill(projectId: string, skillId: string): Promise<SkillContent | null> {
    return this.invoke("getSkill", projectId, skillId);
  }

  createPlan(request: CreatePlanRequest): Promise<ImplementationPlan> {
    return this.invoke("createPlan", request);
  }

  updatePlan(request: UpdatePlanRequest): Promise<ImplementationPlan> {
    return this.invoke("updatePlan", request);
  }

  buildPlan(planId: string): Promise<PromptRefinement> {
    return this.invoke("buildPlan", planId);
  }

  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement> {
    return this.invoke("refinePrompt", request);
  }

  confirmExecution(refinementId: string): Promise<AgentRun> {
    return this.invoke("confirmExecution", refinementId);
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
