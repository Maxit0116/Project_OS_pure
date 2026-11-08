import type {
  ChatSessionHead,
  ChatSessionRecord,
  ChatSessionSnapshot,
  ChatSessionStatus,
  ComposerDraft,
} from '@contracts/index'
import {
  emptyComposerDraft,
  resolveChatSessionTitleSource,
} from '@contracts/index'
import type { Locale } from '../i18n'
import { getStoreMessage } from '../i18n/storeMessages'
import type {
  AgentFlowSubject,
  ChatMessage,
  ChatMode,
  LatestAskTrace,
  LatestPlanTrace,
  WorkbenchState,
} from './workbenchStore'

export { deriveChatSessionTitle } from '@contracts/index'

/** Fields chat-session persist helpers actually read (tests may pass a Pick). */
export type ChatSessionSyncState = Pick<
  WorkbenchState,
  | 'messages'
  | 'chatMode'
  | 'composerDraft'
  | 'globalAgentActive'
  | 'selectedFilePath'
  | 'selectedNodeId'
  | 'pendingFileOwnerChoice'
  | 'fileScopeError'
  | 'graph'
  | 'flowStatus'
  | 'pendingRefinement'
  | 'refinementConfirmed'
  | 'refineLoading'
  | 'activeRunId'
  | 'latestAskTrace'
  | 'pendingIntent'
  | 'pendingPlan'
  | 'planConfirmed'
  | 'latestPlanTrace'
  | 'debugSession'
  | 'agentFlowSubject'
  | 'activeCustomModeSkillId'
  | 'customModePreviousChatMode'
  | 'activeAgentDefinitionId'
  | 'conversationCheckpoints'
  | 'latestContextAssembly'
>

export function resolvePersistedChatSessionTitle(
  existingHead: ChatSessionHead | undefined,
): string {
  if (!existingHead) return ''
  if (resolveChatSessionTitleSource(existingHead.titleSource) === 'manual') {
    return existingHead.title
  }
  return existingHead.title.trim()
}

export function deriveChatSessionSubtitle(state: ChatSessionSyncState): string | undefined {
  if (
    state.globalAgentActive ||
    (!state.selectedNodeId &&
      !state.selectedFilePath &&
      !state.pendingFileOwnerChoice &&
      !state.fileScopeError)
  ) {
    return 'Global'
  }
  if (state.selectedFilePath) {
    const fileName = state.selectedFilePath.split('/').pop()
    return fileName ? `File: ${fileName}` : undefined
  }
  if (state.selectedNodeId && state.graph) {
    const node = state.graph.nodes.find((item) => item.id === state.selectedNodeId)
    if (node?.name) return `Node: ${node.name}`
  }
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant')
  if (!lastAssistant?.content.trim()) return undefined
  const summary = lastAssistant.content.trim().replace(/\s+/g, ' ')
  return summary.length <= 60 ? summary : `${summary.slice(0, 59)}…`
}

export function deriveChatSessionStatus(state: ChatSessionSyncState): ChatSessionStatus {
  if (state.flowStatus === 'awaiting_review') return 'awaiting_review'
  if (state.pendingIntent?.status === 'draft') return 'awaiting_review'
  if (state.pendingRefinement && !state.refinementConfirmed) return 'awaiting_review'
  if (state.pendingPlan && !state.planConfirmed) return 'awaiting_review'
  // An active run id stays set after the run ends (the review and undo work from it), so it is not
  // evidence that the run is going: a finished run was listed as running for good.
  if (state.flowStatus === 'running' || state.refineLoading) return 'running'
  if (state.flowStatus === 'error' || state.flowStatus === 'interrupted') return 'error'
  return 'idle'
}

export function buildChatSessionSnapshot(state: ChatSessionSyncState): ChatSessionSnapshot {
  return {
    pendingRefinement: state.pendingRefinement,
    refinementConfirmed: state.refinementConfirmed,
    latestAskTrace: state.latestAskTrace,
    pendingPlan: state.pendingPlan,
    planConfirmed: state.planConfirmed,
    latestPlanTrace: state.latestPlanTrace,
    debugSession: state.debugSession,
    agentFlowSubject: state.agentFlowSubject,
    flowStatus: deriveChatSessionStatus(state),
    activeRunId: state.activeRunId,
    hasPendingRefinement: Boolean(state.pendingRefinement && !state.refinementConfirmed),
    hasPendingPlan: Boolean(state.pendingPlan && !state.planConfirmed),
    activeCustomModeSkillId: state.activeCustomModeSkillId,
    customModePreviousChatMode: state.customModePreviousChatMode,
    activeAgentDefinitionId: state.activeAgentDefinitionId,
    conversationCheckpoints: state.conversationCheckpoints,
    ...(state.latestContextAssembly
      ? { latestContextAssembly: state.latestContextAssembly }
      : {}),
    // An intent card waiting for approval was dropped when the person left the conversation.
    ...(state.pendingIntent?.status === 'draft' ? { pendingIntent: state.pendingIntent } : {}),
  }
}

