import { useEffect, useRef } from 'react'
import {
  buildReminderDigest,
  currentLocalDateKey,
  shouldSendReminderDigest,
} from '../../../services/reminder-graph/digest.js'
import {
  loadReminderDigestLocalDate,
  saveReminderDigestLocalDate,
} from '../preferences/reminderDigest'
import { useReminderGraphStore } from '../state/reminderGraphStore'
import { useWorkbenchStore } from '../state/workbenchStore'

/** How often to re-check whether today's digest should fire. */
const DIGEST_POLL_MS = 60 * 60 * 1000

/**
 * Once per local calendar day (on project ready + hourly poll):
 * refresh bindings via sync, then emit a digest notification if there is
 * actionable Reminder Graph work.
 */
export function useReminderDigestScheduler() {
  const phase = useWorkbenchStore((s) => s.phase)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const notifyReminderEvents = useWorkbenchStore((s) => s.notifyReminderEvents)
  const syncNow = useReminderGraphStore((s) => s.syncNow)
  const runningRef = useRef(false)

  useEffect(() => {
    if (phase !== 'ready' || !projectId) return undefined

    const run = async () => {
      if (runningRef.current) return
      const last = loadReminderDigestLocalDate(projectId)
      if (!shouldSendReminderDigest({ lastDigestLocalDate: last })) return

      runningRef.current = true
      try {
        await syncNow()
        const document = useReminderGraphStore.getState().document
        const digest = buildReminderDigest(document ?? undefined)
        if (digest.events.length > 0) {
          notifyReminderEvents(digest.events, {
            focusedItemId: useReminderGraphStore.getState().selectedId,
          })
        }
        saveReminderDigestLocalDate(projectId, currentLocalDateKey())
      } finally {
        runningRef.current = false
      }
    }

    void run()
    const timer = window.setInterval(() => {
      void run()
    }, DIGEST_POLL_MS)
    return () => window.clearInterval(timer)
  }, [phase, projectId, notifyReminderEvents, syncNow])
}
