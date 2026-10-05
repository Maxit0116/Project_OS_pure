export interface ViewportPersistenceGuard {
  suppressFor(durationMs: number): number
  isSuppressed(): boolean
  clear(): void
}

type ScheduleTimeout = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
type CancelTimeout = (handle: ReturnType<typeof setTimeout>) => void

export function createViewportPersistenceGuard(
  schedule: ScheduleTimeout = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: CancelTimeout = (handle) => clearTimeout(handle),
): ViewportPersistenceGuard {
  let generation = 0
  let activeGeneration: number | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  return {
    suppressFor(durationMs) {
      const token = ++generation
      activeGeneration = token
      if (timeout !== null) cancel(timeout)
      timeout = schedule(() => {
        if (activeGeneration !== token) return
        activeGeneration = null
        timeout = null
      }, Math.max(0, durationMs))
      return token
    },
    isSuppressed() {
      return activeGeneration !== null
    },
    clear() {
      generation += 1
      activeGeneration = null
      if (timeout !== null) {
        cancel(timeout)
        timeout = null
      }
    },
  }
}

interface SingleNodeFitOptions {
  nodes: Array<{ id: string }>
  padding: number
  duration: number
  maxZoom: number
}

const SEARCH_FIT_DURATION_MS = 300
const CAMERA_EVENT_SETTLE_MS = 80

export function fitSingleMatchingNode(
  matchingIds: ReadonlySet<string> | null,
  fitView: (options: SingleNodeFitOptions) => unknown,
  guard: ViewportPersistenceGuard,
  maxZoom: number,
): boolean {
  if (!matchingIds || matchingIds.size !== 1) return false
  const [id] = matchingIds
  guard.suppressFor(SEARCH_FIT_DURATION_MS + CAMERA_EVENT_SETTLE_MS)
  fitView({
    nodes: [{ id }],
    padding: 0.4,
    duration: SEARCH_FIT_DURATION_MS,
    maxZoom,
  })
  return true
}
