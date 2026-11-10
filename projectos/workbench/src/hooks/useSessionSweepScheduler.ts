import { useEffect } from 'react'
import { useSessionSweepStore } from '../state/sessionSweepStore'
import { useWorkbenchStore } from '../state/workbenchStore'

const POLL_MS = 60_000

/** Poll once a minute for daily hygiene: continuity tidy first, then low-value sweep. */
export function useSessionSweepScheduler() {
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const enabled = useSessionSweepStore((s) => s.preferences.enabled)
  const tidyEnabled = useSessionSweepStore((s) => s.preferences.tidyEnabled)
  const dailyTime = useSessionSweepStore((s) => s.preferences.dailyTime)
  const runHygieneCheck = useSessionSweepStore((s) => s.runHygieneCheck)

  useEffect(() => {
    if (!projectId || (!enabled && !tidyEnabled)) return

    let cancelled = false
    const tick = () => {
      if (cancelled) return
      void runHygieneCheck({ notify: true })
    }

    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [projectId, enabled, tidyEnabled, dailyTime, runHygieneCheck])
}
