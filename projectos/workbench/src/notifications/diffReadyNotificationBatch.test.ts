import { afterEach, describe, expect, it, vi } from 'vitest'

import { DIFF_READY_BATCH_WINDOW_MS } from './diffReadyNotification'
import {
  DIFF_READY_BATCH_MAX_ITEMS,
  enqueueDiffReadyBatch,
  resetDiffReadyBatch,
} from './diffReadyNotificationBatch'

function completion(index: number) {
  return {
    runId: `run_${index}`,
    fileCount: 1,
    summary: `Task ${index}`,
    completedAt: index,
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

    enqueueDiffReadyBatch(completion(1), flush)
    vi.advanceTimersByTime(DIFF_READY_BATCH_WINDOW_MS - 500)
    enqueueDiffReadyBatch(completion(2), flush)
    vi.advanceTimersByTime(499)
    expect(flush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
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
