import { describe, expect, it } from 'vitest'
import { deriveChatSessionTitle, emptyComposerDraft } from '@contracts/index'
import {
  buildChatSessionRecord,
  deriveChatSessionStatus,
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

describe('the status a conversation is listed with', () => {
  const status = (over: Record<string, unknown>) =>
    deriveChatSessionStatus({ ...baseState, ...over } as never)

  it('is not running for a run that has finished, though its run id is still set', () => {
    expect(status({ activeRunId: 'run_1', flowStatus: 'complete' })).toBe('idle')
  })

  it('is running while the run is, or a request is being prepared', () => {
    expect(status({ activeRunId: 'run_1', flowStatus: 'running' })).toBe('running')
    expect(status({ refineLoading: true })).toBe('running')
  })
})

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

  it('preserves lastUpdatedAt when touchActivity is false', () => {
    const record = buildChatSessionRecord(
      baseState,
      'chat_1',
      {
        id: 'chat_1',
        title: 'Quiet session',
        createdAt: '2026-08-02T00:00:00.000Z',
        lastUpdatedAt: '2026-08-02T00:00:00.000Z',
        chatMode: 'ask',
        isArchived: false,
        status: 'idle',
      },
      { touchActivity: false },
    )
    expect(record.head.lastUpdatedAt).toBe('2026-08-02T00:00:00.000Z')
  })

  it('bumps lastUpdatedAt when touchActivity is true', () => {
    const before = Date.now()
    const record = buildChatSessionRecord(
      baseState,
      'chat_1',
      {
        id: 'chat_1',
        title: 'Active session',
        createdAt: '2026-08-02T00:00:00.000Z',
        lastUpdatedAt: '2026-08-02T00:00:00.000Z',
        chatMode: 'ask',
        isArchived: false,
        status: 'idle',
      },
      { touchActivity: true },
    )
    expect(Date.parse(record.head.lastUpdatedAt)).toBeGreaterThanOrEqual(before)
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
