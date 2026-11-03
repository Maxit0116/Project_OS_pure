import { useEffect, useState } from 'react'
import { taskNeedsLiveClock, type AgentPoolTask } from './projectAgentPool'

const TICK_MS = 250

/**
 * Shared wall-clock for pool mini-waterfalls.
 * Only ticks while at least one task still has an open (running) span.
 */
export function useAgentPoolNow(tasks: AgentPoolTask[]): number {
  const needsClock = tasks.some(taskNeedsLiveClock)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!needsClock) return
    setNowMs(Date.now())
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const id = window.setInterval(() => {
      setNowMs(Date.now())
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [needsClock])

  return nowMs
}
