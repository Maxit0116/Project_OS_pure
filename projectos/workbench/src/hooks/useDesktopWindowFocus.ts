import { useEffect } from 'react'
import { isDesktopApp } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'

function readDocumentFocus(): boolean {
  if (typeof document === 'undefined') return true
  return document.hasFocus() && document.visibilityState !== 'hidden'
}

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

export function useDesktopWindowFocus() {
  const setWindowFocused = useWorkbenchStore((s) => s.setWindowFocused)
  const navigateFromAgentNotification = useWorkbenchStore((s) => s.navigateFromAgentNotification)

  useEffect(() => {
    // Browser / non-desktop: document focus + visibility is all we have.
    if (!isDesktopApp()) {
      const syncDocumentFocus = () => {
        setWindowFocused(readDocumentFocus())
      }

      syncDocumentFocus()
      window.addEventListener('focus', syncDocumentFocus)
      window.addEventListener('blur', syncDocumentFocus)
      document.addEventListener('visibilitychange', syncDocumentFocus)
      return () => {
        window.removeEventListener('focus', syncDocumentFocus)
        window.removeEventListener('blur', syncDocumentFocus)
        document.removeEventListener('visibilitychange', syncDocumentFocus)
      }
    }

    const bridge = window.projectOS
    if (!bridge?.window) {
      const syncDocumentFocus = () => {
        setWindowFocused(readDocumentFocus())
      }
      syncDocumentFocus()
      window.addEventListener('focus', syncDocumentFocus)
      window.addEventListener('blur', syncDocumentFocus)
      document.addEventListener('visibilitychange', syncDocumentFocus)
      return () => {
        window.removeEventListener('focus', syncDocumentFocus)
        window.removeEventListener('blur', syncDocumentFocus)
        document.removeEventListener('visibilitychange', syncDocumentFocus)
      }
    }

    // Desktop: Electron focus is authoritative. Do not also listen to window
    // focus/blur — on macOS Spaces, document.hasFocus() can stay true after the
    // window has blurred and would overwrite the correct unfocused state,
    // suppressing system notifications when the user is on another desktop.
    const applyElectronFocus = (focused: boolean) => {
      setWindowFocused(focused && !isDocumentHidden())
    }

    void bridge.window.isFocused().then(applyElectronFocus)

    const focusDisposable = bridge.window.onFocusChange(applyElectronFocus)
    const onVisibilityChange = () => {
      if (isDocumentHidden()) {
        setWindowFocused(false)
        return
      }
      void bridge.window.isFocused().then(applyElectronFocus)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const notifyDisposable = bridge.notify?.onActivated((payload) => {
      void navigateFromAgentNotification(payload.destination)
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      focusDisposable.dispose()
      notifyDisposable?.dispose()
    }
  }, [navigateFromAgentNotification, setWindowFocused])
}
