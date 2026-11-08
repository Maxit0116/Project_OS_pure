import { describe, expect, it } from 'vitest'
import type { LiveNodeActivity } from '@contracts/index'
import type { LiveNodeChangeEntry } from '../../../../services/live-graph/index.js'
import {
  partitionNodeActivities,
  partitionNodeChanges,
} from './partitionNodeActivities'

function activity(
  overrides: Partial<LiveNodeActivity> & Pick<LiveNodeActivity, 'id' | 'status'>,
): LiveNodeActivity {
  return {
    runId: 'run_1',
    kind: overrides.status === 'running' ? 'editing' : 'completed',
    nodeIds: ['node_1'],
    label: overrides.id,
    startedAt: '2026-11-09T01:00:00.000Z',
    sourceEventIds: [`evt_${overrides.id}`],
    ...overrides,
  }
}

describe('partitionNodeActivities', () => {
  it('keeps running agents expanded and stacks terminal ones newest-first', () => {
    const running = activity({
      id: 'a_run',
      status: 'running',
      startedAt: '2026-11-09T01:10:00.000Z',
    })
    const olderDone = activity({
      id: 'a_old',
      status: 'complete',
      startedAt: '2026-11-09T01:01:00.000Z',
      completedAt: '2026-11-09T01:02:00.000Z',
    })
    const newerDone = activity({
      id: 'a_new',
      status: 'complete',
      startedAt: '2026-11-09T01:03:00.000Z',
      completedAt: '2026-11-09T01:05:00.000Z',
    })
    const failed = activity({
      id: 'a_err',
      status: 'error',
      kind: 'failed',
      startedAt: '2026-11-09T01:04:00.000Z',
      completedAt: '2026-11-09T01:04:30.000Z',
    })

    const partitioned = partitionNodeActivities([
      olderDone,
      running,
      failed,
      newerDone,
    ])

    expect(partitioned.active.map((item) => item.id)).toEqual(['a_run'])
    expect(partitioned.completed.map((item) => item.id)).toEqual([
      'a_new',
      'a_err',
      'a_old',
    ])
  })

  it('falls back to startedAt when completedAt is missing', () => {
    const early = activity({
      id: 'early',
      status: 'complete',
      startedAt: '2026-11-09T01:01:00.000Z',
    })
    const late = activity({
      id: 'late',
      status: 'complete',
      startedAt: '2026-11-09T01:09:00.000Z',
    })

    expect(
      partitionNodeActivities([early, late]).completed.map((item) => item.id),
    ).toEqual(['late', 'early'])
  })
})

function change(
  overrides: Partial<LiveNodeChangeEntry> & Pick<LiveNodeChangeEntry, 'path' | 'status'>,
): LiveNodeChangeEntry {
  return {
    kind: overrides.status === 'error' ? 'failed' : 'editing',
    startedAt: '2026-11-09T01:00:00.000Z',
    activityId: `act_${overrides.path}`,
    label: overrides.path.split('/').pop() ?? overrides.path,
    ...overrides,
  }
}

describe('partitionNodeChanges', () => {
  it('stacks completed changes newest-first and keeps running edits expanded', () => {
    const running = change({
      path: 'src/a.ts',
      status: 'running',
      startedAt: '2026-11-09T01:10:00.000Z',
    })
    const older = change({
      path: 'src/b.ts',
      status: 'complete',
      startedAt: '2026-11-09T01:01:00.000Z',
      completedAt: '2026-11-09T01:02:00.000Z',
    })
    const newer = change({
      path: 'src/c.ts',
      status: 'complete',
      startedAt: '2026-11-09T01:03:00.000Z',
      completedAt: '2026-11-09T01:05:00.000Z',
    })

    const partitioned = partitionNodeChanges([older, running, newer])
    expect(partitioned.active.map((item) => item.path)).toEqual(['src/a.ts'])
    expect(partitioned.completed.map((item) => item.path)).toEqual([
      'src/c.ts',
      'src/b.ts',
    ])
  })
})
