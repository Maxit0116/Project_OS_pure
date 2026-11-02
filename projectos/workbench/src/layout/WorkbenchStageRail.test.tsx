import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
    expect(html).toContain('aria-label="GitHub 图"')
    expect(html).toContain('data-chat-tool="github-graph"')
    expect(html).toContain('aria-label="扩展市场"')
    expect(html).toContain('data-chat-tool="marketplace"')
    expect(html).toContain('aria-label="Agent 流程"')
    expect(html).not.toContain('aria-label="聊天记录"')
  })
})
