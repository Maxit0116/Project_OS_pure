import type { ChatSessionHead, ChatSessionRecord } from '@contracts/index'
import { emptyComposerDraft } from '@contracts/index'
import type { Locale } from '../i18n'
import { getStoreMessage } from '../i18n/storeMessages'
import { buildWelcomeMessages } from '../state/chatSessionSync'

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function createRecord(
  partial: Partial<ChatSessionRecord['head']> & {
    messages?: ChatSessionRecord['messages']
    snapshot?: ChatSessionRecord['snapshot']
    draftInput?: string
    draftComposer?: ChatSessionRecord['draftComposer']
  },
): ChatSessionRecord {
  const now = new Date().toISOString()
  const id = partial.id ?? `chat_${crypto.randomUUID()}`
  return {
    version: '0.2.0',
    head: {
      id,
      title: partial.title ?? '',
      createdAt: partial.createdAt ?? now,
      lastUpdatedAt: partial.lastUpdatedAt ?? now,
      chatMode: partial.chatMode ?? 'ask',
      isArchived: partial.isArchived ?? false,
      status: partial.status ?? 'idle',
      ...(partial.subtitle ? { subtitle: partial.subtitle } : {}),
      ...(partial.titleSource ? { titleSource: partial.titleSource } : {}),
      ...(partial.titleGeneratedAt ? { titleGeneratedAt: partial.titleGeneratedAt } : {}),
    },
    messages: partial.messages ?? [],
    ...(partial.draftComposer
      ? { draftComposer: partial.draftComposer }
      : partial.draftInput !== undefined
        ? { draftComposer: emptyComposerDraft(partial.draftInput) }
        : {}),
    ...(partial.snapshot ? { snapshot: partial.snapshot } : {}),
  }
}

export function createSampleChatSessionFixtures(locale: Locale): ChatSessionRecord[] {
  const welcome = buildWelcomeMessages(locale)

  const active = createRecord({
    title: getStoreMessage(locale, 'chat.history.mockActiveTitle'),
    chatMode: 'ask',
    subtitle: 'Node: Login',
    lastUpdatedAt: daysAgo(0),
    messages: [
      ...welcome,
      {
        id: 'msg_mock_user_1',
        role: 'user',
        content: getStoreMessage(locale, 'chat.history.mockActivePrompt'),
        timestamp: daysAgo(0),
      },
      {
        id: 'msg_mock_assistant_1',
        role: 'assistant',
        content: getStoreMessage(locale, 'chat.history.mockActiveReply'),
        format: 'markdown',
        timestamp: daysAgo(0),
      },
    ],
  })

  const yesterday = createRecord({
    title: getStoreMessage(locale, 'chat.history.mockYesterdayTitle'),
    chatMode: 'change',
    createdAt: daysAgo(1),
    lastUpdatedAt: daysAgo(1),
    messages: [
      {
        id: 'msg_mock_user_2',
        role: 'user',
        content: getStoreMessage(locale, 'chat.history.mockYesterdayPrompt'),
        timestamp: daysAgo(1),
      },
    ],
  })

  const awaiting = createRecord({
    title: getStoreMessage(locale, 'chat.history.mockReviewTitle'),
    chatMode: 'change',
    status: 'awaiting_review',
    lastUpdatedAt: daysAgo(0),
    messages: [
      {
        id: 'msg_mock_user_3',
        role: 'user',
        content: getStoreMessage(locale, 'chat.history.mockReviewPrompt'),
        timestamp: daysAgo(0),
      },
    ],
    snapshot: { hasPendingRefinement: true, flowStatus: 'awaiting_review' },
  })

  const archived = createRecord({
    title: getStoreMessage(locale, 'chat.history.mockArchivedTitle'),
    chatMode: 'ask',
    isArchived: true,
    createdAt: daysAgo(10),
    lastUpdatedAt: daysAgo(8),
    messages: welcome,
  })

  const pinned = createRecord({
    title: '',
    titleSource: 'auto',
    chatMode: 'ask',
    status: 'running',
    lastUpdatedAt: daysAgo(2),
    messages: [
      ...welcome,
      {
        id: 'msg_mock_user_pinned',
        role: 'user',
        content: getStoreMessage(locale, 'chat.history.mockActivePrompt'),
        timestamp: daysAgo(2),
      },
    ],
    snapshot: { flowStatus: 'running' },
  })

  return [active, yesterday, awaiting, archived, pinned]
}

export function samplePinnedSessionId(records: ChatSessionRecord[]): string {
  return records[4]!.head.id
}

export function sampleActiveSessionId(records: ChatSessionRecord[]): string {
  return records[0]!.head.id
}

export function headsFromChatSessionRecords(records: ChatSessionRecord[]): ChatSessionHead[] {
  return records.map((record) => record.head)
}
