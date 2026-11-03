import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  buildSessionGraph,
  sessionGraphShieldInsets,
  type ChatSessionHead,
} from '@contracts/index'
import SessionGraphOverlay, { SessionGraphFrame } from './SessionGraphOverlay'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { estimateSessionNodeHeight } from './layoutSessionGraph'

const now = '2026-08-02T00:00:00.000Z'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: now,
    lastUpdatedAt: now,
    chatMode: 'ask',
    isArchived: false,
    status: 'idle',
    classification: 'topic',
    graphId: 'graph_test',
    ...partial,
  }
}

describe('SessionGraphOverlay', () => {
  it('stays closed until the user opens it', () => {
    useChatSessionStore.setState({ sessionGraphOpen: false })
    expect(renderToStaticMarkup(<SessionGraphOverlay />)).toBe('')
  })

  it('estimates taller cards when the preview strip has rows', () => {
    expect(estimateSessionNodeHeight(0)).toBeLessThan(estimateSessionNodeHeight(5))
    expect(estimateSessionNodeHeight(5)).toBeGreaterThan(150)
  })

  it('projects previewStrip onto session graph nodes for card rendering', () => {
    const model = buildSessionGraph([
      head({
        id: 'chat_live',
        title: 'Login redirect',
        status: 'running',
        previewStrip: [
          {
            id: 'decision:0:m1',
            kind: 'decision',
            title: 'Keep the callback',
            ts: now,
            messageId: 'm1',
          },
        ],
        messageCount: 2,
      }),
    ])
    expect(model.nodes[0]?.previewStrip).toHaveLength(1)
    expect(model.nodes[0]?.previewStrip[0]?.title).toBe('Keep the callback')
    expect(model.nodes[0]?.stripCount).toBe(1)
    expect(model.nodes[0]?.messageCount).toBe(2)
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
