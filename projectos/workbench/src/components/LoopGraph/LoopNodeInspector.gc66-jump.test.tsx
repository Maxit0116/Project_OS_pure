/**
 * GC-6.6 product semantic: openAgentFlowForRun must flip canvasOverlay to
 * agent-flow AND bind workbench.activeRunId (same-run context). Overlay-only
 * open that leaves the idle empty page is insufficient.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'

describe('GC-6.6 associated Run jump (store semantic)', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
      client: null,
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
})
