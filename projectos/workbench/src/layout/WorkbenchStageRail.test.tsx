import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useChatSessionStore } from '../state/chatSessionStore'
import WorkbenchStageRail from './WorkbenchStageRail'

describe('WorkbenchStageRail', () => {
  it('renders a collapsed horizontal stage toolbar with views and graphs', () => {
    const html = renderToStaticMarkup(<WorkbenchStageRail />)
    expect(html).toContain('data-workbench-stage-rail')
    expect(html).toContain('data-revealed="false"')
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-label="功能地图"')
    expect(html).toContain('aria-label="会话图"')
    expect(html).toContain('aria-label="Loop 图"')
    expect(html).toContain('aria-label="Diagram Graph"')
    expect(html).toContain('data-chat-tool="diagram-graph"')
    expect(html).toContain('aria-label="Reminder Graph"')
    expect(html).toContain('data-chat-tool="reminder-graph"')
    expect(html).toContain('aria-label="GitHub 图"')
    expect(html).toContain('data-chat-tool="github-graph"')
    expect(html).toContain('aria-label="扩展市场"')
    expect(html).toContain('data-chat-tool="marketplace"')
    expect(html).toContain('aria-label="Agent 流程"')
    expect(html).not.toContain('aria-label="聊天记录"')
  })

  it('stays collapsed while a center overlay is open', () => {
    useChatSessionStore.setState({
      sessionGraphOpen: true,
      loopGraphOpen: false,
      githubGraphOpen: false,
      marketplaceOpen: false,
      agentFlowOpen: false,
    })
    const html = renderToStaticMarkup(<WorkbenchStageRail />)
    expect(html).toContain('data-revealed="false"')
    expect(html).toContain('aria-pressed="true"')
  })
})