export function buildChatSessionRecord(
  state: ChatSessionSyncState,
  sessionId: string,
  existingHead: ChatSessionHead | undefined,
): ChatSessionRecord {
  const now = new Date().toISOString()
  const title = resolvePersistedChatSessionTitle(existingHead)
  const head: ChatSessionHead = {
    id: sessionId,
    title,
    createdAt: existingHead?.createdAt ?? now,
    lastUpdatedAt: now,
    chatMode: state.chatMode,
    isArchived: existingHead?.isArchived ?? false,
    status: deriveChatSessionStatus(state),
    subtitle: deriveChatSessionSubtitle(state),
    ...(existingHead?.titleSource ? { titleSource: existingHead.titleSource } : {}),
    ...(existingHead?.titleGeneratedAt ? { titleGeneratedAt: existingHead.titleGeneratedAt } : {}),
    ...(existingHead?.parentSessionId ? { parentSessionId: existingHead.parentSessionId } : {}),
    ...(existingHead?.forkMessageId ? { forkMessageId: existingHead.forkMessageId } : {}),
    ...(existingHead?.classification ? { classification: existingHead.classification } : {}),
    ...(existingHead?.classificationSource
      ? { classificationSource: existingHead.classificationSource }
      : {}),
    ...(existingHead?.responsibility ? { responsibility: existingHead.responsibility } : {}),
  }
  return {
    version: '0.2.0',
    head,
    messages: state.messages,
    draftComposer: state.composerDraft,
    snapshot: buildChatSessionSnapshot(state),
  }
}

export function buildWelcomeMessages(locale: Locale): ChatMessage[] {
  return [
    {
      id: `msg_${crypto.randomUUID()}`,
      role: 'assistant',
      content: getStoreMessage(locale, 'chat.welcomeMessage'),
      timestamp: new Date().toISOString(),
    },
  ]
}

export function buildResetMessages(locale: Locale): ChatMessage[] {
  return [
    {
      id: `msg_${crypto.randomUUID()}`,
      role: 'assistant',
      content: getStoreMessage(locale, 'chat.resetMessage'),
      timestamp: new Date().toISOString(),
    },
  ]
}

export interface HydratedChatSessionState {
  messages: ChatMessage[]
  composerDraft: ComposerDraft
  chatMode: ChatMode
  pendingRefinement: WorkbenchState['pendingRefinement']
  refinementConfirmed: boolean
  pendingPlan: WorkbenchState['pendingPlan']
  planConfirmed: boolean
  debugSession: WorkbenchState['debugSession']
  latestAskTrace: LatestAskTrace | null
  latestPlanTrace: LatestPlanTrace | null
  agentFlowSubject: AgentFlowSubject
  flowStatus: WorkbenchState['flowStatus']
  activeRunId: string | null
  activeCustomModeSkillId: string | null
  customModePreviousChatMode: ChatMode | null
  activeAgentDefinitionId: string | null
  conversationCheckpoints: WorkbenchState['conversationCheckpoints']
  latestContextAssembly: WorkbenchState['latestContextAssembly']
  pendingIntent: WorkbenchState['pendingIntent']
}

/**
 * Persistable session modes include `team_memory`; the workbench chat surface
 * still treats that as Ask (existing hydrate policy). Do not invent a new rail
 * mode here — report first if product wants a distinct team_memory UI.
 */
function toWorkbenchChatMode(
  mode: ChatSessionRecord['head']['chatMode'] | ChatSessionRecord['messages'][number]['chatMode'],
): ChatMode | undefined {
  if (!mode || mode === 'team_memory') {
    return mode === 'team_memory' ? 'ask' : undefined
  }
  return mode
}

function toWorkbenchChatMessage(
  message: ChatSessionRecord['messages'][number],
): ChatMessage {
  const chatMode = toWorkbenchChatMode(message.chatMode)
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.format ? { format: message.format } : {}),
    ...(message.notice ? { notice: message.notice } : {}),
    ...(message.attachments ? { attachments: message.attachments } : {}),
    ...(message.invokedSkillId ? { invokedSkillId: message.invokedSkillId } : {}),
    ...(message.explorationTrace ? { explorationTrace: message.explorationTrace } : {}),
    ...(message.retrievalSummary ? { retrievalSummary: message.retrievalSummary } : {}),
    ...(message.checkpointId ? { checkpointId: message.checkpointId } : {}),
    ...(chatMode ? { chatMode } : {}),
  }
}

export function hydrateChatSessionState(record: ChatSessionRecord): HydratedChatSessionState {
  const snapshot = record.snapshot
  const previousMode = snapshot?.customModePreviousChatMode
  const headMode = toWorkbenchChatMode(record.head.chatMode) ?? 'ask'
  return {
    messages: record.messages.map(toWorkbenchChatMessage),
    composerDraft: record.draftComposer ?? emptyComposerDraft(record.draftInput ?? ''),
    chatMode: headMode,
    pendingRefinement: snapshot?.pendingRefinement ?? null,
    refinementConfirmed: snapshot?.refinementConfirmed ?? false,
    pendingPlan: snapshot?.pendingPlan ?? null,
    planConfirmed: snapshot?.planConfirmed ?? false,
    debugSession: snapshot?.debugSession ?? null,
    latestAskTrace: snapshot?.latestAskTrace ?? null,
    latestPlanTrace: snapshot?.latestPlanTrace ?? null,
    agentFlowSubject: snapshot?.agentFlowSubject ?? 'run',
    flowStatus: snapshot?.flowStatus ?? record.head.status ?? 'idle',
    activeRunId: snapshot?.activeRunId ?? null,
    activeCustomModeSkillId: snapshot?.activeCustomModeSkillId ?? null,
    customModePreviousChatMode:
      previousMode && previousMode !== 'team_memory' ? previousMode : null,
    activeAgentDefinitionId: snapshot?.activeAgentDefinitionId ?? null,
    conversationCheckpoints: snapshot?.conversationCheckpoints ?? [],
    latestContextAssembly: snapshot?.latestContextAssembly ?? null,
    pendingIntent: snapshot?.pendingIntent?.status === 'draft' ? snapshot.pendingIntent : null,
  }
}
