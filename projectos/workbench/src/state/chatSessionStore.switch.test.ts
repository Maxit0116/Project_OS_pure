import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi, RequestIntent, RunDecision } from '@contracts/index'
import { canSubmitAgentPrompt, useWorkbenchStore } from './workbenchStore'
import { useChatSessionStore } from './chatSessionStore'
import { buildChatSessionSnapshot, deriveChatSessionStatus } from './chatSessionSync'

/**
 * What belongs to a conversation must not follow the person into another one. Found live: after an
 * Agent request, a new Plan conversation had a dead Send button (the intent card it was waiting on
 * is only drawn in Agent mode) and showed a question card that an earlier run had asked.
 */

const now = '2026-01-01T00:00:00.000Z'

function record(id: string, chatMode: 'plan' | 'change', snapshot: Record<string, unknown> = {}) {
  return {
    version: '0.2.0',
    head: { id, title: id, createdAt: now, lastUpdatedAt: now, chatMode, isArchived: false, status: 'idle' },
    messages: [],
    snapshot: { flowStatus: 'idle', ...snapshot },
  }
}

const staleIntent = { id: 'intent_old', status: 'draft', revision: 1 } as unknown as RequestIntent
const staleDecision = {
  version: '0.1.0',
  id: 'decision_old',
  projectId: 'proj_1',
  rootRunId: 'run_old',
  runId: 'run_old',
  kind: 'clarification',
  question: 'Which column?',
  options: [{ id: 'option_1', label: 'A' }, { id: 'decline', label: 'Let Agent decide' }],
  status: 'pending',
  revision: 1,
  createdAt: now,
} as unknown as RunDecision

function clientFor(records: Record<string, ReturnType<typeof record>>, extra: Record<string, unknown> = {}) {
  return {
    getChatSession: vi.fn(async (_projectId: string, id: string) => records[id] ?? null),
    upsertChatSession: vi.fn(async () => undefined),
    setLastActiveChatSession: vi.fn(async () => undefined),
    getChatSessionIndex: vi.fn(async () => ({ heads: [], pinnedIds: [], lastActiveId: null })),
    listRunDecisions: vi.fn(async () => []),
    deleteChatSession: vi.fn(async () => undefined),
    ...extra,
  } as unknown as ProjectOSApi
}

