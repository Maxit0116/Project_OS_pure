import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatSessionHead } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { GlassLens } from '../Glass'
import styles from './ChatHistoryEntryContextMenu.module.css'

const VIEWPORT_MARGIN = 8

export interface ChatHistoryEntryMenuState {
  sessionId: string
  x: number
  y: number
}

interface Props {
  menu: ChatHistoryEntryMenuState | null
  head: ChatSessionHead | null
  isPinned: boolean
  onClose: () => void
}

export default function ChatHistoryEntryContextMenu({
  menu,
  head,
  isPinned,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const setPinned = useChatSessionStore((s) => s.setPinned)
  const setArchived = useChatSessionStore((s) => s.setArchived)
  const deleteSession = useChatSessionStore((s) => s.deleteSession)
  const renameSession = useChatSessionStore((s) => s.renameSession)

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menu, onClose])

  if (!menu || !head) return null

  const untitled = ts('chat.history.untitled')
  const currentTitle = head.title.trim() || untitled
  const left = position?.x ?? menu.x
  const top = position?.y ?? menu.y

  const handleRename = () => {
    const nextTitle = window.prompt(ts('chat.history.renamePrompt'), currentTitle)?.trim()
    if (!nextTitle || nextTitle === currentTitle) {
      onClose()
      return
    }
    void renameSession(menu.sessionId, nextTitle)
    onClose()
  }

  const handlePin = () => {
    void setPinned(menu.sessionId, !isPinned)
    onClose()
  }

  const handleArchive = () => {
    void setArchived(menu.sessionId, !head.isArchived)
    onClose()
  }

  const handleDelete = () => {
    const confirmed = window.confirm(ts('chat.history.deleteConfirm', { title: currentTitle }))
    if (!confirmed) return
    void deleteSession(menu.sessionId)
    onClose()
  }

  const content = (
    <div
      ref={menuRef}
      className={styles.portal}
      data-chat-history-entry-menu
      style={{ left, top }}
      role="presentation"
    >
      <GlassLens radius={12} tint="overlay" className={styles.menu}>
        <button type="button" className={styles.menuItem} role="menuitem" onClick={handleRename}>
          {ts('chat.history.rename')}
        </button>
        {!head.isArchived && (
          <button type="button" className={styles.menuItem} role="menuitem" onClick={handlePin}>
            {isPinned ? ts('chat.history.unpin') : ts('chat.history.pin')}
          </button>
        )}
        <button type="button" className={styles.menuItem} role="menuitem" onClick={handleArchive}>
          {head.isArchived ? ts('chat.history.restore') : ts('chat.history.archive')}
        </button>
        <div className={styles.separator} role="separator" />
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          role="menuitem"
          onClick={handleDelete}
        >
          {ts('chat.history.delete')}
        </button>
      </GlassLens>
    </div>
  )

  return createPortal(content, document.body)
}
