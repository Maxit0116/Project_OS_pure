import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LoopGraphHead } from '@contracts/index'
import LoopGraphRail from './LoopGraphRail'

const head: LoopGraphHead = {
  id: 'loop_1',
  title: 'Login loop',
  status: 'running',
  linkedSessionIds: [],
  draftRevision: 2,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

describe('LoopGraphRail', () => {
  it('keeps a collapsed icon rail with a create control', () => {
    const html = renderToStaticMarkup(
      <LoopGraphRail
        items={[head]}
        activeLoopId="loop_1"
        onOpen={() => undefined}
        onCreate={() => undefined}
      />,
    )
    expect(html).toContain('data-loop-graph-rail')
    expect(html).toContain('data-expanded="false"')
    expect(html).toContain('Login loop')
  })

  it('still shows create when there are no loops', () => {
    const html = renderToStaticMarkup(
      <LoopGraphRail
        items={[]}
        activeLoopId={null}
        onOpen={() => undefined}
        onCreate={() => undefined}
      />,
    )
    expect(html).toContain('data-loop-graph-rail')
    expect(html.includes('新建 Loop') || html.includes('Create loop')).toBe(true)
  })
})
