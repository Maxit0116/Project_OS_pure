import { create } from 'zustand'
import type {
  AgentAnswerResult,
  AgentConversationScope,
  AgentFlowStep,
  AgentActionEvent,
  AgentDelegationEvent,
  AgentProfile,
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
  PromptRefinement,
  MemoryWriteNotice,
  SemanticTree,
  ThinkingDepth,
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
  McpServerConfig,
  McpToolDescriptor,
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
  GitHubAuthStatus,
  GitSyncStatus,
  GitSyncSettingsPatch,
  GitCommitInput,
} from './removedApiStubTypes'
import { buildPromptComposerFields, emptyComposerDraft } from '@contracts/index'
import type { MapWorkGroupMutationInput, UpdateMapWorkGroupPatch, WorkGroupSelectionItem } from '@contracts/index'
import { FileOwnershipErrorDetailsSchema, MAP_ARTIFACT_DEFAULT_SIZES, emptyNoteDocument } from '@contracts/index'
import { getActiveStackMember, getStackMembers, syncStackGeometry } from '@contracts/index'
import {
  createFlowCorrection,
  handleRunEvent,
  type FlowCorrection,
} from './handleRunEvent'
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
  loadChatModeSwitchPreference,
  saveChatModeSwitchPreference,
  type ChatModeSwitchPreference,
} from '../preferences/chatModeSwitch'
export type { ChatModeSwitchPreference } from '../preferences/chatModeSwitch'
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
  persistDefaultModelProfile,
  persistModelProfile,
  persistModelProfileDeletion,
  type SaveModelProfileInput,
} from './modelProfileMutations'
import { resolveFileOwnerSelection } from './fileOwnerSelection'
import { isNodeAgentArchitectureLevel } from '../components/FunctionMap/architectureView'
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
export type AgentFlowViewMode = 'timeline' | 'graph'
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
  | { status: 'error'; scope: AgentConversationScope; message: string }
export type LatestPlanTrace =
  | { status: 'running'; scope: AgentConversationScope }
  | { status: 'complete'; scope: AgentConversationScope; result: import('@contracts/index').ImplementationPlan }
  | { status: 'needs_clarification'; scope: AgentConversationScope; result: import('@contracts/index').ImplementationPlan }
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
  checkpointId?: string
}

/** No node/file selection ⇒ whole-project (global) agent scope. */
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

