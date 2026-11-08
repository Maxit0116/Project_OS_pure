import { afterEach, describe, expect, it } from 'vitest'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

afterEach(() => {
  useChatSessionStore.getState().closeAgentFlow()
  useWorkbenchStore.setState({
    selectedDiffFilePath: null,
    centerTab: 'map',
    codeSubTab: 'files',
    diffReadyBanner: null,
    generatedDiff: null,
    activeRunId: null,
    diffReady: false,
    flowStatus: 'idle',
    refineLoading: false,
  })
})

describe('workbenchStore.navigateToDiffReviewFile', () => {
  it('opens Code/Diff and closes the Agent Flow overlay', async () => {
    useWorkbenchStore.setState({
      activeRunId: 'run-review',
      flowStatus: 'idle',
      refineLoading: false,
      centerTab: 'map',
      codeSubTab: 'files',
      generatedDiff: 'diff --git a/a.ts b/a.ts\n',
      diffReady: true,
    })
    useChatSessionStore.getState().presentAgentFlow()
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)

    await useWorkbenchStore.getState().navigateToDiffReviewFile('a.ts')

    const state = useWorkbenchStore.getState()
    expect(state.centerTab).toBe('code')
    expect(state.codeSubTab).toBe('diff')
    expect(state.selectedDiffFilePath).toBe('a.ts')
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(false)
  })
})