describe('leaving a conversation', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      project: { projectId: 'proj_1', name: 'Test', rootPath: '/tmp/proj', createdAt: now, updatedAt: now } as never,
      chatMode: 'change',
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
      pendingIntent: staleIntent,
      runDecisions: [staleDecision],
      decisionRootRunId: 'run_old',
      focusedDecisionId: 'decision_old',
      decisionResolvingIds: ['decision_old'],
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
    })
    useChatSessionStore.setState({ activeSessionId: 'chat_agent', heads: [], historyOpen: false })
  })

  it('does not carry its pending intent into the next one, which would hold Agent mode there', async () => {
    useWorkbenchStore.setState({ client: clientFor({ chat_agent2: record('chat_agent2', 'change') }) })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(false)

    await useChatSessionStore.getState().switchSession('chat_agent2')

    const state = useWorkbenchStore.getState()
    expect(state.chatMode).toBe('change')
    expect(state.pendingIntent).toBeNull()
    expect(canSubmitAgentPrompt(state)).toBe(true)
  })

  it('does not show a question card that an earlier conversation\'s run asked', async () => {
    useWorkbenchStore.setState({ client: clientFor({ chat_plan: record('chat_plan', 'plan') }) })

    await useChatSessionStore.getState().switchSession('chat_plan')

    const state = useWorkbenchStore.getState()
    expect(state.runDecisions).toEqual([])
    expect(state.focusedDecisionId).toBeNull()
    expect(state.decisionRootRunId).toBeNull()
    expect(state.decisionResolvingIds).toEqual([])
  })

  it.each([
    ['complete', 'complete'],
    ['awaiting_review', 'awaiting_review'],
    ['interrupted', 'interrupted'],
    ['running', 'running'],
  ] as const)('reopens a conversation whose run is %s as %s, not as running', async (runStatus, expected) => {
    // Observed on the packaged app: a run that had finished and applied reopened after a restart with
    // "running" and a Stop button, because replaying its events starts at run_started and the saved
    // status was stale.
    const getAgentRun = vi.fn(async () => ({ runId: 'run_done', status: runStatus }))
    const getAgentRunEvents = vi.fn(async () => [
      { eventId: 'evt_1', runId: 'run_done', timestamp: now, type: 'run_started' },
    ])
    useWorkbenchStore.setState({
      client: clientFor(
        { chat_done: record('chat_done', 'change', { activeRunId: 'run_done', flowStatus: 'running' }) },
        { getAgentRun, getAgentRunEvents },
      ),
    })

    await useChatSessionStore.getState().switchSession('chat_done')
    await vi.waitFor(() => expect(getAgentRunEvents).toHaveBeenCalled())
    await vi.waitFor(() => expect(useWorkbenchStore.getState().flowStatus).toBe(expected))
  })

  it('brings back an intent card the conversation was waiting on, and not one already approved', async () => {
    // Leaving an Agent conversation with its card unanswered used to lose the card for good.
    const waiting = { ...staleIntent, id: 'intent_waiting' }
    useWorkbenchStore.setState({
      client: clientFor({
        chat_waiting: {
          ...record('chat_waiting', 'change', { pendingIntent: waiting }),
          messages: [{ id: 'msg_1', role: 'user', content: 'Add a count query', timestamp: now }],
        },
        chat_approved: record('chat_approved', 'change', { pendingIntent: { ...waiting, status: 'approved' } }),
      }),
    })

    await useChatSessionStore.getState().switchSession('chat_waiting')
    expect(useWorkbenchStore.getState().pendingIntent).toEqual(waiting)
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(false)

    await useChatSessionStore.getState().switchSession('chat_approved')
    expect(useWorkbenchStore.getState().pendingIntent).toBeNull()
  })

  it('saves an unanswered intent card with the conversation, and lists the conversation as waiting', () => {
    const state = { ...useWorkbenchStore.getState(), pendingIntent: staleIntent, flowStatus: 'idle' as const }
    expect(buildChatSessionSnapshot(state).pendingIntent).toEqual(staleIntent)
    expect(deriveChatSessionStatus(state)).toBe('awaiting_review')
    const approved = { ...state, pendingIntent: { ...staleIntent, status: 'approved' } as RequestIntent }
    expect(buildChatSessionSnapshot(approved)).not.toHaveProperty('pendingIntent')
  })

  it('brings back the questions of the run a conversation is still in', async () => {
    const getAgentRun = vi.fn(async () => ({ runId: 'run_new_leaf', rootRunId: 'run_new', status: 'running' }))
    const listRunDecisions = vi.fn(async () => [{ ...staleDecision, id: 'decision_new', rootRunId: 'run_new' }])
    useWorkbenchStore.setState({
      client: clientFor(
        { chat_run: record('chat_run', 'change', { activeRunId: 'run_new_leaf', flowStatus: 'running' }) },
        { getAgentRun, getAgentRunEvents: vi.fn(async () => []), listRunDecisions },
      ),
    })

    await useChatSessionStore.getState().switchSession('chat_run')
    await vi.waitFor(() => expect(useWorkbenchStore.getState().runDecisions.map((item) => item.id)).toEqual(['decision_new']))

    expect(listRunDecisions).toHaveBeenCalledWith('proj_1', 'run_new')
    expect(useWorkbenchStore.getState().pendingIntent).toBeNull()
  })
})

