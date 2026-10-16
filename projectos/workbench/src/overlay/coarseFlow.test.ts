import { describe, expect, it } from 'vitest'

import {
  applyRunEventToCompactFlow,
  currentCompactFlowLabel,
  mapRunEventToCoarseFlow,
  mapTransientTraceToCoarseFlow,
} from './coarseFlow'

describe('coarseFlow', () => {
  it('maps agent events to coarse labels', () => {
    expect(mapRunEventToCoarseFlow({ type: 'file_read' })).toBe('reading')
    expect(mapRunEventToCoarseFlow({ type: 'model_request' })).toBe('thinking')
    expect(mapRunEventToCoarseFlow({ type: 'diff_proposed' })).toBe('writing')
    expect(mapRunEventToCoarseFlow({ type: 'verification_result' })).toBe(
      'verifying',
    )
    expect(mapRunEventToCoarseFlow({ type: 'run_completed' })).toBe('done')
    expect(mapRunEventToCoarseFlow({ type: 'step_failed' })).toBe('error')
  })

  it('maps transient traces with tool hints', () => {
    expect(mapTransientTraceToCoarseFlow({ toolName: 'grep' })).toBe('reading')
    expect(mapTransientTraceToCoarseFlow({ phase: 'write_file' })).toBe(
      'writing',
    )
    expect(mapTransientTraceToCoarseFlow({ kind: 'thinking' })).toBe('thinking')
  })

  it('builds a compact timeline from step events', () => {
    const started = applyRunEventToCompactFlow([], {
      type: 'step_started',
      step: { id: 's1', label: 'Gather context' },
    })
    expect(started.phase).toBe('thinking')
    expect(started.steps).toEqual([
      { id: 's1', label: 'Gather context', status: 'running' },
    ])

    const completed = applyRunEventToCompactFlow(started.steps, {
      type: 'step_completed',
      step: { id: 's1', label: 'Gather context' },
    })
    expect(completed.steps[0]?.status).toBe('complete')
    expect(currentCompactFlowLabel(completed.steps, completed.phase)).toBe(
      'Gather context',
    )
  })
})
