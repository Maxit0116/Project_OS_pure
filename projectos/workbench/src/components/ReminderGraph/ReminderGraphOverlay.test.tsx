import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReminderTimelineItem } from '@contracts/index'
import { useChatSessionStore } from '../../state/chatSessionStore'
import ReminderGraphOverlay from './ReminderGraphOverlay'
import { ReminderTimelineRow, statusLabel } from './ReminderTimelineRow'

const sampleItem: ReminderTimelineItem = {
  id: 'm1',
  kind: 'milestone',
  title: 'MVP acceptance',
  summary: 'Ship MVP gate',
  phaseIndex: 1,
  manualOrder: 0,
  milestoneStatus: 'upcoming',
  dependsOn: [],
  binding: { type: 'manual' },
  sourceRefs: [{ path: 'docs/features/PRD.md', heading: 'MVP', updatedAt: '2026-01-01T00:00:00.000Z' }],
  supersededSources: [],
  userPinned: false,
  locked: false,
  featureIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const ts = (key: string) => key

describe('ReminderGraphOverlay', () => {
  it('renders nothing when closed', () => {
    useChatSessionStore.setState({ canvasOverlay: 'none', reminderGraphOpen: false })
    expect(renderToStaticMarkup(<ReminderGraphOverlay />)).toBe('')
  })
})

describe('ReminderTimelineRow', () => {
  it('expands inline detail without a side inspector', () => {
    const html = renderToStaticMarkup(
      <ReminderTimelineRow
        item={sampleItem}
        expanded
        dragging={false}
        status={statusLabel(sampleItem, ts)}
        titleById={new Map([['m1', 'MVP acceptance']])}
        busy={false}
        onToggle={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDrop={vi.fn()}
        onCompleteMilestone={vi.fn()}
        onOpenSource={vi.fn()}
        ts={ts}
      />,
    )

    expect(html).toContain('data-reminder-row-detail')
    expect(html).toContain('data-expanded="true"')
    expect(html).toContain('data-tone="neutral"')
    expect(html).toContain('MVP acceptance')
    expect(html).toContain('docs/features/PRD.md')
    expect(html).toContain('chat.reminderGraph.completeMilestone')
    expect(html).toContain('chat.reminderGraph.bindingManual')
  })

  it('exposes conflict and ready tones on the row', () => {
    const conflictItem: ReminderTimelineItem = {
      ...sampleItem,
      id: 'r-conflict',
      kind: 'reminder',
      title: 'Conflicted item',
      milestoneStatus: undefined,
      reminderStatus: 'conflict',
    }
    const readyItem: ReminderTimelineItem = {
      ...sampleItem,
      id: 'r-ready',
      kind: 'reminder',
      title: 'Ready item',
      milestoneStatus: undefined,
      reminderStatus: 'ready',
    }

    const conflictHtml = renderToStaticMarkup(
      <ReminderTimelineRow
        item={conflictItem}
        expanded={false}
        dragging={false}
        status={statusLabel(conflictItem, ts)}
        titleById={new Map()}
        busy={false}
        onToggle={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDrop={vi.fn()}
        onCompleteMilestone={vi.fn()}
        onOpenSource={vi.fn()}
        ts={ts}
      />,
    )
    const readyHtml = renderToStaticMarkup(
      <ReminderTimelineRow
        item={readyItem}
        expanded={false}
        dragging={false}
        status={statusLabel(readyItem, ts)}
        titleById={new Map()}
        busy={false}
        onToggle={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDrop={vi.fn()}
        onCompleteMilestone={vi.fn()}
        onOpenSource={vi.fn()}
        ts={ts}
      />,
    )

    expect(conflictHtml).toContain('data-tone="conflict"')
    expect(readyHtml).toContain('data-tone="ready"')
  })

  it('hides detail when collapsed', () => {
    const html = renderToStaticMarkup(
      <ReminderTimelineRow
        item={sampleItem}
        expanded={false}
        dragging={false}
        status={statusLabel(sampleItem, ts)}
        titleById={new Map()}
        busy={false}
        onToggle={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDrop={vi.fn()}
        onCompleteMilestone={vi.fn()}
        onOpenSource={vi.fn()}
        ts={ts}
      />,
    )

    expect(html).toContain('data-expanded="false"')
    expect(html).not.toContain('data-reminder-row-detail')
    expect(html).toContain('Ship MVP gate')
  })
})
