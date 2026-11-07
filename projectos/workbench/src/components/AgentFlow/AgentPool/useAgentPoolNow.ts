import { useEffect, useState } from 'react'
import { taskNeedsLiveClock, type AgentPoolTask } from './projectAgentPool'

/** Target frame budget for smooth bar growth (~30fps keeps width % fluid). */
const RAF_MIN_INTERVAL_MS = 32
/** Keep data advancing under reduced-motion without decorative smoothness. */
const REDUCED_MOTION_TICK_MS = 1000

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Shared wall-clock for pool mini-waterfalls.
 * Only ticks while at least one task still has an open (running) span.
 * Reduced-motion still advances elapsed (1s); decorative CSS is gated separately.
 */
export function useAgentPoolNow(tasks: AgentPoolTask[]): number {
  const needsClock = tasks.some(taskNeedsLiveClock)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!needsClock) return
    setNowMs(Date.now())

    if (prefersReducedMotion()) {
      const id = window.setInterval(() => {
        setNowMs(Date.now())
      }, REDUCED_MOTION_TICK_MS)
      return () => window.clearInterval(id)
    }

    let raf = 0
    let last = 0
    const loop = (ts: number) => {
      if (ts - last >= RAF_MIN_INTERVAL_MS) {
        last = ts
        setNowMs(Date.now())
      }
      raf = window.requestAnimationFrame(loop)
    }
    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [needsClock])

  return nowMs
}
