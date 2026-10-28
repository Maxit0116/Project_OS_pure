import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatToolsEdgeRail from './ChatToolsEdgeRail'

describe('ChatToolsEdgeRail', () => {
  it('renders a collapsed right-edge host with the chat tool toolbar', () => {
    const html = renderToStaticMarkup(<ChatToolsEdgeRail />)
    expect(html).toContain('data-chat-tools-edge-rail')
    expect(html).toContain('data-revealed="false"')
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-label="会话图"')
    expect(html).toContain('aria-label="Loop 图"')
    expect(html).toContain('aria-label="Agent 流程"')
    expect(html).toContain('aria-label="聊天记录"')
  })
})
