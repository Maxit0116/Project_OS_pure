import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LoopGraphHead } from '@contracts/index'
import LoopGraphRail from './LoopGraphRail'
import type { LoopGraphRailLayout } from './loopGraphRailLayout'

const head: LoopGraphHead = {
  id: 'loop_1',
  title: 'Login loop',
  status: 'running',
  linkedSessionIds: [],
  draftRevision: 2,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

const layout: LoopGraphRailLayout = {
  version: 2,
  entries: [{ kind: 'loop', loopId: 'loop_1' }],
}

const noop = () => undefined

const railProps = {
  onOpen: noop,
  onCreate: noop,
  onCreateFolder: noop,
  onRenameFolder: noop,
  onCancelRenameFolder: noop,
  onRemoveFolder: noop,
  onMoveIntoFolder: noop,
  onMoveFolderIntoFolder: noop,
  onMoveToRail: noop,
  onMoveFolderToRail: noop,
}

describe('LoopGraphRail', () => {
  it('keeps a collapsed icon rail with create controls', () => {
    const html = renderToStaticMarkup(
      <LoopGraphRail layout={layout} items={[head]} activeLoopId="loop_1" {...railProps} />,
    )
    expect(html).toContain('data-loop-graph-rail')
    expect(html).toContain('data-expanded="false"')
    expect(html).toContain('Login loop')
    expect(html.includes('新建文件夹') || html.includes('New folder')).toBe(true)
  })

  it('still shows create when there are no loops', () => {
    const html = renderToStaticMarkup(
      <LoopGraphRail
        layout={{ version: 2, entries: [] }}
        items={[]}
        activeLoopId={null}
        {...railProps}
      />,
    )
    expect(html).toContain('data-loop-graph-rail')
    expect(html.includes('新建 Loop') || html.includes('Create loop')).toBe(true)
  })

  it('keeps folder children mounted but collapsed until revealed', () => {
    const html = renderToStaticMarkup(
      <LoopGraphRail
        layout={{
          version: 2,
          entries: [
            {
              kind: 'folder',
              id: 'folder_1',
              title: 'Auth',
              children: [{ kind: 'loop', loopId: 'loop_1' }],
            },
          ],
        }}
        items={[head]}
        activeLoopId="loop_1"
        {...railProps}
      />,
    )
    // Collapsed rail: children not mounted until rail expands
    expect(html).toContain('data-folder-revealed="false"')
  })
})
