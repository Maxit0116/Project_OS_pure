import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { normalizeLoopGraphDocument } from '@contracts/index'

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    ts: (key: string) => key,
  }),
}))

vi.mock('../../state/loopGraphStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/loopGraphStore')>()
  return {
    ...actual,
    useLoopGraphStore: vi.fn(),
  }
})

import { useLoopGraphStore } from '../../state/loopGraphStore'
import LoopGoalComposer from './LoopGoalComposer'

const mockedUseLoopGraphStore = vi.mocked(useLoopGraphStore)

const sampleDoc = normalizeLoopGraphDocument({
  version: '0.1.0',
  id: 'loop_ui',
  projectId: 'proj',
  title: 'UI loop',
  draft: { revision: 0, graphPrompt: '', nodes: [], edges: [] },
  approvedSpecs: [],
  instances: [],
  linkedSessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

function mockStore(partial: Record<string, unknown>) {
  const state = {
    document: sampleDoc,
    composerDraft: '',
    composerSheet: 'none',
    authoringBusy: false,
    setComposerDraft: vi.fn(),
    toggleComposerSheet: vi.fn(),
    setComposerMode: vi.fn(),
    sendAuthoringTurn: vi.fn(),
    answerGoalClarification: vi.fn(),
    cancelGoalClarification: vi.fn(),
    confirmGoalContext: vi.fn(),
    acceptGraphEditOffer: vi.fn(),
    dismissGraphEditOffer: vi.fn(),
    undoDraft: vi.fn(),
    ...partial,
  }
  mockedUseLoopGraphStore.mockImplementation((selector) => selector(state as never))
}

describe('LoopGoalComposer', () => {
  it('renders bookmark tabs and Discuss mode chip', () => {
    mockStore({})
    const html = renderToStaticMarkup(<LoopGoalComposer />)
    expect(html).toContain('data-loop-goal-composer')
    expect(html).toContain('chat.loopGraph.modeDiscuss')
    expect(html).toContain('chat.loopGraph.agentFlowSheet')
    expect(html).toContain('chat.loopGraph.goalContextSheet')
    expect(html).toContain('role="tablist"')
  })

  it('shows only one sheet panel at a time', () => {
    mockStore({ composerSheet: 'context' })
    const html = renderToStaticMarkup(<LoopGoalComposer />)
    expect(html).toContain('data-loop-sheet="context"')
    expect(html).not.toContain('data-loop-sheet="flow"')
    expect(html).toContain('chat.loopGraph.goalContextEmpty')
  })

  it('shows graph edit offer actions when pending', () => {
    mockStore({
      document: {
        ...sampleDoc,
        pendingGraphEditOffer: {
          reason: 'Generate a coarse draft graph?',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    const html = renderToStaticMarkup(<LoopGoalComposer />)
    expect(html).toContain('data-loop-graph-edit-offer')
    expect(html).toContain('chat.loopGraph.acceptGraphEdit')
  })

  it('shows clarifications as a peer bookmark sheet when questions are pending', () => {
    mockStore({
      composerSheet: 'clarify',
      document: {
        ...sampleDoc,
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
    })
    const html = renderToStaticMarkup(<LoopGoalComposer />)
    expect(html).toContain('chat.loopGraph.clarifySheet')
    expect(html).toContain('data-loop-sheet="clarify"')
    expect(html).toContain('data-loop-goal-clarify')
    expect(html).toContain('chat.loopGraph.submitClarifications')
    expect(html).toContain('chat.loopGraph.cancelClarifications')
    expect(html).not.toContain('data-loop-sheet="flow"')
    expect(html).not.toContain('data-loop-sheet="context"')
  })

  it('hides the clarifications tab when no questions are pending', () => {
    mockStore({})
    const html = renderToStaticMarkup(<LoopGoalComposer />)
    expect(html).not.toContain('chat.loopGraph.clarifySheet')
    expect(html).not.toContain('data-loop-sheet="clarify"')
  })
})
