import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeLoopGraphDocument } from '@contracts/index'
import { useLoopGraphStore } from './loopGraphStore'
import { useWorkbenchStore } from './workbenchStore'

const baseDoc = normalizeLoopGraphDocument({
  version: '0.1.0',
  id: 'loop_store',
  projectId: 'proj',
  title: 'Store loop',
  draft: { revision: 0, graphPrompt: '', nodes: [], edges: [] },
  approvedSpecs: [],
  instances: [],
  linkedSessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('loopGraphStore authoring actions', () => {
  beforeEach(() => {
    useLoopGraphStore.getState().clear()
    useLoopGraphStore.setState({
      document: {
        ...baseDoc,
        composerMode: 'ask',
        draftGoalContext: {
          goal: 'Ship login',
          constraints: [],
          doneWhen: [],
          outOfScope: [],
          openQuestions: [{ id: 'q1', question: 'Done when?' }],
          status: 'draft',
          revision: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          sourceThreadLength: 1,
        },
      },
      activeLoopId: 'loop_store',
      composerDraft: 'more detail',
      composerSheet: 'none',
      authoringBusy: false,
      error: null,
    })
  })

  it('gates Ask send while clarifying questions are unanswered', async () => {
    const send = vi.fn()
    useWorkbenchStore.setState({
      client: { sendLoopAuthoringTurn: send } as never,
      project: { projectId: 'proj' } as never,
    })

    await useLoopGraphStore.getState().sendAuthoringTurn()
    expect(send).not.toHaveBeenCalled()
    expect(useLoopGraphStore.getState().error).toMatch(/clarifying/i)
  })

  it('toggles bookmark sheets mutually exclusively', () => {
    useLoopGraphStore.getState().toggleComposerSheet('flow')
    expect(useLoopGraphStore.getState().composerSheet).toBe('flow')
    useLoopGraphStore.getState().toggleComposerSheet('context')
    expect(useLoopGraphStore.getState().composerSheet).toBe('context')
    useLoopGraphStore.getState().toggleComposerSheet('clarify')
    expect(useLoopGraphStore.getState().composerSheet).toBe('clarify')
    useLoopGraphStore.getState().toggleComposerSheet('clarify')
    expect(useLoopGraphStore.getState().composerSheet).toBe('none')
    useLoopGraphStore.getState().setComposerDraft('hello')
    expect(useLoopGraphStore.getState().composerDraft).toBe('hello')
  })

  it('opens the clarifications sheet after an Ask turn that needs answers', async () => {
    const send = vi.fn(async () =>
      normalizeLoopGraphDocument({
        ...baseDoc,
        composerMode: 'ask',
        draftGoalContext: {
          goal: 'Ship login',
          constraints: [],
          doneWhen: [],
          outOfScope: [],
          openQuestions: [{ id: 'q1', question: 'Done when?' }],
          status: 'draft',
          revision: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          sourceThreadLength: 1,
        },
      }),
    )
    useLoopGraphStore.setState({
      document: { ...baseDoc, composerMode: 'ask', draftGoalContext: undefined },
      composerDraft: 'Ship login',
      composerSheet: 'none',
    })
    useWorkbenchStore.setState({
      client: {
        sendLoopAuthoringTurn: send,
        listLoopGraphs: vi.fn(async () => []),
      } as never,
      project: { projectId: 'proj' } as never,
    })

    await useLoopGraphStore.getState().sendAuthoringTurn()
    expect(send).toHaveBeenCalled()
    expect(useLoopGraphStore.getState().composerSheet).toBe('clarify')
  })

  it('restores the previous prompt when canceling clarifications', async () => {
    const cancel = vi.fn(async () =>
      normalizeLoopGraphDocument({
        ...baseDoc,
        composerMode: 'ask',
        authoringThread: [],
        authoringTrace: { status: 'idle', steps: [] },
      }),
    )
    useLoopGraphStore.setState({
      document: {
        ...baseDoc,
        composerMode: 'ask',
        draftGoalContext: {
          goal: 'Ship login',
          constraints: [],
          doneWhen: [],
          outOfScope: [],
          openQuestions: [{ id: 'q1', question: 'Done when?' }],
          status: 'draft',
          revision: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          sourceThreadLength: 1,
        },
        authoringThread: [
          {
            id: 'msg_user',
            role: 'user',
            content: 'Ship login with OAuth',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'msg_assistant',
            role: 'assistant',
            content: 'Please answer clarifying questions',
            timestamp: '2026-01-01T00:00:01.000Z',
          },
        ],
      },
      composerDraft: '',
      composerSheet: 'context',
    })
    useWorkbenchStore.setState({
      client: { cancelLoopGoalClarification: cancel } as never,
      project: { projectId: 'proj' } as never,
    })

    await useLoopGraphStore.getState().cancelGoalClarification()

    expect(cancel).toHaveBeenCalledWith('proj', 'loop_store')
    expect(useLoopGraphStore.getState().composerDraft).toBe('Ship login with OAuth')
    expect(useLoopGraphStore.getState().composerSheet).toBe('none')
    expect(useLoopGraphStore.getState().document?.draftGoalContext).toBeUndefined()
  })
})
