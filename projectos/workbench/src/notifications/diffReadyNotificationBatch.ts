import { DIFF_READY_BATCH_WINDOW_MS, type DiffReadyCompletion } from './diffReadyNotification'

let queue: DiffReadyCompletion[] = []
let timer: ReturnType<typeof setTimeout> | null = null

export const DIFF_READY_BATCH_MAX_ITEMS = 100

function flushQueuedDiffReadyItems(flush: (items: DiffReadyCompletion[]) => void) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const items = queue
  queue = []
  if (items.length > 0) flush(items)
}

export function enqueueDiffReadyBatch(
  item: DiffReadyCompletion,
  flush: (items: DiffReadyCompletion[]) => void,
) {
  const isFirstInBatch = queue.length === 0
  queue.push(item)
  if (queue.length >= DIFF_READY_BATCH_MAX_ITEMS) {
    flushQueuedDiffReadyItems(flush)
    return
  }
  // A fixed window guarantees a steady stream cannot postpone delivery forever.
  if (timer) return
  timer = setTimeout(() => {
    flushQueuedDiffReadyItems(flush)
  }, isFirstInBatch ? 0 : DIFF_READY_BATCH_WINDOW_MS)
}

export function resetDiffReadyBatch() {
  queue = []
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
