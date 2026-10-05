export type DiffColumnSide = 'before' | 'after'

interface ScrollTarget {
  scrollTop: number
}

type ScheduleFrame = (callback: () => void) => number
type CancelFrame = (handle: number) => void

export interface DiffScrollSynchronizer {
  sync(source: DiffColumnSide, scrollTop: number, target: ScrollTarget | null): boolean
  dispose(): void
}

export function createDiffScrollSynchronizer(
  schedule: ScheduleFrame = (callback) => requestAnimationFrame(callback),
  cancel: CancelFrame = (handle) => cancelAnimationFrame(handle),
): DiffScrollSynchronizer {
  let pendingEcho: { source: DiffColumnSide; scrollTop: number } | null = null
  let releaseFrame: number | null = null

  const clearPending = () => {
    pendingEcho = null
    if (releaseFrame !== null) {
      cancel(releaseFrame)
      releaseFrame = null
    }
  }

  return {
    sync(source, scrollTop, target) {
      if (
        pendingEcho?.source === source &&
        Math.abs(pendingEcho.scrollTop - scrollTop) < 1
      ) {
        clearPending()
        return false
      }
      if (!target) return false

      clearPending()
      target.scrollTop = scrollTop
      pendingEcho = {
        source: source === 'before' ? 'after' : 'before',
        scrollTop: target.scrollTop,
      }
      releaseFrame = schedule(() => {
        pendingEcho = null
        releaseFrame = null
      })
      return true
    },
    dispose() {
      clearPending()
    },
  }
}
