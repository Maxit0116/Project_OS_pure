import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import WorkingSessionRail from './WorkingSessionRail'
import type { SessionGraphRailLayout } from './sessionGraphRailLayout'

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
  graphId: 'graph_a',
}

const layout: SessionGraphRailLayout = {
  version: 2,
  entries: [{ kind: 'graph', graphId: 'graph_a' }],
}

const noop = () => undefined

describe('WorkingSessionRail', () => {
  it('keeps a collapsed graph rail with create and delete controls', () => {
    const html = renderToStaticMarkup(
      <WorkingSessionRail
        layout={layout}
        heads={[head]}
        activeGraphId="graph_a"
        onOpenGraph={noop}
        onCreate={noop}
        onCreateFolder={noop}
        onRemoveGraph={noop}
        onRemoveFolder={noop}
        onGraphPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
      />,
    )
    expect(html).toContain('data-working-session-rail')
    expect(html).toContain('data-expanded="false"')
    expect(html).toContain('data-session-graph-drop="graph"')
    expect(html).toContain('data-graph-id="graph_a"')
    expect(html.includes('移除会话图') || html.includes('Remove graph')).toBe(true)
  })

  it('renders a drop gap while dragging a graph', () => {
    const html = renderToStaticMarkup(
      <WorkingSessionRail
        layout={{
          version: 2,
          entries: [
            { kind: 'graph', graphId: 'graph_a' },
            { kind: 'graph', graphId: 'graph_b' },
          ],
        }}
        heads={[
          head,
          { ...head, id: 's2', title: 'Other', graphId: 'graph_b' },
        ]}
        activeGraphId="graph_a"
        draggingGraphId="graph_a"
        railDropIndex={1}
        onOpenGraph={noop}
        onCreate={noop}
        onCreateFolder={noop}
        onRemoveGraph={noop}
        onRemoveFolder={noop}
        onGraphPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
      />,
    )
    expect(html).toContain('data-rail-drop-gap')
  })
})
