import { app } from 'electron'

/**
 * When launched from a terminal/dev host (electron-vite, npm run dev), Ctrl+C
 * often kills only the parent Node process. Electron is then reparented to
 * launchd (ppid=1) and keeps its Dock icon. Watch the original parent and
 * quit when it disappears. Packaged Dock launches already have ppid=1 and
 * are left alone.
 */
export function installParentExitGuard(options?: {
  pollMs?: number
  onParentGone?: (parentPid: number) => void
}): () => void {
  const parentPid = process.ppid
  if (!Number.isInteger(parentPid) || parentPid <= 1) {
    return () => undefined
  }

  const pollMs = options?.pollMs ?? 750
  let stopped = false
  const timer = setInterval(() => {
    if (stopped) return
    try {
      process.kill(parentPid, 0)
    } catch {
      stopped = true
      clearInterval(timer)
      options?.onParentGone?.(parentPid)
      app.quit()
    }
  }, pollMs)
  timer.unref?.()

  const onSignal = () => {
    app.quit()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  return () => {
    stopped = true
    clearInterval(timer)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}
