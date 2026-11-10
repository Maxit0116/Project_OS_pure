/**
 * GC-6.6 product semantic: openAgentFlowForRun must flip canvasOverlay to
 * agent-flow AND bind workbench.activeRunId (same-run context). Overlay-only
 * open that leaves the idle empty page is insufficient.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'

describe('GC-6.6 associated Run jump (store semantic)', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
      client: undefined,
    })
    useChatSessionStore.getState().closeAgentFlow()
  })

  it('openAgentFlowForRun opens agent-flow and binds activeRunId', () => {
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(false)
    expect(useChatSessionStore.getState().canvasOverlay).not.toBe('agent-flow')
    expect(useWorkbenchStore.getState().activeRunId).toBeNull()

    useChatSessionStore.getState().openAgentFlowForRun('run_jump_1')

    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)
    expect(useChatSessionStore.getState().canvasOverlay).toBe('agent-flow')
    expect(useWorkbenchStore.getState().activeRunId).toBe('run_jump_1')
  })

  it('does not reopen a dismissed run id', () => {
    useWorkbenchStore.setState({
      activeRunId: 'run_jump_1',
      flowStatus: 'running',
      refineLoading: false,
    })
    useChatSessionStore.getState().presentAgentFlow()
    useChatSessionStore.getState().closeAgentFlow()
    useWorkbenchStore.setState({ activeRunId: null, flowStatus: 'idle' })

    useChatSessionStore.getState().openAgentFlowForRun('run_jump_1')
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(false)
  })

  it('missing durable run stays bound and errors (not idle empty success)', async () => {
    useWorkbenchStore.setState({
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
      client: {
        getAgentRun: async () => {
          const err = new Error('missing') as Error & { code?: string }
          err.code = 'run_not_found'
          throw err
        },
        getAgentRunEvents: async () => {
          const err = new Error('missing') as Error & { code?: string }
          err.code = 'run_not_found'
          throw err
        },
      } as never,
    })

    useChatSessionStore.getState().openAgentFlowForRun('run_missing_xyz')
    expect(useChatSessionStore.getState().canvasOverlay).toBe('agent-flow')
    expect(useWorkbenchStore.getState().activeRunId).toBe('run_missing_xyz')

    // restoreRunFlow is async — wait for honest error surface
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().flowStatus).toBe('error')
    })
    expect(useWorkbenchStore.getState().activeRunId).toBe('run_missing_xyz')
    expect(useWorkbenchStore.getState().flowStatus).not.toBe('idle')
  })
})
