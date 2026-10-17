import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import AgentFlowOverlay from './AgentFlowOverlay'

describe('AgentFlowOverlay', () => {
  it('stays closed until the user opens it', () => {
    useChatSessionStore.getState().closeAgentFlow()
    expect(renderToStaticMarkup(<AgentFlowOverlay />)).toBe('')
  })

  it('keeps the card inside the sidebars and terminal', () => {
    const shield = sessionGraphShieldCssInsets({
      leftOpen: true,
      rightOpen: true,
      terminalOpen: true,
    })
    const frame = renderToStaticMarkup(
      <GraphOverlayFrame shield={shield} resizing={false} label="Agent Flow">
        <p>flow</p>
      </GraphOverlayFrame>,
    )

    expect(frame).toContain('data-graph-overlay-shield')
    expect(frame).toContain('data-graph-overlay-card')
    expect(frame).toContain('var(--workbench-left-panel-width)')
    expect(frame).toContain('var(--workbench-right-panel-width)')
    expect(frame).toContain('var(--terminal-dock-height)')
  })

  it('does not reopen the same run after the user closes it', () => {
    useWorkbenchStore.setState({
      activeRunId: 'run-1',
      flowStatus: 'running',
      refineLoading: false,
    })
    useChatSessionStore.getState().presentAgentFlow()
    useChatSessionStore.getState().closeAgentFlow()
    useChatSessionStore.getState().openAgentFlowForRun('run-1')
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(false)

    useChatSessionStore.getState().openAgentFlowForRun('run-2')
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)
    useChatSessionStore.getState().closeAgentFlow()
    useWorkbenchStore.setState({ activeRunId: null, flowStatus: 'idle' })
  })
})
