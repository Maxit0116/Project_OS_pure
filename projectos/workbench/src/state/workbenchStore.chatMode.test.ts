import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'
import { useChatSessionStore } from './chatSessionStore'

describe('workbenchStore chat mode M0', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      project: {
        projectId: 'proj_1',
        name: 'Test',
        rootPath: '/tmp/proj',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as never,
      chatMode: 'ask',
      chatModeSwitch: 'new_session',
      composerDraft: {
        text: 'keep me',
        attachments: [],
      },
      pendingPlan: {
        version: '0.1.0',
        id: 'plan_old',
        projectId: 'proj_1',
        scope: { kind: 'global' },
        objective: 'old',
        steps: [],
        todos: [],
        ambiguities: [],
        rationale: 'x',
        status: 'ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingRefinement: { id: 'ref_old' } as never,
      debugSession: { sessionId: 'debug_old' } as never,
      flowStatus: 'idle',
      activeRunId: null,
      refineLoading: false,
      locale: 'en',
      toasts: [],
    })
  })

  it('same_session preference only flips chatMode and keeps pending artifacts', async () => {
    useWorkbenchStore.setState({ chatModeSwitch: 'same_session' })
    await useWorkbenchStore.getState().setChatMode('change')
    const state = useWorkbenchStore.getState()
    expect(state.chatMode).toBe('change')
    expect(state.pendingPlan?.id).toBe('plan_old')
    expect(state.pendingRefinement).toBeTruthy()
    expect(state.debugSession).toBeTruthy()
  })

  it('new_session preference creates a session and clears pending mode artifacts', async () => {
    const createSession = vi.fn(async () => {
      useWorkbenchStore.setState({
        chatMode: 'plan',
        pendingPlan: null,
        pendingRefinement: null,
        debugSession: null,
        messages: [],
        composerDraft: { text: 'keep me', attachments: [] },
      })
      return 'chat_new'
    })
    useChatSessionStore.setState({
      createSession,
    } as never)

    await useWorkbenchStore.getState().setChatMode('plan')

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMode: 'plan',
        draftInput: 'keep me',
        seedWelcome: false,
        activate: true,
      }),
    )
    const state = useWorkbenchStore.getState()
    expect(state.chatMode).toBe('plan')
    expect(state.pendingPlan).toBeNull()
    expect(state.pendingRefinement).toBeNull()
    expect(state.debugSession).toBeNull()
  })

  it('stopAgentRun disposes the stream and calls cancelAgentRun', async () => {
    const dispose = vi.fn()
    const cancelAgentRun = vi.fn(async () => ({
      runId: 'run_1',
      projectId: 'proj_1',
      kind: 'feature_change' as const,
      status: 'cancelled' as const,
      relatedNodeIds: [],
      relatedFiles: [],
      scope: { kind: 'global' as const },
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    }))
    useWorkbenchStore.setState({
      client: { cancelAgentRun } as unknown as ProjectOSApi,
      activeRunId: 'run_1',
      flowStatus: 'running',
      runDisposable: { dispose },
      refineLoading: true,
    })

    await useWorkbenchStore.getState().stopAgentRun()

    expect(dispose).toHaveBeenCalledOnce()
    expect(cancelAgentRun).toHaveBeenCalledWith('run_1')
    expect(useWorkbenchStore.getState().flowStatus).toBe('idle')
    expect(useWorkbenchStore.getState().activeRunId).toBeNull()
    expect(useWorkbenchStore.getState().refineLoading).toBe(false)
  })

  it('isolate:false flips mode without creating a session', async () => {
    const createSession = vi.fn(async () => 'chat_x')
    useChatSessionStore.setState({ createSession } as never)
    useWorkbenchStore.setState({ chatModeSwitch: 'new_session' })

    await useWorkbenchStore.getState().setChatMode('debug', { isolate: false })

    expect(createSession).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().chatMode).toBe('debug')
  })
})
