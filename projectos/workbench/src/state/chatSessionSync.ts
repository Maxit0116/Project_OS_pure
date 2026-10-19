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

export function resolvePersistedChatSessionTitle(
  existingHead: ChatSessionHead | undefined,
): string {
  if (!existingHead) return ''
  if (resolveChatSessionTitleSource(existingHead.titleSource) === 'manual') {
    return existingHead.title
  }
  return existingHead.title.trim()
}

export function deriveChatSessionSubtitle(state: WorkbenchState): string | undefined {
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

export function deriveChatSessionStatus(state: WorkbenchState): ChatSessionStatus {
  if (state.flowStatus === 'awaiting_review') return 'awaiting_review'
  if (state.pendingRefinement && !state.refinementConfirmed) return 'awaiting_review'
  if (state.pendingPlan && !state.planConfirmed) return 'awaiting_review'
  if (state.flowStatus === 'running' || state.refineLoading || state.activeRunId) return 'running'
  if (state.flowStatus === 'error') return 'error'
  return 'idle'
}

export function buildChatSessionSnapshot(state: WorkbenchState): ChatSessionSnapshot {
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
    conversationCheckpoints: state.conversationCheckpoints,
  }
}

export function buildChatSessionRecord(
  state: WorkbenchState,
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
  conversationCheckpoints: WorkbenchState['conversationCheckpoints']
}

export function hydrateChatSessionState(record: ChatSessionRecord): HydratedChatSessionState {
  const snapshot = record.snapshot
  const previousMode = snapshot?.customModePreviousChatMode
  return {
    messages: record.messages,
    composerDraft: record.draftComposer ?? emptyComposerDraft(record.draftInput ?? ''),
    chatMode: record.head.chatMode === 'team_memory' ? 'ask' : record.head.chatMode,
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
    conversationCheckpoints: snapshot?.conversationCheckpoints ?? [],
  }
}
