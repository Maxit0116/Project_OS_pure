import { useEffect, useState } from 'react'
import { isMacElectronShell } from '../data/clientMode'

export interface DesktopWindowChromeState {
  isMacDesktop: boolean
  isFullScreen: boolean
}

/** macOS Electron window chrome state (title bar always visible; traffic lights move in fullscreen). */
export function useDesktopWindowChrome(): DesktopWindowChromeState {
  const [isMacDesktop] = useState(isMacElectronShell)
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    if (!isMacElectronShell()) return

    const bridge = window.projectOS
    if (!bridge?.window) return

    let cancelled = false

    void bridge.window
      .isFullScreen()
      .then((fullScreen) => {
        if (!cancelled) setIsFullScreen(fullScreen)
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[window-chrome] failed to read fullscreen state', error)
        }
      })

    const sub = bridge.window.onFullScreenChange((fullScreen) => {
      setIsFullScreen(fullScreen)
    })

    return () => {
      cancelled = true
      sub.dispose()
    }
  }, [])

  return { isMacDesktop, isFullScreen }
}