export function canSubmitAgentPrompt(state: {
  chatMode: ChatMode
  globalAgentActive: boolean
  selectedNodeId: string | null
  selectedFilePath: string | null
  pendingFileOwnerChoice: PendingFileOwnerChoice | null
  fileScopeError: 'not_mapped' | null
  pendingPlan: import('@contracts/index').ImplementationPlan | null
}): boolean {
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
      message: sanitizeErrorMessage(error),
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
  destination: 'ask' | 'diff'
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
  resolvedTheme: ResolvedTheme
  notifyOnDiffReady: boolean
  /** When switching chat modes: open a fresh session (Cursor-like) or keep the same thread. */
  chatModeSwitch: ChatModeSwitchPreference
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
  refinementConfirmed: boolean
  pendingPlan: import('@contracts/index').ImplementationPlan | null
  /** Last plan that was built — used by Return to plan. */
  lastBuiltPlan: import('@contracts/index').ImplementationPlan | null
  planConfirmed: boolean
  debugSession: import('@contracts/index').DebugSession | null
  composerDraft: ComposerDraft
  chatMode: ChatMode
  /** Pinned skill body injected every turn until cleared (Custom Mode). */
  activeCustomModeSkillId: string | null
  /** Built-in chat mode to restore when exiting Custom Mode. */
  customModePreviousChatMode: ChatMode | null
  conversationCheckpoints: ConversationCheckpoint[]
  latestAskTrace: LatestAskTrace | null
  latestPlanTrace: LatestPlanTrace | null
  agentFlowSubject: AgentFlowSubject

  activeRunId: string | null
  flowSteps: AgentFlowStep[]
  flowActions: AgentActionEvent[]
  flowDelegationEvents: AgentDelegationEvent[]
  delegatedRunTraces: Record<string, DelegatedRunTrace>
  flowTransientTraces: AgentTransientTrace[]
  flowCorrections: FlowCorrection[]
  flowStatus: 'idle' | 'running' | 'complete' | 'awaiting_review' | 'error'
  diffReady: boolean
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
  selectedModelProfileId: string | null
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
  gitSyncStatus: GitSyncStatus | null
  activeHandoffId: string | null
  teamLoading: boolean
  ideaModalOpen: boolean
  endWorkModalOpen: boolean
  commitModalOpen: boolean
  decisionModalOpen: boolean
  rosterModalOpen: boolean
  meetingImportOpen: boolean
  githubDeviceAuthPending: {
    userCode: string
    verificationUri: string
    authorizeUrl: string
  } | null
  handoffOverwriteHandoffId: string | null
  chatAnchor: AnchorRef | null
  lastAnchoredAnswer: TeamBrainAnswer | null
  meetingDraft: TeamMeeting | null
  publishBriefConfirm: boolean

  setLocale: (locale: Locale) => void
  setThemePreference: (theme: ThemePreference) => void
  setResolvedTheme: (theme: ResolvedTheme) => void
  setNotifyOnDiffReady: (enabled: boolean) => void
  setChatModeSwitch: (value: ChatModeSwitchPreference) => void
  setShowGestureCursor: (show: boolean) => void
  setWindowFocused: (focused: boolean) => void
  dismissDiffReadyBanner: () => void
  navigateToDiffReview: () => Promise<void>
  navigateToDiffReviewFile: (path?: string) => Promise<void>
  clearSelectedDiffFilePath: () => void
  setPendingChangesDrawerExpanded: (expanded: boolean) => void
  dismissPendingChanges: () => void
  undoAllPendingChanges: () => Promise<void>
  navigateFromAgentNotification: (destination: 'ask' | 'diff') => Promise<void>
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
  /**
   * Switch chat mode. By default (`chatModeSwitch: 'new_session'`) opens a fresh
   * session so Ask/Plan/Agent/Debug contexts do not mix. Pass `{ isolate: false }`
   * to flip mode in-place (demo scripts, same-session preference).
   */
  setChatMode: (mode: ChatMode, options?: { isolate?: boolean }) => Promise<void>
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
  clearSelection: () => void
  dismissError: () => void
  sendPrompt: (input: string | ComposerDraft) => Promise<void>
  confirmRefinement: () => Promise<void>
  reviseRefinement: () => void
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
  submitDebugRepro: () => Promise<void>
  confirmDebugFix: () => Promise<void>
  markDebugFixed: () => Promise<void>
  loadDiff: (runId?: string) => Promise<void>
  applyCurrentDiff: () => Promise<void>
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
  testModelConnection: (profileId: string) => Promise<void>
  testExternalAgent: (agentId: string) => Promise<void>
  testMcpServer: (serverId: string) => Promise<void>
  refreshMcpTools: (serverId: string) => Promise<McpToolDescriptor[]>
  setSettingsOpen: (open: boolean) => void
  setSelectedModelProfileId: (profileId: string | null) => void
  selectChatModel: (profileId: string) => Promise<void>
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
  setGitHubDeviceAuthPending: (
    pending: {
      userCode: string
      verificationUri: string
      authorizeUrl: string
    } | null,
  ) => void
  refreshGitHubAuthStatus: () => Promise<void>
  refreshGitSyncStatus: () => Promise<void>
  connectGitHub: () => Promise<void>
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

async function reconcileStaleFlowStatus(
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
    if (run.status === 'error') return 'error'
    return 'complete'
  } catch {
    return 'idle'
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
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
    context: null,
    ...initialTransientState,
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
  refinementConfirmed: false,
  pendingPlan: null as import('@contracts/index').ImplementationPlan | null,
  lastBuiltPlan: null as import('@contracts/index').ImplementationPlan | null,
  planConfirmed: false,
  debugSession: null as import('@contracts/index').DebugSession | null,
  composerDraft: emptyComposerDraft(),
  chatMode: 'ask' as ChatMode,
  activeCustomModeSkillId: null as string | null,
  customModePreviousChatMode: null as ChatMode | null,
  conversationCheckpoints: [] as ConversationCheckpoint[],
  latestAskTrace: null as LatestAskTrace | null,
  latestPlanTrace: null as LatestPlanTrace | null,
  agentFlowSubject: 'run' as AgentFlowSubject,
  activeRunId: null as string | null,
  flowSteps: [] as AgentFlowStep[],
  flowActions: [] as AgentActionEvent[],
  flowDelegationEvents: [] as AgentDelegationEvent[],
  delegatedRunTraces: {} as Record<string, DelegatedRunTrace>,
  flowTransientTraces: [] as AgentTransientTrace[],
  flowCorrections: [] as FlowCorrection[],
  flowStatus: 'idle' as const,
  diffReady: false,
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
  handoffOverwriteHandoffId: null as string | null,
  chatAnchor: null as AnchorRef | null,
  lastAnchoredAnswer: null as TeamBrainAnswer | null,
  meetingDraft: null as TeamMeeting | null,
  publishBriefConfirm: false,
}

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

    const showInAppBanner = (
      bannerChannel: Extract<DiffReadyNotificationChannel, 'map_banner' | 'center_banner'>,
    ) => {
      set({
        diffReadyBanner: {
          visible: true,
          channel: bannerChannel,
          title,
          body,
          destination: mergedDestination,
          runIds,
        },
      })
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
          .catch((error) => {
            console.error('[workbench] failed to show diff-ready system notification', error)
            showInAppBanner('center_banner')
          })
        return
      }
      // Non-desktop (or missing bridge): keep an in-app banner for when the user returns.
      showInAppBanner('center_banner')
      return
    }

    showInAppBanner(channel)
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
  resolvedTheme: resolveTheme(loadThemePreference()),
  notifyOnDiffReady: loadNotifyOnDiffReadyPreference(),
  chatModeSwitch: loadChatModeSwitchPreference(),
  showGestureCursor: loadShowGestureCursorPreference(),
  windowFocused: typeof document !== 'undefined' ? document.hasFocus() : true,
  diffReadyBanner: null,
  toasts: [],
  agentFlowViewMode: 'timeline',
  treeViewMode: 'semantic',
  flashKey: 0,
  leftPanelOpen: true,
  rightPanelOpen: false,
  shouldStartOnboarding: false,
  terminalLines: [] as string[],
  ...loadPanelLayout(),
  panelResizing: false,
  settings: null,
  projectDescription: null,
  projectDescriptionSaving: false,
  settingsOpen: false,
  selectedModelProfileId: null,
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
      set({ notifyOnDiffReady: enabled, diffReadyBanner: null })
      return
    }
    set({ notifyOnDiffReady: enabled })
  },

  setChatModeSwitch: (value) => {
    saveChatModeSwitchPreference(value)
    set({ chatModeSwitch: value })
  },

  setShowGestureCursor: (show) => {
    saveShowGestureCursorPreference(show)
    set({ showGestureCursor: show })
  },

  setWindowFocused: (windowFocused) => set({ windowFocused }),

  dismissDiffReadyBanner: () => set({ diffReadyBanner: null }),

  navigateToDiffReview: async () => {
    await get().navigateToDiffReviewFile()
  },

  navigateToDiffReviewFile: async (path) => {
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
    set({
      pendingChangesDrawerDismissedRunId: activeRunId,
      pendingChangesDrawerExpanded: false,
    })
  },

  undoAllPendingChanges: async () => {
    const undoMode = selectPendingChangesDrawerUndoMode(get())
    if (undoMode === 'restore') {
      await get().undoCurrentApply()
    }
    get().dismissPendingChanges()
  },

  navigateFromAgentNotification: async (destination) => {
    if (destination === 'diff') {
      await get().navigateToDiffReviewFile()
      return
    }

    useChatSessionStore.getState().presentAgentFlow()
    set({
      agentFlowSubject: 'ask',
      rightPanelTab: 'chat',
      diffReadyBanner: null,
    })
  },

  maybeNotifyAgentComplete,

  setResolvedTheme: (resolvedTheme) => {
    applyThemeToDocument(resolvedTheme)
    set({ resolvedTheme })
  },

  pushToast: ({ type, message, autoDismiss = 4000 }) => {
    const id = toastId()
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
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
  setSelectedFlowStepId: (id) => set({ selectedFlowStepId: id }),
  setSelectedActivityId: (id) => set({ selectedActivityId: id }),
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
    const loadingKey =
      mode === 'refine' || mode === 'acceptRefine'
        ? 'map.refiningStructure'
        : mode === 'deepen'
          ? 'map.deepeningStructure'
          : mode === 'prepareRefine'
            ? 'map.refiningStructure'
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
      set({ graph, tree, structureRescanLoading: false })
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
    set({
      centerTab: tab,
      ...(onDiffView ? { diffReadyBanner: null } : {}),
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
    get().setCenterTab('function-map')
    set({
      designSurfaceFocus: focus,
      designSurfaceFocusToken: get().designSurfaceFocusToken + 1,
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
    const { client, activeRunId, flowStatus, refineLoading, pushToast, locale } = get()
    if (!activeRunId && flowStatus !== 'running' && !refineLoading) return

    const runId = activeRunId
    disposeActiveRunSubscriptions(get, set)
    set({
      flowStatus: 'idle',
      refineLoading: false,
      activeRunId: null,
    })

    if (client && runId && typeof client.cancelAgentRun === 'function') {
      try {
        await client.cancelAgentRun(runId)
      } catch (error) {
        console.error('[workbench] cancelAgentRun failed', error)
      }
    }

    pushToast({
      type: 'info',
      message: getStoreMessage(locale, 'chat.agentStopped'),
      autoDismiss: 2500,
    })
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
    const composerFields = buildPromptComposerFields(draft)
    const {
      chatMode,
      client,
      project,
      selectedNodeId,
      selectedFilePath,
      pushToast,
    } = state
    if (!project || !rawPrompt.trim() || !canSubmitAgentPrompt(state)) {
      return
    }

    const effectiveSkillId =
      draft.invokedSkillId ?? get().activeCustomModeSkillId ?? undefined
    const composerFieldsWithMode = {
      ...composerFields,
      ...(effectiveSkillId ? { invokedSkillId: effectiveSkillId } : {}),
    }

    const buildUserMessage = (): ChatMessage => ({
      id: msgId(),
      role: 'user',
      content: rawPrompt.trim(),
      timestamp: new Date().toISOString(),
      ...(draft.attachments.length > 0 ? { attachments: draft.attachments } : {}),
      ...(effectiveSkillId ? { invokedSkillId: effectiveSkillId } : {}),
    })

    const clearedDraft = emptyComposerDraft()

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
      const askScope: AgentConversationScope = { kind: 'node', nodeId: anchor.id }
      const userMsg = buildUserMessage()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        refineLoading: true,
        rightPanelTab: 'chat',
        latestAskTrace: { status: 'running', scope: askScope },
      }))
      try {
        const answer = await client.askAgent({
          projectId: project.projectId,
          scope: askScope,
          question: rawPrompt.trim(),
          language: { mode: 'auto' },
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        })
        set((current) => ({
          refineLoading: false,
          lastAnchoredAnswer: { answer: answer.answer, recorded: false },
          latestAskTrace: {
            status: 'complete',
            scope: answer.scope,
            result: answer,
          },
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

    if (chatMode === 'ask') {
      const askScope: AgentConversationScope = isGlobalAgentScope(state)
        ? { kind: 'global' }
        : selectedFilePath
        ? {
            kind: 'file',
            nodeId: selectedNodeId!,
            selectedFilePath,
          }
        : {
            kind: 'node',
            nodeId: selectedNodeId!,
          }
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
      try {
        const answer = await client.askAgent({
          projectId: project.projectId,
          scope: askScope,
          question: rawPrompt.trim(),
          language: { mode: 'auto' },
          exploration: { maxRounds: 2 },
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        })
        set((current) => ({
          refineLoading: false,
          latestAskTrace: {
            status: 'complete',
            scope: answer.scope,
            result: answer,
          },
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
          summary: truncateDiffReadySummary(rawPrompt.trim()),
          completedAt: Date.now(),
        })
        notifyMemoryWrite(pushToast, get().locale, answer.memoryWrite)
      } catch (error) {
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
      const planScope: AgentConversationScope = isGlobalAgentScope(state)
        ? { kind: 'global' }
        : selectedFilePath
        ? {
            kind: 'file',
            nodeId: selectedNodeId!,
            selectedFilePath,
          }
        : {
            kind: 'node',
            nodeId: selectedNodeId!,
          }
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
      try {
        const plan = withPlanQuestionOptions(await client.createPlan({
          projectId: project.projectId,
          scope: planScope,
          objective: rawPrompt.trim(),
          ...chatSessionRequestFields(),
          ...composerFieldsWithMode,
        }))
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
          set((current) => ({
            refineLoading: false,
            pendingPlan: plan,
            latestPlanTrace: {
              status: 'complete',
              scope: planScope,
              result: plan,
            },
          }))
        }
      } catch (error) {
        set((current) => ({
          refineLoading: false,
          latestPlanTrace: {
            status: 'error',
            scope: planScope,
            message: sanitizeErrorMessage(error),
          },
          messages: [
            ...current.messages,
            {
              id: msgId(),
              role: 'assistant' as const,
              content: getStoreMessage(current.locale, 'plan.failure', {
                message: sanitizeErrorMessage(error),
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
      const debugScope: AgentConversationScope = isGlobalAgentScope(state)
        ? { kind: 'global' }
        : selectedFilePath
        ? {
            kind: 'file',
            nodeId: selectedNodeId!,
            selectedFilePath,
          }
        : {
            kind: 'node',
            nodeId: selectedNodeId!,
          }
      const userMsg = buildUserMessage()
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        messages: [...current.messages, userMsg],
        composerDraft: clearedDraft,
        refineLoading: true,
        rightPanelTab: 'chat',
        agentFlowSubject: 'debug',
      }))
      try {
        const session = await client.startDebugSession({
          projectId: project.projectId,
          scope: debugScope,
          bugDescription: rawPrompt.trim(),
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
      diffReady: false,
      diffReadyBanner: null,
      pendingChangesDrawerDismissedRunId: null,
      diffFileStats: [],
      runDisposable: null,
    }))

    try {
      const refinement = await client.refinePrompt({
        projectId: project.projectId,
        nodeId: selectedNodeId ?? undefined,
        filePath: selectedFilePath ?? undefined,
        rawPrompt: rawPrompt.trim(),
        ...chatSessionRequestFields(),
        ...composerFieldsWithMode,
      })
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
      if (refinement.executionPolicy === 'automatic') {
        await get().confirmRefinement()
        set({ pendingRefinement: null })
      }
    } catch (err) {
      set({
        refineLoading: false,
        error: errorMessage(err, 'Failed to refine prompt'),
      })
    }
    scheduleChatSessionPersist()
  },

  confirmRefinement: async () => {
    const { client, pendingRefinement, pushToast, locale } = get()
    if (!pendingRefinement) return
    const subscriptionProjectId = get().project?.projectId

    get().runDisposable?.dispose()

    try {
      const run = await client.confirmExecution(pendingRefinement.id)
      if (!subscriptionProjectId || get().project?.projectId !== subscriptionProjectId) return

      pushToast({ type: 'info', message: getStoreMessage(locale, 'toast.agentRunning') })
      useChatSessionStore.getState().presentAgentFlow()
      set({
        refinementConfirmed: true,
        activeRunId: run.runId,
        flowSteps: [],
        flowActions: [],
        flowDelegationEvents: [],
        delegatedRunTraces: {},
        flowTransientTraces: [],
        flowCorrections: [],
        flowStatus: 'running',
        agentFlowSubject: 'run',
        diffReady: false,
        generatedDiff: null,
        applyResult: null,
        verificationResult: null,
        verificationCommandApproval: null,
        verificationLoading: false,
        harnessFixRunId: null,
        selectedFlowStepId: null,
      selectedActivityId: null,
        runDisposable: null,
        pendingChangesDrawerDismissedRunId: null,
        pendingChangesDrawerExpanded: true,
        diffFileStats: [],
        selectedDiffFilePath: null,
      })

      const isCurrentRunSubscription = () => {
        const current = get()
        return current.activeRunId === run.runId &&
          current.project?.projectId === subscriptionProjectId
      }

      const handledRunEventIds = new Set<string>()
      const applyRunEvent = (event: AgentRunEvent) => {
        if (!isCurrentRunSubscription()) return
        if (handledRunEventIds.has(event.eventId)) return
        handledRunEventIds.add(event.eventId)
        try {
          handleRunEvent(event, set, get)
          scheduleChatSessionPersist()
        } catch (error) {
          console.error('[workbench] failed to apply agent run event', event.type, error)
        }
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
              return {
                delegatedRunTraces: {
                  ...current.delegatedRunTraces,
                  [childRunId]: {
                    ...trace,
                    events: [...trace.events, childEvent],
                  },
                },
              }
            })
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
          const events = await client.getAgentRunEvents(run.runId)
          if (!isCurrentRunSubscription()) return
          if (events.length === 0) return
          for (const event of events) {
            applyRunEvent(event)
          }
        } catch (error) {
          console.error('[workbench] failed to sync agent run events', error)
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
    const { client, pendingPlan, pushToast, locale } = get()
    if (!pendingPlan || pendingPlan.status !== 'ready') return
    if (pendingPlan.steps.length === 0) {
      pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'plan.buildNeedsSteps'),
        autoDismiss: 3000,
      })
      return
    }
    set({ refineLoading: true, planConfirmed: true })
    try {
      const refinement = await client.buildPlan(pendingPlan.id)
      useChatSessionStore.getState().presentAgentFlow()
      set({
        refineLoading: false,
        lastBuiltPlan: pendingPlan,
        pendingPlan: null,
        pendingRefinement: refinement,
        refinementConfirmed: true,
        chatMode: 'change',
        agentFlowSubject: 'run',
        rightPanelTab: 'chat',
      })
      pushToast({ type: 'info', message: getStoreMessage(locale, 'plan.buildStarted') })
      await get().confirmRefinement()
    } catch (error) {
      set({
        refineLoading: false,
        planConfirmed: false,
        refinementConfirmed: false,
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
      diffReady: false,
      generatedDiff: null,
      applyResult: null,
      verificationResult: null,
      diffFileStats: [],
      selectedDiffFilePath: null,
      pendingChangesDrawerDismissedRunId: null,
      pendingChangesDrawerExpanded: true,
      selectedFlowStepId: null,
      selectedActivityId: null,
      runDisposable: null,
    })

    try {
      const run = await client.confirmDebugFix(debugSession.sessionId)
      useChatSessionStore.getState().presentAgentFlow()
      set((current) => ({
        refineLoading: false,
        activeRunId: run.runId,
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
      await client.cleanupDebugInstrumentation(debugSession.sessionId)
      set({
        debugSession: {
          ...debugSession,
          phase: 'complete',
        },
      })
      scheduleChatSessionPersist()
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to clean up debug instrumentation') })
    }
  },

  loadDiff: async (requestedRunId) => {
    const { client, activeRunId, project, editorBuffers, locale } = get()
    const targetRunId = requestedRunId ?? activeRunId
    if (!targetRunId) return
    if (targetRunId !== activeRunId) {
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
      set({
        generatedDiff: { ...generatedDiff, files: enrichedFiles },
        diffFileStats,
        error: null,
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
          error: getStoreMessage(locale, 'diff.notAvailable', { status: runStatus }),
        })
        maybeNotifyDiffReady(targetRunId, 0)
        return
      }
      set({ error: errorMessage(err, 'Failed to load diff') })
      maybeNotifyDiffReady(targetRunId, 0)
    }
  },

  applyCurrentDiff: async () => {
    const { client, project, activeRunId, generatedDiff, editorBuffers, pushToast, locale, selectedNodeId } = get()
    if (!project || !activeRunId) return
    try {
      const applyResult = await client.applyDiff(activeRunId)
      const [graph, tree, currentWork] = await Promise.all([
        client.getProjectGraph(project.projectId),
        client.getSemanticTree(project.projectId),
        client.getCurrentWork(project.projectId),
      ])
      if (
        get().project?.projectId !== project.projectId ||
        get().activeRunId !== activeRunId
      ) return
      const bounceIds = selectedNodeId ? [selectedNodeId] : []
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
          verificationResult: null,
          verificationCommandApproval: null,
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
          conversationCheckpoints: checkpoints,
          messages,
        }
      })
      if (generatedDiff) {
        for (const file of generatedDiff.files) {
          void useFileTimelineStore.getState().refresh(file.path)
        }
      }
      setTimeout(() => set({ bouncingNodeIds: [] }), 600)
      scheduleChatSessionPersist()
    } catch (err) {
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
    const { client, project, applyResult, generatedDiff, editorBuffers, pushToast, locale } = get()
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
      set({
        applyResult: null,
        verificationResult: null,
        verificationCommandApproval: null,
        undoLoading: false,
        currentWork,
        editorBuffers: nextBuffers,
        editorSavedBuffers: nextBuffers,
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
        flowSteps: [],
        flowActions: [],
        flowDelegationEvents: [],
        delegatedRunTraces: {},
        flowTransientTraces: [],
        flowCorrections: [],
        flowStatus: 'running',
        agentFlowSubject: 'run',
        selectedFlowStepId: null,
      selectedActivityId: null,
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
    const { client, project, runDisposable, locale } = get()
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

  saveMcpServer: async () => false,

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
          : result.message ?? getStoreMessage(locale, 'settings.connectionFailed'),
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

  testMcpServer: async (_serverId) => {
    /* MCP removed in pure workbench */
  },

  refreshMcpTools: async (_serverId) => [],

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSelectedModelProfileId: (profileId) => set({ selectedModelProfileId: profileId }),

  selectChatModel: async (profileId) => {
    const { client, project, settings } = get()
    if (!project || !settings) return
    const projectId = project.projectId
    try {
      const updated = await persistDefaultModelProfile(
        client,
        projectId,
        settings,
        profileId,
      )
      if (get().project?.projectId !== projectId) return
      set({ settings: updated, selectedModelProfileId: profileId, error: null })
    } catch (error) {
      if (get().project?.projectId === projectId) {
        reportSettingsMutationFailure(error, 'Failed to select chat model')
      }
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
    set({ githubAuthStatus: { connected: false } })
  },

  refreshGitSyncStatus: async () => {
    /* git sync API removed in pure workbench */
  },

  connectGitHub: async () => {
    set({ githubDeviceAuthPending: null })
  },

  disconnectGitHub: async () => {
    set({ githubAuthStatus: { connected: false } })
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
    const relatedNodeIds =
      chatAnchor?.kind === 'node' ? [chatAnchor.id] : selectedNodeId ? [selectedNodeId] : []
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
    const anchorNodeId = options?.anchorNodeId
    const scope: 'project' | 'node' =
      anchorNodeId || selectedNodeId ? 'node' : 'project'
    const nodeId = anchorNodeId ?? selectedNodeId ?? undefined
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

    const anchorNodeId = options?.anchorNodeId
    const scope: 'project' | 'node' =
      anchorNodeId || selectedNodeId ? 'node' : 'project'
    const nodeId = anchorNodeId ?? selectedNodeId ?? undefined

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
