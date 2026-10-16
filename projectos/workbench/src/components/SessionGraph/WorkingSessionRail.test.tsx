import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import WorkingSessionRail from './WorkingSessionRail'

const head: ChatSessionHead = {
  id: 's1',
  title: 'Login fix',
  createdAt: '2026-08-02T00:00:00.000Z',
  lastUpdatedAt: '2026-08-02T00:00:00.000Z',
  chatMode: 'ask',
  isArchived: false,
  status: 'running',
  classification: 'topic',
  responsibility: '修复登录报错',
}

describe('WorkingSessionRail', () => {
  it('keeps a collapsed icon rail with a create control', () => {
    const html = renderToStaticMarkup(
      <WorkingSessionRail
        items={[head]}
        activeSessionId="s1"
        onOpen={() => undefined}
        onCreate={() => undefined}
      />,
    )
    expect(html).toContain('data-working-session-rail')
    expect(html).toContain('data-expanded="false"')
    expect(html).toContain('Login fix')
  })

  it('still shows create when the working set is empty', () => {
    const html = renderToStaticMarkup(
      <WorkingSessionRail
        items={[]}
        activeSessionId={null}
        onOpen={() => undefined}
        onCreate={() => undefined}
      />,
    )
    expect(html).toContain('data-working-session-rail')
    expect(html.includes('新对话') || html.includes('New chat')).toBe(true)
  })
})
