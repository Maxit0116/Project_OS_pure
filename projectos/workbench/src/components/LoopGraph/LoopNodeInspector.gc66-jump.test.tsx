/**
 * GC-6.6 product semantic: openAgentFlowForRun must flip canvasOverlay to
 * agent-flow (real jump). Button presence alone is insufficient.
 * DutyCard wires data-loop-open-associated-run={activeRunId} (see logic-ui.test).
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
    })
    useChatSessionStore.getState().closeAgentFlow()
  })

  it('openAgentFlowForRun opens agent-flow overlay from closed', () => {
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(false)
    expect(useChatSessionStore.getState().canvasOverlay).not.toBe('agent-flow')

    useChatSessionStore.getState().openAgentFlowForRun('run_jump_1')

    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)
    expect(useChatSessionStore.getState().canvasOverlay).toBe('agent-flow')
  })
})
