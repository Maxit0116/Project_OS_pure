import { create } from 'zustand'
import type {
  AgentAnswerResult,
  AgentConversationScope,
  AgentFlowStep,
  AgentActionEvent,
  AgentDelegationEvent,
  AgentProfile,
  AgentRun,
  AgentRunRole,
  AgentRunScope,
  AgentRunEvent,
  AgentTransientTrace,
  ApplyResult,
  ComposerDraft,
  ContextPayload,
  CurrentWorkState,
  GeneratedDiff,
  HarnessRecord,
  ProjectGraph,
  StructureScanOptions,
  StructureScanProgress,
  StructureScanProgressEvent,
  ProjectDescription,
  ProjectOSApi,
  ProjectOSProject,
  Disposable,
  ProjectOSSettings,
  RunDecision,
  RequestIntent,
  PromptRefinement,
  MemoryWriteNotice,
  McpServerConfig,
  McpToolDescriptor,
  McpCatalogView,
  InstallMcpFromCatalogInput,
  SkillCatalogView,
  InstallSkillFromCatalogInput,
  RulesCatalogView,
  InstallRulesFromCatalogInput,
  AgentCatalogView,
  InstallAgentFromCatalogInput,
  InstallAgentFromCatalogResult,
  ExportCapabilityPackInput,
  ExportCapabilityPackResult,
  InstallAgentFromExportPackInput,
  InstallRulesFromExportPackInput,
  WorkflowCatalogView,
  InstallWorkflowFromCatalogInput,
  InstallWorkflowFromExportPackInput,
  StencilCatalogView,
  InstallStencilFromCatalogInput,
  InstallStencilFromExportPackInput,
  StencilDefinition,
  LoopGraphPreset,
  AgentDefinition,
  InstallFromGitUrlInput,
  InstallFromGitUrlResult,
  SkillDescriptor,
  SemanticTree,
  ThinkingDepth,
  AskSubMode,
  FirstPrinciplesAnswerKind,
  FirstPrinciplesConflictResolution,
  FirstPrinciplesHandoffTarget,
  FirstPrinciplesSession,
  FirstPrinciplesThesis,
  WorkspaceDirectoryEntry,
  VerificationRunResult,
  VerificationCommandApprovalStatus,
  MapArtifactType,
  MapContentDocument,
  UpdateMapArtifactPatch,
} from '@contracts/index'
import type {
  FeaturesFile,
  FeaturesLayout,
  FeaturesStaleness,
  ExternalAgentConfig,
  TeamSnapshot,
  RelatedKnowledge,
  DailyBrief,
  DailyBriefNarrative,
  AnchorRef,
  CreateIdeaInput,
  EndWorkInput,
  CreateDecisionInput,
  UpdateDecisionInput,
  UpsertTeamPersonInput,
  TeamMeeting,
  TeamBrainAnswer,
  GitSyncStatus,
  GitSyncSettingsPatch,
  GitCommitInput,
} from './removedApiStubTypes'
import type {
  GitHubAuthStatus,
  GitHubDeviceAuthPending,
  UserAccountStatus,
} from '@contracts/index'
import {
  buildPromptComposerFields,
  emptyComposerDraft,
  emptyPinComposerHub,
  type PinComposerHub,
} from '@contracts/index'
import { appendComposerHubToPrompt } from '../components/SpatialComposeHub/composerHubPrompt'
import type { MapWorkGroupMutationInput, UpdateMapWorkGroupPatch, WorkGroupSelectionItem } from '@contracts/index'
import type { ExecutorOption, ExecutorSelection } from '@contracts/index'
import {
  FileOwnershipErrorDetailsSchema,
  MAP_ARTIFACT_DEFAULT_SIZES,
  emptyNoteDocument,
  looksLikeVisionPrompt,
} from '@contracts/index'
import { getActiveStackMember, getStackMembers, syncStackGeometry } from '@contracts/index'
import {
  FIRST_PRINCIPLES_SUGGEST_AUTO_DISMISS_MS,
} from '../notifications/notificationCenterTypes'
import {
  createFlowCorrection,
  handleRunEvent,
  settleOpenFlowSteps,
  type FlowCorrection,
} from './handleRunEvent'
import {
  delegatedParentBatchAllowsApply,
  hasAuthorizingParentBatchValid,
  isApplyAuthorizationRevoked,
} from './parentBatchApplyAuthorization'
import { createWorkbenchClient } from '../data/workbenchClient'
import { enrichGeneratedDiffFiles } from '../components/DiffReview/resolveDiffFileContent'
import { computeDiffFileStats } from '../components/PendingChangesDrawer/diffFileStats'
import {
  selectPendingChangesDrawerUndoMode,
  type DiffFileStat,
} from './pendingChangesDrawer'
import { isDesktopApp, usesRealFileContent } from '../data/clientMode'
import { getSampleFileContent } from '../data/sampleFileContents'
import { createClientId } from '../utils/clientId'
import { GOOGLE_LOGIN_PROMPT } from '../data/demoInputs'
import { AUTH_ERROR_RAW } from '../data/demoInputs'
import { withPlanQuestionOptions } from '../components/ChatPanel/planClarification'
import {
  activeChatSessionId,
  applyFirstPrinciplesAnswer,
  assistantReflectMessage,
  confirmThesisOnSession,
  maybeGenerateFirstPrinciplesDiagram,
  persistFirstPrinciplesSession,
  pivotFirstPrinciplesSession,
  runFirstPrinciplesHandoff,
  startFirstPrinciplesSession,
} from './firstPrinciplesWorkbench'
import { seedDeepSeekDevProfile } from '../dev/seedDeepSeekDevProfile'
import type { Locale } from '../i18n/types'
import type { ToastItem, ToastType } from '../components/ui/Toast'
import { getStoreMessage, loadLocale, saveLocale } from '../i18n/storeMessages'
import { applyStructureScanProgressEvent } from './structureScanProgress'
import {
  applyThemeToDocument,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../styles/theme'
import {
  clampPanelDimensions,
  loadPanelLayout,
  savePanelLayout,
} from '../layout/panelLayout'
import { useTerminalStore } from './terminalStore'
import { useActivityStore } from './activityStore'
import { useBottomDockStore } from './bottomDockStore'
import { useDiagnosticsStore } from './diagnosticsStore'
import { useOutlineStore } from './outlineStore'
import { useChatSessionStore } from './chatSessionStore'
import {
  applyAgentRunEventToOverlay,
  emptyExecutionOverlay,
  remapExecutionOverlay,
} from '../../../services/live-graph/index.js'
import { canSkipAlignment } from '../../../services/alignment-contract.js'
import {
  appendAttachment,
  setComposerText,
} from '../components/ChatPanel/composer/composerTokens'
import { useFileTimelineStore } from './fileTimelineStore'
import { rememberRecentWorkspace } from './recentWorkspaces'
import { recordProposedTimelineFromDiff } from './fileTimelineFromRunEvent'
import { lspClient } from '../lsp/lspClient'
import { languageForPath } from '../data/sampleFileContents'
import {
  logTransientTraceToActivity,
  logVerificationResultToActivity,
} from './activityLogFromRunEvent'
import type { MapArtifactCreateFlow, MapArtifactPlacement } from './mapArtifactCreateFlow'
export type { MapArtifactCreateFlow, MapArtifactPlacement } from './mapArtifactCreateFlow'
import type { MapWorkGroupCreateFlow } from './mapWorkGroupCreateFlow'
export type { MapWorkGroupCreateFlow } from './mapWorkGroupCreateFlow'
import type { MapArtifactRenameFlow } from './mapArtifactRenameFlow'
export type { MapArtifactRenameFlow } from './mapArtifactRenameFlow'
import type { PickedMapImageFile } from '../components/FunctionMap/pickMapImageFile'
import { sanitizeErrorMessage } from '../../../utils/sanitize-error-message'
import { userFacingErrorMessage, userFacingProviderText } from '../errors/userFacingError'
import {
  collectDirectoryAncestorPaths,
  collectSemanticAncestorIdsForPaths,
  mergeTreeExpansion,
  resolveSemanticTreeExpanded,
  resolveTreeExpanded,
} from '../components/SemanticFileTree/treeExpansion'
import {
  loadNotifyOnDiffReadyPreference,
  saveNotifyOnDiffReadyPreference,
} from '../preferences/diffReadyNotifications'
import {
  loadNotifyOnPendingDecisionPreference,
  markRunDecisionNotificationSeen,
  saveNotifyOnPendingDecisionPreference,
  wasRunDecisionNotificationSeen,
} from '../preferences/pendingDecisionNotifications'
import {
  loadChatModeSwitchPreference,
  saveChatModeSwitchPreference,
  type ChatModeSwitchPreference,
} from '../preferences/chatModeSwitch'
export type { ChatModeSwitchPreference } from '../preferences/chatModeSwitch'
import {
  loadKeepAwakeModePreference,
  saveKeepAwakeModePreference,
} from '../preferences/keepAwake'
import type { KeepAwakeMode, KeepAwakeStatus } from '@contracts/keep-awake'
function loadShowGestureCursorPreference(): boolean {
  return false
}
function saveShowGestureCursorPreference(_show: boolean): void {}
import {
  mergeDiffReadyCompletions,
  resolveNotificationChannelForCompletions,
  captureDiffReadyNotificationContext,
  filterDiffReadyCompletionsForNotification,
  truncateDiffReadySummary,
  type DiffReadyCompletion,
  type DiffReadyNotificationChannel,
} from '../notifications/diffReadyNotification'
import {
  enqueueDiffReadyBatch,
  resetDiffReadyBatch,
} from '../notifications/diffReadyNotificationBatch'
import {
  mergeReminderNotifyEvents,
  resolveReminderNotificationChannel,
  shouldSuppressReminderNotification,
} from '../notifications/reminderNotification'
import { kindForAgentDestination } from '../notifications/notificationCenterTypes'
import { useNotificationCenterStore } from './notificationCenterStore'
import {
  persistDefaultModelProfile,
  persistModelProfile,
  persistModelProfileDeletion,
  type SaveModelProfileInput,
} from './modelProfileMutations'
import { resolveFileOwnerSelection } from './fileOwnerSelection'
import { unmetRequirementsFromMessage, type UnmetRequirement } from './unmetRequirements'
import { isNodeAgentArchitectureLevel, resolveProjectedCodeNode } from '../components/FunctionMap/architectureView'
import { loadMapDetail, saveMapDetail, type MapDetail } from './mapDetailPreference'
import {
  closeEditorFileInLayout,
  initialEditorLayout,
  openFileInEditorLayout,
  setActiveEditorFileInLayout,
  reorderEditorFileInLayout,
  splitEditorLayout,
} from '../components/CodeEditor/editorPaneHelpers'
import type {
  EditorPane,
  EditorSplitDirection,
} from '../components/CodeEditor/editorTypes'

export type AppPhase = 'idle' | 'loading' | 'ready' | 'error'
export type CenterTab =
  | 'function-map'
  | 'spatial-captures'
  | 'code'
  | 'browser'

export type DesignSurfaceFocus =
  | { kind: 'epic'; epicId: string }
  | { kind: 'feature'; featureId: string }
  | { kind: 'step'; featureId: string; stepId: string }
export type MapLayerMode = 'architecture' | 'story'
export type StoryViewLevel = 'overview' | 'features' | 'steps'
export type RightPanelTab = 'chat' | 'harness'
export type CodeSubTab = 'editor' | 'diff'
export type AgentFlowViewMode = 'timeline' | 'graph' | 'pool'
export type TreeViewMode = 'semantic' | 'directory'

export interface DirectoryListing {
  status: 'loading' | 'ready' | 'error'
  entries: WorkspaceDirectoryEntry[]
}
export type ChatMode = 'ask' | 'change' | 'plan' | 'debug' | 'anchored'
export type AgentFlowSubject = 'ask' | 'run' | 'plan' | 'debug'
export type LatestAskTrace =
  | { status: 'running'; scope: AgentConversationScope }
  | { status: 'complete'; scope: AgentConversationScope; result: AgentAnswerResult }
  | { status: 'cancelled'; scope: AgentConversationScope }
  | { status: 'error'; scope: AgentConversationScope; message: string }
export type LatestPlanTrace =
  | { status: 'running'; scope: AgentConversationScope }
  | { status: 'complete'; scope: AgentConversationScope; result: import('@contracts/index').ImplementationPlan }
  | { status: 'needs_clarification'; scope: AgentConversationScope; result: import('@contracts/index').ImplementationPlan }
  | { status: 'cancelled'; scope: AgentConversationScope }
  | { status: 'error'; scope: AgentConversationScope; message: string }
export type { FlowCorrection } from './handleRunEvent'

export interface DelegatedRunTrace {
  taskId: string
  filePath: string
  nodeId?: string
  parentRunId?: string
  rootRunId?: string
  targetKind?: 'planner' | 'leaf-file'
  scopeKind?: AgentRunScope['kind']
  role?: AgentRunRole
  events: AgentRunEvent[]
  transientTraces: AgentTransientTrace[]
}

export interface PendingFileOwnerChoice {
  filePath: string
  candidateNodeIds: string[]
}

export interface ConversationCheckpoint {
  id: string
  messageId: string
  backupId: string
  runId: string
  createdAt: string
  filesChanged: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  format?: 'plain' | 'markdown'
  notice?: string
  timestamp: string
  attachments?: ComposerDraft['attachments']
  invokedSkillId?: string
  explorationTrace?: import('@contracts/index').AskExplorationTrace
  retrievalSummary?: import('@contracts/index').RetrievalSummary
  mcpToolCalls?: import('@contracts/index').AskMcpToolCall[]
  checkpointId?: string
  /**
   * Mode active when this user turn was sent (nav rail color / history).
   * Persisted turns can carry the stored session mode, including `team_memory`.
   */
  chatMode?: import('@contracts/index').ChatSessionMode
}

/** No node/file selection ⇒ whole-project (global) agent scope. */
/**
 * Keeps the project's `interfaceLanguage` equal to the language the person reads the app in, so that the
 * map generated next is written in it. Quiet: no toast, and nothing when they already agree.
 */
async function syncInterfaceLanguage(get: () => WorkbenchState): Promise<void> {
  const { project, settings, locale } = get()
  if (!project || !settings || settings.interfaceLanguage === locale) return
  try {
    await get().updateSettings({ interfaceLanguage: locale }, { silent: true })
  } catch {
    // The setting is a convenience; a failure must not disturb switching the interface.
  }
}

export function isGlobalAgentScope(state: {
  selectedNodeId: string | null
  selectedFilePath: string | null
  pendingFileOwnerChoice: PendingFileOwnerChoice | null
  fileScopeError: 'not_mapped' | null
}): boolean {
  if (state.pendingFileOwnerChoice || state.fileScopeError) return false
  if (state.selectedNodeId || state.selectedFilePath) return false
  return true
}

/**
 * The scope of an Ask, Plan or Debug conversation from the current selection. A code-level box on the
 * map has a view-only id the server does not know ("Selected node 'code_file_…' was not found"); it is
 * sent as the file it stands for, in the component that owns it, and as the whole project if the graph
 * cannot say which.
 */
export function conversationScopeFromSelection(state: {
  selectedNodeId: string | null
  selectedFilePath: string | null
  pendingFileOwnerChoice: PendingFileOwnerChoice | null
  fileScopeError: 'not_mapped' | null
  graph: { fileIndex: ReadonlyArray<{ path: string; nodeIds: string[] }> } | null
}): AgentConversationScope {
  if (isGlobalAgentScope(state)) return { kind: 'global' }
  const { selectedNodeId, selectedFilePath } = state
  if (selectedNodeId?.startsWith('code_file_')) {
    const projected = resolveProjectedCodeNode(state.graph?.fileIndex, selectedNodeId)
    if (!projected) return { kind: 'global' }
    return { kind: 'file', nodeId: projected.nodeId, selectedFilePath: selectedFilePath ?? projected.filePath }
  }
  return selectedFilePath
    ? { kind: 'file', nodeId: selectedNodeId!, selectedFilePath }
    : { kind: 'node', nodeId: selectedNodeId! }
}

/**
 * The node id the server can look up. A code-level box on the map has a view-only id
 * (`code_file_…`) the graph does not contain: it stands for a file inside a component, so the
 * component is what the server is told. Nothing when the graph cannot say which.
 */
export function serverNodeIdFor(
  fileIndex: ReadonlyArray<{ path: string; nodeIds: string[] }> | undefined,
  nodeId: string,
): string | undefined {
  if (!nodeId.startsWith('code_file_')) return nodeId
  return resolveProjectedCodeNode(fileIndex, nodeId)?.nodeId
}

/**
 * The node and file an Agent request names from the current selection (the same rule as
 * conversationScopeFromSelection, for the calls that take `nodeId` and `filePath` separately).
 */
export function requestTargetFromSelection(state: {
  selectedNodeId: string | null
  selectedFilePath: string | null
  graph: { fileIndex: ReadonlyArray<{ path: string; nodeIds: string[] }> } | null
}): { nodeId?: string; filePath?: string } {
  const { selectedNodeId, selectedFilePath } = state
  if (selectedNodeId?.startsWith('code_file_')) {
    const projected = resolveProjectedCodeNode(state.graph?.fileIndex, selectedNodeId)
    const filePath = selectedFilePath ?? projected?.filePath
    return {
      ...(projected ? { nodeId: projected.nodeId } : {}),
      ...(projected && filePath ? { filePath } : selectedFilePath ? { filePath: selectedFilePath } : {}),
    }
  }
  return {
    ...(selectedNodeId ? { nodeId: selectedNodeId } : {}),
    ...(selectedFilePath ? { filePath: selectedFilePath } : {}),
  }
}

/**
 * The executor a request carries. A chosen runtime applies to Agent-mode changes
 * only; Ask, Plan and Debug always use the selected model. Fixture and
 * presentation modes never carry a live choice.
 */
export function selectExecutorForRequest(state: {
  chatMode: ChatMode
  selectedModelProfileId: string | null
  selectedRuntimeId: string | null
  executorOptions: ExecutorOption[]
  settings: ProjectOSSettings | null
}): ExecutorSelection | undefined {
  if (state.settings?.presentationMode || state.settings?.execution.mode === 'fixture') return undefined
  if (
    state.chatMode === 'change' &&
    state.selectedRuntimeId !== null &&
    state.executorOptions.some((option) => option.executorId === state.selectedRuntimeId)
  ) {
    return { kind: 'runtime', runtimeProfileId: state.selectedRuntimeId }
  }
  return state.selectedModelProfileId
    ? { kind: 'model', modelProfileId: state.selectedModelProfileId }
    : undefined
}

export function canSubmitAgentPrompt(state: {
  chatMode: ChatMode
  globalAgentActive: boolean
  selectedNodeId: string | null
  selectedFilePath: string | null
  pendingFileOwnerChoice: PendingFileOwnerChoice | null
  fileScopeError: 'not_mapped' | null
  pendingPlan: import('@contracts/index').ImplementationPlan | null
  pendingIntent: RequestIntent | null
  modelSelectionPending?: boolean
}): boolean {
  if (state.modelSelectionPending) return false
  // The approval card is drawn only in Agent mode, so it can only hold up Agent mode: elsewhere the
  // person would be facing a disabled Send with nothing on screen to say why.
  if (state.pendingIntent && state.chatMode === 'change') return false
  if (isGlobalAgentScope(state)) {
    // M3.B: Ask/Debug/Anchored + Plan/Agent (global planner → leaf child runs)
    return (
      state.chatMode === 'ask' ||
      state.chatMode === 'debug' ||
      state.chatMode === 'anchored' ||
      state.chatMode === 'plan' ||
      state.chatMode === 'change'
    )
  }
  if (
    !state.selectedNodeId ||
    state.pendingFileOwnerChoice ||
    state.fileScopeError
  ) return false
  if (
    state.chatMode === 'plan' &&
    state.pendingPlan?.status === 'needs_clarification'
  ) {
    return false
  }
  return true
}

export function createFallbackChatMessage(
  fallback: NonNullable<PromptRefinement['fallback']>,
  locale: Locale,
): ChatMessage {
  const profile = fallback.profileId ? ` (profile ${fallback.profileId})` : ''
  const providerMessage = sanitizeErrorMessage(
    fallback.providerMessage ?? fallback.message,
  )
  return {
    id: msgId(),
    role: 'system',
    content: getStoreMessage(locale, 'chat.modelFallbackFailure', {
      profile,
      message: providerMessage,
    }),
    timestamp: new Date().toISOString(),
  }
}

export function createAskFailureChatMessage(
  error: unknown,
  locale: Locale,
): ChatMessage {
  return {
    id: msgId(),
    role: 'system',
    content: getStoreMessage(locale, 'chat.askFailure', {
      message: userFacingErrorMessage(error, locale),
    }),
    timestamp: new Date().toISOString(),
  }
}

function readFileOwnershipFailure(error: unknown):
  | { code: 'ownership_ambiguous'; candidateNodeIds: string[] }
  | { code: 'file_owner_not_found' }
  | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  if (code === 'file_owner_not_found') return { code }
  if (code !== 'ownership_ambiguous') return undefined
  const parsed = FileOwnershipErrorDetailsSchema.safeParse(
    (error as { details?: unknown }).details,
  )
  return parsed.success
    ? { code, candidateNodeIds: parsed.data.candidateNodeIds }
    : undefined
}

export type DiffReadyBannerState = {
  visible: boolean
  channel: Extract<DiffReadyNotificationChannel, 'map_banner' | 'center_banner'>
  title: string
  body: string
  destination: 'ask' | 'diff' | 'reminder'
  runIds: string[]
}

export interface WorkbenchState {
  phase: AppPhase
  error: string | null
  loadingMessage: string | null
  structureRescanLoading: boolean
  structureScanProgress: StructureScanProgress | null
  structureScanDisposable: Disposable | null
  client: ProjectOSApi
  project: ProjectOSProject | null
  graph: ProjectGraph | null
  tree: SemanticTree | null
  context: ContextPayload | null
  contextLoading: boolean
  refineLoading: boolean
  selectedNodeId: string | null
  selectedFilePath: string | null
  globalAgentActive: boolean
  pendingFileOwnerChoice: PendingFileOwnerChoice | null
  fileScopeError: 'not_mapped' | null
  highlightedFilePaths: string[]
  centerTab: CenterTab
  codeSubTab: CodeSubTab
  rightPanelTab: RightPanelTab
  editorBuffers: Record<string, string>
  editorSavedBuffers: Record<string, string>
  outlineExpanded: boolean
  timelineExpanded: boolean
  editorPanes: EditorPane[]
  editorSplitDirection: EditorSplitDirection | null
  focusedEditorPaneId: string
  markdownEditorViewModes: Record<string, import('../components/Markdown/markdownPath').MarkdownEditorViewMode>

  locale: Locale
  themePreference: ThemePreference
  /** Plain words (default) or the architecture vocabulary on the map. */
  mapDetail: MapDetail
  resolvedTheme: ResolvedTheme
  notifyOnDiffReady: boolean
  notifyOnPendingDecision: boolean
  /** When switching chat modes: open a fresh session (Cursor-like) or keep the same thread. */
  chatModeSwitch: ChatModeSwitchPreference
  /** Mac desktop: keep machine awake (incl. lid close) for agent work. */
  keepAwakeMode: KeepAwakeMode
  keepAwakeStatus: KeepAwakeStatus | null
  showGestureCursor: boolean
  windowFocused: boolean
  diffReadyBanner: DiffReadyBannerState | null
  toasts: ToastItem[]
  agentFlowViewMode: AgentFlowViewMode
  treeViewMode: TreeViewMode
  semanticTreeExpansion: Record<string, boolean>
  directoryTreeExpansion: Record<string, boolean>
  directoryListings: Record<string, DirectoryListing>
  selectedFlowStepId: string | null
  selectedActivityId: string | null
  /** When true, Agent Flow inspector tracks the running step; manual step select locks to that step. */
  flowInspectorFollowLive: boolean
  bouncingNodeIds: string[]
  flashKey: number
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  shouldStartOnboarding: boolean
  terminalLines: string[]
  leftPanelWidth: number
  rightPanelWidth: number
  terminalHeight: number
  panelResizing: boolean

  messages: ChatMessage[]
  pendingRefinement: PromptRefinement | null
  pendingIntent: RequestIntent | null
  refinementConfirmed: boolean
  pendingPlan: import('@contracts/index').ImplementationPlan | null
  /** Last plan that was built — used by Return to plan. */
  lastBuiltPlan: import('@contracts/index').ImplementationPlan | null
  planConfirmed: boolean
  debugSession: import('@contracts/index').DebugSession | null
  composerDraft: ComposerDraft
  /** Chat sidebar Compose Hub (Stage Dock) — same shape as spatial pin hub. */
  composerHub: PinComposerHub
  chatMode: ChatMode
  /** Ask-only secondary mode: Chat vs First Principles (立论). Not a ChatMode. */
  askSubMode: AskSubMode
  /** Active First Principles session (in-memory + thesis disk on upsert). */
  pendingFirstPrinciples: FirstPrinciplesSession | null
  firstPrinciplesBusy: boolean
  /** Soft-suggest dismissed for this chat session. */
  firstPrinciplesSuggestDismissed: boolean
  /** Pinned skill body injected every turn until cleared (Custom Mode). */
  activeCustomModeSkillId: string | null
  /** Built-in chat mode to restore when exiting Custom Mode. */
  customModePreviousChatMode: ChatMode | null
  /** Workforce agent for Agent Mode; null = General Agent. */
  activeAgentDefinitionId: string | null
  /** Cached display name for mode chip. */
  activeAgentDisplayName: string | null
  /** Composer substate: drafting a new specialized agent from NL. */
  createAgentComposerActive: boolean
  /** Pending draft card after create-agent submit. */
  pendingWorkforceDraft: {
    draft: import('@contracts/index').WorkforceAgentDraft
    sourcePrompt: string
    source: 'chat' | 'loop'
  } | null
  conversationCheckpoints: ConversationCheckpoint[]
  latestAskTrace: LatestAskTrace | null
  latestPlanTrace: LatestPlanTrace | null
  /** Last delivered six-slot record. The context bar reads only this. */
  latestContextAssembly: import('@contracts/index').ContextAssembly | null
  agentFlowSubject: AgentFlowSubject

  activeRunId: string | null
  decisionRootRunId: string | null
  runDecisions: RunDecision[]
  focusedDecisionId: string | null
  decisionResolvingIds: string[]
  flowSteps: AgentFlowStep[]
  flowActions: AgentActionEvent[]
  flowDelegationEvents: AgentDelegationEvent[]
  delegatedRunTraces: Record<string, DelegatedRunTrace>
  flowTransientTraces: AgentTransientTrace[]
  flowCorrections: FlowCorrection[]
  flowStatus: 'idle' | 'running' | 'complete' | 'awaiting_review' | 'error' | 'cancelled' | 'interrupted'
  /** Live Graph overlay driven by run events (see Live-Graph Dev Plan Phase 1). */
  executionOverlay: import('@contracts/index').ExecutionOverlay | null
  /** Phase 2: focus a task/phase so only its nodes and execution edges stay emphasized. */
  liveGraphFocusTaskId: string | null
  /** Phase 3: run id paused from the graph (interrupted); Resume calls continueAgentRun. */
  liveGraphPausedRunId: string | null
  diffReady: boolean
  /** Set when the run's proposal can be reviewed but not applied (no independent validation). */
  diffReviewOnlyReason: string | null
  /** Run ids whose Apply auth was revoked (cancel/interrupt); late valid must not unlock. */
  revokedApplyRunIds: string[]
  /** Requirements the independent review says a held change does not meet; Apply becomes "apply anyway". */
  diffUnmetRequirements: UnmetRequirement[]
  generatedDiff: GeneratedDiff | null
  applyResult: ApplyResult | null
  verificationResult: VerificationRunResult | null
  verificationCommandApproval: VerificationCommandApprovalStatus | null
  verificationLoading: boolean
  undoLoading: boolean
  pendingChangesDrawerExpanded: boolean
  pendingChangesDrawerDismissedRunId: string | null
  selectedDiffFilePath: string | null
  diffFileStats: DiffFileStat[]
  currentWork: CurrentWorkState | null
  projectDescription: ProjectDescription | null
  projectDescriptionSaving: boolean
  runDisposable: { dispose: () => void } | null

  harnessRecord: HarnessRecord | null
  harnessFixRunId: string | null

  settings: ProjectOSSettings | null
  settingsOpen: boolean
  /** When opening Settings, jump to this hub view once (e.g. teamGithub). */
  settingsFocusView: string | null
  /** Cached MCP marketplace catalog — prefetched when a workspace becomes ready. */
  mcpCatalogView: McpCatalogView | null
  /** Cached skill marketplace catalog — prefetched when a workspace becomes ready. */
  skillCatalogView: SkillCatalogView | null
  /** Cached rules marketplace catalog — prefetched when a workspace becomes ready. */
  rulesCatalogView: RulesCatalogView | null
  /** Cached agent marketplace catalog — prefetched when a workspace becomes ready. */
  agentCatalogView: AgentCatalogView | null
  /** Cached workflow marketplace catalog — prefetched when a workspace becomes ready. */
  workflowCatalogView: WorkflowCatalogView | null
  /** Cached stencil marketplace catalog — prefetched when a workspace becomes ready. */
  stencilCatalogView: StencilCatalogView | null
  /** Installed skill ids used by Marketplace install/uninstall badges. */
  installedMarketplaceSkillIds: string[]
  /** Installed rules pack ids (catalog installs under `.projectos/rules/<id>/`). */
  installedMarketplaceRulesPackIds: string[]
  /** Installed agent catalog listing ids (workforce defs with marketplaceProvenance). */
  installedMarketplaceAgentListingIds: string[]
  /** Installed workflow catalog listing ids (user presets under `.projectos/loop-presets/`). */
  installedMarketplaceWorkflowListingIds: string[]
  /** Installed stencil catalog listing ids (packs under `.projectos/stencils/`). */
  installedMarketplaceStencilListingIds: string[]
  /** Built-in UI stencils merged with user-installed marketplace packs. */
  mergedStencilDefinitions: StencilDefinition[]
  /** Marketplace catalog prefetch / refresh lifecycle. */
  marketplaceCatalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedModelProfileId: string | null
  /** Agent runtimes this build offers for single-file changes; empty in a production build. */
  executorOptions: ExecutorOption[]
  /** A chosen runtime replaces the model for Agent-mode changes only. */
  selectedRuntimeId: string | null
  modelSelectionPending: boolean
  mapContent: MapContentDocument | null
  features: FeaturesFile | null
  featuresBaseline: FeaturesFile | null
  featuresLayout: FeaturesLayout | null
  featuresStaleness: FeaturesStaleness | null
  selectedStoryFeatureId: string | null
  designSurfaceFocus: DesignSurfaceFocus | null
  designSurfaceFocusToken: number
  featuresLiveReload: boolean
  mapLayer: MapLayerMode
  storyViewLevel: StoryViewLevel
  storyFocusedFeatureId: string | null
  selectedArtifactId: string | null
  mapArtifactCreateFlow: MapArtifactCreateFlow | null
  mapArtifactRenameFlow: MapArtifactRenameFlow | null
  mapWorkGroupCreateFlow: MapWorkGroupCreateFlow | null
  teamSnapshot: TeamSnapshot | null
  relatedKnowledge: RelatedKnowledge | null
  dailyBrief: DailyBrief | null
  dailyBriefNarrative: DailyBriefNarrative | null
  githubAuthStatus: GitHubAuthStatus | null
  userAccountStatus: UserAccountStatus | null
  userAccountGooglePending: boolean
  /** True while account-menu GitHub sign-in awaits Device Flow completion. */
  userAccountGitHubSignInIntent: boolean
  gitSyncStatus: GitSyncStatus | null
  activeHandoffId: string | null
  teamLoading: boolean
  ideaModalOpen: boolean
  endWorkModalOpen: boolean
  commitModalOpen: boolean
  decisionModalOpen: boolean
  rosterModalOpen: boolean
  meetingImportOpen: boolean
  githubDeviceAuthPending: GitHubDeviceAuthPending | null
  githubAuthPollTimer: ReturnType<typeof setInterval> | null
  googleAuthPollTimer: ReturnType<typeof setInterval> | null
  handoffOverwriteHandoffId: string | null
  chatAnchor: AnchorRef | null
  lastAnchoredAnswer: TeamBrainAnswer | null
  meetingDraft: TeamMeeting | null
  publishBriefConfirm: boolean

