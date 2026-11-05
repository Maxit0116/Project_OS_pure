import { describe, expect, it } from 'vitest'

import { isDebugFixPending } from './debugFixPending'
import type { FlowStatus } from './handleRunEvent'

describe('isDebugFixPending', () => {
  it('is pending while the fix run works or its change waits for review', () => {
    expect(isDebugFixPending('verify', 'running')).toBe(true)
    expect(isDebugFixPending('verify', 'awaiting_review')).toBe(true)
  })

  it('is not pending once the change is applied or the run ended without one', () => {
    for (const status of ['complete', 'error', 'interrupted', 'idle'] as FlowStatus[]) {
      expect(isDebugFixPending('verify', status)).toBe(false)
    }
  })

  it('only concerns the verify phase', () => {
    for (const phase of ['hypothesize', 'reproduce', 'fix', 'complete', undefined]) {
      expect(isDebugFixPending(phase, 'awaiting_review')).toBe(false)
    }
  })
})
