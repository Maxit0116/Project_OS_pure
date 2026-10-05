import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PendingChangesDrawer from './PendingChangesDrawer'
import type { DiffFileStat } from './diffFileStats'

const files: DiffFileStat[] = [
  {
    path: 'app/api/notifications/route.ts',
    changeType: 'modify',
    added: 12,
    removed: 3,
  },
  {
    path: 'lib/db.ts',
    changeType: 'create',
    added: 28,
    removed: 0,
  },
]

describe('PendingChangesDrawer', () => {
  it('renders file count, stats, and action labels', () => {
    const html = renderToStaticMarkup(
      <PendingChangesDrawer
        files={files}
        expanded
        undoMode="dismiss"
        onToggleExpanded={vi.fn()}
        onReview={vi.fn()}
        onReviewFile={vi.fn()}
        onUndoAll={vi.fn()}
      />,
    )

    expect(html).toContain('data-pending-changes-drawer')
    expect(html).toContain('+12')
    expect(html).toContain('-3')
    expect(html).toContain('+28')
    expect(html).toContain('route.ts')
    expect(html).toContain('db.ts')
    expect(html).toContain('lib')
    expect(html).toContain('审阅')
    expect(html).toContain('全部撤销')
  })

  it('shows restore label in automatic undo mode', () => {
    const html = renderToStaticMarkup(
      <PendingChangesDrawer
        files={files}
        expanded={false}
        undoMode="restore"
        undoLoading
        onToggleExpanded={vi.fn()}
        onReview={vi.fn()}
        onReviewFile={vi.fn()}
        onUndoAll={vi.fn()}
      />,
    )

    expect(html).toContain('全部撤销')
    expect(html).toContain('disabled')
  })
})
