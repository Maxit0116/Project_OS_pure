import { useEffect, useRef } from 'react'
import { shouldReportAgentActivity } from '@contracts/keep-awake'
import { isDesktopApp } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'

/**
 * Syncs keep-awake preference + live agent activity to the desktop main process.
 * No-op outside the Electron shell.
 */
export function useKeepAwakeSync(): void {
  const keepAwakeMode = useWorkbenchStore((s) => s.keepAwakeMode)
  const setKeepAwakeStatus = useWorkbenchStore((s) => s.setKeepAwakeStatus)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)
  const askTraceStatus = useWorkbenchStore((s) => s.latestAskTrace?.status ?? null)
  const planTraceStatus = useWorkbenchStore((s) => s.latestPlanTrace?.status ?? null)

  const lastActivityRef = useRef<boolean | null>(null)
  const lastModeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isDesktopApp() || !window.projectOS?.keepAwake) return

    const bridge = window.projectOS.keepAwake
    let cancelled = false

    const disposable = bridge.onStatus((status) => {
      if (!cancelled) setKeepAwakeStatus(status)
    })

    void bridge
      .getStatus()
      .then((status) => {
        if (!cancelled) setKeepAwakeStatus(status)
      })
      .catch((error: unknown) => {
        console.error('[keepAwake] failed to read status', error)
      })

    return () => {
      cancelled = true
      disposable.dispose()
    }
  }, [setKeepAwakeStatus])

  useEffect(() => {
    if (!isDesktopApp() || !window.projectOS?.keepAwake) return
    if (lastModeRef.current === keepAwakeMode) return
    lastModeRef.current = keepAwakeMode
    void window.projectOS.keepAwake.setMode(keepAwakeMode).then(setKeepAwakeStatus).catch((error: unknown) => {
      console.error('[keepAwake] failed to set mode', error)
    })
  }, [keepAwakeMode, setKeepAwakeStatus])

  useEffect(() => {
    if (!isDesktopApp() || !window.projectOS?.keepAwake) return
    const active = shouldReportAgentActivity({
      flowStatus,
      refineLoading,
      askTraceStatus,
      planTraceStatus,
    })
    if (lastActivityRef.current === active) return
    lastActivityRef.current = active
    void window.projectOS.keepAwake
      .setAgentActivity(active)
      .then(setKeepAwakeStatus)
      .catch((error: unknown) => {
        console.error('[keepAwake] failed to set agent activity', error)
      })
  }, [
    flowStatus,
    refineLoading,
    askTraceStatus,
    planTraceStatus,
    setKeepAwakeStatus,
  ])
}
