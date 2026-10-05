import { useEffect } from 'react'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useTerminalStore } from '../../state/terminalStore'
import { isDesktopApp } from '../../data/clientMode'

export function useTerminalShortcuts() {
  const togglePanel = useBottomDockStore((s) => s.togglePanel)
  const openPanel = useBottomDockStore((s) => s.openPanel)
  const setActiveView = useBottomDockStore((s) => s.setActiveView)
  const createTab = useTerminalStore((s) => s.createTab)
  const killActiveTab = useTerminalStore((s) => s.killActiveTab)
  const cycleActiveTab = useTerminalStore((s) => s.cycleActiveTab)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const key = event.key

      if (mod && event.shiftKey && key === 'u') {
        event.preventDefault()
        setActiveView('activity')
        return
      }

      if (mod && event.shiftKey && key === 'm') {
        event.preventDefault()
        setActiveView('diagnostics')
        return
      }

      if (mod && event.shiftKey && key === '`') {
        event.preventDefault()
        openPanel('terminal')
        void createTab()
        return
      }

      if (mod && !event.shiftKey && !event.altKey && key === '`') {
        event.preventDefault()
        togglePanel()
        return
      }

      if (event.metaKey && event.altKey && key === 'ArrowRight') {
        event.preventDefault()
        cycleActiveTab(1)
        return
      }

      if (event.metaKey && event.altKey && key === 'ArrowLeft') {
        event.preventDefault()
        cycleActiveTab(-1)
        return
      }

      if (event.metaKey && key === 'Backspace' && isDesktopApp()) {
        const target = event.target
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return
        }
        event.preventDefault()
        void killActiveTab()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePanel, openPanel, setActiveView, createTab, killActiveTab, cycleActiveTab])
}
