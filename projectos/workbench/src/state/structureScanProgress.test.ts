import { describe, expect, it } from 'vitest'
import { applyStructureScanProgressEvent } from './structureScanProgress'

describe('applyStructureScanProgressEvent', () => {
  it('builds running progress from scan_planned and completes steps', () => {
    const planned = applyStructureScanProgressEvent(null, {
      type: 'scan_planned',
      scanId: 's1',
      projectId: 'p1',
      timestamp: '2026-01-01T00:00:00.000Z',
      mode: 'regenerate',
      steps: [
        { id: 'index_repo', status: 'pending' },
        { id: 'map_context', status: 'pending' },
        { id: 'map_components', status: 'pending' },
        { id: 'link_code', status: 'pending' },
        { id: 'validate_save', status: 'pending' },
      ],
    })
    expect(planned.status).toBe('running')

    const started = applyStructureScanProgressEvent(planned, {
      type: 'step_started',
      scanId: 's1',
      projectId: 'p1',
      timestamp: '2026-01-01T00:00:01.000Z',
      stepId: 'index_repo',
    })
    expect(started.steps[0]?.status).toBe('running')

    const done = applyStructureScanProgressEvent(started, {
      type: 'scan_completed',
      scanId: 's1',
      projectId: 'p1',
      timestamp: '2026-01-01T00:00:02.000Z',
    })
    expect(done.status).toBe('success')
    expect(done.steps.every((step) => step.status === 'complete')).toBe(true)

    const cancelled = applyStructureScanProgressEvent(started, {
      type: 'scan_cancelled',
      scanId: 's1',
      projectId: 'p1',
      timestamp: '2026-01-01T00:00:03.000Z',
    })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.steps[0]?.status).toBe('skipped')
  })
})
