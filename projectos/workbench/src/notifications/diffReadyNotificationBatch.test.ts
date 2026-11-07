import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DIFF_READY_BATCH_WINDOW_MS,
  type DiffReadyCompletion,
} from './diffReadyNotification'
import {
  DIFF_READY_BATCH_MAX_ITEMS,
  enqueueDiffReadyBatch,
  resetDiffReadyBatch,
} from './diffReadyNotificationBatch'

function completion(index: number): DiffReadyCompletion {
  return {
    kind: 'diff',
    runId: `run_${index}`,
    fileCount: 1,
    summary: `Task ${index}`,
    completedAt: index,
    context: {
      centerTab: 'code',
      codeSubTab: 'editor',
      windowFocused: false,
      rightPanelTab: 'chat',
      agentFlowOpen: false,
    },
  }
}

afterEach(() => {
  resetDiffReadyBatch()
  vi.useRealTimers()
})

describe('diff-ready notification batching', () => {
  it('flushes on the original fixed-window deadline under a steady stream', () => {
    vi.useFakeTimers()
    const flush = vi.fn()

    // First-in-batch schedules at 0ms; items enqueued before that tick share one flush.
    enqueueDiffReadyBatch(completion(1), flush)
    enqueueDiffReadyBatch(completion(2), flush)
    expect(flush).not.toHaveBeenCalled()
    expect(DIFF_READY_BATCH_WINDOW_MS).toBeGreaterThan(0)

    vi.advanceTimersByTime(0)
    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0]?.[0]).toEqual([completion(1), completion(2)])
  })

  it('caps queued memory by flushing a full batch immediately without dropping items', () => {
    vi.useFakeTimers()
    const flush = vi.fn()

    for (let index = 0; index < DIFF_READY_BATCH_MAX_ITEMS; index += 1) {
      enqueueDiffReadyBatch(completion(index), flush)
    }

    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0]?.[0]).toHaveLength(DIFF_READY_BATCH_MAX_ITEMS)
    expect(vi.getTimerCount()).toBe(0)
  })
})
