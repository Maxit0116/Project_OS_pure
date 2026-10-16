import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import LoopGraphOverlay from './LoopGraphOverlay'
import { sessionGraphShieldInsets } from '@contracts/index'

describe('LoopGraphOverlay', () => {
  it('stays closed until the user opens it', () => {
    useChatSessionStore.getState().setLoopGraphOpen(false)
    expect(renderToStaticMarkup(<LoopGraphOverlay />)).toBe('')
  })

  it('reuses the shared overlay frame insets', () => {
    const shield = sessionGraphShieldInsets({
      leftOpen: true,
      rightOpen: false,
      terminalOpen: false,
      leftWidth: 200,
      rightWidth: 300,
      terminalHeight: 240,
    })
    const html = renderToStaticMarkup(
      <GraphOverlayFrame shield={shield} resizing={false} label="Loop graph">
        <p>loop</p>
      </GraphOverlayFrame>,
    )
    expect(html).toContain('data-graph-overlay-shield')
    expect(html).toContain('data-graph-overlay-card')
    expect(html).toContain('left:200px')
  })
})