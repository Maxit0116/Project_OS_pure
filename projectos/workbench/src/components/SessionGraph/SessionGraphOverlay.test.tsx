import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sessionGraphShieldInsets } from '@contracts/index'
import SessionGraphOverlay, { SessionGraphFrame } from './SessionGraphOverlay'
import { useChatSessionStore } from '../../state/chatSessionStore'

describe('SessionGraphOverlay', () => {
  it('stays closed until the user opens it', () => {
    useChatSessionStore.setState({ sessionGraphOpen: false })
    expect(renderToStaticMarkup(<SessionGraphOverlay />)).toBe('')
  })

  it('insets the floating card inside the squeezed sidebars and terminal', () => {
    const openShield = sessionGraphShieldInsets({
      leftOpen: true,
      rightOpen: true,
      terminalOpen: true,
      leftWidth: 253,
      rightWidth: 380,
      terminalHeight: 320,
    })
    const openHtml = renderToStaticMarkup(
      <SessionGraphFrame shield={openShield} resizing={false} label="Session graph">
        <p>graph</p>
      </SessionGraphFrame>,
    )
    expect(openHtml).toContain('data-session-graph-shield')
    expect(openHtml).toContain('data-session-graph-card')
    expect(openHtml).toContain('left:253px')
    expect(openHtml).toContain('right:380px')
    expect(openHtml).toContain('bottom:320px')
    expect(openHtml).toContain('left:12px')

    const closedShield = sessionGraphShieldInsets({
      leftOpen: false,
      rightOpen: false,
      terminalOpen: false,
      leftWidth: 253,
      rightWidth: 380,
      terminalHeight: 320,
    })
    const closedHtml = renderToStaticMarkup(
      <SessionGraphFrame shield={closedShield} resizing={true} label="Session graph">
        <p>graph</p>
      </SessionGraphFrame>,
    )
    expect(closedHtml).toContain('left:0')
    expect(closedHtml).toContain('right:0')
    expect(closedHtml).toContain('bottom:0')
    expect(closedHtml).toContain('left:12px')
  })
})