  setLocale: (locale: Locale) => void
  setThemePreference: (theme: ThemePreference) => void
  setMapDetail: (value: MapDetail) => void
  setResolvedTheme: (theme: ResolvedTheme) => void
  setNotifyOnDiffReady: (enabled: boolean) => void
  setNotifyOnPendingDecision: (enabled: boolean) => void
  setChatModeSwitch: (value: ChatModeSwitchPreference) => void
  setKeepAwakeMode: (mode: KeepAwakeMode) => Promise<void>
  setKeepAwakeStatus: (status: KeepAwakeStatus | null) => void
  setShowGestureCursor: (show: boolean) => void
  setWindowFocused: (focused: boolean) => void
  dismissDiffReadyBanner: () => void
  navigateToDiffReview: () => Promise<void>
  navigateToDiffReviewFile: (path?: string) => Promise<void>
  clearSelectedDiffFilePath: () => void
  setPendingChangesDrawerExpanded: (expanded: boolean) => void
  dismissPendingChanges: () => void
  undoAllPendingChanges: () => Promise<void>
  navigateFromAgentNotification: (
    destination: 'ask' | 'diff' | 'reminder' | 'decisions',
    runId?: string,
    decisionId?: string,
  ) => Promise<void>
  /** Fire Reminder Graph due/ready/conflict alerts (system or in-app banner). */
  notifyReminderEvents: (
    events: import('@contracts/index').ReminderNotifyEvent[],
    opts?: { focusedItemId?: string | null },
  ) => void
  maybeNotifyAgentComplete: (item: Omit<DiffReadyCompletion, 'context'> & { context?: DiffReadyCompletion['context'] }) => void
  pushToast: (opts: { type: ToastType; message: string; autoDismiss?: number }) => void
  dismissToast: (id: string) => void
  setAgentFlowViewMode: (mode: AgentFlowViewMode) => void
  setTreeViewMode: (mode: TreeViewMode) => void
  toggleSemanticTreeExpanded: (nodeId: string, depth: number) => void
  toggleDirectoryTreeExpanded: (folderPath: string, depth: number) => void
  loadDirectoryListing: (relativePath: string) => Promise<void>
  setSelectedFlowStepId: (id: string | null) => void
  setSelectedActivityId: (id: string | null) => void
  setFlowInspectorFollowLive: (follow: boolean) => void
  setLiveGraphFocusTask: (taskId: string | null) => void
  /** Attach file/node as composer context (read-only; does not expand write scope). */
  addGraphContextFromNode: (nodeId: string) => void
  /** Prefill composer with an instruction scoped to the node; opens chat. */
  sendGraphInstructionFromNode: (nodeId: string, instruction: string) => void
  /** Pause via harness interrupt (not cancel). */
  pauseAgentFromGraph: () => Promise<void>
  /** Resume a graph-paused (interrupted) run. */
  resumeAgentFromGraph: () => Promise<void>
  /** Approve pending verification commands — same path as Diff panel. */
  approveFromGraph: () => Promise<void>
  /** Reject / dismiss pending verification approval without approving. */
  rejectFromGraph: () => void
  setLeftPanelOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  clearShouldStartOnboarding: () => void
  triggerFlash: () => void
  injectFlowCorrection: (stepId: string, message: string) => Promise<void>

  openSampleWorkspace: () => Promise<void>
  openWorkspace: (path: string) => Promise<void>
  rescanStructureGraph: (options?: StructureScanOptions) => Promise<void>
  cancelStructureScan: () => Promise<void>
  /** Debounced refine when workspace files change (C4 Pulse incremental). */
  queueStructureRefineForChangedFiles: (changedFiles: string[]) => void
  setCenterTab: (tab: CenterTab) => void
  setMapLayer: (layer: MapLayerMode) => void
  setStoryView: (next: {
    level: StoryViewLevel
    focusedFeatureId?: string | null
  }) => void
  saveFeaturesLayout: (layout: FeaturesLayout) => Promise<void>
  saveFeatures: (features: FeaturesFile) => Promise<void>
  openDesignSurface: (focus: DesignSurfaceFocus) => void
  approvePlannedFeature: (featureId: string) => Promise<void>
  rejectPlannedFeature: (featureId: string) => Promise<void>
  refreshFeaturesStaleness: () => Promise<void>
  refreshFeaturesFromDisk: () => Promise<void>
  setFeaturesLiveReload: (enabled: boolean) => void
  requestFeaturesSync: () => void
  requestFeaturesScan: () => void
  selectStoryFeature: (featureId: string) => Promise<void>
  setCodeSubTab: (tab: CodeSubTab) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  setChatInput: (value: string) => void
  setComposerDraft: (draft: ComposerDraft) => void
  setComposerHub: (hub: PinComposerHub) => void
  /**
   * Switch chat mode. Default preference (`chatModeSwitch: 'same_session'`) flips
   * mode in the current chat (Cursor-like multi-mode thread). Opt into
   * `new_session` in Settings to open a fresh chat on each switch. Pass
   * `{ isolate: false }` to force in-place even when preference is `new_session`.
   */
  setChatMode: (mode: ChatMode, options?: { isolate?: boolean }) => Promise<void>
  setAskSubMode: (mode: AskSubMode) => void
  dismissFirstPrinciplesSuggest: () => void
  /** After Ask send: soft-suggest First Principles via ephemeral notification. */
  maybeSuggestFirstPrinciplesAfterAskSend: (prompt: string) => void
  beginFirstPrinciplesFromVision: (vision: string) => Promise<void>
  answerFirstPrinciplesQuestion: (input: {
    questionId: string
    kind: FirstPrinciplesAnswerKind
    selectedOptionId?: string
    text?: string
  }) => Promise<void>
  confirmFirstPrinciplesThesis: (
    thesis: FirstPrinciplesThesis,
    acknowledgeLowConfidence?: boolean,
    writePlannedFeature?: boolean,
  ) => Promise<void>
  resolveFirstPrinciplesConflict: (
    resolution: FirstPrinciplesConflictResolution,
    rephraseText?: string,
  ) => Promise<void>
  pivotFirstPrinciples: () => Promise<void>
  handoffFirstPrinciples: (target: FirstPrinciplesHandoffTarget) => Promise<void>
  /** Stop the active agent run (dispose stream + server cancel). */
  stopAgentRun: () => Promise<void>
  updateEditorBuffer: (path: string, content: string) => void
  saveEditorFile: (path: string) => Promise<void>
  isEditorDirty: (path: string) => boolean
  setOutlineExpanded: (expanded: boolean) => void
  setTimelineExpanded: (expanded: boolean) => void
  setActiveEditorFile: (paneId: string, filePath: string) => void
  setFocusedEditorPane: (paneId: string) => void
  closeEditorFile: (filePath: string, paneId?: string) => void
  setMarkdownEditorViewMode: (
    filePath: string,
    mode: import('../components/Markdown/markdownPath').MarkdownEditorViewMode,
  ) => void
  reorderEditorFile: (paneId: string, filePath: string, toIndex: number) => void
  splitEditor: (direction: EditorSplitDirection) => void
  selectNode: (nodeId: string) => Promise<void>
  openNodeAgentChat: (nodeId: string) => Promise<void>
  openGlobalAgentChat: () => void
  openFileAgentChat: (filePath: string, preferredNodeId: string) => Promise<void>
  selectFile: (filePath: string, preferredNodeId?: string) => Promise<void>
  chooseFileOwner: (nodeId: string) => void
  /** Give the selected file, which no node owns, to a node so Agent can change it. */
  assignFileOwner: (nodeId: string) => Promise<void>
  clearSelection: () => void
  dismissError: () => void
  sendPrompt: (input: string | ComposerDraft) => Promise<void>
  confirmRefinement: (
    alignment?: import('@contracts/index').ConfirmAlignmentRequest,
    onStarted?: (run: AgentRun) => void,
  ) => Promise<void>
  reviseRefinement: () => void
  confirmBugAlignment: (
    bugs: Array<{ id: string; selected: boolean; comment?: string; rejected?: boolean }>,
  ) => Promise<void>
  markBugFixed: (bugId: string) => Promise<void>
  confirmPlanBuild: () => Promise<void>
  submitPlanClarification: (
    answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }>,
  ) => Promise<void>
  revisePlan: () => void
  savePlanEdits: (patch: {
    objective: string
    steps: import('@contracts/index').ImplementationPlan['steps']
    todos: import('@contracts/index').ImplementationPlan['todos']
    rationale: string
  }) => Promise<void>
  savePlanToWorkspace: () => Promise<void>
  returnToPlan: () => void
  setActiveCustomModeSkillId: (skillId: string | null) => void
  exitCustomMode: () => void
  setActiveAgentDefinitionId: (
    definitionId: string | null,
    displayName?: string | null,
  ) => void
  beginCreateAgentComposer: (source?: 'chat' | 'loop') => void
  /** Prefill Draft Card from an Agent Template (catalog listing). */
  beginWorkforceDraftFromAgentListing: (
    listing: import('@contracts/index').AgentCatalogListing,
    options?: { asAdditionalInstance?: boolean; source?: 'chat' | 'loop' },
  ) => void
  cancelCreateAgentComposer: () => void
  submitCreateAgentPrompt: (prompt: string, source?: 'chat' | 'loop') => Promise<void>
  confirmWorkforceDraft: (options?: {
    placeOnLoop?: boolean
    useInChat?: boolean
  }) => Promise<import('@contracts/index').AgentDefinition | null>
  dismissWorkforceDraft: () => void
  updatePendingWorkforceDraft: (
    draft: import('@contracts/index').WorkforceAgentDraft,
  ) => void
  /** Marketplace Installed compose: assemble proposal (local ± catalog). */
  assembleWorkforceAgent: (input: {
    prompt: string
    scope: import('@contracts/index').AssemblySearchScope
    seedSkillIds?: string[]
    seedMcpServerIds?: string[]
  }) => Promise<import('@contracts/index').AssembleWorkforceAgentResult | null>
  /**
   * Install selected missing bindings then create workforce agent.
   * Returns created definition id, or null on failure.
   */
  confirmMarketplaceAgentAssembly: (input: {
    draft: import('@contracts/index').WorkforceAgentDraft
    bindings: import('@contracts/index').AssemblyBinding[]
    installOnly?: boolean
  }) => Promise<{
    createdId: string | null
    bindings: import('@contracts/index').AssemblyBinding[]
    installErrorIds: string[]
  } | null>
  loadPlanFromWorkspace: (planId: string) => Promise<void>
  listWorkspacePlans: () => Promise<
    Array<{
      id: string
      path: string
      objective: string
      status?: string
      updatedAt?: string
    }>
  >
  restoreConversationCheckpoint: (checkpointId: string) => Promise<void>
  loadRunDecisions: (rootRunId?: string) => Promise<void>
  resolveRunDecision: (
    decision: RunDecision,
    optionId: string,
    text?: string,
    status?: 'resolved' | 'declined',
  ) => Promise<void>
  submitDebugRepro: () => Promise<void>
  approveRequestIntent: (answers?: Array<{ questionId: string; answer: string; selectedOptionId?: string }>) => Promise<void>
  reviseRequestIntent: () => void
  confirmDebugFix: () => Promise<void>
  markDebugFixed: () => Promise<void>
  loadDiff: (runId?: string) => Promise<void>
  applyCurrentDiff: (options?: { anyway?: boolean }) => Promise<void>
  runCurrentVerification: () => Promise<void>
  approveAndRunCurrentVerification: () => Promise<void>
  undoCurrentApply: () => Promise<void>
  triggerAuthError: () => Promise<void>
  startHarnessFix: () => Promise<void>
  resetDemo: () => Promise<void>
  runGoogleLoginScenario: () => Promise<void>
  appendTerminalLine: (line: string) => void
  setLeftPanelWidth: (width: number) => void
  setRightPanelWidth: (width: number) => void
  setTerminalHeight: (height: number) => void
  adjustLeftPanelWidth: (delta: number) => number
  adjustRightPanelWidth: (delta: number) => number
  adjustTerminalHeight: (delta: number) => number
  setPanelResizing: (resizing: boolean) => void
  reclampPanelLayout: () => void

  loadSettings: () => Promise<void>
  saveProjectDescription: (conciseDescription: string) => Promise<void>
  updateSettings: (patch: Partial<ProjectOSSettings>, options?: { silent?: boolean }) => Promise<void>
  saveModelProfile: (input: SaveModelProfileInput) => Promise<boolean>
  deleteModelProfile: (profileId: string) => Promise<boolean>
  setDefaultModelProfile: (profileId: string) => Promise<boolean>
  saveAgentProfile: (profile: AgentProfile) => Promise<boolean>
  saveExternalAgent: (config: ExternalAgentConfig, authToken?: string) => Promise<boolean>
  saveMcpServer: (config: McpServerConfig, authToken?: string) => Promise<boolean>
  deleteMcpServer: (serverId: string) => Promise<boolean>
  testModelConnection: (profileId: string) => Promise<void>
  testExternalAgent: (agentId: string) => Promise<void>
  testMcpServer: (serverId: string) => Promise<void>
  refreshMcpTools: (serverId: string) => Promise<McpToolDescriptor[]>
  listMcpCatalog: (options?: { forceRefresh?: boolean }) => Promise<McpCatalogView | null>
  refreshMcpCatalog: () => Promise<McpCatalogView | null>
  installMcpFromCatalog: (input: InstallMcpFromCatalogInput) => Promise<boolean>
  disableMcpCatalogListing: (listingId: string) => Promise<boolean>
  reportMcpCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  listSkillCatalog: (options?: { forceRefresh?: boolean }) => Promise<SkillCatalogView | null>
  refreshSkillCatalog: () => Promise<SkillCatalogView | null>
  installSkillFromCatalog: (input: InstallSkillFromCatalogInput) => Promise<SkillDescriptor | null>
  uninstallSkillFromCatalog: (listingId: string) => Promise<boolean>
  uninstallMcpListing: (listingId: string) => Promise<boolean>
  disableSkillCatalogListing: (listingId: string) => Promise<boolean>
  reportSkillCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  listRulesCatalog: (options?: { forceRefresh?: boolean }) => Promise<RulesCatalogView | null>
  refreshRulesCatalog: () => Promise<RulesCatalogView | null>
  installRulesFromCatalog: (
    input: InstallRulesFromCatalogInput,
  ) => Promise<{ packId: string; relativeRoot: string } | null>
  uninstallRulesFromCatalog: (listingId: string) => Promise<boolean>
  disableRulesCatalogListing: (listingId: string) => Promise<boolean>
  reportRulesCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  listAgentCatalog: (options?: { forceRefresh?: boolean }) => Promise<AgentCatalogView | null>
  refreshAgentCatalog: () => Promise<AgentCatalogView | null>
  installAgentFromCatalog: (
    input: InstallAgentFromCatalogInput,
  ) => Promise<InstallAgentFromCatalogResult | null>
  uninstallAgentFromCatalog: (listingId: string) => Promise<boolean>
  disableAgentCatalogListing: (listingId: string) => Promise<boolean>
  reportAgentCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  exportCapabilityPack: (
    input: ExportCapabilityPackInput,
  ) => Promise<ExportCapabilityPackResult | null>
  installAgentFromExportPack: (
    input: InstallAgentFromExportPackInput,
  ) => Promise<AgentDefinition | null>
  installRulesFromExportPack: (
    input: InstallRulesFromExportPackInput,
  ) => Promise<{ packId: string; relativeRoot: string } | null>
  listWorkflowCatalog: (options?: { forceRefresh?: boolean }) => Promise<WorkflowCatalogView | null>
  refreshWorkflowCatalog: () => Promise<WorkflowCatalogView | null>
  installWorkflowFromCatalog: (
    input: InstallWorkflowFromCatalogInput,
  ) => Promise<LoopGraphPreset | null>
  uninstallWorkflowFromCatalog: (listingId: string) => Promise<boolean>
  disableWorkflowCatalogListing: (listingId: string) => Promise<boolean>
  reportWorkflowCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  installWorkflowFromExportPack: (
    input: InstallWorkflowFromExportPackInput,
  ) => Promise<LoopGraphPreset | null>
  listStencilCatalog: (options?: { forceRefresh?: boolean }) => Promise<StencilCatalogView | null>
  refreshStencilCatalog: () => Promise<StencilCatalogView | null>
  installStencilFromCatalog: (
    input: InstallStencilFromCatalogInput,
  ) => Promise<StencilDefinition[] | null>
  uninstallStencilFromCatalog: (listingId: string) => Promise<boolean>
  disableStencilCatalogListing: (listingId: string) => Promise<boolean>
  reportStencilCatalogListing: (input: { listingId: string; note?: string }) => Promise<boolean>
  installStencilFromExportPack: (
    input: InstallStencilFromExportPackInput,
  ) => Promise<StencilDefinition[] | null>
  listMergedStencilDefinitions: () => Promise<StencilDefinition[]>
  listLoopGraphPresets: () => Promise<{ builtins: LoopGraphPreset[]; user: LoopGraphPreset[] } | null>
  resolveLoopGraphPreset: (presetId: string) => Promise<LoopGraphPreset | null>
  /** Warm MCP + skill + rules + agent + workflow catalogs in the background after a project opens. */
  prefetchMarketplaceCatalogs: () => Promise<void>
  refreshInstalledMarketplaceSkills: () => Promise<void>
  refreshInstalledMarketplaceRulesPacks: () => Promise<void>
  refreshInstalledMarketplaceAgents: () => Promise<void>
  refreshInstalledMarketplaceWorkflows: () => Promise<void>
  refreshInstalledMarketplaceStencils: () => Promise<void>
  /** Install MCP or skill from a GitHub / git URL (deterministic installer). */
  installFromGitUrl: (input: InstallFromGitUrlInput) => Promise<InstallFromGitUrlResult | null>
  setSettingsOpen: (open: boolean, focusView?: string | null) => void
  clearSettingsFocusView: () => void
  setSelectedModelProfileId: (profileId: string | null) => void
  loadExecutorOptions: () => Promise<void>
  selectRuntimeExecutor: (executorId: string | null) => void
  selectChatModel: (profileId: string) => Promise<boolean>
  setThinkingDepth: (depth: ThinkingDepth) => Promise<void>
  setPresentationMode: (enabled: boolean) => Promise<void>
  loadMapContent: () => Promise<void>
  refreshTeamSnapshot: () => Promise<void>
  setActivePerson: (personId: string) => Promise<void>
  claimSelectedNode: () => Promise<void>
  completeSelectedFeature: () => Promise<void>
  submitSelectedAcceptance: () => Promise<void>
  resolveSelectedAcceptance: (
    action: 'accept' | 'reject',
    reviewerNote?: string,
    acceptWithGap?: boolean,
  ) => Promise<void>
  endWork: (input?: EndWorkInput) => Promise<void>
  continueHandoff: (handoffId: string, confirmOverwrite?: boolean) => Promise<void>
  confirmHandoffOverwrite: () => Promise<void>
  dismissHandoffOverwrite: () => void
  markSelectedNodePlanned: () => Promise<void>
  createQuickIdea: (input: CreateIdeaInput | string) => Promise<void>
  setIdeaModalOpen: (open: boolean) => void
  setEndWorkModalOpen: (open: boolean) => void
  setCommitModalOpen: (open: boolean) => void
  setDecisionModalOpen: (open: boolean) => void
  setRosterModalOpen: (open: boolean) => void
  setMeetingImportOpen: (open: boolean) => void
  setGitHubDeviceAuthPending: (pending: GitHubDeviceAuthPending | null) => void
  refreshGitHubAuthStatus: () => Promise<void>
  refreshUserAccountStatus: () => Promise<void>
  connectGoogleAccount: () => Promise<void>
  cancelGoogleOAuth: () => Promise<void>
  signInUserAccountWithGitHub: () => Promise<void>
  signOutUserAccount: () => Promise<void>
  refreshGitSyncStatus: () => Promise<void>
  connectGitHub: () => Promise<void>
  importGitHubFromGhCli: () => Promise<void>
  saveGitHubOAuthClientId: (clientId: string) => Promise<void>
  cancelGitHubOAuth: () => Promise<void>
  disconnectGitHub: () => Promise<void>
  gitPull: () => Promise<void>
  gitPush: () => Promise<void>
  gitCommit: (input: GitCommitInput) => Promise<void>
  updateGitSyncSettings: (patch: GitSyncSettingsPatch) => Promise<void>
  generateDailyBriefNarrative: () => Promise<void>
  publishDailyBriefToPullRequest: () => Promise<void>
  setPublishBriefConfirm: (confirm: boolean) => void
  upsertRosterPerson: (input: UpsertTeamPersonInput) => Promise<void>
  saveDecision: (input: CreateDecisionInput) => Promise<void>
  patchDecision: (input: UpdateDecisionInput) => Promise<void>
  removeDecision: (decisionId: string) => Promise<void>
  importTranscript: (title: string, text: string) => Promise<void>
  applyMeetingDraft: (acceptDecisionIds: string[], acceptNodeTempRefs: string[]) => Promise<void>
  setChatAnchor: (anchor: AnchorRef | null) => void
  writeAnchoredAnswerAsDecision: () => Promise<void>
  openRelatedKnowledge: (kind: string, id: string) => Promise<void>
  beginMapArtifactCreate: (type: MapArtifactType, placement: MapArtifactPlacement) => void
  cancelMapArtifactCreate: () => void
  beginMapWorkGroupCreate: (flow: MapWorkGroupCreateFlow) => void
  cancelMapWorkGroupCreate: () => void
  confirmMapWorkGroupCreate: (items: WorkGroupSelectionItem[]) => Promise<boolean>
  beginMapArtifactRename: (
    artifactId: string,
    artifactType: MapArtifactType,
    initialTitle: string,
  ) => void
  cancelMapArtifactRename: () => void
  beginMapArtifactStackAdd: (hostArtifactId: string) => Promise<void>
  setStackActiveMember: (stackId: string, artifactId: string) => Promise<void>
  reorderStackMembers: (stackId: string, orderedArtifactIds: string[]) => Promise<void>
  attachArtifactToStack: (artifactId: string, targetNodeId: string) => Promise<void>
  detachArtifactFromStack: (
    artifactId: string,
    position: { x: number; y: number },
  ) => Promise<void>
  createMapArtifact: (
    type: MapArtifactType,
    position: { x: number; y: number },
    options?: { title?: string; anchorNodeId?: string; stackId?: string },
  ) => Promise<void>
  createMapImageArtifact: (
    position: { x: number; y: number },
    size: { width: number; height: number },
    file: PickedMapImageFile,
    options?: { anchorNodeId?: string; stackId?: string },
  ) => Promise<void>
  updateMapArtifact: (artifactId: string, patch: UpdateMapArtifactPatch) => Promise<void>
  applyMapWorkGroupMutation: (input: MapWorkGroupMutationInput) => Promise<boolean>
  updateMapWorkGroup: (workGroupId: string, patch: UpdateMapWorkGroupPatch) => Promise<void>
  deleteMapArtifact: (artifactId: string) => Promise<void>
  selectArtifact: (artifactId: string | null) => void
}

function msgId() {
  return createClientId('msg_')
}

function toastId() {
  return createClientId('toast_')
}

function notifyMemoryWrite(
  pushToast: WorkbenchState['pushToast'],
  locale: Locale,
  notice: MemoryWriteNotice | undefined,
) {
  if (!notice) return
  const key = !notice.accepted
    ? 'toast.memoryRejected'
    : notice.op === 'forget'
      ? 'toast.memoryForgotten'
      : 'toast.memorySaved'
  pushToast({
    type: notice.accepted ? 'info' : 'warning',
    message: getStoreMessage(locale, key),
  })
}

type FlowStatus = WorkbenchState['flowStatus']

export async function reconcileStaleFlowStatus(
  client: ProjectOSApi,
  activeRunId: string | null,
  flowStatus: FlowStatus,
): Promise<FlowStatus> {
  if (flowStatus !== 'running') return flowStatus
  if (!activeRunId) return 'idle'
  try {
    const run = await client.getAgentRun(activeRunId)
    if (run.status === 'running' || run.status === 'queued') return 'running'
    if (run.status === 'awaiting_review') return 'awaiting_review'
    if (run.status === 'cancelled') return 'cancelled'
    if (run.status === 'error') return 'error'
    // These used to fall through to "complete", which told a person an interrupted or stopped run had finished.
    if (run.status === 'interrupted') return 'interrupted'
    return 'complete'
  } catch {
    return 'idle'
  }
}

/**
 * The sentence a person sees for a failed request: coded errors in their language, provider
 * failures explained, wrapper text stripped. The raw message used to reach the banner, so a Chinese
 * UI showed "The model did not return a usable planning step after a retry".
 */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error
    ? userFacingErrorMessage(error, useWorkbenchStore.getState().locale)
    : fallback
}

/** Compact, user-visible reason for structure rescan failures (IPC preserves message). */
function formatStructureRescanFailure(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message.trim()) return null
  const sanitized = sanitizeErrorMessage(error.message).replace(/\s+/g, ' ').trim()
  if (!sanitized) return null
  return sanitized.length > 180 ? `${sanitized.slice(0, 177)}…` : sanitized
}

function isStructureScanCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  if (code === 'operation_cancelled') return true
  const message = error instanceof Error ? error.message : ''
  return /structure map generation was cancelled|operation_cancelled/i.test(message)
}

function isOperationCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  if (code === 'operation_cancelled') return true
  const message = error instanceof Error ? error.message : String(error)
  return /operation_cancelled|Model request cancelled/i.test(message)
}

function ensureBuffer(buffers: Record<string, string>, path: string): Record<string, string> {
  if (buffers[path] !== undefined) return buffers
  if (usesRealFileContent()) return buffers
  return { ...buffers, [path]: getSampleFileContent(path) }
}

function shouldFetchFileContentFromDisk(
  editorSavedBuffers: Record<string, string>,
  filePath: string,
): boolean {
  return usesRealFileContent() && editorSavedBuffers[filePath] === undefined
}

function needsFileContextLoading(context: ContextPayload | null, filePath: string): boolean {
  return context?.scope !== 'file' || context.filePath !== filePath
}

function openLspDocumentIfReady(filePath: string, content: string): void {
  if (lspClient.isAvailable()) {
    lspClient.openDocument(filePath, languageForPath(filePath), content)
  }
}

function clearEditorBuffers(): Record<string, string> {
  return {}
}

function buildNodeSelectionPatch(
  state: Pick<
    WorkbenchState,
    | 'graph'
    | 'tree'
    | 'semanticTreeExpansion'
    | 'directoryTreeExpansion'
    | 'flashKey'
  >,
  nodeId: string,
): Partial<WorkbenchState> {
  const node = state.graph?.nodes.find((candidate) => candidate.id === nodeId)
  const highlightedFilePaths = node?.linkedFiles.map((file) => file.path) ?? []
  const semanticRevealIds =
    state.tree && highlightedFilePaths.length > 0
      ? collectSemanticAncestorIdsForPaths(state.tree.roots, highlightedFilePaths)
      : []
  const directoryRevealPaths = highlightedFilePaths.flatMap(collectDirectoryAncestorPaths)

  return {
    globalAgentActive: false,
    selectedNodeId: nodeId,
    selectedFilePath: null,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    highlightedFilePaths,
    semanticTreeExpansion: mergeTreeExpansion(
      state.semanticTreeExpansion,
      semanticRevealIds,
    ),
    directoryTreeExpansion: mergeTreeExpansion(
      state.directoryTreeExpansion,
      directoryRevealPaths,
    ),
    contextLoading: true,
    flashKey: state.flashKey + 1,
  }
}

function applyDiffToBuffers(
  buffers: Record<string, string>,
  diff: GeneratedDiff,
): Record<string, string> {
  const next = { ...buffers }
  for (const file of diff.files) {
    if (file.after !== undefined) next[file.path] = file.after
  }
  return next
}

function scheduleChatSessionPersist(): void {
  const chatSessionStore = useChatSessionStore.getState()
  chatSessionStore.schedulePersist()
  chatSessionStore.scheduleTitleSummarize()
}

/** Project the just-sent prompt onto Session Graph before async agent work finishes. */
function syncChatSessionHeadNow(): void {
  useChatSessionStore.getState().syncActiveHeadFromWorkbench()
}

function chatSessionRequestFields(): { chatSessionId?: string } {
  const chatSessionId = useChatSessionStore.getState().activeSessionId
  return chatSessionId ? { chatSessionId } : {}
}

function disposeActiveRunSubscriptions(
  get: () => WorkbenchState,
  set: (partial: Partial<WorkbenchState>) => void,
): void {
  const disposable = get().runDisposable
  set({ activeRunId: null, runDisposable: null })
  disposable?.dispose()
}

function disposeStructureScanSubscription(
  get: () => WorkbenchState,
  set: (partial: Partial<WorkbenchState>) => void,
): void {
  const disposable = get().structureScanDisposable
  set({ structureScanDisposable: null })
  disposable?.dispose()
}

function attachStructureScanSubscription(
  projectId: string,
  client: ProjectOSApi,
  locale: Locale,
  get: () => WorkbenchState,
  set: (partial: Partial<WorkbenchState> | ((s: WorkbenchState) => Partial<WorkbenchState>)) => void,
): void {
  disposeStructureScanSubscription(get, set)

  const applyEvent = (event: StructureScanProgressEvent) => {
    const prior = get().structureScanProgress
    // Drop success/fail handlers if this scan was already cancelled locally.
    if (
      prior &&
      prior.scanId === event.scanId &&
      prior.status === 'cancelled' &&
      (event.type === 'scan_completed' || event.type === 'scan_failed')
    ) {
      return
    }

    set((state) => {
      const next = applyStructureScanProgressEvent(state.structureScanProgress, event)
      return {
        structureScanProgress: next,
        structureRescanLoading: next.status === 'running',
      }
    })
    if (event.type === 'scan_completed') {
      if (get().structureScanProgress?.status === 'cancelled') return
      void (async () => {
        try {
          const [graph, tree] = await Promise.all([
            client.getProjectGraph(projectId),
            client.getSemanticTree(projectId),
          ])
          if (get().project?.projectId !== projectId) return
          if (get().structureScanProgress?.status === 'cancelled') return
          set({
            graph,
            tree,
            structureRescanLoading: false,
            structureScanProgress: applyStructureScanProgressEvent(
              get().structureScanProgress,
              event,
            ),
          })
          get().pushToast({
            type: 'success',
            message: getStoreMessage(locale, 'map.structureScan.success'),
          })
          window.setTimeout(() => {
            const current = get().structureScanProgress
            if (
              current?.scanId === event.scanId &&
              current.status === 'success'
            ) {
              set({ structureScanProgress: null })
            }
          }, 4_500)
        } catch {
          set({ structureRescanLoading: false })
        }
      })()
    }
    if (event.type === 'scan_failed') {
      if (get().structureScanProgress?.status === 'cancelled') return
      set({ structureRescanLoading: false })
      get().pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'map.structureScan.failedDetail', {
          reason: event.message,
        }),
      })
    }
    if (event.type === 'scan_cancelled') {
      set({ structureRescanLoading: false })
      // Avoid duplicate toasts when cancelStructureScan already notified.
      if (prior?.status !== 'cancelled') {
        get().pushToast({
          type: 'info',
          message: getStoreMessage(locale, 'map.structureScan.cancelled'),
        })
      }
      window.setTimeout(() => {
        const current = get().structureScanProgress
        if (
          current?.scanId === event.scanId &&
          current.status === 'cancelled'
        ) {
          set({ structureScanProgress: null })
        }
      }, 2_500)
    }
  }

  const disposable = client.streamStructureScan(projectId, applyEvent)
  set({ structureScanDisposable: disposable })
  void client.getStructureScanProgress(projectId).then((snapshot) => {
    if (!snapshot || get().project?.projectId !== projectId) return
    set({
      structureScanProgress: snapshot,
      structureRescanLoading: snapshot.status === 'running',
    })
  })
}

const marketplaceCatalogInitialState = {
  mcpCatalogView: null as McpCatalogView | null,
  skillCatalogView: null as SkillCatalogView | null,
  rulesCatalogView: null as RulesCatalogView | null,
  agentCatalogView: null as AgentCatalogView | null,
  workflowCatalogView: null as WorkflowCatalogView | null,
  stencilCatalogView: null as StencilCatalogView | null,
  installedMarketplaceSkillIds: [] as string[],
  installedMarketplaceRulesPackIds: [] as string[],
  installedMarketplaceAgentListingIds: [] as string[],
  installedMarketplaceWorkflowListingIds: [] as string[],
  installedMarketplaceStencilListingIds: [] as string[],
  mergedStencilDefinitions: [] as StencilDefinition[],
  marketplaceCatalogStatus: 'idle' as const,
}

async function loadWorkspaceIntoStore(
  project: ProjectOSProject,
  client: ProjectOSApi,
  locale: Locale,
  set: (partial: Partial<WorkbenchState> | ((s: WorkbenchState) => Partial<WorkbenchState>)) => void,
  get: () => WorkbenchState,
  options: { shouldStartOnboarding?: boolean } = {},
) {
  disposeActiveRunSubscriptions(get, set)
  disposeStructureScanSubscription(get, set)
  set({ structureScanProgress: null, structureRescanLoading: false })
  await useTerminalStore.getState().disposeAllSessions()
  await useDiagnosticsStore.getState().dispose()
  useOutlineStore.getState().clear()
  useFileTimelineStore.getState().clear()
  useChatSessionStore.getState().clear()
  const { useLoopGraphStore } = await import('./loopGraphStore')
  useLoopGraphStore.getState().clear()
  const [graph, tree, mapContent, currentWork, projectDescription, directoryEntries] = await Promise.all([
    client.getProjectGraph(project.projectId),
    client.getSemanticTree(project.projectId),
    client.getMapContent(project.projectId),
    client.getCurrentWork(project.projectId),
    client.getProjectDescription(project.projectId),
    client.listWorkspaceDirectory(project.projectId, '').catch(() => null),
  ])
  const features = null
  const featuresLayout = null
  const teamSnapshot = null
  let settings: ProjectOSSettings | null = null
  try {
    settings = await client.getSettings(project.projectId)
    const seeded = await seedDeepSeekDevProfile(client, project.projectId)
    if (seeded) {
      settings = seeded
    }
  } catch {
    settings = null
  }
  const defaultModelProfileId =
    settings?.execution.defaultModelProfileId ??
    null
  let shouldStartOnboarding = options.shouldStartOnboarding ?? false
  if (options.shouldStartOnboarding === undefined) {
    try {
      shouldStartOnboarding = !localStorage.getItem('projectos_onboarding_done')
    } catch {
      /* ignore */
    }
  }
  set({
    phase: 'ready',
    loadingMessage: null,
    project,
    graph,
    tree,
    mapContent,
    features,
    featuresBaseline: features ? structuredClone(features) : null,
    featuresLayout,
    featuresStaleness: null,
    selectedStoryFeatureId: null,
    designSurfaceFocus: null,
    designSurfaceFocusToken: 0,
    featuresLiveReload: false,
    mapLayer: 'architecture' as MapLayerMode,
    storyViewLevel: 'overview' as StoryViewLevel,
    storyFocusedFeatureId: null,
    settings,
    selectedModelProfileId: defaultModelProfileId,
    executorOptions: [] as ExecutorOption[],
    selectedRuntimeId: null as string | null,
    modelSelectionPending: false,
    context: null,
    ...initialTransientState,
    // Reset marketplace cache for the new workspace so prefetch cannot skip on stale ready.
    ...marketplaceCatalogInitialState,
    directoryListings: {
      '': directoryEntries
        ? { status: 'ready', entries: directoryEntries }
        : { status: 'error', entries: [] },
    },
    currentWork,
    projectDescription,
    teamSnapshot,
    dailyBrief: null,
    projectDescriptionSaving: false,
    shouldStartOnboarding,
    terminalLines: [],
  })
  rememberRecentWorkspace(project)
  // Warm marketplace as soon as the workspace is ready — do not wait on chat/terminal/diagnostics.
  void get().prefetchMarketplaceCatalogs()
  if (graph.analysisStatus === 'partial') {
    get().pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'map.heuristicHint'),
      autoDismiss: 8000,
    })
  }
  attachStructureScanSubscription(project.projectId, client, locale, get, set)
  await useChatSessionStore.getState().loadForWorkspace()
  await useTerminalStore.getState().syncMapSessions(mapContent.artifacts)
  await useDiagnosticsStore.getState().init(project.workspaceRoot)
  void import('./productLabStore').then(({ useProductLabStore }) => {
    void useProductLabStore.getState().loadForWorkspace()
  })
}

