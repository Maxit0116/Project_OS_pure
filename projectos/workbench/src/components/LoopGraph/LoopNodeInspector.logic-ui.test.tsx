/**
 * Goal 2 control-flow UI: Inspector exposes logic kinds (condition/loop/merge/retry/wait).
 * Complements runtime GC E2E; Electron control-flow script covers product DOM separately.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    ts: (key: string) => key,
  }),
}))

vi.mock('../ChatPanel/composer/useComposePromptVoice', () => ({
  useComposePromptVoice: () => ({
    voice: {
      state: {},
      isRecording: false,
      isTranscribing: false,
      dismissError: vi.fn(),
    },
    voiceLabels: {},
    dockProps: {
      isRecording: false,
      isTranscribing: false,
      labels: { start: 'start', stop: 'stop', recording: 'recording' },
      isSupported: false,
      onMicToggle: vi.fn(),
    },
    syncBaseFromExternalText: vi.fn(),
    cancelVoice: vi.fn(),
    stopVoice: vi.fn(),
  }),
}))

vi.mock('../../state/loopGraphStore', () => ({
  useLoopGraphStore: (selector: (s: { document: null }) => unknown) =>
    selector({ document: null }),
}))

vi.mock('../../state/chatSessionStore', () => ({
  useChatSessionStore: (
    selector: (s: { openAgentFlowForRun: (runId: string | null) => void }) => unknown,
  ) => selector({ openAgentFlowForRun: vi.fn() }),
}))

vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: (selector: (s: { settings: null }) => unknown) =>
    selector({ settings: null }),
}))

describe('LoopNodeInspector logic control-flow UI', () => {
  it('renders logic kind select for condition', async () => {
    const { default: LoopNodeInspector } = await import('./LoopNodeInspector')
    const html = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_logic',
          title: 'Logic',
          prompt: '',
          position: { x: 0, y: 0 },
          type: 'logic',
          logicKind: 'condition',
          role: 'implement',
        }}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="logic-node-config"')
    expect(html).toContain('data-testid="logic-kind-select"')
  })

  it('shows retry limit / wait ms / max iterations for those kinds', async () => {
    const { default: LoopNodeInspector } = await import('./LoopNodeInspector')
    const retry = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_retry',
          title: 'Retry',
          prompt: '',
          position: { x: 0, y: 0 },
          type: 'logic',
          logicKind: 'retry',
          retryLimit: 2,
          role: 'implement',
        }}
        onChange={() => {}}
      />,
    )
    expect(retry).toContain('data-testid="logic-retry-limit"')

    const wait = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_wait',
          title: 'Wait',
          prompt: '',
          position: { x: 0, y: 0 },
          type: 'logic',
          logicKind: 'wait',
          waitMs: 100,
          role: 'implement',
        }}
        onChange={() => {}}
      />,
    )
    expect(wait).toContain('data-testid="logic-wait-ms"')

    const loop = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_loop',
          title: 'Loop',
          prompt: '',
          position: { x: 0, y: 0 },
          type: 'logic',
          logicKind: 'loop',
          maxIterations: 3,
          role: 'implement',
        }}
        onChange={() => {}}
      />,
    )
    expect(loop).toContain('data-testid="logic-max-iterations"')
  })

  it('GC-6.6 exposes Open associated Agent Run when activeRunId is set', async () => {
    const { default: LoopNodeInspector } = await import('./LoopNodeInspector')
    const html = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_agent',
          title: 'Agent',
          prompt: 'do',
          position: { x: 0, y: 0 },
          type: 'agent',
          agentRole: 'coder',
          role: 'implement',
        }}
        activeInstance={
          {
            id: 'inst_1',
            loopId: 'loop_1',
            status: 'running',
            cursorNodeId: 'n_agent',
            attemptCounts: { n_agent: 1 },
            activeRunId: 'run_abc',
            nodeRecords: {},
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } as never
        }
        onChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="loop-open-associated-run"')
    expect(html).toContain('data-loop-open-associated-run="run_abc"')
    expect(html).toContain('chat.loopGraph.openAssociatedRun')
  })
})
