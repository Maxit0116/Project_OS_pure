import { useEffect } from 'react'
import { executeAppMenuCommand } from '../../appMenu/menuCommands'
import { isDesktopApp } from '../../data/clientMode'

export function useTerminalShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key !== 'Backspace' || !isDesktopApp()) return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      executeAppMenuCommand({ id: 'terminal-kill' })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