const initialTransientState = {
  globalAgentActive: true,
  selectedNodeId: null as string | null,
  selectedFilePath: null as string | null,
  pendingFileOwnerChoice: null as PendingFileOwnerChoice | null,
  fileScopeError: null as 'not_mapped' | null,
  highlightedFilePaths: [] as string[],
  centerTab: 'function-map' as CenterTab,
  codeSubTab: 'editor' as CodeSubTab,
  rightPanelTab: 'chat' as RightPanelTab,
  editorBuffers: clearEditorBuffers(),
  editorSavedBuffers: clearEditorBuffers(),
  outlineExpanded: true,
  timelineExpanded: false,
  ...initialEditorLayout(),
  markdownEditorViewModes: {} as Record<
    string,
    import('../components/Markdown/markdownPath').MarkdownEditorViewMode
  >,
  messages: [] as ChatMessage[],
  pendingRefinement: null as PromptRefinement | null,
  pendingIntent: null as RequestIntent | null,
  refinementConfirmed: false,
  pendingPlan: null as import('@contracts/index').ImplementationPlan | null,
  lastBuiltPlan: null as import('@contracts/index').ImplementationPlan | null,
  planConfirmed: false,
  debugSession: null as import('@contracts/index').DebugSession | null,
  composerDraft: emptyComposerDraft(),
  composerHub: emptyPinComposerHub(),
  chatMode: 'ask' as ChatMode,
  askSubMode: 'chat' as AskSubMode,
  pendingFirstPrinciples: null as FirstPrinciplesSession | null,
  firstPrinciplesBusy: false,
  firstPrinciplesSuggestDismissed: false,
  activeCustomModeSkillId: null as string | null,
  customModePreviousChatMode: null as ChatMode | null,
  activeAgentDefinitionId: null as string | null,
  activeAgentDisplayName: null as string | null,
  createAgentComposerActive: false,
  pendingWorkforceDraft: null as {
    draft: import('@contracts/index').WorkforceAgentDraft
    sourcePrompt: string
    source: 'chat' | 'loop'
  } | null,
  conversationCheckpoints: [] as ConversationCheckpoint[],
  latestAskTrace: null as LatestAskTrace | null,
  latestPlanTrace: null as LatestPlanTrace | null,
  latestContextAssembly: null as import('@contracts/index').ContextAssembly | null,
  agentFlowSubject: 'run' as AgentFlowSubject,
  activeRunId: null as string | null,
  decisionRootRunId: null as string | null,
  runDecisions: [] as RunDecision[],
  focusedDecisionId: null as string | null,
  decisionResolvingIds: [] as string[],
  flowSteps: [] as AgentFlowStep[],
  flowActions: [] as AgentActionEvent[],
  flowDelegationEvents: [] as AgentDelegationEvent[],
  delegatedRunTraces: {} as Record<string, DelegatedRunTrace>,
  flowTransientTraces: [] as AgentTransientTrace[],
  flowCorrections: [] as FlowCorrection[],
  flowStatus: 'idle' as const,
  executionOverlay: null as import('@contracts/index').ExecutionOverlay | null,
  liveGraphFocusTaskId: null as string | null,
  liveGraphPausedRunId: null as string | null,
  diffReady: false,
  diffReviewOnlyReason: null,
  revokedApplyRunIds: [] as string[],
  diffUnmetRequirements: [],
  generatedDiff: null as GeneratedDiff | null,
  applyResult: null as ApplyResult | null,
  verificationResult: null as VerificationRunResult | null,
  verificationCommandApproval: null as VerificationCommandApprovalStatus | null,
  verificationLoading: false,
  undoLoading: false,
  pendingChangesDrawerExpanded: true,
  pendingChangesDrawerDismissedRunId: null as string | null,
  selectedDiffFilePath: null as string | null,
  diffFileStats: [] as DiffFileStat[],
  currentWork: null as CurrentWorkState | null,
  runDisposable: null as { dispose: () => void } | null,
  harnessRecord: null as HarnessRecord | null,
  harnessFixRunId: null as string | null,
  refineLoading: false,
  selectedFlowStepId: null as string | null,
  selectedActivityId: null as string | null,
  flowInspectorFollowLive: true,
  bouncingNodeIds: [] as string[],
  semanticTreeExpansion: {} as Record<string, boolean>,
  directoryTreeExpansion: {} as Record<string, boolean>,
  directoryListings: {} as Record<string, DirectoryListing>,
  selectedArtifactId: null as string | null,
  mapArtifactCreateFlow: null as MapArtifactCreateFlow | null,
  mapWorkGroupCreateFlow: null as MapWorkGroupCreateFlow | null,
  mapArtifactRenameFlow: null as MapArtifactRenameFlow | null,
  teamSnapshot: null as TeamSnapshot | null,
  relatedKnowledge: null as RelatedKnowledge | null,
  dailyBrief: null as DailyBrief | null,
  dailyBriefNarrative: null as DailyBriefNarrative | null,
  githubAuthStatus: null as GitHubAuthStatus | null,
  userAccountStatus: null as UserAccountStatus | null,
  userAccountGooglePending: false,
  userAccountGitHubSignInIntent: false,
  gitSyncStatus: null as GitSyncStatus | null,
  activeHandoffId: null as string | null,
  teamLoading: false,
  ideaModalOpen: false,
  endWorkModalOpen: false,
  commitModalOpen: false,
  decisionModalOpen: false,
  rosterModalOpen: false,
  meetingImportOpen: false,
  githubDeviceAuthPending: null,
  githubAuthPollTimer: null,
  googleAuthPollTimer: null,
  handoffOverwriteHandoffId: null as string | null,
  chatAnchor: null as AnchorRef | null,
  lastAnchoredAnswer: null as TeamBrainAnswer | null,
  meetingDraft: null as TeamMeeting | null,
  publishBriefConfirm: false,
  ...marketplaceCatalogInitialState,
}

/** Dedup concurrent marketplace prefetches for the same workspace open. */
let marketplacePrefetchInflight: Promise<void> | null = null
let marketplacePrefetchProjectId: string | null = null

const pendingStructureRefineFiles: string[] = []
let structureRefineTimer: ReturnType<typeof setTimeout> | null = null

