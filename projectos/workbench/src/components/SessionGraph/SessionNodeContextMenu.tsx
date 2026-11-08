import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, History, MessageSquare } from 'lucide-react'
import { useI18n } from '../../i18n'
import styles from './SessionGraphCenterSheet.module.css'

const VIEWPORT_MARGIN = 8

export interface SessionNodeContextMenuState {
  x: number
  y: number
  sessionId: string
  restoreFocusTo?: HTMLElement | null
}

interface Props {
  menu: SessionNodeContextMenuState | null
  onClose: () => void
  onViewHistory: (sessionId: string) => void
  onBranch: (sessionId: string) => void
  onOpen: (sessionId: string) => void
}

export default function SessionNodeContextMenu({
  menu,
  onClose,
  onViewHistory,
  onBranch,
  onOpen,
}: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null)
      return
    }
    const el = menuRef.current
    if (!el) {
      setPosition({ x: menu.x, y: menu.y })
      return
    }
    const rect = el.getBoundingClientRect()
    let x = menu.x
    let y = menu.y
    if (x + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    }
    if (y + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN)
    }
    setPosition({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ts('chat.sessionGraph.contextMenu.label')}
      style={{ left: position?.x ?? menu.x, top: position?.y ?? menu.y }}
    >
      <button
        type="button"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => {
          onViewHistory(menu.sessionId)
          onClose()
        }}
      >
        <History size={14} aria-hidden />
        {ts('chat.sessionGraph.contextMenu.viewHistory')}
      </button>
      <button
        type="button"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => {
          onBranch(menu.sessionId)
          onClose()
        }}
      >
        <GitBranch size={14} aria-hidden />
        {ts('chat.sessionGraph.contextMenu.branch')}
      </button>
      <div className={styles.menuSeparator} role="separator" />
      <button
        type="button"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => {
          onOpen(menu.sessionId)
          onClose()
        }}
      >
        <MessageSquare size={14} aria-hidden />
        {ts('chat.sessionGraph.contextMenu.open')}
      </button>
    </div>,
    document.body,
  )
}