describe('persist must not revert the active session after a fork switch', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      project: { projectId: 'proj_1', name: 'Test', rootPath: '/tmp/proj', createdAt: now, updatedAt: now } as never,
      chatMode: 'ask',
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
      pendingIntent: null,
      runDecisions: [],
      decisionRootRunId: null,
      focusedDecisionId: null,
      decisionResolvingIds: [],
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
      messages: [],
    })
    useChatSessionStore.setState({
      activeSessionId: 'chat_parent',
      heads: [
        {
          id: 'chat_parent',
          title: 'Parent',
          createdAt: now,
          lastUpdatedAt: now,
          chatMode: 'ask',
          isArchived: false,
          status: 'idle',
        },
      ],
      historyOpen: false,
    })
  })

  it('keeps the child active when a parent persist finishes after switchSession', async () => {
    let resolveParentUpsert: (() => void) | undefined
    const parentUpsertGate = new Promise<void>((resolve) => {
      resolveParentUpsert = resolve
    })

    const records = {
      chat_parent: record('chat_parent', 'ask'),
      chat_child: record('chat_child', 'ask'),
    }
    const upsertChatSession = vi.fn(async (_projectId: string, next: { head: { id: string } }) => {
      if (next.head.id === 'chat_parent') await parentUpsertGate
    })
    const setLastActiveChatSession = vi.fn(async () => undefined)
    const getChatSessionIndex = vi.fn(async () => ({
      heads: [
        records.chat_parent.head,
        { ...records.chat_child.head, parentSessionId: 'chat_parent' },
      ],
      pinnedIds: [],
      lastActiveId: 'chat_child',
    }))

    useWorkbenchStore.setState({
      client: clientFor(records, {
        upsertChatSession,
        setLastActiveChatSession,
        getChatSessionIndex,
      }),
    })

    // Stale persist for the parent starts while still active.
    const stalePersist = useChatSessionStore.getState().persistActiveSession()
    // Switch to the forked child before that persist settles (also persists parent).
    const switchPromise = useChatSessionStore.getState().switchSession('chat_child')

    await vi.waitFor(() => expect(upsertChatSession.mock.calls.length).toBeGreaterThanOrEqual(2))
    resolveParentUpsert?.()
    await switchPromise

    expect(useChatSessionStore.getState().activeSessionId).toBe('chat_child')

    await stalePersist
    expect(useChatSessionStore.getState().activeSessionId).toBe('chat_child')
  })

  it('activates the forked child in the same turn the card appears', async () => {
    const parentHead = {
      id: 'chat_parent',
      title: 'Parent',
      createdAt: now,
      lastUpdatedAt: now,
      chatMode: 'ask' as const,
      isArchived: false,
      status: 'idle' as const,
      classification: 'topic' as const,
      classificationSource: 'auto' as const,
    }
    const childRecord = {
      ...record('chat_child', 'ask'),
      head: {
        ...record('chat_child', 'ask').head,
        parentSessionId: 'chat_parent',
        classification: 'topic' as const,
        classificationSource: 'auto' as const,
      },
      inheritedDigest: {
        responsibility: 'Continue from parent',
        decisions: [],
        openQuestions: [],
        refs: [],
        updatedAt: now,
        throughMessageId: 'm1',
      },
    }
    const forkChatSession = vi.fn(async () => childRecord)
    const upsertChatSession = vi.fn(async (_projectId: string, next: typeof childRecord) => next)
    const setLastActiveChatSession = vi.fn(async () => undefined)
    const getChatSessionIndex = vi.fn(async () => ({
      heads: [parentHead, childRecord.head],
      pinnedIds: [],
      lastActiveId: 'chat_child',
    }))

    useWorkbenchStore.setState({
      client: clientFor(
        { chat_parent: record('chat_parent', 'ask'), chat_child: childRecord },
        { forkChatSession, upsertChatSession, setLastActiveChatSession, getChatSessionIndex },
      ),
      messages: [
        { id: 'm1', role: 'user', content: 'Parent prompt', timestamp: now },
      ],
    })
    useChatSessionStore.setState({
      activeSessionId: 'chat_parent',
      heads: [parentHead],
      inheritedDigest: null,
    })

    const childId = await useChatSessionStore.getState().forkSession('chat_parent')
    expect(childId).toBe('chat_child')
    expect(useChatSessionStore.getState().activeSessionId).toBe('chat_child')
    expect(useChatSessionStore.getState().inheritedDigest?.responsibility).toBe(
      'Continue from parent',
    )
    expect(useWorkbenchStore.getState().messages).toEqual([])
    expect(setLastActiveChatSession).toHaveBeenCalledWith('proj_1', 'chat_child')
  })
})