function queueStructureRefineForChangedFilesImpl(
  changedFiles: string[],
  flush: () => void,
): void {
  const cleaned = changedFiles.map((path) => path.trim()).filter(Boolean)
  if (cleaned.length === 0) return
  for (const path of cleaned) {
    if (!pendingStructureRefineFiles.includes(path)) {
      pendingStructureRefineFiles.push(path)
    }
  }
  if (pendingStructureRefineFiles.length > 256) {
    pendingStructureRefineFiles.splice(0, pendingStructureRefineFiles.length - 256)
  }
  if (structureRefineTimer) clearTimeout(structureRefineTimer)
  structureRefineTimer = setTimeout(() => {
    structureRefineTimer = null
    flush()
  }, 1_500)
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  let nodeContextRequestSequence = 0
  let fileContextRequestSequence = 0
  let decisionRequestSequence = 0

  const loadSelectedNodeContext = async (nodeId: string) => {
    const { client, project } = get()
    if (!project) return
    const projectId = project.projectId
    const requestSequence = ++nodeContextRequestSequence
    const isCurrentRequest = () => {
      const current = get()
      return requestSequence === nodeContextRequestSequence &&
        current.project?.projectId === projectId &&
        current.selectedNodeId === nodeId &&
        current.selectedFilePath === null
    }

    // Projected C4 code-layer ids are view-only; durable getNodeContext cannot resolve them.
    if (nodeId.startsWith('code_file_')) {
      if (!isCurrentRequest()) return
      set({ context: null, contextLoading: false, error: null })
      return
    }

    try {
      const context = await client.getNodeContext(projectId, nodeId)
      if (!isCurrentRequest()) return
      set({ context, contextLoading: false, error: null })
    } catch (err) {
      if (!isCurrentRequest()) return
      set({
        contextLoading: false,
        error: errorMessage(err, 'Failed to load context'),
      })
    }
  }

  const reportSettingsMutationFailure = (error: unknown, fallback: string) => {
    const message = sanitizeErrorMessage(errorMessage(error, fallback))
    set({ error: message })
    get().pushToast({ type: 'error', message })
  }

  const persistSettingsPatch = async (
    patch: Partial<ProjectOSSettings>,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    const { client, project, pushToast, locale, settings } = get()
    if (!project) return false
    const projectId = project.projectId
    const settingsPatch = patch.execution && settings
      ? { ...patch, execution: { ...settings.execution, ...patch.execution } }
      : patch
    try {
      const updated = await client.updateSettings(projectId, settingsPatch)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, verificationCommandApproval: null, error: null })
      if (!options?.silent) {
        pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.saved') })
      }
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to save settings')
      }
      return false
    }
  }

  const flushDiffReadyNotifications = (items: DiffReadyCompletion[]) => {
    const state = get()
    const pending = filterDiffReadyCompletionsForNotification(items, state.notifyOnDiffReady)
    if (pending.length === 0) return

    const channel = resolveNotificationChannelForCompletions(pending, {
      windowFocused: state.windowFocused,
      centerTab: state.centerTab,
    })
    const { title, body, destination: mergedDestination, runIds } = mergeDiffReadyCompletions(
      pending,
      state.locale,
    )
    const kind = kindForAgentDestination(mergedDestination)

    const pushCenter = (deliveredViaSystem: boolean) => {
      useNotificationCenterStore.getState().pushNotification({
        kind,
        title,
        body,
        destination: mergedDestination,
        runIds,
        deliveredViaSystem,
      })
      // Legacy field cleared — UI reads NotificationStack instead.
      set({ diffReadyBanner: null })
    }

    if (channel === 'system') {
      if (isDesktopApp() && window.projectOS?.notify) {
        void window.projectOS.notify
          .showDiffReady({
            title,
            body,
            destination: mergedDestination,
            runIds,
          })
          .then(() => pushCenter(true))
          .catch((error) => {
            console.error('[workbench] failed to show diff-ready system notification', error)
            pushCenter(false)
          })
        return
      }
      pushCenter(false)
      return
    }

    pushCenter(false)
  }

  const notifyPendingDecision = (decision: RunDecision) => {
    const state = get()
    if (!state.notifyOnPendingDecision || decision.status !== 'pending' ||
      wasRunDecisionNotificationSeen(decision.id)) return
    markRunDecisionNotificationSeen(decision.id)
    const title = getStoreMessage(state.locale, 'decisions.notificationTitle')
    const body = getStoreMessage(state.locale, 'decisions.notificationBody', {
      question: truncateDiffReadySummary(decision.question, 160),
    })
    const pushDecision = (deliveredViaSystem: boolean) => {
      useNotificationCenterStore.getState().pushNotification({
        kind: 'decision',
        title,
        body,
        destination: 'decisions',
        runIds: [decision.rootRunId],
        decisionId: decision.id,
        deliveredViaSystem,
      })
    }
    if (!state.windowFocused && isDesktopApp() && window.projectOS?.notify) {
      void window.projectOS.notify.showDiffReady({
        title,
        body,
        destination: 'decisions',
        runIds: [decision.rootRunId],
        decisionId: decision.id,
      }).then(() => pushDecision(true)).catch((error) => {
        console.error('[workbench] failed to show decision notification', error)
        pushDecision(false)
      })
      return
    }
    useChatSessionStore.getState().presentAgentFlow()
    set({
      decisionRootRunId: decision.rootRunId,
      agentFlowSubject: 'run',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
      focusedDecisionId: decision.id,
    })
    pushDecision(false)
  }

  const maybeNotifyAgentComplete = (
    item: Omit<DiffReadyCompletion, 'context'> & { context?: DiffReadyCompletion['context'] },
  ) => {
    const state = get()
    if (!state.notifyOnDiffReady) return

    enqueueDiffReadyBatch(
      {
        ...item,
        context: item.context ?? captureDiffReadyNotificationContext({
          ...state,
          agentFlowOpen: useChatSessionStore.getState().agentFlowOpen,
        }),
      },
      flushDiffReadyNotifications,
    )
  }

  const maybeNotifyDiffReady = (runId: string, fileCount: number) => {
    const state = get()
    const lastUserMessage = [...state.messages].reverse().find((msg) => msg.role === 'user')
    const summary = truncateDiffReadySummary(
      state.pendingRefinement?.understood ?? lastUserMessage?.content ?? '',
    )

    maybeNotifyAgentComplete({
      kind: 'diff',
      runId,
      fileCount,
      summary,
      completedAt: Date.now(),
    })
  }

  return {
  phase: 'idle',
  error: null,
  loadingMessage: null,
  structureRescanLoading: false,
  structureScanProgress: null,
  structureScanDisposable: null,
  client: createWorkbenchClient(),
  project: null,
  graph: null,
  tree: null,
  context: null,
  contextLoading: false,
  locale: loadLocale(),
  themePreference: loadThemePreference(),
  mapDetail: loadMapDetail(),
  resolvedTheme: resolveTheme(loadThemePreference()),
  notifyOnDiffReady: loadNotifyOnDiffReadyPreference(),
  notifyOnPendingDecision: loadNotifyOnPendingDecisionPreference(),
  chatModeSwitch: loadChatModeSwitchPreference(),
  keepAwakeMode: loadKeepAwakeModePreference(),
  keepAwakeStatus: null,
  showGestureCursor: loadShowGestureCursorPreference(),
  windowFocused: typeof document !== 'undefined' ? document.hasFocus() : true,
  diffReadyBanner: null,
  toasts: [],
  agentFlowViewMode: 'timeline',
  treeViewMode: 'semantic',
  flashKey: 0,
  leftPanelOpen: true,
  rightPanelOpen: true,
  shouldStartOnboarding: false,
  terminalLines: [] as string[],
  ...loadPanelLayout(),
  panelResizing: false,
  settings: null,
  projectDescription: null,
  projectDescriptionSaving: false,
  settingsOpen: false,
  settingsFocusView: null,
  selectedModelProfileId: null,
  executorOptions: [],
  selectedRuntimeId: null,
  modelSelectionPending: false,
  mapContent: null,
  features: null,
  featuresBaseline: null,
  featuresLayout: null,
  featuresStaleness: null,
  selectedStoryFeatureId: null,
  designSurfaceFocus: null,
  designSurfaceFocusToken: 0,
  featuresLiveReload: false,
  mapLayer: 'architecture' as MapLayerMode,
  storyViewLevel: 'overview' as StoryViewLevel,
  storyFocusedFeatureId: null as string | null,
  ...initialTransientState,

  setLocale: (locale) => {
    saveLocale(locale)
    set({ locale })
    // The map's own text is written in this language: tell the open project.
    void syncInterfaceLanguage(get)
  },
  setMapDetail: (mapDetail) => {
    saveMapDetail(mapDetail)
    set({ mapDetail })
  },

  setThemePreference: (themePreference) => {
    saveThemePreference(themePreference)
    const resolvedTheme = resolveTheme(themePreference)
    applyThemeToDocument(resolvedTheme)
    set({ themePreference, resolvedTheme })
  },

  setNotifyOnDiffReady: (enabled) => {
    saveNotifyOnDiffReadyPreference(enabled)
    if (!enabled) {
      resetDiffReadyBatch()
      useNotificationCenterStore.getState().archiveActive()
      set({ notifyOnDiffReady: enabled, diffReadyBanner: null })
      return
    }
    set({ notifyOnDiffReady: enabled })
  },

  setNotifyOnPendingDecision: (enabled) => {
    saveNotifyOnPendingDecisionPreference(enabled)
    set({ notifyOnPendingDecision: enabled })
  },

  setChatModeSwitch: (value) => {
    saveChatModeSwitchPreference(value)
    set({ chatModeSwitch: value })
  },

  setKeepAwakeMode: async (mode) => {
    saveKeepAwakeModePreference(mode)
    set({ keepAwakeMode: mode })
    if (!isDesktopApp() || !window.projectOS?.keepAwake) return
    try {
      const status = await window.projectOS.keepAwake.setMode(mode)
      if (get().keepAwakeMode === mode) {
        set({ keepAwakeStatus: status })
      }
    } catch (error) {
      console.error('[workbench] failed to apply keep-awake mode', error)
      const message = error instanceof Error ? error.message : String(error)
      set({
        keepAwakeStatus: {
          ...(get().keepAwakeStatus ?? {
            supported: window.projectOS.platform === 'darwin',
            mode,
            active: false,
            idleBlocked: false,
            lidGuardActive: false,
            lidGuardSupported: window.projectOS.platform === 'darwin',
            agentActivity: false,
          }),
          mode,
          lastError: message,
        },
      })
    }
  },

  setKeepAwakeStatus: (status) => set({ keepAwakeStatus: status }),

  setShowGestureCursor: (show) => {
    saveShowGestureCursorPreference(show)
    set({ showGestureCursor: show })
  },

  setWindowFocused: (windowFocused) => set({ windowFocused }),

  dismissDiffReadyBanner: () => {
    useNotificationCenterStore.getState().archiveActive()
    set({ diffReadyBanner: null })
  },

  navigateToDiffReview: async () => {
    await get().navigateToDiffReviewFile()
  },

  navigateToDiffReviewFile: async (path) => {
    useNotificationCenterStore.getState().archiveActiveByDestination('diff')
    // Close the center Agent Flow overlay so the Code/Diff stage is visible.
    // Pending Changes "Review" (and other entry points) otherwise leave the
    // floating window covering the diff the user just navigated to.
    useChatSessionStore.getState().closeAgentFlow()
    set({
      selectedDiffFilePath: path ?? null,
      centerTab: 'code',
      codeSubTab: 'diff',
      diffReadyBanner: null,
    })
    const { generatedDiff, activeRunId, diffReady } = get()
    if (!generatedDiff && activeRunId) {
      if (diffReady) {
        await get().loadDiff()
      }
    }
  },

  clearSelectedDiffFilePath: () => set({ selectedDiffFilePath: null }),

  setPendingChangesDrawerExpanded: (expanded) => set({ pendingChangesDrawerExpanded: expanded }),

  dismissPendingChanges: () => {
    const { activeRunId } = get()
    useNotificationCenterStore.getState().archiveActiveByDestination('diff')
    set({
      pendingChangesDrawerDismissedRunId: activeRunId,
      pendingChangesDrawerExpanded: false,
      // Discard review attention so Code/Diff no longer advertises a pending review.
      diffReady: false,
      diffReadyBanner: null,
      generatedDiff: null,
      diffFileStats: [],
      selectedDiffFilePath: null,
      diffReviewOnlyReason: null,
      diffUnmetRequirements: [],
    })
  },

  undoAllPendingChanges: async () => {
    const undoMode = selectPendingChangesDrawerUndoMode(get())
    if (undoMode === 'restore') {
      await get().undoCurrentApply()
      // Failed restore keeps applyResult — do not discard the reviewable diff.
      if (get().applyResult) return
      const { activeRunId } = get()
      set({
        pendingChangesDrawerDismissedRunId: activeRunId,
        pendingChangesDrawerExpanded: false,
      })
      return
    }
    get().dismissPendingChanges()
  },

  navigateFromAgentNotification: async (destination, runId, decisionId) => {
    useNotificationCenterStore.getState().archiveActiveByDestination(destination)
    if (destination === 'decisions') {
      if (!runId || !decisionId) return
      useChatSessionStore.getState().presentAgentFlow()
      set({
        decisionRootRunId: runId,
        agentFlowSubject: 'run',
        rightPanelTab: 'chat',
        rightPanelOpen: true,
        focusedDecisionId: decisionId,
        diffReadyBanner: null,
      })
      await get().loadRunDecisions(runId)
      return
    }
    if (destination === 'diff') {
      await get().navigateToDiffReviewFile()
      return
    }

    if (destination === 'reminder') {
      useChatSessionStore.getState().setReminderGraphOpen(true)
      const { useReminderGraphStore } = await import('./reminderGraphStore')
      useReminderGraphStore.getState().setPage('notifications')
      set({ diffReadyBanner: null })
      return
    }

    useChatSessionStore.getState().presentAgentFlow()
    set({
      agentFlowSubject: 'ask',
      rightPanelTab: 'chat',
      diffReadyBanner: null,
    })
  },

  notifyReminderEvents: (events, opts) => {
    const state = get()
    if (!state.notifyOnDiffReady || events.length === 0) return

    const reminderGraphOpen = useChatSessionStore.getState().reminderGraphOpen
    const pending = events.filter(
      (event) =>
        !shouldSuppressReminderNotification({
          enabled: true,
          reminderGraphOpen,
          windowFocused: state.windowFocused,
          focusedItemId: opts?.focusedItemId ?? null,
          eventItemId: event.itemId,
        }),
    )
    const merged = mergeReminderNotifyEvents(pending)
    if (!merged) return

    const channel = resolveReminderNotificationChannel({
      windowFocused: state.windowFocused,
      centerTab: state.centerTab,
      reminderGraphOpen,
    })
    const runIds = merged.itemIds.map((id) => `reminder:${id}`)

    const pushCenter = (deliveredViaSystem: boolean) => {
      useNotificationCenterStore.getState().pushNotification({
        kind: 'reminder',
        title: merged.title,
        body: merged.body,
        destination: 'reminder',
        runIds,
        deliveredViaSystem,
      })
      set({ diffReadyBanner: null })
    }

    if (channel === 'system') {
      if (isDesktopApp() && window.projectOS?.notify) {
        void window.projectOS.notify
          .showDiffReady({
            title: merged.title,
            body: merged.body,
            destination: 'reminder',
            runIds,
          })
          .then(() => pushCenter(true))
          .catch((error) => {
            console.error('[workbench] failed to show reminder system notification', error)
            pushCenter(false)
          })
        return
      }
      pushCenter(false)
      return
    }

    pushCenter(false)
  },

  maybeNotifyAgentComplete,

  setResolvedTheme: (resolvedTheme) => {
    applyThemeToDocument(resolvedTheme)
    set({ resolvedTheme })
  },

  pushToast: ({ type, message, autoDismiss = 5000 }) => {
    const id = toastId()
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    // Keep toast ephemeral in the corner; durable copy goes straight to Notification Center.
    if (type === 'error' || type === 'warning' || type === 'info') {
      useNotificationCenterStore.getState().pushNotification({
        kind: type === 'error' ? 'toast_error' : type === 'warning' ? 'toast_warning' : 'toast_info',
        title: getStoreMessage(get().locale, 'notificationCenter.toastTitle'),
        body: message,
        destination: 'none',
        archiveImmediately: true,
      })
    }
    if (autoDismiss > 0) {
      setTimeout(() => get().dismissToast(id), autoDismiss)
    }
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setAgentFlowViewMode: (mode) => set({ agentFlowViewMode: mode }),
  setTreeViewMode: (mode) => set({ treeViewMode: mode }),
  toggleSemanticTreeExpanded: (nodeId, depth) =>
    set((s) => {
      const expanded = resolveSemanticTreeExpanded(s.semanticTreeExpansion, nodeId, depth)
      return {
        semanticTreeExpansion: { ...s.semanticTreeExpansion, [nodeId]: !expanded },
      }
    }),
  toggleDirectoryTreeExpanded: (folderPath, depth) =>
    set((s) => {
      const expanded = resolveTreeExpanded(s.directoryTreeExpansion, folderPath, depth)
      return {
        directoryTreeExpansion: { ...s.directoryTreeExpansion, [folderPath]: !expanded },
      }
    }),

  loadDirectoryListing: async (relativePath) => {
    const { client, project, directoryListings } = get()
    const existing = directoryListings[relativePath]
    if (!project || existing?.status === 'loading' || existing?.status === 'ready') return
    const projectId = project.projectId
    set((s) => ({
      directoryListings: {
        ...s.directoryListings,
        [relativePath]: { status: 'loading', entries: existing?.entries ?? [] },
      },
    }))
    try {
      const entries = await client.listWorkspaceDirectory(projectId, relativePath)
      if (get().project?.projectId !== projectId) return
      set((s) => ({
        directoryListings: {
          ...s.directoryListings,
          [relativePath]: { status: 'ready', entries },
        },
      }))
    } catch {
      if (get().project?.projectId !== projectId) return
      set((s) => ({
        directoryListings: {
          ...s.directoryListings,
          [relativePath]: { status: 'error', entries: [] },
        },
      }))
    }
  },
  setSelectedFlowStepId: (id) =>
    set({
      selectedFlowStepId: id,
      // Manual selection locks the inspector; clearing restores live follow.
      flowInspectorFollowLive: id == null,
    }),
  setSelectedActivityId: (id) => set({ selectedActivityId: id }),
  setFlowInspectorFollowLive: (follow) => set({ flowInspectorFollowLive: follow }),

  setLiveGraphFocusTask: (taskId) => set({ liveGraphFocusTaskId: taskId }),

  addGraphContextFromNode: (nodeId) => {
    const { graph, composerDraft, setComposerDraft, pushToast, locale } = get()
    const node = graph?.nodes.find((item) => item.id === nodeId)
    if (!node) return
    const filePath =
      node.linkedFiles[0]?.path ??
      (node.level === 'code' || node.elementType === 'code_element' ? node.name : null)
    const attachment = filePath
      ? {
          id: `att_graph_${crypto.randomUUID()}`,
          label: filePath.split(/[/\\]/).pop() || filePath,
          ref: { kind: 'file' as const, path: filePath },
        }
      : {
          id: `att_graph_${crypto.randomUUID()}`,
          label: node.name,
          ref: { kind: 'node' as const, nodeId },
        }
    const next = appendAttachment(composerDraft, attachment)
    setComposerDraft(next)
    useChatSessionStore.getState().presentAgentFlow()
    set({ rightPanelTab: 'chat' })
    pushToast({
      type: 'success',
      message: getStoreMessage(locale, 'map.liveGraph.contextAdded', {
        label: attachment.label,
      }),
      autoDismiss: 2500,
    })
  },

  sendGraphInstructionFromNode: (nodeId, instruction) => {
    const trimmed = instruction.trim()
    if (!trimmed) return
    const { graph, composerDraft, setComposerDraft, flowSteps, injectFlowCorrection, pushToast, locale } =
      get()
    const node = graph?.nodes.find((item) => item.id === nodeId)
    const label = node?.name ?? nodeId
    const filePath = node?.linkedFiles[0]?.path
    const scoped = filePath
      ? `[${filePath}] ${trimmed}`
      : `[node:${label}] ${trimmed}`

    const runningStep = flowSteps.find((step) => step.status === 'running')
    if (runningStep && get().flowStatus === 'running') {
      void injectFlowCorrection(runningStep.id, scoped)
      return
    }

    setComposerDraft(setComposerText(composerDraft, scoped))
    set({ rightPanelTab: 'chat' })
    useChatSessionStore.getState().presentAgentFlow()
    pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'map.liveGraph.instructionReady'),
      autoDismiss: 2500,
    })
  },

  pauseAgentFromGraph: async () => {
    const { client, activeRunId, flowStatus, pushToast, locale, executionOverlay, graph } = get()
    if (!activeRunId || flowStatus !== 'running') return
    const runId = activeRunId
    disposeActiveRunSubscriptions(get, set)
    const settledOverlay =
      executionOverlay?.runId === runId
        ? applyAgentRunEventToOverlay(
            executionOverlay,
            {
              eventId: `local_pause_${runId}_${Date.now()}`,
              runId,
              timestamp: new Date().toISOString(),
              type: 'run_interrupted',
            },
            graph?.fileIndex ?? [],
          )
        : executionOverlay
    set({
      flowStatus: 'interrupted',
      refineLoading: false,
      activeRunId: null,
      liveGraphPausedRunId: runId,
      flowSteps: settleOpenFlowSteps(get().flowSteps),
      executionOverlay: settledOverlay,
    })
    if (client && typeof client.pauseAgentRun === 'function') {
      try {
        await client.pauseAgentRun(runId)
      } catch (error) {
        console.error('[workbench] pauseAgentRun failed', error)
        pushToast({
          type: 'error',
          message: getStoreMessage(locale, 'map.liveGraph.pauseFailed'),
        })
        return
      }
    }
    pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'map.liveGraph.paused'),
      autoDismiss: 2500,
    })
    scheduleChatSessionPersist()
  },

  resumeAgentFromGraph: async () => {
    const { client, liveGraphPausedRunId, project, pushToast, locale } = get()
    const runId = liveGraphPausedRunId
    if (!client || !runId || !project) return
    if (typeof client.continueAgentRun !== 'function') return
    disposeActiveRunSubscriptions(get, set)
    try {
      const run = await client.continueAgentRun(runId)
      useChatSessionStore.getState().presentAgentFlow()
      set({
        activeRunId: run.runId,
        decisionRootRunId: run.rootRunId ?? run.runId,
        runDecisions: [],
        focusedDecisionId: null,
        decisionResolvingIds: [],
        liveGraphPausedRunId: null,
        flowStatus: 'running',
        agentFlowSubject: 'run',
        refineLoading: false,
      })
      const disposable = client.streamAgentRun(run.runId, (event) => {
        if (
          get().activeRunId !== run.runId ||
          get().project?.projectId !== project.projectId
        ) {
          return
        }
        handleRunEvent(event, set, get)
        scheduleChatSessionPersist()
      })
      set({ runDisposable: disposable })
      pushToast({
        type: 'info',
        message: getStoreMessage(locale, 'map.liveGraph.resumed'),
        autoDismiss: 2500,
      })
      scheduleChatSessionPersist()
    } catch (error) {
      console.error('[workbench] continueAgentRun failed', error)
      pushToast({
        type: 'error',
        message: getStoreMessage(locale, 'map.liveGraph.resumeFailed'),
      })
    }
  },

  approveFromGraph: async () => {
    await get().approveAndRunCurrentVerification()
  },

  rejectFromGraph: () => {
    const { verificationCommandApproval, pushToast, locale } = get()
    if (verificationCommandApproval?.status !== 'approval_required') return
    set({ verificationCommandApproval: null, verificationLoading: false })
    pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'map.liveGraph.approvalRejected'),
      autoDismiss: 2500,
    })
  },

  setLeftPanelOpen: (open) => {
    set({ leftPanelOpen: open })
    if (open) get().reclampPanelLayout()
  },
  setRightPanelOpen: (open) => {
    set({ rightPanelOpen: open })
    if (open) get().reclampPanelLayout()
  },
  clearShouldStartOnboarding: () => set({ shouldStartOnboarding: false }),
  triggerFlash: () => set((s) => ({ flashKey: s.flashKey + 1 })),

  injectFlowCorrection: async (stepId, message) => {
    const { flowSteps, pushToast, locale } = get()
    const step = flowSteps.find((s) => s.id === stepId)
    if (!step) return

    const correction = createFlowCorrection(stepId, message.trim())
    set((s) => ({
      flowCorrections: [...s.flowCorrections, correction],
      flowSteps: s.flowSteps.map((item) =>
        item.id === stepId ? { ...item, status: 'warning' as const } : item,
      ),
      selectedFlowStepId: null,
      selectedActivityId: null,
      flowInspectorFollowLive: true,
    }))
    pushToast({
      type: 'info',
      message: `${getStoreMessage(locale, 'agentFlow.correction')}: ${message}`,
    })
  },

  openSampleWorkspace: async () => {
    const { client, locale } = get()
    disposeActiveRunSubscriptions(get, set)
    set({
      phase: 'loading',
      error: null,
      loadingMessage: getStoreMessage(locale, 'welcome.opening'),
    })
    try {
      const project = await client.openSampleWorkspace()
      await loadWorkspaceIntoStore(project, client, locale, set, get)
      set({ loadingMessage: null })
    } catch (err) {
      set({
        phase: 'error',
        error: errorMessage(err, 'Failed to open workspace'),
        loadingMessage: null,
      })
    }
  },

  openWorkspace: async (path) => {
    const { client, locale } = get()
    const trimmed = path.trim()
    if (!trimmed) return
    disposeActiveRunSubscriptions(get, set)
    set({
      phase: 'loading',
      error: null,
      loadingMessage: getStoreMessage(locale, 'welcome.opening'),
    })
    try {
      const project = await client.openWorkspace(trimmed)
      await loadWorkspaceIntoStore(project, client, locale, set, get)
      set({ loadingMessage: null })
    } catch (err) {
      set({
        phase: 'error',
        error: errorMessage(err, 'Failed to open workspace'),
        loadingMessage: null,
      })
    }
  },

  rescanStructureGraph: async (options) => {
    const { client, project, locale, structureRescanLoading, pushToast } = get()
    if (!project || structureRescanLoading) return
    const mode = options?.mode ?? 'regenerate'
    set({ structureRescanLoading: true })
    attachStructureScanSubscription(project.projectId, client, locale, get, set)
    // The rewrite is written in the project's interface language: make sure it is the current one.
    if (mode === 'translate' || mode === 'connections') await syncInterfaceLanguage(get)
    const loadingKey =
      mode === 'refine' || mode === 'acceptRefine'
        ? 'map.refiningStructure'
        : mode === 'deepen'
          ? 'map.deepeningStructure'
          : mode === 'prepareRefine'
            ? 'map.refiningStructure'
            : mode === 'translate'
              ? 'map.translatingStructure'
              : mode === 'connections'
                ? 'map.rewritingConnections'
                : 'map.regeneratingStructure'
    pushToast({
      type: 'info',
      message: getStoreMessage(locale, loadingKey),
    })
    try {
      const graph = await client.analyzeWorkspace(project.projectId, {
        mode,
        ...(options?.nodeIds ? { nodeIds: options.nodeIds } : {}),
        ...(options?.changedFiles ? { changedFiles: options.changedFiles } : {}),
        ...(options?.refinedGraph !== undefined
          ? { refinedGraph: options.refinedGraph }
          : {}),
        // Authored graphs are only overwritten when the caller sets force.
        ...(options?.force === true ? { force: true } : {}),
      })
      const tree = await client.getSemanticTree(project.projectId)
      set((current) => ({
        graph,
        tree,
        structureRescanLoading: false,
        // Promote ephemeral unmapped activities onto nodes when fileIndex grows.
        // Never triggers architecture re-layout by itself.
        executionOverlay: current.executionOverlay
          ? remapExecutionOverlay(current.executionOverlay, graph.fileIndex ?? [])
          : current.executionOverlay,
      }))
      // Progress stream already toasts success on scan_completed; avoid duplicate
      // when the stream delivered first. Still toast if progress UI was idle.
      if (get().structureScanProgress?.status !== 'success') {
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'map.rescanStructureDone'),
        })
      }
    } catch (err) {
      set({ structureRescanLoading: false })
      const progressStatus = get().structureScanProgress?.status
      if (progressStatus === 'failed' || progressStatus === 'cancelled') return
      if (isStructureScanCancellation(err)) return
      const reason = formatStructureRescanFailure(err)
      pushToast({
        type: 'warning',
        message: reason
          ? getStoreMessage(locale, 'map.rescanStructureFailedDetail', {
              reason,
            })
          : getStoreMessage(locale, 'map.rescanStructureFailed'),
      })
    }
  },

  cancelStructureScan: async () => {
    const { client, project, locale, structureRescanLoading, structureScanProgress } =
      get()
    if (!project || !structureRescanLoading) return
    if (structureScanProgress?.status === 'cancelled') return

    // Optimistic UI: settle immediately; backend abort catches up.
    const cancelledProgress = structureScanProgress
      ? applyStructureScanProgressEvent(structureScanProgress, {
          type: 'scan_cancelled',
          scanId: structureScanProgress.scanId,
          projectId: project.projectId,
          timestamp: new Date().toISOString(),
        })
      : null
    set({
      structureRescanLoading: false,
      ...(cancelledProgress ? { structureScanProgress: cancelledProgress } : {}),
    })
    get().pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'map.structureScan.cancelled'),
    })
    if (cancelledProgress) {
      window.setTimeout(() => {
        const current = get().structureScanProgress
        if (
          current?.scanId === cancelledProgress.scanId &&
          current.status === 'cancelled'
        ) {
          set({ structureScanProgress: null })
        }
      }, 2_500)
    }

    try {
      await client.cancelStructureScan(project.projectId)
    } catch {
      // Best-effort; UI already settled.
    }
  },

  queueStructureRefineForChangedFiles: (changedFiles) => {
    queueStructureRefineForChangedFilesImpl(changedFiles, () => {
      const pending = pendingStructureRefineFiles.splice(
        0,
        pendingStructureRefineFiles.length,
      )
      if (pending.length === 0) return
      void get().rescanStructureGraph({
        mode: 'refine',
        changedFiles: pending,
      })
    })
  },

  setCenterTab: (tab) => {
    if (tab === 'browser' && !isDesktopApp()) {
      set({ centerTab: 'function-map' })
      return
    }
    const state = get()
    const onDiffView = tab === 'code' && state.codeSubTab === 'diff'
    if (onDiffView) {
      useNotificationCenterStore.getState().archiveActiveByDestination('diff')
    }
    set({
      centerTab: tab,
      ...(onDiffView ? { diffReadyBanner: null } : {}),
      // Browser owns a vertical tab/docs rail — open left sidebar when entering.
      ...(tab === 'browser' ? { leftPanelOpen: true } : {}),
    })
  },
  setMapLayer: (layer) => {
    set({
      mapLayer: layer,
      ...(layer === 'story'
        ? { storyViewLevel: 'overview' as StoryViewLevel, storyFocusedFeatureId: null }
        : {}),
    })
  },
  setStoryView: ({ level, focusedFeatureId }) => {
    set((state) => {
      const nextFocus =
        level === 'steps'
          ? focusedFeatureId === undefined
            ? state.storyFocusedFeatureId
            : focusedFeatureId
          : focusedFeatureId === undefined
            ? null
            : focusedFeatureId
      return {
        storyViewLevel: level,
        storyFocusedFeatureId: nextFocus,
      }
    })
  },
  saveFeaturesLayout: async (_layout) => {
    /* features API removed in pure workbench */
  },
  saveFeatures: async (_features) => {
    /* features API removed in pure workbench */
  },
  openDesignSurface: (focus) => {
    // Design Tab is abandoned — route wireframe / design intents into Diagram Graph.
    set({
      designSurfaceFocus: focus,
      designSurfaceFocusToken: get().designSurfaceFocusToken + 1,
    })
    void import('./diagramGraphStore').then(({ useDiagramGraphStore }) => {
      useDiagramGraphStore.getState().enterWireframeMode()
    })
  },
  approvePlannedFeature: async (_featureId) => {
    /* features API removed in pure workbench */
  },
  rejectPlannedFeature: async (_featureId) => {
    /* features API removed in pure workbench */
  },
  refreshFeaturesStaleness: async () => {
    set({ featuresStaleness: null })
  },
  refreshFeaturesFromDisk: async () => {
    /* features API removed in pure workbench */
  },
  setFeaturesLiveReload: (enabled) => {
    set({ featuresLiveReload: enabled })
    if (enabled) {
      void get().refreshFeaturesFromDisk()
    }
  },
  requestFeaturesSync: () => {
    const prompt = getStoreMessage(get().locale, 'map.story.stale.syncPrompt')
    get().openGlobalAgentChat()
    get().setChatMode('ask')
    get().setRightPanelTab('chat')
    get().setRightPanelOpen(true)
    get().setChatInput(prompt)
  },
  requestFeaturesScan: () => {
    // Dev-stable path: never dump scan prompts into the broken agent chat sidebar.
    // Story features are generated directly by workspace bootstrap / codesee import.
    get().pushToast({
      type: 'info',
      message: getStoreMessage(get().locale, 'map.story.bootstrap.scanHint'),
      autoDismiss: 3500,
    })
  },
  selectStoryFeature: async (featureId) => {
    const { features } = get()
    if (!features) return
    const feature = features.features.find((item) => item.id === featureId)
    if (!feature) return
    const epic = features.epics.find((item) => item.id === feature.epicId)

    if (feature.nodeId) {
      await get().selectNode(feature.nodeId)
    }

    set({ selectedStoryFeatureId: featureId })

    const context = get().context
    const stepNames = feature.steps.map((step) => step.name).join(' → ')
    const storySummary = [
      epic ? `Epic: ${epic.name}` : null,
      `Feature: ${feature.name}`,
      feature.summary ?? null,
      stepNames ? `Steps: ${stepNames}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const storyMarkdown = [
      '## Story feature',
      epic ? `- Epic: **${epic.name}** (\`${epic.id}\`)` : null,
      `- Feature: **${feature.name}** (\`${feature.id}\`)`,
      feature.summary ? `- Summary: ${feature.summary}` : null,
      feature.workUnitId ? `- workUnitId: \`${feature.workUnitId}\`` : null,
      feature.steps.length
        ? `- Steps:\n${feature.steps.map((step) => `  - [${step.role}] ${step.name}`).join('\n')}`
        : null,
      feature.steps.some((step) => step.refs?.length)
        ? `- Refs:\n${feature.steps
            .flatMap((step) => step.refs ?? [])
            .map((ref) => `  - ${ref.file}${ref.lines ? `:${ref.lines[0]}-${ref.lines[1]}` : ''}`)
            .join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    if (context) {
      const storyFiles = feature.steps.flatMap((step) => step.refs ?? []).map((ref) => ({
        path: ref.file,
        role: 'supporting' as const,
      }))
      const existingPaths = new Set(context.linkedFiles.map((file) => file.path))
      set({
        context: {
          ...context,
          summary: `${storySummary}\n\n${context.summary}`,
          rawContextMarkdown: `${storyMarkdown}\n\n${context.rawContextMarkdown}`,
          linkedFiles: [
            ...context.linkedFiles,
            ...storyFiles.filter((file) => !existingPaths.has(file.path)),
          ],
        },
      })
    }
  },
  setCodeSubTab: (tab) => {
    const state = get()
    if (state.centerTab === 'code' && tab === 'diff') {
      useNotificationCenterStore.getState().archiveActiveByDestination('diff')
    }
    set({
      codeSubTab: tab,
      ...(state.centerTab === 'code' && tab === 'diff' ? { diffReadyBanner: null } : {}),
    })
  },
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setChatInput: (value) => {
    set((state) => ({ composerDraft: { ...state.composerDraft, text: value } }))
    scheduleChatSessionPersist()
  },
  setComposerDraft: (draft) => {
    set({ composerDraft: draft })
    scheduleChatSessionPersist()
  },
  setComposerHub: (hub) => {
    set({ composerHub: hub })
  },
  setAskSubMode: (mode) => {
    set({
      askSubMode: mode,
      ...(mode === 'first_principles' ? { firstPrinciplesSuggestDismissed: true } : {}),
    })
    scheduleChatSessionPersist()
  },
  dismissFirstPrinciplesSuggest: () => {
    set({ firstPrinciplesSuggestDismissed: true })
  },
  maybeSuggestFirstPrinciplesAfterAskSend: (prompt: string) => {
    const { chatMode, askSubMode, firstPrinciplesSuggestDismissed, locale } = get()
    if (chatMode !== 'ask' || askSubMode !== 'chat' || firstPrinciplesSuggestDismissed) return
    if (!looksLikeVisionPrompt(prompt)) return
    useNotificationCenterStore.getState().pushNotification({
      kind: 'first_principles_suggest',
      title: getStoreMessage(locale, 'firstPrinciples.suggestNotificationTitle'),
      body: getStoreMessage(locale, 'firstPrinciples.suggestChip'),
      destination: 'none',
      ephemeral: true,
      visionText: prompt.trim(),
      autoDismissMs: FIRST_PRINCIPLES_SUGGEST_AUTO_DISMISS_MS,
    })
  },
  beginFirstPrinciplesFromVision: async (vision) => {
    const { project, client, locale } = get()
    if (!project || !client || !vision.trim()) return
    for (const item of useNotificationCenterStore.getState().items) {
      if (item.status === 'active' && item.kind === 'first_principles_suggest') {
        useNotificationCenterStore.getState().removeNotification(item.id)
      }
    }
    set({
      chatMode: 'ask',
      askSubMode: 'first_principles',
      firstPrinciplesBusy: true,
      firstPrinciplesSuggestDismissed: true,
      rightPanelTab: 'chat',
    })
    try {
      const chatSessionId = activeChatSessionId()
      let session = typeof client.startFirstPrinciplesSession === 'function'
        ? await client.startFirstPrinciplesSession({
            projectId: project.projectId,
            vision: vision.trim(),
            ...(chatSessionId ? { chatSessionId } : {}),
          })
        : startFirstPrinciplesSession({
            projectId: project.projectId,
            vision: vision.trim(),
            chatSessionId,
          })
      session = await persistFirstPrinciplesSession(client, project.projectId, session)
      const userMsg = {
        id: msgId(),
        role: 'user' as const,
        content: vision.trim(),
        timestamp: new Date().toISOString(),
        chatMode: 'ask' as const,
      }
      const assistantMsg = assistantReflectMessage(session, locale)
      set((current) => ({
        pendingFirstPrinciples: session,
        firstPrinciplesBusy: false,
        composerDraft: emptyComposerDraft(),
        messages: [...current.messages, userMsg, assistantMsg],
      }))
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'First Principles failed to start'),
      })
    }
  },
  answerFirstPrinciplesQuestion: async (input) => {
    const { pendingFirstPrinciples, client, project, locale } = get()
    if (!pendingFirstPrinciples || !project || !client) return
    set({ firstPrinciplesBusy: true })
    try {
      let session = typeof client.answerFirstPrinciplesTurn === 'function'
        ? await client.answerFirstPrinciplesTurn({
            projectId: project.projectId,
            sessionId: pendingFirstPrinciples.id,
            answer: input,
          })
        : applyFirstPrinciplesAnswer(pendingFirstPrinciples, input)
      if (
        session.status === 'thesis_review' ||
        session.layers.find((layer) => layer.id === 'L4')?.status === 'complete' ||
        session.layers.find((layer) => layer.id === 'L4')?.status === 'skipped'
      ) {
        session = await maybeGenerateFirstPrinciplesDiagram(session)
        session = await persistFirstPrinciplesSession(client, project.projectId, session)
      }
      const assistantMsg = assistantReflectMessage(session, locale)
      set((current) => ({
        pendingFirstPrinciples: session,
        firstPrinciplesBusy: false,
        messages: [...current.messages, assistantMsg],
      }))
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'First Principles answer failed'),
      })
    }
  },
  confirmFirstPrinciplesThesis: async (
    thesis,
    acknowledgeLowConfidence = false,
    writePlannedFeature = false,
  ) => {
    const { pendingFirstPrinciples, client, project, locale, pushToast } = get()
    if (!pendingFirstPrinciples || !project || !client) return
    set({ firstPrinciplesBusy: true })
    try {
      let session = confirmThesisOnSession(
        pendingFirstPrinciples,
        thesis,
        acknowledgeLowConfidence,
      )
      session = await persistFirstPrinciplesSession(client, project.projectId, session)
      if (
        writePlannedFeature &&
        thesis.verdict === 'go' &&
        typeof client.writeFirstPrinciplesPlannedFeature === 'function'
      ) {
        const result = await client.writeFirstPrinciplesPlannedFeature({
          projectId: project.projectId,
          sessionId: session.id,
        })
        if (result.featureId) {
          session = {
            ...session,
            featuresFeatureId: result.featureId,
            updatedAt: new Date().toISOString(),
          }
          session = await persistFirstPrinciplesSession(client, project.projectId, session)
        }
        if (result.skippedLocked) {
          pushToast({
            type: 'warning',
            message: result.message ?? 'Feature locked — left unchanged',
            autoDismiss: 3000,
          })
        }
      }
      set({
        pendingFirstPrinciples: session,
        firstPrinciplesBusy: false,
      })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'firstPrinciples.concluded', {
          verdict: thesis.verdict,
        }),
        autoDismiss: 2500,
      })
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'Confirm thesis failed'),
      })
    }
  },
  resolveFirstPrinciplesConflict: async (resolution, rephraseText) => {
    const { pendingFirstPrinciples, client, project, locale } = get()
    if (!pendingFirstPrinciples || !project || !client) return
    set({ firstPrinciplesBusy: true })
    try {
      let session =
        typeof client.resolveFirstPrinciplesConflict === 'function'
          ? await client.resolveFirstPrinciplesConflict({
              projectId: project.projectId,
              sessionId: pendingFirstPrinciples.id,
              resolution,
              ...(rephraseText ? { rephraseText } : {}),
            })
          : pendingFirstPrinciples
      session = await persistFirstPrinciplesSession(client, project.projectId, session)
      const assistantMsg = assistantReflectMessage(session, locale)
      set((current) => ({
        pendingFirstPrinciples: session,
        firstPrinciplesBusy: false,
        messages: [...current.messages, assistantMsg],
      }))
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'Resolve conflict failed'),
      })
    }
  },
  pivotFirstPrinciples: async () => {
    const { pendingFirstPrinciples, client, project, locale } = get()
    if (!pendingFirstPrinciples || !project) return
    set({ firstPrinciplesBusy: true })
    try {
      let session = pivotFirstPrinciplesSession(pendingFirstPrinciples)
      session = await persistFirstPrinciplesSession(client, project.projectId, session)
      const assistantMsg = assistantReflectMessage(session, locale)
      set((current) => ({
        pendingFirstPrinciples: session,
        firstPrinciplesBusy: false,
        messages: [...current.messages, assistantMsg],
      }))
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'Pivot failed'),
      })
    }
  },
  handoffFirstPrinciples: async (target) => {
    const { pendingFirstPrinciples, setAskSubMode, setChatMode, setChatInput } = get()
    if (!pendingFirstPrinciples) return
    set({ firstPrinciplesBusy: true })
    try {
      await runFirstPrinciplesHandoff({
        session: pendingFirstPrinciples,
        target,
        setAskSubMode,
        setChatMode,
        setChatInput,
      })
      set({ firstPrinciplesBusy: false })
    } catch (error) {
      set({
        firstPrinciplesBusy: false,
        error: errorMessage(error, 'Handoff failed'),
      })
    }
  },
  setChatMode: async (mode, options) => {
    const state = get()
    if (state.chatMode === mode) return

    const isolate = options?.isolate ?? state.chatModeSwitch === 'new_session'
    if (!isolate || !state.project) {
      set({ chatMode: mode })
      scheduleChatSessionPersist()
      return
    }

    const modeTitleKey =
      mode === 'ask'
        ? 'chat.askMode'
        : mode === 'plan'
          ? 'chat.planMode'
          : mode === 'debug'
            ? 'chat.debugMode'
            : mode === 'anchored'
              ? 'chat.anchoredMode'
              : 'chat.changeMode'

    await useChatSessionStore.getState().createSession({
      seedWelcome: false,
      chatMode: mode,
      draftInput: state.composerDraft.text,
      activate: true,
      title: getStoreMessage(state.locale, modeTitleKey),
    })
  },

  stopAgentRun: async () => {
    const {
      client,
      project,
      activeRunId,
      flowStatus,
      refineLoading,
      latestAskTrace,
      latestPlanTrace,
      pushToast,
      locale,
      executionOverlay,
      graph,
    } = get()
    if (!activeRunId && flowStatus !== 'running' && !refineLoading) return

    const runId = activeRunId
    const askWasRunning = refineLoading && latestAskTrace?.status === 'running'
    const askScope = askWasRunning ? latestAskTrace.scope : null
    const planWasRunning = refineLoading && latestPlanTrace?.status === 'running'
    const planScope = planWasRunning ? latestPlanTrace.scope : null
    const hadActiveAgentRun = Boolean(runId) || flowStatus === 'running'
    disposeActiveRunSubscriptions(get, set)
    const settledOverlay =
      runId && executionOverlay?.runId === runId
        ? applyAgentRunEventToOverlay(
            executionOverlay,
            {
              eventId: `local_stop_${runId}_${Date.now()}`,
              runId,
              timestamp: new Date().toISOString(),
              type: 'run_cancelled',
            },
            graph?.fileIndex ?? [],
          )
        : executionOverlay
    // Optimistic settle: stream is closed so step_completed / run_cancelled will
    // not arrive. Keep UI from pulsing "working" after Stop (Pool + Timeline).
    set({
      flowStatus: hadActiveAgentRun ? 'cancelled' : 'idle',
      refineLoading: false,
      activeRunId: null,
      flowSteps: settleOpenFlowSteps(get().flowSteps),
      executionOverlay: settledOverlay,
      ...(askWasRunning && askScope
        ? { latestAskTrace: { status: 'cancelled' as const, scope: askScope } }
        : {}),
      ...(planWasRunning && planScope
        ? { latestPlanTrace: { status: 'cancelled' as const, scope: planScope } }
        : {}),
      ...(runId
        ? {
            revokedApplyRunIds: [
              ...new Set([...(get().revokedApplyRunIds ?? []), runId]),
            ],
            diffReviewOnlyReason: getStoreMessage(
              locale,
              'diff.applyBlockedAfterCancel',
            ),
          }
        : {}),
    })

    if (client && runId && typeof client.cancelAgentRun === 'function') {
      try {
        await client.cancelAgentRun(runId)
      } catch (error) {
        console.error('[workbench] cancelAgentRun failed', error)
      }
    }
    // Ask / intent-discovery cannot pass AbortSignal over IPC — abort on the main process.
    if (client && project && refineLoading && typeof client.cancelAsk === 'function') {
      try {
        await client.cancelAsk(project.projectId)
      } catch (error) {
        console.error('[workbench] cancelAsk failed', error)
      }
    }

    pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'chat.agentStopped'),
      autoDismiss: 2500,
    })
    // The toast disappears; the chat is where the person looks for what happened to the run.
    if (runId) {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: msgId(),
            role: 'system' as const,
            content: getStoreMessage(locale, 'chat.agentStoppedMessage'),
            timestamp: new Date().toISOString(),
          },
        ],
      }))
    }
    scheduleChatSessionPersist()
  },

  dismissError: () => set({ error: null }),

  updateEditorBuffer: (path, content) => {
    lspClient.changeDocument(path, content)
    useOutlineStore.getState().scheduleFetchOutline(path)
    set((s) => ({
      editorBuffers: { ...s.editorBuffers, [path]: content },
    }))
  },

  isEditorDirty: (path) => {
    const { editorBuffers, editorSavedBuffers } = get()
    if (editorBuffers[path] === undefined) return false
    if (editorSavedBuffers[path] === undefined) return true
    return editorBuffers[path] !== editorSavedBuffers[path]
  },

  setOutlineExpanded: (expanded) => set({ outlineExpanded: expanded }),
  setTimelineExpanded: (expanded) => set({ timelineExpanded: expanded }),

  saveEditorFile: async (path) => {
    const { client, project, editorBuffers, pushToast, locale } = get()
    if (!project) return
    const content = editorBuffers[path]
    if (content == null) return
    try {
      await client.saveFileWithHistory(project.projectId, path, content)
      lspClient.changeDocument(path, content)
      set((s) => ({
        editorSavedBuffers: { ...s.editorSavedBuffers, [path]: content },
      }))
      await useFileTimelineStore.getState().refresh(path)
      get().queueStructureRefineForChangedFiles([path])
      pushToast({ type: 'success', message: getStoreMessage(locale, 'editor.saveSuccess') })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to save file') })
    }
  },

  setActiveEditorFile: (paneId, filePath) => {
    const content = get().editorBuffers[filePath]
    if (content !== undefined) {
      openLspDocumentIfReady(filePath, content)
    }
    set((s) => ({
      ...setActiveEditorFileInLayout(s, paneId, filePath),
      selectedFilePath: filePath,
      highlightedFilePaths: [filePath],
    }))
  },

  setFocusedEditorPane: (paneId) => set({ focusedEditorPaneId: paneId }),

  closeEditorFile: (filePath, paneId) =>
    set((s) => {
      const nextLayout = closeEditorFileInLayout(s, filePath, paneId)
      const stillOpen = nextLayout.editorPanes.some((pane) =>
        pane.filePaths.includes(filePath),
      )
      if (!stillOpen) {
        lspClient.closeDocument(filePath)
      }
      const markdownEditorViewModes = { ...s.markdownEditorViewModes }
      if (!stillOpen) {
        delete markdownEditorViewModes[filePath]
      }
      return {
        ...nextLayout,
        markdownEditorViewModes,
        ...(s.selectedFilePath === filePath && !stillOpen
          ? { selectedFilePath: null }
          : {}),
      }
    }),

  setMarkdownEditorViewMode: (filePath, mode) =>
    set((s) => ({
      markdownEditorViewModes: { ...s.markdownEditorViewModes, [filePath]: mode },
    })),

  splitEditor: (direction) => set((s) => splitEditorLayout(s, direction)),

  reorderEditorFile: (paneId, filePath, toIndex) =>
    set((s) => reorderEditorFileInLayout(s, paneId, filePath, toIndex)),

  selectNode: async (nodeId) => {
    const state = get()
    const { project, graph } = state
    if (!project || !graph) return

    set({
      ...buildNodeSelectionPatch(state, nodeId),
      selectedStoryFeatureId: null,
    })
    await loadSelectedNodeContext(nodeId)
    set({ relatedKnowledge: null })
  },

  openNodeAgentChat: async (nodeId) => {
    const state = get()
    if (!state.project || !state.graph) return
    const node = state.graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || !isNodeAgentArchitectureLevel(node.level)) return

    set({
      ...buildNodeSelectionPatch(state, nodeId),
      chatMode: 'ask',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
    })
    if (!state.rightPanelOpen && typeof window !== 'undefined') {
      get().reclampPanelLayout()
    }
    await loadSelectedNodeContext(nodeId)
  },

  openGlobalAgentChat: () => {
    const state = get()
    if (!state.project) return
    set({
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      highlightedFilePaths: [],
      context: null,
      contextLoading: false,
      rightPanelTab: 'chat',
      rightPanelOpen: true,
    })
    if (!state.rightPanelOpen && typeof window !== 'undefined') {
      get().reclampPanelLayout()
    }
  },

  openFileAgentChat: async (filePath, preferredNodeId) => {
    await get().selectFile(filePath, preferredNodeId)
    if (get().selectedFilePath !== filePath || get().selectedNodeId !== preferredNodeId) return
    set({
      chatMode: 'ask',
      centerTab: 'function-map',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
    })
  },

  selectFile: async (filePath, preferredNodeId) => {
    const {
      client,
      project,
      graph,
      editorBuffers,
      editorSavedBuffers,
      tree,
      context,
    } = get()
    if (!project || !graph) return
    const projectId = project.projectId
    const requestSequence = ++fileContextRequestSequence

    const owner = resolveFileOwnerSelection(graph, tree, filePath, preferredNodeId)
    const isCurrentRequest = () => {
      const current = get()
      return requestSequence === fileContextRequestSequence &&
        current.project?.projectId === projectId &&
        current.selectedFilePath === filePath
    }
    const semanticRevealIds = tree
      ? collectSemanticAncestorIdsForPaths(tree.roots, [filePath])
      : []
    const directoryRevealPaths = collectDirectoryAncestorPaths(filePath)
    const nextBuffers = ensureBuffer(editorBuffers, filePath)
    const bufferContent = nextBuffers[filePath] ?? ''
    const needsContext = needsFileContextLoading(context, filePath)
    const fetchContentFromDisk = shouldFetchFileContentFromDisk(editorSavedBuffers, filePath)

    set((s) => ({
      globalAgentActive: false,
      selectedFilePath: filePath,
      selectedNodeId: owner.status === 'resolved' ? owner.nodeId : null,
      pendingFileOwnerChoice: owner.status === 'ambiguous'
        ? { filePath, candidateNodeIds: owner.candidateNodeIds }
        : null,
      fileScopeError: owner.status === 'not_mapped' ? 'not_mapped' : null,
      highlightedFilePaths: [filePath],
      semanticTreeExpansion: mergeTreeExpansion(s.semanticTreeExpansion, semanticRevealIds),
      directoryTreeExpansion: mergeTreeExpansion(s.directoryTreeExpansion, directoryRevealPaths),
      contextLoading: needsContext,
      centerTab: 'code',
      codeSubTab: 'editor',
      editorBuffers: nextBuffers,
      editorSavedBuffers:
        !usesRealFileContent() && editorSavedBuffers[filePath] === undefined
          ? { ...s.editorSavedBuffers, [filePath]: bufferContent }
          : s.editorSavedBuffers,
      ...openFileInEditorLayout(s, filePath),
      flashKey: s.flashKey + 1,
    }))

    openLspDocumentIfReady(filePath, bufferContent)

    try {
      const [resolvedContext, fileContent] = await Promise.all([
        needsContext
          ? client.getFileContext(project.projectId, filePath)
          : Promise.resolve(context),
        fetchContentFromDisk
          ? client.getFileContent(project.projectId, filePath)
          : Promise.resolve(null),
      ])

      if (!isCurrentRequest()) return

      if (needsContext || fileContent !== null) {
        set((s) => {
          const patch: Partial<WorkbenchState> = {}
          if (needsContext) {
            patch.context = resolvedContext
            patch.contextLoading = false
          }
          if (fileContent !== null) {
            patch.editorBuffers = { ...s.editorBuffers, [filePath]: fileContent }
            patch.editorSavedBuffers = { ...s.editorSavedBuffers, [filePath]: fileContent }
          }
          return patch
        })
      }

      if (fileContent !== null) {
        openLspDocumentIfReady(filePath, fileContent)
        // The outline was first asked for while the server held the empty placeholder this file is
        // opened with, so it came back with no symbols; ask again now that it has the real text.
        useOutlineStore.getState().scheduleFetchOutline(filePath)
      }
    } catch (err) {
      if (!isCurrentRequest()) return
      set({
        contextLoading: false,
        error: errorMessage(err, 'Failed to load context'),
      })
    }
  },

  chooseFileOwner: (nodeId) => {
    const { pendingFileOwnerChoice } = get()
    if (!pendingFileOwnerChoice?.candidateNodeIds.includes(nodeId)) return
    set({
      selectedNodeId: nodeId,
      selectedFilePath: pendingFileOwnerChoice.filePath,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
    })
  },

  assignFileOwner: async (nodeId) => {
    const { client, project, selectedFilePath, fileScopeError, locale, pushToast } = get()
    if (!project || !selectedFilePath || fileScopeError !== 'not_mapped') return
    const projectId = project.projectId
    const filePath = selectedFilePath
    try {
      await client.assignFileOwner(projectId, filePath, nodeId)
      const [graph, tree] = await Promise.all([
        client.getProjectGraph(projectId),
        client.getSemanticTree(projectId),
      ])
      if (get().project?.projectId !== projectId || get().selectedFilePath !== filePath) return
      set({ graph, tree })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'context.fileAssigned', {
          file: filePath,
          name: graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId,
        }),
      })
      // Select it the way a click in the tree does, so the context and scope follow the new owner.
      await get().selectFile(filePath, nodeId)
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to assign the file to a feature') })
    }
  },

  clearSelection: () =>
    set({
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      highlightedFilePaths: [],
      context: null,
      contextLoading: false,
    }),

  sendPrompt: async (input) => {
    const state = get()
    const draft = typeof input === 'string' ? emptyComposerDraft(input) : input
    const rawPrompt = draft.text
    if (state.createAgentComposerActive && rawPrompt.trim()) {
      set({ composerDraft: emptyComposerDraft() })
      await get().submitCreateAgentPrompt(rawPrompt.trim(), 'chat')
      return
    }
    const composerFields = buildPromptComposerFields(draft)
    const {
      chatMode,
      client,
      project,
      selectedNodeId,
      selectedFilePath,
      pushToast,
      composerHub,
    } = state
    if (!project || !rawPrompt.trim() || !canSubmitAgentPrompt(state)) {
      return
    }

    const visiblePrompt = rawPrompt.trim()
    const agentPrompt = appendComposerHubToPrompt(visiblePrompt, composerHub)

    const effectiveSkillId =
      draft.invokedSkillId ?? get().activeCustomModeSkillId ?? undefined
    const composerFieldsWithMode = {
      ...composerFields,
      ...(selectExecutorForRequest(state) ? { executorSelection: selectExecutorForRequest(state)! } : {}),
      ...(effectiveSkillId ? { invokedSkillId: effectiveSkillId } : {}),
    }

    const buildUserMessage = (): ChatMessage => ({
      id: msgId(),
      role: 'user',
      content: visiblePrompt,
      timestamp: new Date().toISOString(),
      chatMode,
      ...(draft.attachments.length > 0 ? { attachments: draft.attachments } : {}),
      ...(effectiveSkillId ? { invokedSkillId: effectiveSkillId } : {}),
    })

    const clearedDraft = emptyComposerDraft()

    // Wireframe Pack / Diagram Graph / Function Map routing (before mode-specific agent paths).
    {
      const {
        DIAGRAM_DESIGN_SKILL_ID,
        looksLikeDiagramRequest,
        looksLikeFunctionMapRequest,
        looksLikeOpenWireframePackRequest,
        looksLikeWireframePackRequest,
        wireframeVsDiagramAmbiguous,
      } = await import('@contracts/index')
      const skillIsDiagram = effectiveSkillId === DIAGRAM_DESIGN_SKILL_ID
      if (looksLikeFunctionMapRequest(visiblePrompt) && !skillIsDiagram) {
        const userMsg = buildUserMessage()
        set((current) => ({
          messages: [
            ...current.messages,
            userMsg,
            {
              id: msgId(),
              role: 'assistant' as const,
              content: getStoreMessage(get().locale, 'chat.diagramGraph.functionMapRedirect'),
              format: 'plain' as const,
              timestamp: new Date().toISOString(),
            },
          ],
          composerDraft: clearedDraft,
          centerTab: 'function-map',
        }))
        return
      }
      if (
        !skillIsDiagram &&
        looksLikeWireframePackRequest(visiblePrompt) &&
        !wireframeVsDiagramAmbiguous(visiblePrompt)
      ) {
        const userMsg = buildUserMessage()
        const { useDiagramGraphStore } = await import('./diagramGraphStore')
        if (looksLikeOpenWireframePackRequest(visiblePrompt)) {
          const { useWireframePackStore } = await import('./wireframePackStore')
          await useWireframePackStore.getState().loadForWorkspace()
          useDiagramGraphStore.getState().enterWireframeMode()
          set((current) => ({
            messages: [
              ...current.messages,
              userMsg,
              {
                id: msgId(),
                role: 'assistant' as const,
                content: getStoreMessage(get().locale, 'chat.wireframePack.summaryNotice'),
                format: 'plain' as const,
                timestamp: new Date().toISOString(),
              },
            ],
            composerDraft: clearedDraft,
            rightPanelTab: 'chat',
          }))
          return
        }
        set((current) => ({
          messages: [...current.messages, userMsg],
          composerDraft: clearedDraft,
          refineLoading: true,
          rightPanelTab: 'chat',
        }))
        try {
          const diagramStore = useDiagramGraphStore.getState()
          diagramStore.enterWireframeMode()
          diagramStore.setComposerDraft(visiblePrompt)
          diagramStore.setTypeHint('ui-wireframe')
          await diagramStore.generate('chat')
          const after = useDiagramGraphStore.getState()
          const wireframeError = (await import('./wireframePackStore')).useWireframePackStore
            .getState().error
          set((current) => ({
            refineLoading: false,
            messages: [
              ...current.messages,
              {
                id: msgId(),
                role: 'assistant' as const,
                content: after.pendingSummary
                  ? getStoreMessage(get().locale, 'chat.wireframePack.summaryNotice')
                  : wireframeError ??
                    after.error ??
                    getStoreMessage(get().locale, 'chat.wireframePack.generating'),
                format: 'plain' as const,
                timestamp: new Date().toISOString(),
              },
            ],
          }))
        } catch (error) {
          set({
            refineLoading: false,
            error: errorMessage(error, 'Wireframe pack generation failed'),
          })
        }
        return
      }
      if (
        !skillIsDiagram &&
        wireframeVsDiagramAmbiguous(visiblePrompt)
      ) {
        const userMsg = buildUserMessage()
        set((current) => ({
          messages: [
            ...current.messages,
            userMsg,
            {
              id: msgId(),
              role: 'assistant' as const,
              content: getStoreMessage(get().locale, 'chat.wireframePack.ambiguousPrompt'),
              format: 'plain' as const,
              timestamp: new Date().toISOString(),
            },
          ],
          composerDraft: clearedDraft,
        }))
        return
      }
      if (skillIsDiagram || looksLikeDiagramRequest(visiblePrompt)) {
        const userMsg = buildUserMessage()
        set((current) => ({
          messages: [...current.messages, userMsg],
          composerDraft: clearedDraft,
          refineLoading: true,
          rightPanelTab: 'chat',
        }))
        try {
          const { useDiagramGraphStore } = await import('./diagramGraphStore')
          const diagramStore = useDiagramGraphStore.getState()
          await diagramStore.ensureSkill()
          await diagramStore.loadForWorkspace()
          if (!diagramStore.styleChosen) {
            await diagramStore.chooseStyle('project-os-tech')
          }
          diagramStore.setComposerDraft(visiblePrompt)
          const artifact = await diagramStore.generate('chat')
          set((current) => ({
            refineLoading: false,
            messages: [
              ...current.messages,
              {
                id: msgId(),
                role: 'assistant' as const,
                content: artifact
                  ? getStoreMessage(get().locale, 'chat.diagramGraph.summaryNotice')
                  : diagramStore.error ??
                    getStoreMessage(get().locale, 'chat.diagramGraph.generating'),
                format: 'plain' as const,
                timestamp: new Date().toISOString(),
              },
            ],
          }))
        } catch (error) {
          set({
            refineLoading: false,
            error: errorMessage(error, 'Diagram generation failed'),
          })
        }
        return
      }
    }

    if (chatMode === 'anchored') {
      const anchor =
        get().chatAnchor ??
        (selectedNodeId ? { kind: 'node' as const, id: selectedNodeId } : null)
      if (!anchor || anchor.kind !== 'node') {
        pushToast({
          type: 'warning',
          message: getStoreMessage(get().locale, 'chat.anchoredPlaceholder'),
          autoDismiss: 3000,
        })
        return
      }
      const askScope: AgentConversationScope = {
        kind: 'node',
        nodeId: resolveProjectedCodeNode(get().graph?.fileIndex, anchor.id)?.nodeId ?? anchor.id,
      }
      const userMsg = buildUserMessage()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        refineLoading: true,
        rightPanelTab: 'chat',
        latestAskTrace: { status: 'running', scope: askScope },
      }))
      syncChatSessionHeadNow()
      try {
        const answer = await client.askAgent({
          projectId: project.projectId,
          scope: askScope,
          question: agentPrompt,
          language: { mode: 'auto' },
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        })
        if (get().latestAskTrace?.status === 'cancelled') {
          set({ refineLoading: false })
          return
        }
        set((current) => ({
          refineLoading: false,
          lastAnchoredAnswer: { answer: answer.answer, recorded: false },
          latestAskTrace: {
            status: 'complete',
            scope: answer.scope,
            result: answer,
          },
          latestContextAssembly: answer.contextAssembly ?? null,
          messages: [
            ...current.messages,
            {
              id: answer.id,
              role: 'assistant' as const,
              content: answer.answer,
              format: 'markdown' as const,
              timestamp: answer.createdAt,
            },
          ],
        }))
        notifyMemoryWrite(pushToast, get().locale, answer.memoryWrite)
      } catch (error) {
        if (isOperationCancelled(error) || get().latestAskTrace?.status === 'cancelled') {
          set({
            refineLoading: false,
            latestAskTrace: { status: 'cancelled', scope: askScope },
          })
          return
        }
        set({
          refineLoading: false,
          latestAskTrace: {
            status: 'error',
            scope: askScope,
            message: errorMessage(error, 'Anchored ask failed'),
          },
          error: errorMessage(error, 'Anchored ask failed'),
        })
      }
      return
    }

    if (chatMode === 'ask' && get().askSubMode === 'first_principles') {
      const pending = get().pendingFirstPrinciples
      if (!pending || pending.status === 'concluded' || pending.status === 'abandoned') {
        await get().beginFirstPrinciplesFromVision(visiblePrompt)
        return
      }
      if (pending.status === 'thesis_review') {
        pushToast({
          type: 'info',
          message: getStoreMessage(get().locale, 'firstPrinciples.thesis.intro'),
          autoDismiss: 2800,
        })
        return
      }
      if (pending.activeQuestion) {
        const userMsg = buildUserMessage()
        set((current) => ({
          messages: [...current.messages, userMsg],
          composerDraft: clearedDraft,
        }))
        await get().answerFirstPrinciplesQuestion({
          questionId: pending.activeQuestion.id,
          kind: 'custom',
          text: visiblePrompt,
        })
        return
      }
      await get().beginFirstPrinciplesFromVision(visiblePrompt)
      return
    }

    if (chatMode === 'ask') {
      get().maybeSuggestFirstPrinciplesAfterAskSend(visiblePrompt)
      const askScope: AgentConversationScope = conversationScopeFromSelection(state)
      const userMsg = buildUserMessage()
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        pendingRefinement: null,
        refinementConfirmed: false,
        refineLoading: true,
        rightPanelTab: 'chat',
        agentFlowSubject: 'ask',
        latestAskTrace: { status: 'running', scope: askScope },
      }))
      syncChatSessionHeadNow()
      try {
        const answer = await client.askAgent({
          projectId: project.projectId,
          scope: askScope,
          question: agentPrompt,
          language: { mode: 'auto' },
          exploration: { maxRounds: 2 },
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        })
        if (get().latestAskTrace?.status === 'cancelled') {
          set({ refineLoading: false })
          return
        }
        set((current) => ({
          refineLoading: false,
          latestAskTrace: {
            status: 'complete',
            scope: answer.scope,
            result: answer,
          },
          latestContextAssembly: answer.contextAssembly ?? null,
          messages: [
            ...current.messages,
            {
              id: answer.id,
              role: 'assistant' as const,
              content: answer.answer,
              format: 'markdown' as const,
              ...(answer.explorationTrace
                ? { explorationTrace: answer.explorationTrace }
                : {}),
              ...(answer.mcpToolCalls?.length
                ? { mcpToolCalls: answer.mcpToolCalls }
                : {}),
              ...(answer.retrievalSummary?.searched
                ? { retrievalSummary: answer.retrievalSummary }
                : {}),
              ...(answer.responseLanguage.validation === 'mismatch_after_retry'
                ? {
                    notice: getStoreMessage(
                      current.locale,
                      'chat.askLanguageMismatchNotice',
                    ),
                  }
                : {}),
              timestamp: answer.createdAt,
            },
          ],
        }))
        get().maybeNotifyAgentComplete({
          kind: 'ask',
          // System notify IPC requires non-empty runIds; reuse answer id as the ask handle.
          runId: answer.id,
          summary: truncateDiffReadySummary(visiblePrompt),
          completedAt: Date.now(),
        })
        notifyMemoryWrite(pushToast, get().locale, answer.memoryWrite)
      } catch (error) {
        if (isOperationCancelled(error) || get().latestAskTrace?.status === 'cancelled') {
          set({
            refineLoading: false,
            latestAskTrace: { status: 'cancelled', scope: askScope },
          })
          return
        }
        const ownershipFailure = readFileOwnershipFailure(error)
        if (selectedFilePath && ownershipFailure?.code === 'ownership_ambiguous') {
          set({
            selectedNodeId: null,
            pendingFileOwnerChoice: {
              filePath: selectedFilePath!,
              candidateNodeIds: ownershipFailure.candidateNodeIds,
            },
            fileScopeError: null,
            refineLoading: false,
            latestAskTrace: {
              status: 'error',
              scope: askScope,
              message: sanitizeErrorMessage(error),
            },
          })
          return
        }
        if (selectedFilePath && ownershipFailure?.code === 'file_owner_not_found') {
          set({
            selectedNodeId: null,
            pendingFileOwnerChoice: null,
            fileScopeError: 'not_mapped',
            refineLoading: false,
            latestAskTrace: {
              status: 'error',
              scope: askScope,
              message: sanitizeErrorMessage(error),
            },
          })
          return
        }
        set((current) => {
          const failureMessage = createAskFailureChatMessage(error, current.locale)
          return {
            refineLoading: false,
            latestAskTrace: {
              status: 'error',
              scope: askScope,
              message: failureMessage.content,
            },
            messages: [...current.messages, failureMessage],
          }
        })
      }
      scheduleChatSessionPersist()
      return
    }

    if (chatMode === 'plan') {
      const planScope: AgentConversationScope = conversationScopeFromSelection(state)
      const userMsg = buildUserMessage()
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        pendingPlan: null,
        planConfirmed: false,
        refineLoading: true,
        rightPanelTab: 'chat',
        agentFlowSubject: 'plan',
        latestPlanTrace: {
          status: 'running',
          scope: planScope,
        },
      }))
      syncChatSessionHeadNow()
      try {
        const plan = withPlanQuestionOptions(await client.createPlan({
          projectId: project.projectId,
          scope: planScope,
          objective: agentPrompt,
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        }))
        if (
          get().latestPlanTrace?.status === 'cancelled' ||
          !get().refineLoading
        ) {
          set({ refineLoading: false })
          return
        }
        if (plan.status === 'needs_clarification') {
          const questions = plan.clarifyingQuestions ?? []
          const questionText = questions.length
            ? questions.map((item) => `- ${item.question}`).join('\n')
            : plan.ambiguities.join('\n')
          set((current) => ({
            refineLoading: false,
            pendingPlan: plan,
            latestPlanTrace: {
              status: 'needs_clarification',
              scope: planScope,
              result: plan,
            },
            latestContextAssembly: plan.contextAssembly ?? null,
            messages: [
              ...current.messages,
              {
                id: msgId(),
                role: 'assistant' as const,
                content: `${getStoreMessage(current.locale, 'plan.clarificationIntro')}\n\n${questionText}`,
                format: 'markdown' as const,
                timestamp: new Date().toISOString(),
              },
            ],
          }))
        } else {
          set({
            refineLoading: false,
            pendingPlan: plan,
            latestPlanTrace: {
              status: 'complete',
              scope: planScope,
              result: plan,
            },
            latestContextAssembly: plan.contextAssembly ?? null,
          })
        }
      } catch (error) {
        if (
          isOperationCancelled(error) ||
          get().latestPlanTrace?.status === 'cancelled' ||
          !get().refineLoading
        ) {
          set({
            refineLoading: false,
            latestPlanTrace: { status: 'cancelled', scope: planScope },
          })
          return
        }
        set((current) => ({
          refineLoading: false,
          latestPlanTrace: {
            status: 'error',
            scope: planScope,
            message: userFacingErrorMessage(error, current.locale),
          },
          messages: [
            ...current.messages,
            {
              id: msgId(),
              role: 'assistant' as const,
              content: getStoreMessage(current.locale, 'plan.failure', {
                message: userFacingErrorMessage(error, current.locale),
              }),
              timestamp: new Date().toISOString(),
            },
          ],
        }))
      }
      scheduleChatSessionPersist()
      return
    }

    if (chatMode === 'debug') {
      const debugScope: AgentConversationScope = conversationScopeFromSelection(state)
      const userMsg = buildUserMessage()
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        refineLoading: true,
        rightPanelTab: 'chat',
        agentFlowSubject: 'debug',
      }))
      syncChatSessionHeadNow()
      try {
        const session = await client.startDebugSession({
          projectId: project.projectId,
          scope: debugScope,
          bugDescription: agentPrompt,
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        })
        set((current) => ({
          refineLoading: false,
          debugSession: session,
          messages: [
            ...current.messages,
            {
              id: msgId(),
              role: 'system' as const,
              content: getStoreMessage(current.locale, 'debug.chatStageReproduce'),
              timestamp: new Date().toISOString(),
            },
          ],
        }))
      } catch (error) {
        set({
          refineLoading: false,
          error: errorMessage(error, 'Failed to start debug session'),
        })
      }
      scheduleChatSessionPersist()
      return
    }

    if (chatMode === 'change') {
      const executorSelection = composerFieldsWithMode.executorSelection
      if (!executorSelection) {
        pushToast({ type: 'warning', message: getStoreMessage(state.locale, 'chat.configureModel') })
        return
      }
      get().runDisposable?.dispose()
      resetDiffReadyBatch()
      const userMsg = buildUserMessage()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        pendingIntent: null,
        pendingRefinement: null,
        refinementConfirmed: false,
        refineLoading: true,
        activeRunId: null,
        flowStatus: 'idle',
        executionOverlay: null,
        runDecisions: [],
        focusedDecisionId: null,
      }))
      syncChatSessionHeadNow()
      try {
        const intent = await client.extractRequestIntent({
          projectId: project.projectId,
          rawRequest: rawPrompt.trim(),
          ...requestTargetFromSelection(state),
          ...composerFieldsWithMode,
          executorSelection,
        })
        // Drop late intent if Stop already cleared the in-flight turn.
        if (!get().refineLoading) {
          return
        }
        set({
          pendingIntent: intent,
          rightPanelTab: 'chat',
          refineLoading: false,
        })
      } catch (error) {
        if (isOperationCancelled(error) || !get().refineLoading) {
          set({ refineLoading: false })
          return
        }
        set({
          refineLoading: false,
          error: errorMessage(error, 'Failed to prepare request intent'),
        })
      }
      scheduleChatSessionPersist()
      return
    }

    get().runDisposable?.dispose()
    resetDiffReadyBatch()

    const userMsg = buildUserMessage()

    set((s) => ({
      messages: [...s.messages, userMsg],
      composerDraft: clearedDraft,
      pendingRefinement: null,
      refinementConfirmed: false,
      refineLoading: true,
      activeRunId: null,
      flowSteps: [],
      flowActions: [],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      flowTransientTraces: [],
      flowCorrections: [],
      flowStatus: 'idle',
      executionOverlay: null,
      liveGraphFocusTaskId: null,
        liveGraphPausedRunId: null,
      diffReady: false,
      diffReviewOnlyReason: null,
      diffUnmetRequirements: [],
      diffReadyBanner: null,
      pendingChangesDrawerDismissedRunId: null,
      diffFileStats: [],
      runDisposable: null,
    }))
    syncChatSessionHeadNow()

    try {
      const refinement = await client.refinePrompt({
        projectId: project.projectId,
        ...requestTargetFromSelection(state),
        rawPrompt: agentPrompt,
        workforceAgentDefinitionId: get().activeAgentDefinitionId,
        ...chatSessionRequestFields(),
        ...composerFieldsWithMode,
      })
      // Drop late refine if Stop already cleared the in-flight turn.
      if (!get().refineLoading) {
        return
      }
      set((state) => ({
        pendingRefinement: refinement,
        rightPanelTab: 'chat',
        refineLoading: false,
        messages: refinement.fallback
          ? [...state.messages, createFallbackChatMessage(refinement.fallback, state.locale)]
          : state.messages,
      }))
      notifyMemoryWrite(pushToast, get().locale, refinement.memoryWrite)
      if (refinement.fallback) {
        pushToast({
          type: 'warning',
          message: sanitizeErrorMessage(
            refinement.fallback.providerMessage ?? refinement.fallback.message,
          ),
        })
      } else if (refinement.mode === 'deterministic_fixture' && get().settings && !get().settings?.presentationMode) {
        pushToast({ type: 'info', message: getStoreMessage(get().locale, 'settings.fallbackNotice') })
      }
      if (
        refinement.executionPolicy === 'automatic' &&
        canSkipAlignment(refinement)
      ) {
        await get().confirmRefinement()
        set({ pendingRefinement: null })
      }
    } catch (err) {
      if (isOperationCancelled(err) || !get().refineLoading) {
        set({ refineLoading: false })
        return
      }
      set({
        refineLoading: false,
        error: errorMessage(err, 'Failed to refine prompt'),
      })
    }
    scheduleChatSessionPersist()
  },

  confirmRefinement: async (alignment, onStarted) => {
    const { client, pendingRefinement, pushToast, locale } = get()
    if (!pendingRefinement) return
    const subscriptionProjectId = get().project?.projectId

    get().runDisposable?.dispose()

    try {
      if (alignment) {
        const confirmed = await client.confirmAlignment(alignment)
        set({ pendingRefinement: confirmed })
      }
      const refinementId = get().pendingRefinement?.id ?? pendingRefinement.id
      const run = await client.confirmExecution(refinementId)
      const delivered = run as typeof run & {
        contextAssembly?: import('@contracts/index').ContextAssembly
      }
      if (!subscriptionProjectId || get().project?.projectId !== subscriptionProjectId) return

      pushToast({ type: 'info', message: getStoreMessage(locale, 'toast.agentRunning') })
      useChatSessionStore.getState().presentAgentFlow()
      set({
        refinementConfirmed: true,
        latestContextAssembly: delivered.contextAssembly ?? get().latestContextAssembly,
        activeRunId: run.runId,
        decisionRootRunId: run.rootRunId ?? run.runId,
        runDecisions: [],
        focusedDecisionId: null,
        flowSteps: [],
        flowActions: [],
        flowDelegationEvents: [],
        delegatedRunTraces: {},
        flowTransientTraces: [],
        flowCorrections: [],
        flowStatus: 'running',
        executionOverlay: null,
        liveGraphFocusTaskId: null,
        liveGraphPausedRunId: null,
        agentFlowSubject: 'run',
        diffReady: false,
        diffReviewOnlyReason: null,
        revokedApplyRunIds: [],
        diffUnmetRequirements: [],
        generatedDiff: null,
        applyResult: null,
        verificationResult: null,
        verificationCommandApproval: null,
        verificationLoading: false,
        harnessFixRunId: null,
        selectedFlowStepId: null,
        selectedActivityId: null,
        flowInspectorFollowLive: true,
        runDisposable: null,
        pendingChangesDrawerDismissedRunId: null,
        pendingChangesDrawerExpanded: true,
        diffFileStats: [],
        selectedDiffFilePath: null,
      })
      onStarted?.(run)
      void get().loadRunDecisions(run.rootRunId ?? run.runId)

      const isCurrentRunSubscription = () => {
        const current = get()
        return current.activeRunId === run.runId &&
          current.project?.projectId === subscriptionProjectId
      }

      const handledRunEventIds = new Set<string>()
      /** Snapshot watermark — live events with runSequence <= this are ignored (DevPlan §7.4). */
      let snapshotWatermark: number | null = null
      let lastDecisionRefreshAt = 0
      const refreshRunDecisionsIfDue = () => {
        const rootRunId = run.rootRunId ?? run.runId
        const inspectedRootRunId = get().decisionRootRunId
        if (inspectedRootRunId && inspectedRootRunId !== rootRunId) return
        const now = Date.now()
        if (now - lastDecisionRefreshAt < 1_500) return
        lastDecisionRefreshAt = now
        void get().loadRunDecisions(rootRunId)
      }
      const applyRunEvent = (
        event: AgentRunEvent,
        options?: { fromSnapshot?: boolean },
      ) => {
        if (!isCurrentRunSubscription()) return
        if (handledRunEventIds.has(event.eventId)) return
        // Live-only filter (Agent-Pool §7.4): after a snapshot is applied, ignore
        // overlapping live deliveries. Snapshot events themselves must still apply.
        if (
          !options?.fromSnapshot &&
          typeof event.runSequence === 'number' &&
          snapshotWatermark != null &&
          event.runSequence <= snapshotWatermark
        ) {
          handledRunEventIds.add(event.eventId)
          return
        }
        handledRunEventIds.add(event.eventId)
        try {
          handleRunEvent(event, set, get)
          scheduleChatSessionPersist()
        } catch (error) {
          console.error('[workbench] failed to apply agent run event', event.type, error)
        }
        refreshRunDecisionsIfDue()
        if (event.type === 'task_delegated') {
          ensureChildSubscription(event, run.runId, run.runId)
        }
      }

      const childDisposables = new Map<string, { dispose: () => void }>()
      const ensureChildSubscription = (
        event: Extract<AgentDelegationEvent, { type: 'task_delegated' }>,
        parentRunId: string,
        rootRunId: string,
      ) => {
        if (!isCurrentRunSubscription()) return
        const childRunId = event.payload.childRunId
        const targetKind = 'targetKind' in event.payload
          ? event.payload.targetKind
          : 'leaf-file'
        set((current) => {
          const existing = current.delegatedRunTraces[childRunId]
          const trace: DelegatedRunTrace = existing
            ? {
                ...existing,
                nodeId: existing.nodeId ?? event.payload.nodeId,
                parentRunId: existing.parentRunId ?? parentRunId,
                rootRunId: existing.rootRunId ?? rootRunId,
                targetKind: existing.targetKind ?? targetKind,
              }
            : {
                taskId: event.payload.taskId,
                filePath: 'filePath' in event.payload
                  ? event.payload.filePath
                  : event.payload.nodeId,
                nodeId: event.payload.nodeId,
                parentRunId,
                rootRunId,
                targetKind,
                events: [],
                transientTraces: [],
              }
          return {
            delegatedRunTraces: {
              ...current.delegatedRunTraces,
              [childRunId]: trace,
            },
          }
        })
        if (childDisposables.has(childRunId)) return
        if (typeof client.getAgentRun === 'function') {
          void client.getAgentRun(childRunId).then((childRun) => {
            if (!isCurrentRunSubscription()) return
            set((current) => {
              const trace = current.delegatedRunTraces[childRunId]
              if (!trace || trace.parentRunId !== parentRunId || trace.rootRunId !== rootRunId) {
                return current
              }
              return {
                delegatedRunTraces: {
                  ...current.delegatedRunTraces,
                  [childRunId]: {
                    ...trace,
                    parentRunId: childRun.parentRunId ?? parentRunId,
                    rootRunId: childRun.rootRunId ?? rootRunId,
                    scopeKind: childRun.scope?.kind,
                    role: childRun.role,
                  },
                },
              }
            })
          }).catch((error) => {
            console.error('[workbench] failed to load delegated run metadata', childRunId, error)
          })
        }
        const childDisposable = client.streamAgentRun(
          childRunId,
          (childEvent) => {
            if (!isCurrentRunSubscription()) return
            set((current) => {
              const trace = current.delegatedRunTraces[childRunId]
              if (!trace || trace.events.some((item) => item.eventId === childEvent.eventId)) {
                return current
              }
              const fileIndex = current.graph?.fileIndex ?? []
              const overlayBase =
                current.executionOverlay ??
                emptyExecutionOverlay(rootRunId, childEvent.timestamp)
              const next: Partial<WorkbenchState> = {
                delegatedRunTraces: {
                  ...current.delegatedRunTraces,
                  [childRunId]: {
                    ...trace,
                    events: [...trace.events, childEvent],
                  },
                },
                // Feed child honesty into Live Graph without replacing parent apply/verify state.
                executionOverlay: applyAgentRunEventToOverlay(
                  overlayBase,
                  childEvent,
                  fileIndex,
                ),
              }
              // Child preview must not re-block Apply after the parent batch already
              // unlocked (late/replayed child events race past batch_validation_result).
              const parentBatchUnlocked = hasAuthorizingParentBatchValid({
                activeRunId: current.activeRunId ?? rootRunId,
                flowActions: current.flowActions ?? [],
              })
              const applyRevoked = isApplyAuthorizationRevoked({
                activeRunId: current.activeRunId ?? rootRunId,
                revokedApplyRunIds: current.revokedApplyRunIds,
                flowStatus: current.flowStatus,
              })
              if (childEvent.type === 'diff_proposed') {
                if (!parentBatchUnlocked && !applyRevoked) {
                  next.diffReviewOnlyReason = getStoreMessage(
                    current.locale,
                    'diff.validatingProposal',
                  )
                }
                next.centerTab = 'code'
                next.codeSubTab = 'diff'
              }
              if (childEvent.type === 'diff_ready') {
                // Preview OK; Apply stays blocked until parent batch_validation_result
                // is valid — child validation alone must not authorize group apply.
                if (!parentBatchUnlocked && !applyRevoked) {
                  next.diffReviewOnlyReason = getStoreMessage(
                    current.locale,
                    'diff.awaitingParentBatchValidation',
                  )
                }
                next.centerTab = 'code'
                next.codeSubTab = 'diff'
              }
              return next
            })
            if (childEvent.type === 'diff_proposed' || childEvent.type === 'diff_ready') {
              void get().loadDiff(childRunId)
            }
            refreshRunDecisionsIfDue()
            if (childEvent.type === 'task_delegated') {
              ensureChildSubscription(childEvent, childRunId, rootRunId)
            }
          },
          (traceEvent) => {
            if (!isCurrentRunSubscription()) return
            set((current) => {
              const trace = current.delegatedRunTraces[childRunId]
              if (
                !trace ||
                trace.transientTraces.some((item) => item.traceId === traceEvent.traceId)
              ) return current
              return {
                delegatedRunTraces: {
                  ...current.delegatedRunTraces,
                  [childRunId]: {
                    ...trace,
                    transientTraces: [...trace.transientTraces, traceEvent],
                  },
                },
              }
            })
          },
        )
        childDisposables.set(childRunId, childDisposable)
      }

      const syncFlowFromRun = async () => {
        if (!isCurrentRunSubscription()) return
        try {
          const snapshot = await client.getAgentRunEventSnapshot(run.runId)
          if (!isCurrentRunSubscription()) return
          // Apply snapshot first, then raise watermark — never the reverse.
          // Fast synthetic/model runs finish before live subscribe; reversing
          // left flowStatus stuck on "running" with an empty Diff panel.
          for (const event of snapshot.events) {
            applyRunEvent(event as AgentRunEvent, { fromSnapshot: true })
          }
          snapshotWatermark = snapshot.watermark
        } catch (error) {
          // Fallback for older transports / partial mocks.
          try {
            const events = await client.getAgentRunEvents(run.runId)
            if (!isCurrentRunSubscription()) return
            for (const event of events) {
              applyRunEvent(event)
            }
          } catch (fallbackError) {
            console.error('[workbench] failed to sync agent run events', error, fallbackError)
          }
        }
      }

      const disposable = client.streamAgentRun(
        run.runId,
        applyRunEvent,
        (trace) => {
          logTransientTraceToActivity(trace)
          if (!isCurrentRunSubscription()) return
          set((current) => ({
            flowTransientTraces: current.flowTransientTraces.some(
              (existing) => existing.traceId === trace.traceId,
            )
              ? current.flowTransientTraces
              : [...current.flowTransientTraces, trace],
          }))
        },
      )
      set({
        runDisposable: {
          dispose: () => {
            disposable.dispose()
            for (const childDisposable of childDisposables.values()) {
              childDisposable.dispose()
            }
            childDisposables.clear()
          },
        },
      })

      await syncFlowFromRun()
      if (get().flowSteps.length === 0) {
        const pollUntil = Date.now() + 15_000
        while (get().flowSteps.length === 0 && get().flowStatus === 'running' && Date.now() < pollUntil) {
          await new Promise((resolve) => setTimeout(resolve, 200))
          await syncFlowFromRun()
        }
      }
    } catch (err) {
      const ownershipFailure = readFileOwnershipFailure(err)
      const selectedFilePath = get().selectedFilePath
      if (ownershipFailure?.code === 'ownership_ambiguous' && selectedFilePath) {
        set({
          selectedNodeId: null,
          pendingFileOwnerChoice: {
            filePath: selectedFilePath,
            candidateNodeIds: ownershipFailure.candidateNodeIds,
          },
          fileScopeError: null,
          pendingRefinement: null,
          refinementConfirmed: false,
          flowStatus: 'idle',
        })
        return
      }
      if (ownershipFailure?.code === 'file_owner_not_found') {
        set({
          selectedNodeId: null,
          pendingFileOwnerChoice: null,
          fileScopeError: 'not_mapped',
          pendingRefinement: null,
          refinementConfirmed: false,
          flowStatus: 'idle',
        })
        return
      }
      set({
        error: errorMessage(err, 'Failed to start run'),
        flowStatus: 'error',
      })
    }
  },

  reviseRefinement: () => {
    const state = get()
    if (!state.pendingRefinement || state.refinementConfirmed) return
    const lastUserRequest = [...state.messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content
    set({
      composerDraft: emptyComposerDraft(lastUserRequest ?? state.pendingRefinement.understood),
      pendingRefinement: null,
      refinementConfirmed: false,
      refineLoading: false,
    })
  },

  confirmPlanBuild: async () => {
    const { client, project, pendingPlan, refineLoading, pushToast, locale } = get()
    if (!pendingPlan || pendingPlan.status !== 'ready' || refineLoading) return
    if (pendingPlan.steps.length === 0) {
      pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'plan.buildNeedsSteps'),
        autoDismiss: 3000,
      })
      return
    }
    const isCurrentBuild = () => get().project?.projectId === project?.projectId &&
      get().pendingPlan?.id === pendingPlan.id
    set({ refineLoading: true, planConfirmed: false, error: null })
    try {
      const refinement = await client.buildPlan(pendingPlan.id)
      if (!isCurrentBuild()) return
      // buildPlan still returns PromptRefinement; surface model→deterministic
      // fallback the same way the legacy refinePrompt path did (redacted system line).
      set((current) => ({
        pendingRefinement: refinement,
        refinementConfirmed: false,
        messages: refinement.fallback
          ? [...current.messages, createFallbackChatMessage(refinement.fallback, current.locale)]
          : current.messages,
      }))
      if (refinement.fallback) {
        pushToast({
          type: 'warning',
          message: sanitizeErrorMessage(
            refinement.fallback.providerMessage ?? refinement.fallback.message,
          ),
        })
      }
      let started = false
      await get().confirmRefinement(undefined, () => {
        if (!isCurrentBuild()) return
        started = true
        set({
          refineLoading: false,
          lastBuiltPlan: pendingPlan,
          pendingPlan: null,
          planConfirmed: true,
          chatMode: 'change',
          agentFlowSubject: 'run',
          rightPanelTab: 'chat',
        })
        pushToast({ type: 'info', message: getStoreMessage(locale, 'plan.buildStarted') })
      })
      if (!started && isCurrentBuild()) {
        set({
          refineLoading: false,
          planConfirmed: false,
          refinementConfirmed: false,
          pendingRefinement: null,
          chatMode: 'plan',
          agentFlowSubject: 'plan',
        })
      }
    } catch (error) {
      if (!isCurrentBuild()) return
      set({
        refineLoading: false,
        planConfirmed: false,
        refinementConfirmed: false,
        pendingRefinement: null,
        error: errorMessage(error, 'Failed to build plan'),
      })
    }
    scheduleChatSessionPersist()
  },

  savePlanEdits: async (patch) => {
    const { client, pendingPlan, pushToast, locale } = get()
    if (!pendingPlan || pendingPlan.status !== 'ready') return
    try {
      const updated = await client.updatePlan({
        planId: pendingPlan.id,
        objective: patch.objective,
        steps: patch.steps,
        todos: patch.todos,
        rationale: patch.rationale,
        status: 'ready',
      })
      set({
        pendingPlan: withPlanQuestionOptions(updated),
        latestPlanTrace: {
          status: 'complete',
          scope: updated.scope,
          result: updated,
        },
      })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'plan.editsSaved'),
        autoDismiss: 2500,
      })
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to save plan edits') })
    }
  },

  savePlanToWorkspace: async () => {
    const { client, pendingPlan, pushToast, locale } = get()
    if (!client || !pendingPlan) return
    if (typeof client.savePlanToWorkspace !== 'function') {
      pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'common.comingSoon'),
        autoDismiss: 2500,
      })
      return
    }
    try {
      await client.savePlanToWorkspace(pendingPlan.id)
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'plan.savedToWorkspace'),
        autoDismiss: 3000,
      })
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to save plan to workspace') })
    }
  },

  returnToPlan: () => {
    const { lastBuiltPlan, applyResult } = get()
    if (!lastBuiltPlan) return
    const restorePlan = () => {
      set({
        pendingPlan: { ...lastBuiltPlan, status: 'ready' },
        planConfirmed: false,
        chatMode: 'plan',
        pendingRefinement: null,
        refinementConfirmed: false,
        agentFlowSubject: 'plan',
        rightPanelTab: 'chat',
      })
      scheduleChatSessionPersist()
    }
    if (applyResult?.applied && applyResult.backupId) {
      void get()
        .undoCurrentApply()
        .then(restorePlan)
        .catch(() => restorePlan())
      return
    }
    restorePlan()
  },

  setActiveCustomModeSkillId: (skillId) => {
    if (!skillId) {
      set({ activeCustomModeSkillId: null, customModePreviousChatMode: null })
      scheduleChatSessionPersist()
      return
    }
    const { activeCustomModeSkillId, chatMode, customModePreviousChatMode } = get()
    set({
      activeCustomModeSkillId: skillId,
      customModePreviousChatMode:
        activeCustomModeSkillId && customModePreviousChatMode
          ? customModePreviousChatMode
          : chatMode,
      // Custom Mode and specialized Agent are mutually exclusive (v1).
      activeAgentDefinitionId: null,
      activeAgentDisplayName: null,
    })
    scheduleChatSessionPersist()
  },

  exitCustomMode: () => {
    const { customModePreviousChatMode, chatMode } = get()
    const restoreMode = customModePreviousChatMode ?? chatMode
    set({
      activeCustomModeSkillId: null,
      customModePreviousChatMode: null,
      chatMode: restoreMode,
    })
    scheduleChatSessionPersist()
  },

  setActiveAgentDefinitionId: (definitionId, displayName = null) => {
    set({
      activeAgentDefinitionId: definitionId,
      activeAgentDisplayName: definitionId ? displayName : null,
      chatMode: 'change',
      ...(definitionId
        ? { activeCustomModeSkillId: null, customModePreviousChatMode: null }
        : {}),
      createAgentComposerActive: false,
    })
    scheduleChatSessionPersist()
  },

  beginCreateAgentComposer: (_source = 'chat') => {
    set({
      createAgentComposerActive: true,
      pendingWorkforceDraft: null,
      chatMode: 'change',
    })
  },

  beginWorkforceDraftFromAgentListing: (listing, options) => {
    const skillIds = [
      ...new Set([...(listing.skillIds ?? []), ...(listing.dependsOn?.skills ?? [])]),
    ]
    const hintLine =
      listing.permissionHints && listing.permissionHints.length > 0
        ? `Permission hints: ${listing.permissionHints.join(', ')}`
        : undefined
    const permissionNotes = [listing.permissionNotes?.trim(), hintLine]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join('\n')
    const suffix = options?.asAdditionalInstance ? '(copy)' : undefined
    const displayName = suffix
      ? `${listing.name} ${suffix}`.slice(0, 120)
      : listing.name
    const draft: import('@contracts/index').WorkforceAgentDraft = {
      displayName,
      ...(listing.roleLabel ? { roleLabel: listing.roleLabel } : {}),
      instructions: listing.instructions ?? '',
      modelProfileId: null,
      skillIds,
      mcpServerIds: [],
      ...(permissionNotes ? { permissionNotes: permissionNotes.slice(0, 2000) } : {}),
    }
    set({
      pendingWorkforceDraft: {
        draft,
        sourcePrompt: `template:${listing.id}`,
        source: options?.source ?? 'chat',
      },
      createAgentComposerActive: true,
      chatMode: 'change',
      activeCustomModeSkillId: null,
      customModePreviousChatMode: null,
    })
  },

  cancelCreateAgentComposer: () => {
    set({ createAgentComposerActive: false, pendingWorkforceDraft: null })
  },

  submitCreateAgentPrompt: async (prompt, source = 'chat') => {
    const { client, project } = get()
    const trimmed = prompt.trim()
    if (!client || !project || !trimmed || !client.draftWorkforceAgent) return
    const result = await client.draftWorkforceAgent({
      projectId: project.projectId,
      prompt: trimmed,
    })
    set({
      pendingWorkforceDraft: {
        draft: result.draft,
        sourcePrompt: result.sourcePrompt,
        source,
      },
      createAgentComposerActive: true,
    })
  },

  updatePendingWorkforceDraft: (draft) => {
    const pending = get().pendingWorkforceDraft
    if (!pending) return
    set({ pendingWorkforceDraft: { ...pending, draft } })
  },

  dismissWorkforceDraft: () => {
    set({ pendingWorkforceDraft: null, createAgentComposerActive: false })
  },

  confirmWorkforceDraft: async (options) => {
    const { client, project, pendingWorkforceDraft } = get()
    if (!client || !project || !pendingWorkforceDraft || !client.createWorkforceAgent) {
      return null
    }
    const created = await client.createWorkforceAgent({
      projectId: project.projectId,
      draft: pendingWorkforceDraft.draft,
    })
    const useInChat = options?.useInChat ?? pendingWorkforceDraft.source === 'chat'
    set({
      pendingWorkforceDraft: null,
      createAgentComposerActive: false,
      ...(useInChat
        ? {
            activeAgentDefinitionId: created.definitionId,
            activeAgentDisplayName: created.config.displayName,
            chatMode: 'change' as ChatMode,
            activeCustomModeSkillId: null,
            customModePreviousChatMode: null,
          }
        : {}),
    })
    scheduleChatSessionPersist()
    return created
  },

  assembleWorkforceAgent: async (input) => {
    const { client, project } = get()
    if (!client || !project || typeof client.assembleWorkforceAgent !== 'function') {
      return null
    }
    const projectId = project.projectId
    try {
      return await client.assembleWorkforceAgent({
        projectId,
        prompt: input.prompt,
        scope: input.scope,
        ...(input.seedSkillIds ? { seedSkillIds: input.seedSkillIds } : {}),
        ...(input.seedMcpServerIds ? { seedMcpServerIds: input.seedMcpServerIds } : {}),
      })
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to assemble agent from capabilities')
      }
      return null
    }
  },

  confirmMarketplaceAgentAssembly: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!client || !project || typeof client.createWorkforceAgent !== 'function') {
      return null
    }
    const projectId = project.projectId
    let bindings = [...input.bindings]
    const installErrorIds: string[] = []

    const markInstalled = (kind: string, id: string, serverId?: string) => {
      bindings = bindings.map((b) => {
        if (b.kind !== kind) return b
        if (b.id !== id && b.listingId !== id) return b
        return {
          ...b,
          installed: true,
          action: b.action === 'suggest_install_only' ? b.action : 'bind',
          ...(kind === 'mcp' && serverId ? { id: serverId } : {}),
        }
      })
    }

    try {
      for (const binding of bindings) {
        if (!binding.selected || binding.installed) continue
        const listingId = binding.listingId ?? binding.id
        const key = `${binding.kind}:${binding.id}`
        try {
          if (binding.kind === 'skill' && binding.action === 'install_then_bind') {
            const ok = await get().installSkillFromCatalog({ listingId })
            if (!ok) throw new Error('skill install failed')
            markInstalled('skill', listingId)
          } else if (binding.kind === 'mcp' && binding.action === 'install_then_bind') {
            const ok = await get().installMcpFromCatalog({ listingId })
            if (!ok) throw new Error('mcp install failed')
            const settings = get().settings
            const server = (settings?.mcpServers ?? []).find(
              (s) => s.provenance?.listingId === listingId,
            )
            markInstalled('mcp', listingId, server?.id)
          } else if (binding.kind === 'rules' && binding.action === 'suggest_install_only') {
            const ok = await get().installRulesFromCatalog({ listingId })
            if (!ok) throw new Error('rules install failed')
            markInstalled('rules', listingId)
          } else if (
            binding.kind === 'workflow' &&
            binding.action === 'suggest_install_only'
          ) {
            const ok = await get().installWorkflowFromCatalog({ listingId })
            if (!ok) throw new Error('workflow install failed')
            markInstalled('workflow', listingId)
          } else if (
            binding.kind === 'stencil' &&
            binding.action === 'suggest_install_only'
          ) {
            const ok = await get().installStencilFromCatalog({ listingId })
            if (!ok) throw new Error('stencil install failed')
            markInstalled('stencil', listingId)
          }
        } catch {
          installErrorIds.push(key)
        }
      }

      if (input.installOnly) {
        return { createdId: null, bindings, installErrorIds }
      }

      if (installErrorIds.length > 0) {
        return { createdId: null, bindings, installErrorIds }
      }

      const skillIds = bindings
        .filter(
          (b) =>
            b.kind === 'skill' &&
            b.selected &&
            b.installed &&
            (b.action === 'bind' || b.action === 'install_then_bind'),
        )
        .map((b) => b.id)
      const mcpServerIds = bindings
        .filter(
          (b) =>
            b.kind === 'mcp' &&
            b.selected &&
            b.installed &&
            (b.action === 'bind' || b.action === 'install_then_bind'),
        )
        .map((b) => b.id)

      const created = await client.createWorkforceAgent({
        projectId,
        draft: {
          ...input.draft,
          skillIds: [...new Set(skillIds)],
          mcpServerIds: [...new Set(mcpServerIds)],
        },
      })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'chat.marketplace.composeAgentCreated'),
      })
      await get().refreshInstalledMarketplaceAgents()
      return { createdId: created.definitionId, bindings, installErrorIds }
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to create assembled agent')
      }
      return { createdId: null, bindings, installErrorIds }
    }
  },

  listWorkspacePlans: async () => {
    const { client, project } = get()
    if (!client || !project || typeof client.listWorkspacePlans !== 'function') {
      return []
    }
    try {
      return await client.listWorkspacePlans(project.projectId)
    } catch {
      return []
    }
  },

  loadPlanFromWorkspace: async (planId) => {
    const { client, project, pushToast, locale } = get()
    if (!client || !project) return
    if (typeof client.loadPlanFromWorkspace !== 'function') {
      pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'common.comingSoon'),
        autoDismiss: 2500,
      })
      return
    }
    try {
      const plan = await client.loadPlanFromWorkspace(project.projectId, planId)
      set({
        pendingPlan: withPlanQuestionOptions(plan),
        planConfirmed: false,
        chatMode: 'plan',
        agentFlowSubject: 'plan',
        rightPanelTab: 'chat',
        latestPlanTrace: {
          status: 'complete',
          scope: plan.scope,
          result: plan,
        },
      })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'plan.loadedFromWorkspace'),
        autoDismiss: 3000,
      })
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to load plan from workspace') })
    }
  },

  restoreConversationCheckpoint: async (checkpointId) => {
    const { client, project, conversationCheckpoints, pushToast, locale } = get()
    if (!client || !project) return
    const checkpoint = conversationCheckpoints.find((item) => item.id === checkpointId)
    if (!checkpoint) return
    try {
      await client.restoreApplyBackup(project.projectId, checkpoint.backupId)
      pushToast({
        type: 'info',
        message: getStoreMessage(locale, 'chat.checkpointRestored'),
        autoDismiss: 3000,
      })
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to restore checkpoint') })
    }
  },

  loadRunDecisions: async (requestedRootRunId) => {
    const { client, project, activeRunId, decisionRootRunId } = get()
    const rootRunId = requestedRootRunId ?? decisionRootRunId ?? activeRunId
    if (!project || !rootRunId) return
    const projectId = project.projectId
    const requestSequence = ++decisionRequestSequence
    set({ decisionRootRunId: rootRunId })
    try {
      const decisions = await client.listRunDecisions(projectId, rootRunId)
      const current = get()
      if (current.project?.projectId !== projectId ||
        current.decisionRootRunId !== rootRunId ||
        requestSequence !== decisionRequestSequence) return
      const previousPendingIds = new Set(get().runDecisions
        .filter((item) => item.rootRunId === rootRunId && item.status === 'pending')
        .map((item) => item.id))
      const focusedDecisionId = get().focusedDecisionId
      set({
        runDecisions: decisions,
        ...(focusedDecisionId && !decisions.some((item) => item.id === focusedDecisionId)
          ? { focusedDecisionId: null }
          : {}),
      })
      decisions
        .filter((item) => item.status === 'pending' && !previousPendingIds.has(item.id))
        .forEach(notifyPendingDecision)
    } catch (error) {
      if (get().project?.projectId === projectId) {
        set({ error: errorMessage(error, 'Failed to load run decisions') })
      }
    }
  },

  approveRequestIntent: async (answers = []) => {
    const { client, project, pendingIntent, pushToast, locale } = get()
    if (!project || !pendingIntent || pendingIntent.status !== 'draft') return
    const projectId = project.projectId
    set({ refineLoading: true, error: null })
    try {
      const approved = await client.approveRequestIntent(
        projectId,
        pendingIntent.id,
        pendingIntent.revision,
        answers,
      )
      if (get().project?.projectId !== projectId) return
      const refinement = await client.prepareIntentExecution(projectId, approved.id)
      if (get().project?.projectId !== projectId) return
      set({ pendingIntent: null, pendingRefinement: refinement, refinementConfirmed: false, refineLoading: false })
      await get().confirmRefinement()
      pushToast({ type: 'info', message: getStoreMessage(locale, 'toast.agentRunning') })
    } catch (error) {
      if (get().project?.projectId === projectId) {
        set({ refineLoading: false, error: errorMessage(error, 'Failed to approve request intent') })
      }
    }
  },

  reviseRequestIntent: () => {
    const intent = get().pendingIntent
    if (!intent) return
    set((state) => ({
      pendingIntent: null,
      composerDraft: setComposerText(state.composerDraft, intent.rawRequest),
    }))
  },

  resolveRunDecision: async (decision, optionId, text, status = 'resolved') => {
    const { client, project, decisionResolvingIds } = get()
    if (!project || decisionResolvingIds.includes(decision.id)) return
    const projectId = project.projectId
    set({ decisionResolvingIds: [...decisionResolvingIds, decision.id] })
    try {
      const resolved = await client.resolveRunDecision(
        projectId,
        decision.id,
        decision.revision,
        { optionId, ...(text ? { text } : {}) },
        status,
      )
      if (get().project?.projectId !== projectId) return
      set((current) => ({
        runDecisions: current.runDecisions.map((item) =>
          item.id === resolved.id ? resolved : item),
        error: null,
      }))
    } catch (error) {
      if (get().project?.projectId === projectId) {
        set({ error: errorMessage(error, 'Failed to resolve run decision') })
      }
    } finally {
      if (get().project?.projectId === projectId) {
        set((current) => ({
          decisionResolvingIds: current.decisionResolvingIds.filter((id) => id !== decision.id),
        }))
      }
    }
  },

  submitPlanClarification: async (answers) => {
    const { client, pendingPlan, project } = get()
    if (!project || !pendingPlan || pendingPlan.status !== 'needs_clarification') return
    useChatSessionStore.getState().presentAgentFlow()
    set({ refineLoading: true, agentFlowSubject: 'plan' })
    try {
      const priorAnswers = (pendingPlan.clarifyingQuestions ?? [])
        .filter((question) => question.answer?.trim())
        .map((question) => ({
          questionId: question.id,
          answer: question.answer!.trim(),
          ...(question.selectedOptionId ? { selectedOptionId: question.selectedOptionId } : {}),
        }))
      const mergedAnswers = new Map(
        priorAnswers.map((answer) => [answer.questionId, answer] as const),
      )
      for (const answer of answers) {
        mergedAnswers.set(answer.questionId, answer)
      }
      const plan = withPlanQuestionOptions(await client.createPlan({
        projectId: project.projectId,
        scope: pendingPlan.scope,
        objective: pendingPlan.objective,
        existingPlanId: pendingPlan.id,
        clarifyingAnswers: [...mergedAnswers.values()],
        existingQuestions: pendingPlan.clarifyingQuestions,
        ...chatSessionRequestFields(),
      }))
      set({
        refineLoading: false,
        pendingPlan: plan,
        latestPlanTrace:
          plan.status === 'needs_clarification'
            ? { status: 'needs_clarification', scope: plan.scope, result: plan }
            : { status: 'complete', scope: plan.scope, result: plan },
        latestContextAssembly: plan.contextAssembly ?? null,
      })
      if (plan.status === 'ready') {
        get().pushToast({
          type: 'info',
          message: getStoreMessage(get().locale, 'plan.readyToBuild'),
        })
      }
    } catch (error) {
      set({
        refineLoading: false,
        error: errorMessage(error, 'Failed to submit plan clarification'),
      })
    }
    scheduleChatSessionPersist()
  },

  revisePlan: () => {
    const state = get()
    if (!state.pendingPlan || state.planConfirmed) return
    const lastUserRequest = [...state.messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content
    set({
      composerDraft: emptyComposerDraft(lastUserRequest ?? state.pendingPlan.objective),
      pendingPlan: null,
      planConfirmed: false,
      refineLoading: false,
    })
  },

  submitDebugRepro: async () => {
    const { client, debugSession } = get()
    if (!debugSession) return
    if (debugSession.phase === 'hypothesize') {
      set({
        debugSession: {
          ...debugSession,
          phase: 'reproduce',
          updatedAt: new Date().toISOString(),
        },
      })
      scheduleChatSessionPersist()
      return
    }
    try {
      const session = await client.submitDebugRepro({ sessionId: debugSession.sessionId })
      set((current) => ({
        debugSession: session,
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'system' as const,
            content: getStoreMessage(
              current.locale,
              session.phase === 'fix' || session.phase === 'verify'
                ? 'debug.chatStageFix'
                : 'debug.chatStageReproduce',
            ),
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to submit debug reproduction') })
    }
  },

  confirmDebugFix: async () => {
    const { client, debugSession, refineLoading } = get()
    if (!debugSession) return

    let flowStatus = get().flowStatus
    if (flowStatus === 'running') {
      const reconciled = await reconcileStaleFlowStatus(client, get().activeRunId, flowStatus)
      if (reconciled !== flowStatus) {
        set({ flowStatus: reconciled })
        flowStatus = reconciled
      }
    }
    if (refineLoading || flowStatus === 'running') return

    get().runDisposable?.dispose()

    set({
      refineLoading: true,
      flowSteps: [],
      flowActions: [],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      flowTransientTraces: [],
      flowCorrections: [],
      executionOverlay: null,
      liveGraphFocusTaskId: null,
        liveGraphPausedRunId: null,
      diffReady: false,
      diffReviewOnlyReason: null,
      revokedApplyRunIds: [],
      diffUnmetRequirements: [],
      generatedDiff: null,
      applyResult: null,
      verificationResult: null,
      diffFileStats: [],
      selectedDiffFilePath: null,
      pendingChangesDrawerDismissedRunId: null,
      pendingChangesDrawerExpanded: true,
      selectedFlowStepId: null,
      selectedActivityId: null,
      flowInspectorFollowLive: true,
      runDisposable: null,
    })

    try {
      const run = await client.confirmDebugFix(debugSession.sessionId)
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        refineLoading: false,
        activeRunId: run.runId,
        decisionRootRunId: run.rootRunId ?? run.runId,
        flowStatus: 'running',
        agentFlowSubject: 'run',
        harnessFixRunId: null,
        debugSession: {
          ...debugSession,
          phase: 'verify',
          linkedRunId: run.runId,
          updatedAt: new Date().toISOString(),
        },
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'system' as const,
            content: getStoreMessage(current.locale, 'debug.chatStageVerify'),
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      const disposable = client.streamAgentRun(run.runId, (event) => {
        handleRunEvent(event, set, get)
        scheduleChatSessionPersist()
      })
      set({ runDisposable: disposable })
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
      if (code === 'debug_target_unresolved') {
        // A bug reported with no file selected, and no probes to say where it is: Agent's own
        // discovery reads the project to find the file, and its intent card keeps the person in
        // charge of what gets changed.
        const { locale } = get()
        set((current) => ({
          refineLoading: false,
          error: null,
          chatMode: 'change',
          messages: [
            ...current.messages,
            {
              id: msgId(),
              role: 'system' as const,
              content: getStoreMessage(locale, 'debug.handoffMessage'),
              timestamp: new Date().toISOString(),
            },
          ],
        }))
        await get().sendPrompt(
          getStoreMessage(locale, 'debug.handoffPrompt', {
            bug: debugSession.bugDescription,
            summary: debugSession.proposedFix?.summary ?? debugSession.bugDescription,
          }),
        )
        return
      }
      set({
        refineLoading: false,
        error: errorMessage(error, 'Failed to confirm debug fix'),
      })
    }
  },

  markDebugFixed: async () => {
    const { client, debugSession } = get()
    if (!debugSession) return
    try {
      const bugs = debugSession.bugs ?? []
      const openConfirmed = bugs.filter(
        (bug) =>
          bug.selected &&
          bug.status !== 'rejected' &&
          bug.status !== 'abandoned' &&
          bug.status !== 'fixed',
      )
      if (openConfirmed.length === 1) {
        const session = await client.markBugFixed({
          sessionId: debugSession.sessionId,
          bugId: openConfirmed[0]!.id,
        })
        set({ debugSession: session })
        scheduleChatSessionPersist()
        return
      }
      await client.cleanupDebugInstrumentation(debugSession.sessionId)
      set({
        debugSession: {
          ...debugSession,
          phase: 'complete',
          ...(bugs.length
            ? {
                bugs: bugs.map((bug) =>
                  bug.selected && bug.status !== 'rejected'
                    ? { ...bug, status: 'fixed' as const, fixedAt: new Date().toISOString() }
                    : bug,
                ),
              }
            : {}),
        },
      })
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to clean up debug instrumentation') })
    }
  },

  confirmBugAlignment: async (bugs) => {
    const { client, debugSession } = get()
    if (!debugSession) return
    try {
      set({ refineLoading: true })
      const session = await client.confirmBugAlignment({
        sessionId: debugSession.sessionId,
        bugs,
      })
      set((current) => ({
        refineLoading: false,
        debugSession: session,
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'system' as const,
            content: getStoreMessage(current.locale, 'debug.chatStageReproduce'),
            timestamp: new Date().toISOString(),
          },
        ],
      }))
      scheduleChatSessionPersist()
    } catch (error) {
      set({
        refineLoading: false,
        error: errorMessage(error, 'Failed to confirm bug alignment'),
      })
    }
  },

  markBugFixed: async (bugId) => {
    const { client, debugSession } = get()
    if (!debugSession) return
    try {
      const session = await client.markBugFixed({
        sessionId: debugSession.sessionId,
        bugId,
      })
      set({ debugSession: session })
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to mark bug fixed') })
    }
  },

  loadDiff: async (requestedRunId) => {
    const { client, activeRunId, project, editorBuffers, locale, delegatedRunTraces } = get()
    const targetRunId = requestedRunId ?? activeRunId
    if (!targetRunId) return
    // Parent activeRunId normally owns the UI; allow an explicitly requested
    // delegated child so diff_proposed/diff_ready previews are not dropped.
    if (
      targetRunId !== activeRunId &&
      !Object.prototype.hasOwnProperty.call(delegatedRunTraces, targetRunId)
    ) {
      return
    }
    try {
      const generatedDiff = await client.getDiff(targetRunId)
      const enrichedFiles = await enrichGeneratedDiffFiles(generatedDiff.files, {
        editorBuffers,
        ...(project
          ? {
              getFileContent: (path: string) => client.getFileContent(project.projectId, path),
            }
          : {}),
      })
      const diffFileStats = computeDiffFileStats(enrichedFiles)
      const { pendingChangesDrawerDismissedRunId } = get()
      const current = get()
      if (
        current.activeRunId !== activeRunId ||
        current.project?.projectId !== project?.projectId
      ) return
      const hasDelegatedChildren =
        Object.keys(current.delegatedRunTraces ?? {}).length > 0 ||
        (current.flowDelegationEvents ?? []).some((event) => event.type === 'task_delegated')
      const parentAllowsApply = current.activeRunId
        ? delegatedParentBatchAllowsApply({
            activeRunId: current.activeRunId,
            hasDelegatedChildren,
            flowActions: current.flowActions ?? [],
            revokedApplyRunIds: current.revokedApplyRunIds,
            flowStatus: current.flowStatus,
          }).allowed
        : false
      set({
        generatedDiff: { ...generatedDiff, files: enrichedFiles },
        diffFileStats,
        error: null,
        // Heal sticky review-only only for delegated parents whose batch already
        // unlocked Apply (late child diff_ready race). Never clear leaf/non-delegated
        // validatingProposal — loadDiff runs on diff_proposed before validation finishes.
        ...(hasDelegatedChildren &&
        parentAllowsApply &&
        current.diffReviewOnlyReason
          ? { diffReviewOnlyReason: null }
          : {}),
        ...(targetRunId !== pendingChangesDrawerDismissedRunId
          ? { pendingChangesDrawerExpanded: true }
          : {}),
      })
      maybeNotifyDiffReady(targetRunId, enrichedFiles.length)
      if (project) {
        await recordProposedTimelineFromDiff(
          client,
          project.projectId,
          targetRunId,
          { ...generatedDiff, files: enrichedFiles },
        )
      }
    } catch (err) {
      if (
        get().activeRunId !== activeRunId ||
        get().project?.projectId !== project?.projectId
      ) return
      const diffNotFound = typeof err === 'object' && err !== null && 'code' in err &&
        (err as { code?: string }).code === 'diff_not_found'
      if (diffNotFound) {
        let runStatus = 'unknown'
        try {
          const run = await client.getAgentRun(targetRunId)
          runStatus = run.status
        } catch {
          /* ignore */
        }
        set({
          diffReady: false,
          diffReviewOnlyReason: null,
          diffUnmetRequirements: [],
          error: getStoreMessage(locale, 'diff.notAvailable', { status: runStatus }),
        })
        maybeNotifyDiffReady(targetRunId, 0)
        return
      }
      set({ error: errorMessage(err, 'Failed to load diff') })
      maybeNotifyDiffReady(targetRunId, 0)
    }
  },

  applyCurrentDiff: async (options) => {
    const {
      client,
      project,
      activeRunId,
      generatedDiff,
      editorBuffers,
      pushToast,
      locale,
      selectedNodeId,
      diffReviewOnlyReason,
      delegatedRunTraces,
      flowDelegationEvents,
      flowActions,
      flowStatus,
      revokedApplyRunIds,
    } = get()
    if (!project || !activeRunId) return
    const hasDelegatedChildren =
      Object.keys(delegatedRunTraces ?? {}).length > 0 ||
      (flowDelegationEvents ?? []).some((event) => event.type === 'task_delegated')
    const auth = delegatedParentBatchAllowsApply({
      activeRunId,
      hasDelegatedChildren,
      flowActions: flowActions ?? [],
      revokedApplyRunIds,
      flowStatus,
    })
    if (!auth.allowed) {
      const message = getStoreMessage(
        locale,
        auth.reason === 'revoked'
          ? 'diff.applyBlockedAfterCancel'
          : 'diff.awaitingParentBatchValidation',
      )
      pushToast({ type: 'warning', message: diffReviewOnlyReason ?? message })
      set({ diffReviewOnlyReason: message })
      return
    }
    if (diffReviewOnlyReason) {
      // Delegated parent already batch-authorized: clear sticky review-only left by a
      // late/replayed child diff_ready. Leaf/non-delegated validatingProposal must block.
      if (hasDelegatedChildren) {
        set({ diffReviewOnlyReason: null })
      } else {
        pushToast({ type: 'warning', message: diffReviewOnlyReason })
        return
      }
    }
    try {
      // "Apply anyway" is its own server call: the ordinary Apply is refused for a change the review
      // says does not meet a requirement, so it cannot be reached by accident.
      const applyResult = options?.anyway
        ? await client.applyDespiteUnmetRequirements(activeRunId)
        : await client.applyDiff(activeRunId)
      const [graph, tree, currentWork] = await Promise.all([
        client.getProjectGraph(project.projectId),
        client.getSemanticTree(project.projectId),
        client.getCurrentWork(project.projectId),
      ])
      // Disk may already be written. Never drop applyResult just because the user
      // (or a child loadDiff) changed activeRunId during the await — Undo needs it.
      if (get().project?.projectId !== project.projectId) return
      const stillOnAppliedRun = get().activeRunId === activeRunId
      const bounceIds = stillOnAppliedRun && selectedNodeId ? [selectedNodeId] : []
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'toast.applySuccess', { count: applyResult.filesChanged.length }),
      })
      const existingCheckpoint = applyResult.backupId
        ? get().conversationCheckpoints.find(
            (item) => item.runId === activeRunId && item.backupId === applyResult.backupId,
          )
        : undefined
      const checkpointId =
        !existingCheckpoint && applyResult.applied && applyResult.backupId
          ? `ckpt_${crypto.randomUUID()}`
          : undefined
      const checkpointMessageId = checkpointId ? msgId() : undefined
      set((current) => {
        const checkpoints =
          checkpointId && applyResult.backupId
            ? [
                ...current.conversationCheckpoints,
                {
                  id: checkpointId,
                  messageId: checkpointMessageId!,
                  backupId: applyResult.backupId,
                  runId: activeRunId,
                  createdAt: new Date().toISOString(),
                  filesChanged: applyResult.filesChanged,
                },
              ]
            : current.conversationCheckpoints
        const messages =
          checkpointId && checkpointMessageId
            ? [
                ...current.messages,
                {
                  id: checkpointMessageId,
                  role: 'system' as const,
                  content: getStoreMessage(locale, 'chat.checkpointCreated', {
                    count: applyResult.filesChanged.length,
                  }),
                  timestamp: new Date().toISOString(),
                  checkpointId,
                },
              ]
            : current.messages
        return {
          applyResult,
          diffUnmetRequirements: [],
          verificationResult: null,
          verificationCommandApproval: null,
          ...(stillOnAppliedRun
            ? {
                currentWork,
                graph,
                tree,
                editorBuffers: generatedDiff
                  ? applyDiffToBuffers(editorBuffers, generatedDiff)
                  : editorBuffers,
                editorSavedBuffers: generatedDiff
                  ? applyDiffToBuffers(current.editorSavedBuffers, generatedDiff)
                  : current.editorSavedBuffers,
                flowStatus: 'complete' as const,
                bouncingNodeIds: bounceIds,
              }
            : {}),
          conversationCheckpoints: checkpoints,
          messages,
        }
      })
      if (stillOnAppliedRun && generatedDiff) {
        for (const file of generatedDiff.files) {
          void useFileTimelineStore.getState().refresh(file.path)
        }
      }
      if (stillOnAppliedRun) {
        setTimeout(() => set({ bouncingNodeIds: [] }), 600)
      }
      scheduleChatSessionPersist()
    } catch (err) {
      // The change was held for unmet requirements and the screen did not know (the run was opened
      // later): show them now, with the "apply anyway" choice, instead of only an error.
      const refused = typeof err === 'object' && err !== null && 'code' in err &&
        (err as { code?: string }).code === 'review_unmet_requirements'
      if (refused) {
        const unmet = unmetRequirementsFromMessage(err instanceof Error ? err.message : '')
        if (unmet.length > 0) set({ diffUnmetRequirements: unmet })
      }
      // Disk+backup may already be committed when post-apply verification throws.
      // Recover parent applyResult from persisted apply_result so DOM Undo stays linked.
      try {
        if (get().project?.projectId === project.projectId) {
          const events = await client.getAgentRunEvents(activeRunId)
          const applyEvt = [...events].reverse().find((event) => event.type === 'apply_result')
          const payload = applyEvt && applyEvt.type === 'apply_result' ? applyEvt.payload : null
          if (
            payload &&
            payload.outcome === 'applied' &&
            typeof payload.backupId === 'string' &&
            payload.backupId.length > 0
          ) {
            set({
              applyResult: {
                runId: activeRunId,
                applied: true,
                filesChanged: Array.isArray(payload.filesWritten) ? payload.filesWritten : [],
                verificationStatus: 'not_run',
                outcome: 'applied',
                backupId: payload.backupId,
              },
              error: errorMessage(err, 'Failed to apply diff'),
            })
            return
          }
        }
      } catch {
        /* fall through to surface the original apply error */
      }
      set({ error: errorMessage(err, 'Failed to apply diff') })
    }
  },

  runCurrentVerification: async () => {
    const { client, project, activeRunId, pushToast, locale } = get()
    if (!project || !activeRunId) return
    set({ verificationLoading: true })
    try {
      const approval = await client.getVerificationCommandApproval(project.projectId)
      if (
        get().project?.projectId !== project.projectId ||
        get().activeRunId !== activeRunId
      ) return
      if (approval.status === 'approval_required') {
        set({
          verificationCommandApproval: approval,
          verificationLoading: false,
        })
        return
      }
      const verificationResult = await client.runVerification(activeRunId)
      logVerificationResultToActivity(verificationResult)
      set({
        verificationResult,
        verificationCommandApproval: approval,
        verificationLoading: false,
      })
      pushToast({
        type: verificationResult.status === 'passed'
          ? 'success'
          : verificationResult.status === 'failed'
            ? 'error'
            : 'info',
        message: getStoreMessage(locale, `diff.verification_${verificationResult.status}`),
      })
    } catch (err) {
      set({
        verificationLoading: false,
        error: errorMessage(err, 'Failed to run verification'),
      })
    }
  },

  approveAndRunCurrentVerification: async () => {
    const {
      client,
      project,
      activeRunId,
      verificationCommandApproval,
      pushToast,
      locale,
    } = get()
    if (
      !project ||
      !activeRunId ||
      verificationCommandApproval?.status !== 'approval_required'
    ) return
    set({ verificationLoading: true })
    try {
      const approved = await client.approveVerificationCommands(
        project.projectId,
        verificationCommandApproval.commandSetHash,
      )
      if (
        get().project?.projectId !== project.projectId ||
        get().activeRunId !== activeRunId
      ) return
      const verificationResult = await client.runVerification(activeRunId)
      set({
        verificationCommandApproval: approved,
        verificationResult,
        verificationLoading: false,
      })
      pushToast({
        type: verificationResult.status === 'passed'
          ? 'success'
          : verificationResult.status === 'failed'
            ? 'error'
            : 'info',
        message: getStoreMessage(locale, `diff.verification_${verificationResult.status}`),
      })
    } catch (err) {
      set({
        verificationLoading: false,
        error: errorMessage(err, 'Failed to approve verification commands'),
      })
    }
  },

  undoCurrentApply: async () => {
    const {
      client,
      project,
      applyResult,
      generatedDiff,
      editorBuffers,
      messages,
      pushToast,
      locale,
    } = get()
    if (!project || !applyResult?.backupId) return
    set({ undoLoading: true })
    try {
      const restored = await client.restoreApplyBackup(project.projectId, applyResult.backupId)
      if (!restored.restored) {
        set({ undoLoading: false, error: restored.reason ?? 'Undo requires manual recovery' })
        return
      }
      const currentWork = await client.getCurrentWork(project.projectId)
      const nextBuffers = { ...editorBuffers }
      for (const file of generatedDiff?.files ?? []) {
        if (file.before !== undefined) nextBuffers[file.path] = file.before
      }
      const undoneRunId = applyResult.runId
      const fileCount = applyResult.filesChanged.length
      const undoneMessageId = `automatic_apply_${undoneRunId}`
      const undoneContent = getStoreMessage(locale, 'chat.automaticApplyUndone', {
        count: fileCount,
      })
      const nextMessages = messages.map((message) =>
        message.id === undoneMessageId
          ? {
              ...message,
              content: undoneContent,
              timestamp: new Date().toISOString(),
            }
          : message,
      )
      const hasUndoneMessage = nextMessages.some((message) => message.id === undoneMessageId)
      useNotificationCenterStore.getState().archiveActiveByDestination('diff')
      set({
        applyResult: null,
        verificationResult: null,
        verificationCommandApproval: null,
        undoLoading: false,
        currentWork,
        editorBuffers: nextBuffers,
        editorSavedBuffers: nextBuffers,
        // Undo removes the reviewable diff — clear attention so the stage-rail
        // Code/Diff live dot does not keep advertising an empty Diff tab.
        diffReady: false,
        diffReadyBanner: null,
        generatedDiff: null,
        diffFileStats: [],
        selectedDiffFilePath: null,
        diffReviewOnlyReason: null,
        diffUnmetRequirements: [],
        messages: hasUndoneMessage
          ? nextMessages
          : [
              ...nextMessages,
              {
                id: undoneMessageId,
                role: 'assistant' as const,
                content: undoneContent,
                format: 'markdown' as const,
                timestamp: new Date().toISOString(),
              },
            ],
      })
      for (const file of generatedDiff?.files ?? []) {
        void useFileTimelineStore.getState().refresh(file.path)
      }
      pushToast({ type: 'success', message: getStoreMessage(locale, 'diff.undoSuccess') })
    } catch (err) {
      set({ undoLoading: false, error: errorMessage(err, 'Failed to undo apply') })
    }
  },

  triggerAuthError: async () => {
    const { client, project, runDisposable, pushToast, locale } = get()
    if (!project) return
    runDisposable?.dispose()

    try {
      const harnessRecord = await client.reportError(project.projectId, AUTH_ERROR_RAW)
      const [graph, tree] = await Promise.all([
        client.getProjectGraph(project.projectId),
        client.getSemanticTree(project.projectId),
      ])
      pushToast({ type: 'warning', message: getStoreMessage(locale, 'toast.authError') })
      const terminalLine = `[error] ${AUTH_ERROR_RAW}`
      useBottomDockStore.getState().openPanel('terminal')
      useActivityStore.getState().appendSystemLine(terminalLine)
      if (isDesktopApp()) {
        if (!useTerminalStore.getState().getActivePtyId()) {
          await useTerminalStore.getState().createTab()
        }
        useTerminalStore.getState().writeToActivePty(`\r\n${terminalLine}\r\n`)
      }
      const debugSession = await client.startDebugSession({
        projectId: project.projectId,
        scope: { kind: 'node', nodeId: 'feat_login' },
        bugDescription: AUTH_ERROR_RAW,
        rawError: AUTH_ERROR_RAW,
        ...chatSessionRequestFields(),
      })
      useChatSessionStore.getState().presentAgentFlow()
      set({
        harnessRecord,
        harnessFixRunId: null,
        graph,
        tree,
        rightPanelTab: 'chat',
        chatMode: 'debug',
        debugSession,
        composerDraft: emptyComposerDraft(AUTH_ERROR_RAW),
        globalAgentActive: false,
        selectedNodeId: 'feat_login',
        highlightedFilePaths: harnessRecord.technicalFiles,
        flowSteps: [],
        flowActions: [],
        flowDelegationEvents: [],
        delegatedRunTraces: {},
        flowTransientTraces: [],
        flowCorrections: [],
        flowStatus: 'idle',
        executionOverlay: null,
        liveGraphFocusTaskId: null,
        liveGraphPausedRunId: null,
        agentFlowSubject: 'debug',
        activeRunId: null,
        runDisposable: null,
        flashKey: get().flashKey + 1,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to report error') })
    }
  },

  startHarnessFix: async () => {
    const { client, project, harnessRecord, runDisposable } = get()
    if (!project || !harnessRecord) return
    runDisposable?.dispose()

    try {
      const run = await client.startHarnessFix(harnessRecord.errorId)
      useChatSessionStore.getState().presentAgentFlow()
      set({
        harnessFixRunId: run.runId,
        activeRunId: run.runId,
        decisionRootRunId: run.rootRunId ?? run.runId,
        flowSteps: [],
        flowActions: [],
        flowDelegationEvents: [],
        delegatedRunTraces: {},
        flowTransientTraces: [],
        flowCorrections: [],
        flowStatus: 'running',
        executionOverlay: null,
        liveGraphFocusTaskId: null,
        liveGraphPausedRunId: null,
        agentFlowSubject: 'run',
        selectedFlowStepId: null,
        selectedActivityId: null,
        flowInspectorFollowLive: true,
      })

      const disposable = client.streamAgentRun(run.runId, (event) => {
        if (
          get().activeRunId !== run.runId ||
          get().project?.projectId !== project.projectId
        ) return
        handleRunEvent(event, set, get)
        scheduleChatSessionPersist()
      })
      set({ runDisposable: disposable })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to start harness fix') })
    }
  },

  resetDemo: async () => {
    const { client, project, runDisposable } = get()
    if (!project) return
    runDisposable?.dispose()

    try {
      await useTerminalStore.getState().disposeAllSessions()
      const [graph, tree, mapContent, currentWork] = await Promise.all([
        client.getProjectGraph(project.projectId),
        client.getSemanticTree(project.projectId),
        client.getMapContent(project.projectId),
        client.getCurrentWork(project.projectId),
      ])
      set({
        graph,
        tree,
        mapContent,
        context: null,
        ...initialTransientState,
        currentWork,
        error: null,
        terminalLines: [],
      })
      await useChatSessionStore.getState().resetForDemo()
      await useTerminalStore.getState().syncMapSessions(mapContent.artifacts)
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to reset demo') })
    }
  },

  runGoogleLoginScenario: async () => {
    const { selectFile, setChatInput, setChatMode, sendPrompt } = get()
    await setChatMode('change', { isolate: false })
    await selectFile('app/login/page.tsx', 'feat_login')
    setChatInput(GOOGLE_LOGIN_PROMPT)
    await sendPrompt(GOOGLE_LOGIN_PROMPT)
  },

  appendTerminalLine: (line) => {
    useBottomDockStore.getState().openPanel('terminal')
    useActivityStore.getState().appendSystemLine(line)
  },

  setLeftPanelWidth: (width) => {
    const state = get()
    const next = clampPanelDimensions(
      { leftPanelWidth: width, rightPanelWidth: state.rightPanelWidth, terminalHeight: state.terminalHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { leftOpen: state.leftPanelOpen, rightOpen: state.rightPanelOpen },
    )
    savePanelLayout(next)
    set(next)
  },

  setRightPanelWidth: (width) => {
    const state = get()
    const next = clampPanelDimensions(
      { leftPanelWidth: state.leftPanelWidth, rightPanelWidth: width, terminalHeight: state.terminalHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { leftOpen: state.leftPanelOpen, rightOpen: state.rightPanelOpen },
    )
    savePanelLayout(next)
    set(next)
  },

  setTerminalHeight: (height) => {
    const state = get()
    const next = clampPanelDimensions(
      { leftPanelWidth: state.leftPanelWidth, rightPanelWidth: state.rightPanelWidth, terminalHeight: height },
      { width: window.innerWidth, height: window.innerHeight },
      { leftOpen: state.leftPanelOpen, rightOpen: state.rightPanelOpen },
    )
    savePanelLayout(next)
    set(next)
  },

  adjustLeftPanelWidth: (delta) => {
    const state = get()
    get().setLeftPanelWidth(state.leftPanelWidth + delta)
    return get().leftPanelWidth - state.leftPanelWidth
  },

  adjustRightPanelWidth: (delta) => {
    const state = get()
    get().setRightPanelWidth(state.rightPanelWidth + delta)
    return get().rightPanelWidth - state.rightPanelWidth
  },

  adjustTerminalHeight: (delta) => {
    const state = get()
    get().setTerminalHeight(state.terminalHeight + delta)
    return get().terminalHeight - state.terminalHeight
  },

  setPanelResizing: (resizing) => set({ panelResizing: resizing }),

  reclampPanelLayout: () => {
    const state = get()
    const next = clampPanelDimensions(
      {
        leftPanelWidth: state.leftPanelWidth,
        rightPanelWidth: state.rightPanelWidth,
        terminalHeight: state.terminalHeight,
      },
      { width: window.innerWidth, height: window.innerHeight },
      { leftOpen: state.leftPanelOpen, rightOpen: state.rightPanelOpen },
    )
    savePanelLayout(next)
    set(next)
  },

  loadSettings: async () => {
    const { client, project } = get()
    if (!project) return
    const projectId = project.projectId
    try {
      const settings = await client.getSettings(projectId)
      if (get().project?.projectId !== projectId) return
      set({
        settings,
        selectedModelProfileId:
          settings.execution.defaultModelProfileId ??
          null,
        error: null,
      })
      void syncInterfaceLanguage(get)
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load settings')
      }
    }
  },

  saveProjectDescription: async (conciseDescription) => {
    const { client, project, pushToast, locale } = get()
    const normalized = conciseDescription.trim()
    if (!project || !normalized) return
    set({ projectDescriptionSaving: true })
    try {
      const projectDescription = await client.updateProjectDescription(
        project.projectId,
        normalized,
      )
      set({ projectDescription, projectDescriptionSaving: false })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.projectDescriptionSaved'),
      })
    } catch (err) {
      set({
        projectDescriptionSaving: false,
        error: errorMessage(err, 'Failed to save project description'),
      })
    }
  },

  updateSettings: async (patch, options) => {
    await persistSettingsPatch(patch, options)
  },

  saveModelProfile: async (input) => {
    const { client, project, settings, pushToast, locale } = get()
    if (!project || !settings) return false
    if (input.provider === 'custom' && !input.baseUrl?.trim()) {
      pushToast({ type: 'warning', message: getStoreMessage(locale, 'settings.baseUrlRequired') })
      return false
    }
    const projectId = project.projectId
    try {
      const result = await persistModelProfile(
        client,
        projectId,
        settings,
        input,
      )
      if (get().project?.projectId !== projectId) return false
      set({
        settings: result.settings,
        selectedModelProfileId:
          result.settings.execution.defaultModelProfileId ?? get().selectedModelProfileId,
        error: null,
      })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.modelSaved') })
      if (result.secretCleanupError !== undefined) {
        pushToast({
          type: 'warning',
          message: getStoreMessage(locale, 'settings.secretCleanupFailed'),
        })
      }
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to save model profile')
      }
      return false
    }
  },

  deleteModelProfile: async (profileId) => {
    const { client, project, settings, selectedModelProfileId, pushToast, locale } = get()
    if (!project || !settings) return false
    const projectId = project.projectId
    try {
      const result = await persistModelProfileDeletion(
        client,
        projectId,
        settings,
        profileId,
        selectedModelProfileId,
      )
      if (!result || get().project?.projectId !== projectId) return false
      set({
        settings: result.settings,
        selectedModelProfileId: result.selectedModelProfileId,
        error: null,
      })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.modelDeleted') })
      if (result.secretCleanupError !== undefined) {
        pushToast({
          type: 'warning',
          message: getStoreMessage(locale, 'settings.secretCleanupFailed'),
        })
      }
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to delete model profile')
      }
      return false
    }
  },

  setDefaultModelProfile: async (profileId) => {
    const { client, project, settings, pushToast, locale } = get()
    if (!project || !settings) return false
    const projectId = project.projectId
    try {
      const updated = await persistDefaultModelProfile(
        client,
        projectId,
        settings,
        profileId,
      )
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, selectedModelProfileId: profileId, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.defaultModelChanged') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to set default model profile')
      }
      return false
    }
  },

  saveAgentProfile: async (profile) => {
    const { client, project, settings, pushToast, locale } = get()
    if (!project || !settings) return false
    const projectId = project.projectId
    try {
      const updated = await client.updateSettings(projectId, {
        agentProfiles: [...settings.agentProfiles, profile],
      })
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.agentSaved') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to save agent profile')
      }
      return false
    }
  },

  saveExternalAgent: async () => false,

  saveMcpServer: async (config, authToken) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.saveMcpServer(projectId, {
        config,
        ...(authToken?.trim() ? { authToken: authToken.trim() } : {}),
      })
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.mcpSaved') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to save MCP server')
      }
      return false
    }
  },

  deleteMcpServer: async (serverId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.deleteMcpServer(projectId, serverId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.mcpDeleted') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to delete MCP server')
      }
      return false
    }
  },

  testModelConnection: async (profileId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return
    const projectId = project.projectId
    try {
      const result = await client.testModelConnection(projectId, profileId)
      if (get().project?.projectId !== projectId) return
      pushToast({
        type: result.ok ? 'success' : 'warning',
        message: result.ok
          ? getStoreMessage(locale, 'settings.connectionOk', { ms: result.latencyMs })
          : (result.message && (userFacingProviderText(result.message, locale) ?? result.message)) ||
            getStoreMessage(locale, 'settings.connectionFailed'),
      })
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, getStoreMessage(locale, 'settings.connectionFailed'))
      }
    }
  },

  testExternalAgent: async (_agentId) => {
    /* external agents removed in pure workbench */
  },

  testMcpServer: async (serverId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return
    const projectId = project.projectId
    try {
      const result = await client.testMcpServer(projectId, serverId)
      if (get().project?.projectId !== projectId) return
      pushToast({
        type: result.ok ? 'success' : 'warning',
        message: result.ok
          ? getStoreMessage(locale, 'settings.mcpConnectionOk', { ms: result.latencyMs })
          : result.message ?? getStoreMessage(locale, 'settings.mcpConnectionFailed'),
      })
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, getStoreMessage(locale, 'settings.mcpConnectionFailed'))
      }
    }
  },

  refreshMcpTools: async (serverId) => {
    const { client, project } = get()
    if (!project) return []
    return client.refreshMcpTools(project.projectId, serverId)
  },

  listMcpCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listMcpCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          mcpCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load MCP catalog')
      }
      return null
    }
  },

  refreshMcpCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshMcpCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        mcpCatalogView: view,
        marketplaceCatalogStatus:
          s.skillCatalogView || s.rulesCatalogView || s.agentCatalogView || view ? 'ready' : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh MCP catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView || s.skillCatalogView || s.rulesCatalogView || s.agentCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installMcpFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.installMcpFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.mcpMarketInstalled') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install MCP listing')
      }
      return false
    }
  },

  disableMcpCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableMcpCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.mcpMarketDisabled') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable MCP listing')
      }
      return false
    }
  },

  reportMcpCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportMcpCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({ type: 'success', message: getStoreMessage(locale, 'settings.mcpMarketReported') })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report MCP listing')
      }
      return false
    }
  },

  listSkillCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listSkillCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          skillCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load skill catalog')
      }
      return null
    }
  },

  refreshSkillCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshSkillCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        skillCatalogView: view,
        marketplaceCatalogStatus:
          s.mcpCatalogView || s.rulesCatalogView || s.agentCatalogView || view ? 'ready' : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh skill catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView || s.skillCatalogView || s.rulesCatalogView || s.agentCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installSkillFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const descriptor = await client.installSkillFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        installedMarketplaceSkillIds: s.installedMarketplaceSkillIds.includes(descriptor.id)
          ? s.installedMarketplaceSkillIds
          : [...s.installedMarketplaceSkillIds, descriptor.id],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.skillMarketInstalled'),
      })
      return descriptor
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install skill')
      }
      return null
    }
  },

  uninstallSkillFromCatalog: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      await client.uninstallSkillFromCatalog(projectId, { listingId })
      if (get().project?.projectId !== projectId) return false
      const normalized = listingId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
      set((s) => ({
        installedMarketplaceSkillIds: s.installedMarketplaceSkillIds.filter(
          (id) => id !== listingId && id !== normalized,
        ),
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.skillMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall skill')
      }
      return false
    }
  },

  uninstallMcpListing: async (listingId) => {
    const { client, project, settings, pushToast, locale } = get()
    if (!project || !settings) return false
    const projectId = project.projectId
    const targets = (settings.mcpServers ?? []).filter(
      (server) => server.provenance?.listingId === listingId,
    )
    if (targets.length === 0) return false
    try {
      let updated = settings
      for (const server of targets) {
        updated = await client.deleteMcpServer(projectId, server.id)
      }
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.mcpMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall MCP listing')
      }
      return false
    }
  },

  disableSkillCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableSkillCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.skillMarketDisabled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable skill listing')
      }
      return false
    }
  },

  reportSkillCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportSkillCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.skillMarketReported'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report skill listing')
      }
      return false
    }
  },

  listRulesCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listRulesCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          rulesCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load rules catalog')
      }
      return null
    }
  },

  refreshRulesCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshRulesCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        rulesCatalogView: view,
        marketplaceCatalogStatus:
          s.mcpCatalogView || s.skillCatalogView || s.agentCatalogView || view ? 'ready' : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh rules catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView || s.skillCatalogView || s.rulesCatalogView || s.agentCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installRulesFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const result = await client.installRulesFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        installedMarketplaceRulesPackIds: s.installedMarketplaceRulesPackIds.includes(
          result.packId,
        )
          ? s.installedMarketplaceRulesPackIds
          : [...s.installedMarketplaceRulesPackIds, result.packId],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.rulesMarketInstalled'),
      })
      return result
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install rules pack')
      }
      return null
    }
  },

  uninstallRulesFromCatalog: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      await client.uninstallRulesFromCatalog(projectId, { listingId })
      if (get().project?.projectId !== projectId) return false
      const normalized = listingId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
      set((s) => ({
        installedMarketplaceRulesPackIds: s.installedMarketplaceRulesPackIds.filter(
          (id) => id !== listingId && id !== normalized,
        ),
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.rulesMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall rules pack')
      }
      return false
    }
  },

  disableRulesCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableRulesCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.rulesMarketDisabled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable rules listing')
      }
      return false
    }
  },

  reportRulesCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportRulesCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.rulesMarketReported'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report rules listing')
      }
      return false
    }
  },

  listAgentCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listAgentCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          agentCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load agent catalog')
      }
      return null
    }
  },

  refreshAgentCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshAgentCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        agentCatalogView: view,
        marketplaceCatalogStatus:
          s.mcpCatalogView || s.skillCatalogView || s.rulesCatalogView || view
            ? 'ready'
            : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh agent catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView || s.skillCatalogView || s.rulesCatalogView || s.agentCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installAgentFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const result = await client.installAgentFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return null
      const definition = result.definition
      const listingId = definition.config.marketplaceProvenance?.listingId ?? input.listingId
      set((s) => ({
        installedMarketplaceAgentListingIds: s.installedMarketplaceAgentListingIds.includes(
          listingId,
        )
          ? s.installedMarketplaceAgentListingIds
          : [...s.installedMarketplaceAgentListingIds, listingId],
      }))
      // Refresh Skill / Rules / MCP mirrors so Installed views stay accurate.
      void get().refreshInstalledMarketplaceSkills()
      void get().refreshInstalledMarketplaceRulesPacks()
      void client.getSettings(projectId).then((settings) => {
        if (get().project?.projectId !== projectId || !settings) return
        set({ settings, error: null })
      })
      const deps = result.dependencies ?? []
      const failed = deps.filter((d) => d.status === 'failed' || d.status === 'missing_from_catalog')
      const ready = deps.filter(
        (d) => d.status === 'installed' || d.status === 'already_installed',
      )
      if (failed.length > 0) {
        pushToast({
          type: 'warning',
          message: getStoreMessage(locale, 'settings.agentMarketInstalledWithGaps', {
            ready: ready.length,
            failed: failed.length,
          }),
        })
      } else if (deps.length > 0) {
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.agentMarketInstalledWithDeps', {
            count: ready.length,
          }),
        })
      } else {
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.agentMarketInstalled'),
        })
      }
      return result
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install agent pack')
      }
      return null
    }
  },

  uninstallAgentFromCatalog: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      await client.uninstallAgentFromCatalog(projectId, { listingId })
      if (get().project?.projectId !== projectId) return false
      set((s) => ({
        installedMarketplaceAgentListingIds: s.installedMarketplaceAgentListingIds.filter(
          (id) => id !== listingId,
        ),
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.agentMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall agent pack')
      }
      return false
    }
  },

  disableAgentCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableAgentCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.agentMarketDisabled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable agent listing')
      }
      return false
    }
  },

  reportAgentCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportAgentCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.agentMarketReported'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report agent listing')
      }
      return false
    }
  },

  exportCapabilityPack: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const result = await client.exportCapabilityPack(projectId, input)
      if (get().project?.projectId !== projectId) return null
      pushToast({
        type: 'success',
        message: getStoreMessage(
          locale,
          result.kind === 'stencil'
            ? 'settings.stencilMarketExported'
            : result.kind === 'workflow'
              ? 'settings.workflowMarketExported'
              : 'settings.agentMarketExported',
        ),
      })
      return result
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to export capability pack')
      }
      return null
    }
  },

  installAgentFromExportPack: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const definition = await client.installAgentFromExportPack(projectId, input)
      if (get().project?.projectId !== projectId) return null
      const listingId = definition.config.marketplaceProvenance?.listingId ?? input.listing.id
      set((s) => ({
        installedMarketplaceAgentListingIds: s.installedMarketplaceAgentListingIds.includes(
          listingId,
        )
          ? s.installedMarketplaceAgentListingIds
          : [...s.installedMarketplaceAgentListingIds, listingId],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.agentMarketInstalled'),
      })
      return definition
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install exported agent pack')
      }
      return null
    }
  },

  installRulesFromExportPack: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const result = await client.installRulesFromExportPack(projectId, input)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        installedMarketplaceRulesPackIds: s.installedMarketplaceRulesPackIds.includes(result.packId)
          ? s.installedMarketplaceRulesPackIds
          : [...s.installedMarketplaceRulesPackIds, result.packId],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.rulesMarketInstalled'),
      })
      return result
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install exported rules pack')
      }
      return null
    }
  },

  listWorkflowCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listWorkflowCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          workflowCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load workflow catalog')
      }
      return null
    }
  },

  refreshWorkflowCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshWorkflowCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        workflowCatalogView: view,
        marketplaceCatalogStatus:
          s.mcpCatalogView ||
          s.skillCatalogView ||
          s.rulesCatalogView ||
          s.agentCatalogView ||
          view
            ? 'ready'
            : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh workflow catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView ||
            s.skillCatalogView ||
            s.rulesCatalogView ||
            s.agentCatalogView ||
            s.workflowCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installWorkflowFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const preset = await client.installWorkflowFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        installedMarketplaceWorkflowListingIds: s.installedMarketplaceWorkflowListingIds.includes(
          input.listingId,
        )
          ? s.installedMarketplaceWorkflowListingIds
          : [...s.installedMarketplaceWorkflowListingIds, input.listingId],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.workflowMarketInstalled'),
      })
      return preset
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install workflow pack')
      }
      return null
    }
  },

  uninstallWorkflowFromCatalog: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      await client.uninstallWorkflowFromCatalog(projectId, { listingId })
      if (get().project?.projectId !== projectId) return false
      set((s) => ({
        installedMarketplaceWorkflowListingIds: s.installedMarketplaceWorkflowListingIds.filter(
          (id) => id !== listingId,
        ),
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.workflowMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall workflow pack')
      }
      return false
    }
  },

  disableWorkflowCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableWorkflowCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.workflowMarketDisabled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable workflow listing')
      }
      return false
    }
  },

  reportWorkflowCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportWorkflowCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.workflowMarketReported'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report workflow listing')
      }
      return false
    }
  },

  installWorkflowFromExportPack: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const preset = await client.installWorkflowFromExportPack(projectId, input)
      if (get().project?.projectId !== projectId) return null
      const listingId = input.listing.id
      set((s) => ({
        installedMarketplaceWorkflowListingIds: s.installedMarketplaceWorkflowListingIds.includes(
          listingId,
        )
          ? s.installedMarketplaceWorkflowListingIds
          : [...s.installedMarketplaceWorkflowListingIds, listingId],
      }))
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.workflowMarketInstalled'),
      })
      return preset
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install exported workflow pack')
      }
      return null
    }
  },

  listStencilCatalog: async (options) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const view = await client.listStencilCatalog(projectId, options)
      if (get().project?.projectId === projectId) {
        set((s) => ({
          stencilCatalogView: view,
          marketplaceCatalogStatus:
            s.marketplaceCatalogStatus === 'loading' ? s.marketplaceCatalogStatus : 'ready',
        }))
      }
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to load stencil catalog')
      }
      return null
    }
  },

  refreshStencilCatalog: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    set({ marketplaceCatalogStatus: 'loading' })
    try {
      const view = await client.refreshStencilCatalog(projectId)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        stencilCatalogView: view,
        marketplaceCatalogStatus:
          s.mcpCatalogView ||
          s.skillCatalogView ||
          s.rulesCatalogView ||
          s.agentCatalogView ||
          s.workflowCatalogView ||
          view
            ? 'ready'
            : 'error',
      }))
      return view
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to refresh stencil catalog')
        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView ||
            s.skillCatalogView ||
            s.rulesCatalogView ||
            s.agentCatalogView ||
            s.workflowCatalogView ||
            s.stencilCatalogView
              ? 'ready'
              : 'error',
        }))
      }
      return null
    }
  },

  installStencilFromCatalog: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const stencils = await client.installStencilFromCatalog(projectId, input)
      if (get().project?.projectId !== projectId) return null
      set((s) => ({
        installedMarketplaceStencilListingIds: s.installedMarketplaceStencilListingIds.includes(
          input.listingId,
        )
          ? s.installedMarketplaceStencilListingIds
          : [...s.installedMarketplaceStencilListingIds, input.listingId],
      }))
      await get().listMergedStencilDefinitions()
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.stencilMarketInstalled'),
      })
      return stencils
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install stencil pack')
      }
      return null
    }
  },

  uninstallStencilFromCatalog: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      await client.uninstallStencilFromCatalog(projectId, { listingId })
      if (get().project?.projectId !== projectId) return false
      set((s) => ({
        installedMarketplaceStencilListingIds: s.installedMarketplaceStencilListingIds.filter(
          (id) => id !== listingId,
        ),
      }))
      await get().listMergedStencilDefinitions()
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.stencilMarketUninstalled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to uninstall stencil pack')
      }
      return false
    }
  },

  disableStencilCatalogListing: async (listingId) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.disableStencilCatalogListing(projectId, listingId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.stencilMarketDisabled'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to disable stencil listing')
      }
      return false
    }
  },

  reportStencilCatalogListing: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false
    const projectId = project.projectId
    try {
      const updated = await client.reportStencilCatalogListing(projectId, input)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, error: null })
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.stencilMarketReported'),
      })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to report stencil listing')
      }
      return false
    }
  },

  installStencilFromExportPack: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const stencils = await client.installStencilFromExportPack(projectId, input)
      if (get().project?.projectId !== projectId) return null
      const listingId = input.listing.id
      set((s) => ({
        installedMarketplaceStencilListingIds: s.installedMarketplaceStencilListingIds.includes(
          listingId,
        )
          ? s.installedMarketplaceStencilListingIds
          : [...s.installedMarketplaceStencilListingIds, listingId],
      }))
      await get().listMergedStencilDefinitions()
      pushToast({
        type: 'success',
        message: getStoreMessage(locale, 'settings.stencilMarketInstalled'),
      })
      return stencils
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install exported stencil pack')
      }
      return null
    }
  },

  listMergedStencilDefinitions: async () => {
    const { client, project } = get()
    if (!project) {
      set({ mergedStencilDefinitions: [] })
      return []
    }
    const projectId = project.projectId
    try {
      const definitions = await client.listMergedStencilDefinitions(projectId)
      if (get().project?.projectId !== projectId) return []
      set({ mergedStencilDefinitions: definitions })
      return definitions
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to list stencil definitions')
        set({ mergedStencilDefinitions: [] })
      }
      return []
    }
  },

  listLoopGraphPresets: async () => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      return await client.listLoopGraphPresets(projectId)
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to list loop presets')
      }
      return null
    }
  },

  resolveLoopGraphPreset: async (presetId) => {
    const { client, project } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      return await client.resolveLoopGraphPreset(projectId, presetId)
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to resolve loop preset')
      }
      return null
    }
  },

  prefetchMarketplaceCatalogs: async () => {
    const { client, project } = get()
    if (!project) return
    const projectId = project.projectId
    if (
      marketplacePrefetchInflight &&
      marketplacePrefetchProjectId === projectId
    ) {
      await marketplacePrefetchInflight
      return
    }
    // Already warm for this project — skip unless catalogs were cleared.
    if (
      get().marketplaceCatalogStatus === 'ready' &&
      get().project?.projectId === projectId &&
      (get().mcpCatalogView ||
        get().skillCatalogView ||
        get().rulesCatalogView ||
        get().agentCatalogView ||
        get().workflowCatalogView ||
        get().stencilCatalogView)
    ) {
      return
    }

    set({ marketplaceCatalogStatus: 'loading' })
    marketplacePrefetchProjectId = projectId
    marketplacePrefetchInflight = (async () => {
      const stillCurrent = () => get().project?.projectId === projectId

      const patchIfCurrent = (partial: Partial<WorkbenchState>) => {
        if (!stillCurrent()) return
        set(partial)
      }

      try {
        // Progressive warm: publish each catalog as soon as it resolves so the open
        // overlay can show content without waiting for the slowest sibling.
        const catalogTasks: Array<Promise<unknown>> = [
          client.listMcpCatalog(projectId).then((view) => {
            patchIfCurrent({ mcpCatalogView: view })
            return view
          }),
          client.listSkillCatalog(projectId).then((view) => {
            patchIfCurrent({ skillCatalogView: view })
            return view
          }),
          client.listRulesCatalog(projectId).then((view) => {
            patchIfCurrent({ rulesCatalogView: view })
            return view
          }),
          client.listAgentCatalog(projectId).then((view) => {
            patchIfCurrent({ agentCatalogView: view })
            return view
          }),
          client.listWorkflowCatalog(projectId).then((view) => {
            patchIfCurrent({ workflowCatalogView: view })
            return view
          }),
          client.listStencilCatalog(projectId).then((view) => {
            patchIfCurrent({ stencilCatalogView: view })
            return view
          }),
          client.listSkills(projectId).then((result) => {
            patchIfCurrent({
              installedMarketplaceSkillIds: result.skills.map((s) => s.id),
            })
            return result
          }),
          client.listInstalledRulesPackIds(projectId).then((ids) => {
            patchIfCurrent({ installedMarketplaceRulesPackIds: ids })
            return ids
          }),
          client.listInstalledMarketplaceAgentListingIds(projectId).then((ids) => {
            patchIfCurrent({ installedMarketplaceAgentListingIds: ids })
            return ids
          }),
          client.listInstalledWorkflowListingIds(projectId).then((ids) => {
            patchIfCurrent({ installedMarketplaceWorkflowListingIds: ids })
            return ids
          }),
          client.listInstalledStencilListingIds(projectId).then((ids) => {
            patchIfCurrent({ installedMarketplaceStencilListingIds: ids })
            return ids
          }),
          client.listMergedStencilDefinitions(projectId).then((defs) => {
            patchIfCurrent({ mergedStencilDefinitions: defs })
            return defs
          }),
        ]

        await Promise.allSettled(catalogTasks)
        if (!stillCurrent()) return

        set((s) => ({
          marketplaceCatalogStatus:
            s.mcpCatalogView ||
            s.skillCatalogView ||
            s.rulesCatalogView ||
            s.agentCatalogView ||
            s.workflowCatalogView ||
            s.stencilCatalogView
              ? 'ready'
              : 'error',
        }))

        // If we painted bundled catalogs for cold start, refresh remote once and patch store
        // without flipping status back to loading.
        if (stillCurrent()) {
          const snap = get()
          const remoteTasks: Array<Promise<unknown>> = []
          if (snap.mcpCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listMcpCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ mcpCatalogView: view })
              }),
            )
          }
          if (snap.skillCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listSkillCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ skillCatalogView: view })
              }),
            )
          }
          if (snap.rulesCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listRulesCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ rulesCatalogView: view })
              }),
            )
          }
          if (snap.agentCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listAgentCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ agentCatalogView: view })
              }),
            )
          }
          if (snap.workflowCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listWorkflowCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ workflowCatalogView: view })
              }),
            )
          }
          if (snap.stencilCatalogView?.source === 'bundled') {
            remoteTasks.push(
              client.listStencilCatalog(projectId, { forceRefresh: true }).then((view) => {
                patchIfCurrent({ stencilCatalogView: view })
              }),
            )
          }
          if (remoteTasks.length > 0) {
            void Promise.allSettled(remoteTasks)
          }
        }
      } catch {
        if (stillCurrent()) {
          set((s) => ({
            marketplaceCatalogStatus:
              s.mcpCatalogView ||
              s.skillCatalogView ||
              s.rulesCatalogView ||
              s.agentCatalogView ||
              s.workflowCatalogView ||
              s.stencilCatalogView
                ? 'ready'
                : 'error',
          }))
        }
      } finally {
        if (marketplacePrefetchProjectId === projectId) {
          marketplacePrefetchInflight = null
          marketplacePrefetchProjectId = null
        }
      }
    })()
    await marketplacePrefetchInflight
  },

  refreshInstalledMarketplaceSkills: async () => {
    const { client, project } = get()
    if (!project) {
      set({ installedMarketplaceSkillIds: [] })
      return
    }
    const projectId = project.projectId
    try {
      const result = await client.listSkills(projectId)
      if (get().project?.projectId !== projectId) return
      set({ installedMarketplaceSkillIds: result.skills.map((s) => s.id) })
    } catch {
      if (get().project?.projectId === projectId) {
        set({ installedMarketplaceSkillIds: [] })
      }
    }
  },

  refreshInstalledMarketplaceRulesPacks: async () => {
    const { client, project } = get()
    if (!project) {
      set({ installedMarketplaceRulesPackIds: [] })
      return
    }
    const projectId = project.projectId
    try {
      const ids = await client.listInstalledRulesPackIds(projectId)
      if (get().project?.projectId !== projectId) return
      set({ installedMarketplaceRulesPackIds: ids })
    } catch {
      if (get().project?.projectId === projectId) {
        set({ installedMarketplaceRulesPackIds: [] })
      }
    }
  },

  refreshInstalledMarketplaceAgents: async () => {
    const { client, project } = get()
    if (!project) {
      set({ installedMarketplaceAgentListingIds: [] })
      return
    }
    const projectId = project.projectId
    try {
      const ids = await client.listInstalledMarketplaceAgentListingIds(projectId)
      if (get().project?.projectId !== projectId) return
      set({ installedMarketplaceAgentListingIds: ids })
    } catch {
      if (get().project?.projectId === projectId) {
        set({ installedMarketplaceAgentListingIds: [] })
      }
    }
  },

  refreshInstalledMarketplaceWorkflows: async () => {
    const { client, project } = get()
    if (!project) {
      set({ installedMarketplaceWorkflowListingIds: [] })
      return
    }
    const projectId = project.projectId
    try {
      const ids = await client.listInstalledWorkflowListingIds(projectId)
      if (get().project?.projectId !== projectId) return
      set({ installedMarketplaceWorkflowListingIds: ids })
    } catch {
      if (get().project?.projectId === projectId) {
        set({ installedMarketplaceWorkflowListingIds: [] })
      }
    }
  },

  refreshInstalledMarketplaceStencils: async () => {
    const { client, project } = get()
    if (!project) {
      set({ installedMarketplaceStencilListingIds: [] })
      return
    }
    const projectId = project.projectId
    try {
      const ids = await client.listInstalledStencilListingIds(projectId)
      if (get().project?.projectId !== projectId) return
      set({ installedMarketplaceStencilListingIds: ids })
    } catch {
      if (get().project?.projectId === projectId) {
        set({ installedMarketplaceStencilListingIds: [] })
      }
    }
  },

  installFromGitUrl: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return null
    const projectId = project.projectId
    try {
      const result = await client.installFromGitUrl(projectId, input)
      if (get().project?.projectId !== projectId) return null
      if (result.status === 'installed' && result.kind === 'mcp') {
        set({ settings: result.settings, error: null })
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.mcpMarketInstalled'),
        })
      } else if (result.status === 'installed' && result.kind === 'skills') {
        set((s) => ({
          installedMarketplaceSkillIds: s.installedMarketplaceSkillIds.includes(result.skill.id)
            ? s.installedMarketplaceSkillIds
            : [...s.installedMarketplaceSkillIds, result.skill.id],
        }))
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.skillMarketInstalled'),
        })
      } else if (result.status === 'installed' && result.kind === 'rules') {
        set((s) => ({
          installedMarketplaceRulesPackIds: s.installedMarketplaceRulesPackIds.includes(
            result.packId,
          )
            ? s.installedMarketplaceRulesPackIds
            : [...s.installedMarketplaceRulesPackIds, result.packId],
        }))
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.rulesMarketInstalled'),
        })
      } else if (result.status === 'installed' && result.kind === 'agents') {
        set((s) => ({
          installedMarketplaceAgentListingIds: s.installedMarketplaceAgentListingIds.includes(
            result.listingId,
          )
            ? s.installedMarketplaceAgentListingIds
            : [...s.installedMarketplaceAgentListingIds, result.listingId],
        }))
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.agentMarketInstalled'),
        })
      } else if (result.status === 'installed' && result.kind === 'workflows') {
        set((s) => ({
          installedMarketplaceWorkflowListingIds:
            s.installedMarketplaceWorkflowListingIds.includes(result.listingId)
              ? s.installedMarketplaceWorkflowListingIds
              : [...s.installedMarketplaceWorkflowListingIds, result.listingId],
        }))
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.workflowMarketInstalled'),
        })
      } else if (result.status === 'installed' && result.kind === 'stencils') {
        set((s) => ({
          installedMarketplaceStencilListingIds: s.installedMarketplaceStencilListingIds.includes(
            result.listingId,
          )
            ? s.installedMarketplaceStencilListingIds
            : [...s.installedMarketplaceStencilListingIds, result.listingId],
        }))
        await get().listMergedStencilDefinitions()
        pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'settings.stencilMarketInstalled'),
        })
      }
      return result
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to install from git URL')
      }
      return {
        status: 'failed' as const,
        kind: input.kind,
        message: error instanceof Error ? error.message : 'Failed to install from git URL',
        agentFallbackSuggested: true as const,
      }
    }
  },

  setSettingsOpen: (open, focusView) => {
    set({
      settingsOpen: open,
      ...(focusView !== undefined ? { settingsFocusView: focusView } : open ? {} : { settingsFocusView: null }),
    })
    const chat = useChatSessionStore.getState()
    if (open) {
      chat.setCanvasOverlay('settings')
    } else if (chat.canvasOverlay === 'settings') {
      chat.setCanvasOverlay('none')
    }
  },
  clearSettingsFocusView: () => set({ settingsFocusView: null }),
  setSelectedModelProfileId: (profileId) => set({ selectedModelProfileId: profileId }),

  loadExecutorOptions: async () => {
    const { client, project } = get()
    if (!project) {
      set({ executorOptions: [], selectedRuntimeId: null })
      return
    }
    const projectId = project.projectId
    let options: ExecutorOption[] = []
    try {
      options = await client.listExecutors(projectId)
    } catch {
      options = []
    }
    if (get().project?.projectId !== projectId) return
    set((current) => ({
      executorOptions: options,
      selectedRuntimeId: options.some((option) => option.executorId === current.selectedRuntimeId)
        ? current.selectedRuntimeId
        : null,
    }))
  },

  selectRuntimeExecutor: (executorId) =>
    set((current) => ({
      selectedRuntimeId:
        executorId !== null && current.executorOptions.some((option) => option.executorId === executorId)
          ? executorId
          : null,
    })),

  selectChatModel: async (profileId) => {
    const { client, project, settings, modelSelectionPending } = get()
    if (!project || !settings || modelSelectionPending) return false
    const projectId = project.projectId
    set({ modelSelectionPending: true })
    try {
      const updated = await persistDefaultModelProfile(client, projectId, settings, profileId)
      if (get().project?.projectId !== projectId) return false
      set({ settings: updated, selectedModelProfileId: profileId, error: null })
      return true
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to select chat model')
      }
      return false
    } finally {
      if (get().project?.projectId === projectId) set({ modelSelectionPending: false })
    }
  },

  setThinkingDepth: async (depth) => {
    const { settings, project } = get()
    if (!settings) return
    const projectId = project?.projectId
    set({
      settings: {
        ...settings,
        execution: { ...settings.execution, thinkingDepth: depth },
      },
    })
    const saved = await persistSettingsPatch(
      { execution: { ...settings.execution, thinkingDepth: depth } },
      { silent: true },
    )
    if (
      !saved &&
      get().project?.projectId === projectId &&
      get().settings?.execution.thinkingDepth === depth
    ) {
      set({ settings })
    }
  },

  setPresentationMode: async (enabled) => {
    const { settings, project, pushToast, locale } = get()
    if (!settings) return
    const projectId = project?.projectId
    set({
      settings: {
        ...settings,
        presentationMode: enabled,
      },
    })
    const saved = await persistSettingsPatch({ presentationMode: enabled }, { silent: true })
    if (!saved) {
      if (
        get().project?.projectId === projectId &&
        get().settings?.presentationMode === enabled
      ) {
        set({ settings })
      }
      return
    }
    pushToast({
      type: 'info',
      message: getStoreMessage(
        locale,
        enabled ? 'chat.modeSwitchedDemo' : 'chat.modeSwitchedReal',
      ),
    })
  },

  loadMapContent: async () => {
    const { client, project } = get()
    if (!project) return
    try {
      const mapContent = await client.getMapContent(project.projectId)
      set({ mapContent })
      await useTerminalStore.getState().syncMapSessions(mapContent.artifacts)
    } catch (err) {
      set({
        error: errorMessage(err, 'Failed to load map content'),
      })
    }
  },

  refreshTeamSnapshot: async () => {
    /* team API removed in pure workbench */
  },

  setActivePerson: async (_personId) => {
    /* team API removed in pure workbench */
  },

  claimSelectedNode: async () => {
    /* team API removed in pure workbench */
  },

  completeSelectedFeature: async () => {
    /* team API removed in pure workbench */
  },

  submitSelectedAcceptance: async () => {
    /* team API removed in pure workbench */
  },

  resolveSelectedAcceptance: async (_action, _reviewerNote, _acceptWithGap) => {
    /* team API removed in pure workbench */
  },

  endWork: async (_input = {}) => {
    set({ endWorkModalOpen: false })
  },

  continueHandoff: async (_handoffId, _confirmOverwrite) => {
    /* team API removed in pure workbench */
  },

  confirmHandoffOverwrite: async () => {
    set({ handoffOverwriteHandoffId: null })
  },

  dismissHandoffOverwrite: () => set({ handoffOverwriteHandoffId: null }),

  markSelectedNodePlanned: async () => {
    /* team API removed in pure workbench */
  },

  createQuickIdea: async (input: CreateIdeaInput) => {
    const raw = typeof input === 'string' ? input.trim() : input.rawText.trim()
    if (!raw) return
    set({ ideaModalOpen: false })
  },

  setIdeaModalOpen: (open) => set({ ideaModalOpen: open }),
  setEndWorkModalOpen: (open) => set({ endWorkModalOpen: open }),
  setCommitModalOpen: (open) => set({ commitModalOpen: open }),
  setDecisionModalOpen: (open) => set({ decisionModalOpen: open }),
  setRosterModalOpen: (open) => set({ rosterModalOpen: open }),
  setMeetingImportOpen: (open) => set({ meetingImportOpen: open }),
  setGitHubDeviceAuthPending: (pending) => set({ githubDeviceAuthPending: pending }),
  setPublishBriefConfirm: (confirm) => set({ publishBriefConfirm: confirm }),

  refreshGitHubAuthStatus: async () => {
    const { client } = get()
    try {
      const status = await client.getGitHubAuthStatus()
      const pending = get().githubDeviceAuthPending
      if (status.connected) {
        const timer = get().githubAuthPollTimer
        if (timer) clearInterval(timer)
        set({
          githubAuthStatus: status,
          githubDeviceAuthPending: null,
          githubAuthPollTimer: null,
        })
        if (get().userAccountGitHubSignInIntent) {
          try {
            const account = await client.activateUserAccountProvider('github')
            set({
              userAccountStatus: account,
              userAccountGitHubSignInIntent: false,
            })
          } catch {
            set({ userAccountGitHubSignInIntent: false })
            void get().refreshUserAccountStatus()
          }
        } else {
          void get().refreshUserAccountStatus()
        }
        return
      }
      set({ githubAuthStatus: status, ...(pending ? {} : {}) })
    } catch {
      set({ githubAuthStatus: { connected: false, oauthConfigured: false } })
    }
  },

  refreshUserAccountStatus: async () => {
    const { client } = get()
    try {
      const status = await client.getUserAccountStatus()
      const pending = Boolean(status.googleOAuthPending)
      if (!pending && get().googleAuthPollTimer) {
        clearInterval(get().googleAuthPollTimer!)
        set({
          userAccountStatus: status,
          userAccountGooglePending: false,
          googleAuthPollTimer: null,
        })
        return
      }
      set({
        userAccountStatus: status,
        userAccountGooglePending: pending,
      })
    } catch {
      set({
        userAccountStatus: { connected: false, googleOAuthConfigured: false },
        userAccountGooglePending: false,
      })
    }
  },

  connectGoogleAccount: async () => {
    const { client, googleAuthPollTimer } = get()
    if (googleAuthPollTimer) clearInterval(googleAuthPollTimer)
    try {
      const result = await client.beginGoogleOAuth()
      if (result.kind === 'connected') {
        set({
          userAccountStatus: result.status,
          userAccountGooglePending: false,
          googleAuthPollTimer: null,
        })
        return
      }
      set({
        userAccountStatus: result.status,
        userAccountGooglePending: true,
      })
      const timer = setInterval(() => {
        void get().refreshUserAccountStatus()
      }, 2000)
      set({ googleAuthPollTimer: timer })
    } catch (error) {
      set({ userAccountGooglePending: false, googleAuthPollTimer: null })
      const message =
        error instanceof Error ? error.message : 'Google sign-in failed'
      get().pushToast({ type: 'error', message })
      throw error
    }
  },

  cancelGoogleOAuth: async () => {
    const { client, googleAuthPollTimer } = get()
    if (googleAuthPollTimer) clearInterval(googleAuthPollTimer)
    set({ userAccountGooglePending: false, googleAuthPollTimer: null })
    try {
      const status = await client.cancelGoogleOAuth()
      set({ userAccountStatus: status })
    } catch {
      /* keep local pending cleared */
    }
  },

  signInUserAccountWithGitHub: async () => {
    const { client, githubAuthStatus } = get()
    set({ userAccountGitHubSignInIntent: true })
    try {
      if (!githubAuthStatus?.connected) {
        await get().connectGitHub()
      }
      const latest = get().githubAuthStatus
      if (latest?.connected) {
        const status = await client.activateUserAccountProvider('github')
        set({
          userAccountStatus: status,
          userAccountGitHubSignInIntent: false,
        })
      }
    } catch (error) {
      set({ userAccountGitHubSignInIntent: false })
      const message =
        error instanceof Error ? error.message : 'GitHub sign-in failed'
      get().pushToast({ type: 'error', message })
      throw error
    }
  },

  signOutUserAccount: async () => {
    const { client, githubAuthPollTimer, googleAuthPollTimer } = get()
    if (githubAuthPollTimer) clearInterval(githubAuthPollTimer)
    if (googleAuthPollTimer) clearInterval(googleAuthPollTimer)
    set({
      githubDeviceAuthPending: null,
      githubAuthPollTimer: null,
      userAccountGooglePending: false,
      googleAuthPollTimer: null,
      userAccountGitHubSignInIntent: false,
    })
    try {
      const status = await client.signOutUserAccount()
      set({ userAccountStatus: status })
      await get().refreshGitHubAuthStatus()
    } catch (error) {
      set({ userAccountStatus: { connected: false } })
      const message =
        error instanceof Error ? error.message : 'Sign out failed'
      get().pushToast({ type: 'error', message })
      throw error
    }
  },

  refreshGitSyncStatus: async () => {
    /* git sync API removed in pure workbench */
  },

  connectGitHub: async () => {
    const { client, githubAuthPollTimer } = get()
    if (githubAuthPollTimer) clearInterval(githubAuthPollTimer)
    try {
      const result = await client.beginGitHubOAuth()
      if (result.kind === 'connected') {
        set({
          githubAuthStatus: result.status,
          githubDeviceAuthPending: null,
          githubAuthPollTimer: null,
        })
        void get().refreshUserAccountStatus()
        return
      }
      set({
        githubAuthStatus: result.status,
        githubDeviceAuthPending: result.pending,
      })
      const timer = setInterval(() => {
        void get().refreshGitHubAuthStatus()
      }, Math.max(2, result.pending.intervalSeconds) * 1000)
      set({ githubAuthPollTimer: timer })
    } catch (error) {
      set({ githubDeviceAuthPending: null, githubAuthPollTimer: null })
      const message =
        error instanceof Error ? error.message : 'GitHub sign-in failed'
      get().pushToast({ type: 'error', message })
      throw error
    }
  },

  importGitHubFromGhCli: async () => {
    const { client, githubAuthPollTimer } = get()
    if (githubAuthPollTimer) clearInterval(githubAuthPollTimer)
    try {
      const result = await client.importGitHubAuthFromGhCli()
      if (result.kind === 'connected') {
        set({
          githubAuthStatus: result.status,
          githubDeviceAuthPending: null,
          githubAuthPollTimer: null,
        })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'GitHub CLI import failed'
      get().pushToast({ type: 'error', message })
      throw error
    }
  },

  saveGitHubOAuthClientId: async (clientId) => {
    const { client } = get()
    const status = await client.saveGitHubOAuthClientId(clientId.trim())
    set({ githubAuthStatus: status })
  },

  cancelGitHubOAuth: async () => {
    const { client, githubAuthPollTimer } = get()
    if (githubAuthPollTimer) clearInterval(githubAuthPollTimer)
    set({ githubDeviceAuthPending: null, githubAuthPollTimer: null })
    try {
      const status = await client.cancelGitHubOAuth()
      set({ githubAuthStatus: status })
    } catch {
      set({ githubAuthStatus: { connected: false } })
    }
  },

  disconnectGitHub: async () => {
    const { client, githubAuthPollTimer } = get()
    if (githubAuthPollTimer) clearInterval(githubAuthPollTimer)
    set({ githubDeviceAuthPending: null, githubAuthPollTimer: null })
    try {
      const status = await client.disconnectGitHub()
      set({ githubAuthStatus: status })
      void get().refreshUserAccountStatus()
    } catch {
      set({ githubAuthStatus: { connected: false } })
      void get().refreshUserAccountStatus()
    }
  },

  gitPull: async () => {
    /* git sync API removed in pure workbench */
  },

  gitPush: async () => {
    /* git sync API removed in pure workbench */
  },

  gitCommit: async (_input) => {
    set({ commitModalOpen: false })
  },

  updateGitSyncSettings: async (_patch) => {
    /* git sync API removed in pure workbench */
  },

  generateDailyBriefNarrative: async () => {
    /* team API removed in pure workbench */
  },

  publishDailyBriefToPullRequest: async () => {
    set({ publishBriefConfirm: false })
  },

  upsertRosterPerson: async (_input) => {
    set({ rosterModalOpen: false })
  },

  saveDecision: async (_input) => {
    set({ decisionModalOpen: false })
  },

  patchDecision: async (_input) => {
    /* team API removed in pure workbench */
  },

  removeDecision: async (_decisionId) => {
    /* team API removed in pure workbench */
  },

  importTranscript: async (_title, _text) => {
    /* team API removed in pure workbench */
  },

  applyMeetingDraft: async (_acceptDecisionIds, _acceptNodeTempRefs) => {
    set({ meetingDraft: null, meetingImportOpen: false })
  },

  setChatAnchor: (anchor) => set({ chatAnchor: anchor }),

  writeAnchoredAnswerAsDecision: async () => {
    const { lastAnchoredAnswer, chatAnchor, selectedNodeId, saveDecision, pushToast } = get()
    if (!lastAnchoredAnswer?.recorded) {
      pushToast({ type: 'info', message: 'No recorded answer to write' })
      return
    }
    const anchoredId = chatAnchor?.kind === 'node' ? chatAnchor.id : selectedNodeId
    const relatedNodeId = anchoredId ? serverNodeIdFor(get().graph?.fileIndex, anchoredId) : undefined
    const relatedNodeIds = relatedNodeId ? [relatedNodeId] : []
    await saveDecision({
      title: 'Anchored answer',
      date: new Date().toISOString(),
      participantPersonIds: [],
      choice: lastAnchoredAnswer.answer.slice(0, 1_024),
      reasons: ['Written back from anchored question'],
      alternativesConsidered: [],
      relatedNodeIds,
    })
  },

  openRelatedKnowledge: async (kind, id) => {
    const { selectFile, selectArtifact, teamSnapshot, setDecisionModalOpen, setCenterTab } = get()
    if (kind === 'code') {
      await selectFile(id)
      return
    }
    if (kind === 'artifact' || kind === 'dev_plan') {
      selectArtifact(id)
      setCenterTab('function-map')
      return
    }
    if (kind === 'decision') {
      const decision = teamSnapshot?.decisions.find((item) => item.id === id)
      if (decision) setDecisionModalOpen(true)
      return
    }
    if (kind === 'git') {
      await navigator.clipboard?.writeText(id).catch(() => undefined)
    }
  },

  beginMapArtifactCreate: (type, placement) => {
    set({
      mapArtifactCreateFlow: { type, placement },
      mapArtifactRenameFlow: null,
      mapWorkGroupCreateFlow: null,
    })
  },

  cancelMapArtifactCreate: () => set({ mapArtifactCreateFlow: null }),

  beginMapWorkGroupCreate: (flow) => {
    set({
      mapWorkGroupCreateFlow: flow,
      mapArtifactCreateFlow: null,
      mapArtifactRenameFlow: null,
    })
  },

  cancelMapWorkGroupCreate: () => set({ mapWorkGroupCreateFlow: null }),

  confirmMapWorkGroupCreate: async (items) => {
    const { client, project, pushToast, locale, mapWorkGroupCreateFlow } = get()
    if (!project) {
      return false
    }
    if (items.length === 0) {
      set({ mapWorkGroupCreateFlow: null })
      return true
    }

    try {
      const mapContent = await client.applyMapWorkGroupMutation(project.projectId, {
        type: 'merge_or_create_group',
        items,
        origin: mapWorkGroupCreateFlow?.origin,
      })
      set({ mapContent, mapWorkGroupCreateFlow: null })
      return true
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('invalid_work_group_layout')
          ? getStoreMessage(locale, 'map.workGroup.invalidLayout')
          : errorMessage(err, getStoreMessage(locale, 'map.workGroup.saveFailed'))
      pushToast({ type: 'error', message })
      return false
    }
  },

  beginMapArtifactRename: (artifactId, artifactType, initialTitle) => {
    set({
      mapArtifactRenameFlow: { artifactId, artifactType, initialTitle },
      mapArtifactCreateFlow: null,
    })
  },

  cancelMapArtifactRename: () => set({ mapArtifactRenameFlow: null }),

  beginMapArtifactStackAdd: async (hostArtifactId) => {
    const { client, project, mapContent, pushToast, locale } = get()
    if (!project || !mapContent) return

    const host = mapContent.artifacts.find((artifact) => artifact.id === hostArtifactId)
    if (!host) return

    let stackId = host.stackId
    if (!stackId) {
      stackId = createClientId('stack_')
      try {
        await client.initMapArtifactStack(project.projectId, hostArtifactId, stackId)
        const refreshed = await client.getMapContent(project.projectId)
        set({ mapContent: refreshed })
      } catch (err) {
        pushToast({
          type: 'error',
          message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
        })
        return
      }
    }

    set({
      mapArtifactCreateFlow: {
        type: host.type,
        placement: { mode: 'stack', stackId },
        targetStackId: stackId,
      },
      mapArtifactRenameFlow: null,
    })
  },

  setStackActiveMember: async (stackId, artifactId) => {
    const { client, project, mapContent, pushToast, locale } = get()
    if (!project || !mapContent) return

    try {
      const updated = await client.setMapArtifactStackActive(
        project.projectId,
        stackId,
        artifactId,
      )
      const refreshed = await client.getMapContent(project.projectId)
      set({
        mapContent: refreshed,
        selectedArtifactId: updated.id,
      })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  reorderStackMembers: async (stackId, orderedArtifactIds) => {
    const { client, project, mapContent, pushToast, locale } = get()
    if (!project || !mapContent) return

    try {
      await client.reorderMapArtifactStack(project.projectId, stackId, {
        orderedArtifactIds,
      })
      const refreshed = await client.getMapContent(project.projectId)
      set({ mapContent: refreshed })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  attachArtifactToStack: async (artifactId, targetNodeId) => {
    const { client, project, mapContent, pushToast, locale } = get()
    if (!project || !mapContent) return

    const source = mapContent.artifacts.find((artifact) => artifact.id === artifactId)
    if (!source) return

    let targetStackId = targetNodeId
    const stackMember = mapContent.artifacts.find(
      (artifact) => artifact.stackId === targetNodeId,
    )
    const soloHost = mapContent.artifacts.find((artifact) => artifact.id === targetNodeId)

    if (stackMember?.stackId) {
      targetStackId = stackMember.stackId
    } else if (soloHost && !soloHost.stackId) {
      targetStackId = createClientId('stack_')
      try {
        await client.initMapArtifactStack(project.projectId, soloHost.id, targetStackId)
        const refreshed = await client.getMapContent(project.projectId)
        set({ mapContent: refreshed })
      } catch (err) {
        pushToast({
          type: 'error',
          message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
        })
        return
      }
    } else if (soloHost?.stackId) {
      targetStackId = soloHost.stackId
    }

    const latestMapContent = get().mapContent ?? mapContent
    const targetAnchor =
      latestMapContent.artifacts.find((artifact) => artifact.stackId === targetStackId) ??
      latestMapContent.artifacts.find((artifact) => artifact.id === targetNodeId)
    if (targetAnchor && source.type !== targetAnchor.type) {
      pushToast({
        type: 'error',
        message: getStoreMessage(locale, 'mapArtifacts.stackTypeMismatch'),
      })
      return
    }

    try {
      const updated = await client.attachMapArtifactToStack(project.projectId, artifactId, {
        targetStackId,
      })
      const refreshed = await client.getMapContent(project.projectId)
      set({
        mapContent: refreshed,
        selectedArtifactId: updated.id,
      })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  detachArtifactFromStack: async (artifactId, position) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return

    try {
      const updated = await client.detachMapArtifactFromStack(project.projectId, artifactId, {
        position,
      })
      const refreshed = await client.getMapContent(project.projectId)
      set({
        mapContent: refreshed,
        selectedArtifactId: updated.id,
      })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  createMapArtifact: async (type, position, options) => {
    const { client, project, selectedNodeId, pushToast, locale } = get()
    if (!project) return

    const title = options?.title?.trim() || undefined
    const requestedNodeId = options?.anchorNodeId ?? selectedNodeId ?? undefined
    const nodeId = requestedNodeId ? serverNodeIdFor(get().graph?.fileIndex, requestedNodeId) : undefined
    const scope: 'project' | 'node' = nodeId ? 'node' : 'project'
    const size = MAP_ARTIFACT_DEFAULT_SIZES[type]
    const base = {
      type,
      scope,
      nodeId,
      position,
      size,
      ...(options?.stackId ? { stackId: options.stackId } : {}),
    }
    const input =
      type === 'note'
        ? { ...base, note: { document: emptyNoteDocument(), ...(title ? { title } : {}) } }
        : type === 'plan'
          ? { ...base, plan: { items: [], ...(title ? { title } : {}) } }
          : type === 'terminal'
            ? { ...base, terminal: title ? { title } : {} }
            : type === 'urls'
              ? { ...base, urls: { items: [], ...(title ? { title } : {}) } }
              : { ...base, acceptance: { items: [], ...(title ? { title } : {}) } }

    try {
      const artifact = await client.createMapArtifact(project.projectId, input)
      if (artifact.type === 'terminal') {
        await useTerminalStore.getState().createMapSession(artifact.id, {
          title: artifact.terminal.title,
          cwd: artifact.terminal.cwd,
        })
      }
      const mapContent = await client.getMapContent(project.projectId)
      set({
        mapContent,
        selectedArtifactId: artifact.id,
        mapArtifactCreateFlow: null,
      })
    } catch (err) {
      set({ mapArtifactCreateFlow: null })
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  createMapImageArtifact: async (position, size, file, options) => {
    const { client, project, selectedNodeId, pushToast, locale } = get()
    if (!project) return

    const requestedNodeId = options?.anchorNodeId ?? selectedNodeId ?? undefined
    const nodeId = requestedNodeId ? serverNodeIdFor(get().graph?.fileIndex, requestedNodeId) : undefined
    const scope: 'project' | 'node' = nodeId ? 'node' : 'project'

    const input = {
      scope,
      nodeId,
      position,
      size,
      fileName: file.fileName,
      mimeType: file.mimeType,
      width: file.width,
      height: file.height,
      ...(options?.stackId ? { stackId: options.stackId } : {}),
      dataUrl: file.dataUrl,
    }

    try {
      const artifact = await client.createMapImageArtifact(project.projectId, input)
      const mapContent = await client.getMapContent(project.projectId)
      set({
        mapContent,
        selectedArtifactId: artifact.id,
        mapArtifactCreateFlow: null,
      })
    } catch (err) {
      set({ mapArtifactCreateFlow: null })
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  updateMapArtifact: async (artifactId, patch) => {
    const { client, project, mapContent, pushToast, locale } = get()
    if (!project || !mapContent) return
    const projectId = project.projectId

    const existing = mapContent.artifacts.find((artifact) => artifact.id === artifactId)
    if (!existing) return

    try {
      const updated = await client.updateMapArtifact(projectId, artifactId, patch)
      if (get().project?.projectId !== projectId) return
      set((current) => {
        if (current.project?.projectId !== projectId || !current.mapContent) return {}
        const latestExisting = current.mapContent.artifacts.find(
          (artifact) => artifact.id === artifactId,
        )
        if (!latestExisting) return {}
        let artifacts = current.mapContent.artifacts.map((artifact) =>
          artifact.id === artifactId ? updated : artifact,
        )
        if (
          latestExisting.stackId &&
          (patch.position !== undefined ||
            patch.size !== undefined ||
            patch.workGroupId !== undefined)
        ) {
          const geometryPatch: {
            position?: typeof patch.position
            size?: typeof patch.size
            workGroupId?: string
          } = {}
          if (patch.position !== undefined) geometryPatch.position = patch.position
          if (patch.size !== undefined) geometryPatch.size = patch.size
          if (patch.workGroupId !== undefined) {
            geometryPatch.workGroupId = patch.workGroupId ?? undefined
          }
          artifacts = syncStackGeometry(artifacts, latestExisting.stackId, geometryPatch)
        }
        return {
          mapContent: {
            ...current.mapContent,
            artifacts,
          },
          error: null,
        }
      })
    } catch (err) {
      if (get().project?.projectId !== projectId) return
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.saveFailed')),
      })
    }
  },

  applyMapWorkGroupMutation: async (input) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return false

    try {
      const mapContent = await client.applyMapWorkGroupMutation(project.projectId, input)
      set({ mapContent })
      return true
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('invalid_work_group_layout')
          ? getStoreMessage(locale, 'map.workGroup.invalidLayout')
          : errorMessage(err, getStoreMessage(locale, 'map.workGroup.saveFailed'))
      pushToast({
        type: 'error',
        message,
      })
      return false
    }
  },

  updateMapWorkGroup: async (workGroupId, patch) => {
    const { client, project, pushToast, locale } = get()
    if (!project) return

    try {
      const mapContent = await client.updateMapWorkGroup(project.projectId, workGroupId, patch)
      set({ mapContent })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'map.workGroup.saveFailed')),
      })
    }
  },

  deleteMapArtifact: async (artifactId) => {
    const { client, project, mapContent, selectedArtifactId, pushToast, locale } = get()
    if (!project || !mapContent) return

    const existing = mapContent.artifacts.find((artifact) => artifact.id === artifactId)
    if (!existing) return

    if (existing.type === 'terminal') {
      await useTerminalStore.getState().disposeMapSession(artifactId)
    }

    const stackId = existing.stackId
    const remainingBeforeDelete = stackId
      ? getStackMembers(mapContent.artifacts, stackId).filter(
          (member) => member.id !== artifactId,
        )
      : []

    try {
      await client.deleteMapArtifact(project.projectId, artifactId)
      const refreshed = await client.getMapContent(project.projectId)
      let nextSelected = selectedArtifactId
      if (selectedArtifactId === artifactId) {
        if (remainingBeforeDelete.length > 0) {
          nextSelected = getActiveStackMember(remainingBeforeDelete).id
        } else {
          nextSelected = null
        }
      }
      set({
        mapContent: refreshed,
        selectedArtifactId: nextSelected,
      })
    } catch (err) {
      pushToast({
        type: 'error',
        message: errorMessage(err, getStoreMessage(locale, 'mapArtifacts.deleteFailed')),
      })
    }
  },

  selectArtifact: (artifactId) => {
    set({ selectedArtifactId: artifactId })
    const { mapContent } = get()
    if (!artifactId) {
      useTerminalStore.getState().setFocusedMapArtifact(null)
      return
    }
    const artifact = mapContent?.artifacts.find((item) => item.id === artifactId)
    if (artifact?.type === 'terminal') {
      useTerminalStore.getState().setFocusedMapArtifact(artifactId)
    } else {
      useTerminalStore.getState().setFocusedMapArtifact(null)
    }
  },
}
})
