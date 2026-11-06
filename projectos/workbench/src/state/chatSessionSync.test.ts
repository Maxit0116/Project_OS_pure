import { describe, expect, it } from 'vitest'
import { deriveChatSessionTitle, emptyComposerDraft } from '@contracts/index'
import {
  buildChatSessionRecord,
  resolvePersistedChatSessionTitle,
  type ChatSessionSyncState,
} from './chatSessionSync'

const baseState: ChatSessionSyncState = {
  messages: [],
  chatMode: 'ask',
  composerDraft: emptyComposerDraft(),
  globalAgentActive: false,
  selectedFilePath: null,
  selectedNodeId: null,
  pendingFileOwnerChoice: null,
  fileScopeError: null,
  graph: null,
  flowStatus: 'idle',
  pendingRefinement: null,
  refinementConfirmed: false,
  refineLoading: false,
  activeRunId: null,
  latestAskTrace: null,
  pendingPlan: null,
  planConfirmed: false,
  latestPlanTrace: null,
  debugSession: null,
  agentFlowSubject: 'run',
  activeCustomModeSkillId: null,
  customModePreviousChatMode: null,
  activeAgentDefinitionId: null,
  conversationCheckpoints: [],
  latestContextAssembly: null,
}

describe('chatSessionSync', () => {
  it('derives title from first user message', () => {
    const title = deriveChatSessionTitle(
      [
        {
          id: '1',
          role: 'assistant',
          content: 'Welcome',
          timestamp: '2026-08-02T00:00:00.000Z',
        },
        {
          id: '2',
          role: 'user',
          content: '  Explain the login flow  ',
          timestamp: '2026-08-02T00:00:01.000Z',
        },
      ],
      'Untitled',
    )
    expect(title).toBe('Explain the login flow')
  })

  it('does not persist untitled fallback into session title', () => {
    const record = buildChatSessionRecord(
      {
        ...baseState,
        messages: [
          {
            id: '1',
            role: 'assistant',
            content: 'Welcome',
            timestamp: '2026-08-02T00:00:00.000Z',
          },
        ],
      },
      'chat_1',
      undefined,
    )
    expect(record.head.title).toBe('')
  })

  it('keeps manual titles on persist', () => {
    const record = buildChatSessionRecord(
      baseState,
      'chat_1',
      {
        id: 'chat_1',
        title: 'Pinned topic',
        titleSource: 'manual',
        createdAt: '2026-08-02T00:00:00.000Z',
        lastUpdatedAt: '2026-08-02T00:00:00.000Z',
        chatMode: 'ask',
        isArchived: false,
        status: 'idle',
      },
    )
    expect(record.head.title).toBe('Pinned topic')
    expect(record.head.titleSource).toBe('manual')
  })

  it('resolvePersistedChatSessionTitle preserves manual titles', () => {
    expect(
      resolvePersistedChatSessionTitle({
        id: 'chat_1',
        title: 'Pinned topic',
        titleSource: 'manual',
        createdAt: '2026-08-02T00:00:00.000Z',
        lastUpdatedAt: '2026-08-02T00:00:00.000Z',
        chatMode: 'ask',
        isArchived: false,
        status: 'idle',
      }),
    ).toBe('Pinned topic')
  })
})
