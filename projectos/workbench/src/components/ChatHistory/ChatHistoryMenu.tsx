import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ChatSessionHead } from '@contracts/index'
import { Archive, MoreHorizontal, Pin, PinOff, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import Button from '../ui/Button'
import { GlassLens } from '../Glass'
import ChatHistoryEntryContextMenu, {
  type ChatHistoryEntryMenuState,
} from './ChatHistoryEntryContextMenu'
import {
  formatRelativeChatTime,
  groupChatHistorySessions,
} from './chatHistoryGrouping'
import ChatHistoryScrollingTitle from './ChatHistoryScrollingTitle'
import styles from './ChatHistoryMenu.module.css'

const VIEWPORT_MARGIN = 8
const MENU_WIDTH = 252

interface Props {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}

export default function ChatHistoryMenu({ open, anchorRef, onClose }: Props) {
  const { ts } = useI18n()
  const heads = useChatSessionStore((s) => s.heads)
  const pinnedIds = useChatSessionStore((s) => s.pinnedIds)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const setPinned = useChatSessionStore((s) => s.setPinned)
  const setArchived = useChatSessionStore((s) => s.setArchived)
  const deleteSession = useChatSessionStore((s) => s.deleteSession)
  const findWithAgent = useChatSessionStore((s) => s.findWithAgent)

  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [entryMenu, setEntryMenu] = useState<ChatHistoryEntryMenuState | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor) return

    const anchorRect = anchor.getBoundingClientRect()
    const menuHeight = menu?.getBoundingClientRect().height ?? 320
    const menuWidth = menu?.getBoundingClientRect().width ?? MENU_WIDTH

    let left = anchorRect.right - menuWidth
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - menuWidth - VIEWPORT_MARGIN),
    )

    let top = anchorRect.bottom + 4
    if (top + menuHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchorRect.top - menuHeight - 4
    }
    top = Math.max(VIEWPORT_MARGIN, top)

    setPosition({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    updatePosition()
    requestAnimationFrame(() => updatePosition())
  }, [open, heads, pinnedIds, search])

  useEffect(() => {
    if (!open) {
      setEntryMenu(null)
      return
    }
    setSearch('')
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-chat-history-entry-menu]')) return
      setEntryMenu(null)
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) return
    const handleLayoutChange = () => updatePosition()
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)
    return () => {
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
    }
  }, [open, anchorRef])

  const headById = useMemo(() => {
    const map = new Map<string, ChatSessionHead>()
    for (const head of heads) map.set(head.id, head)
    return map
  }, [heads])

  const groups = useMemo(
    () =>
      groupChatHistorySessions({
        heads,
        pinnedIds,
        activeSessionId,
        searchQuery: search,
        now,
      }),
    [heads, pinnedIds, activeSessionId, search, now],
  )

  const hasResults = groups.length > 0
  const showFindWithAgent = search.trim().length > 0

  if (!open) return null

  const untitled = ts('chat.history.untitled')

  const menu = (
    <div
      ref={menuRef}
      className={styles.portal}
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: -9999, left: -9999, visibility: 'hidden' as const }
      }
    >
      <GlassLens radius={16} tint="overlay" className={`${styles.dropdown} glass-overlay-enter`}>
        <div className={styles.searchRow}>
          <input
            ref={searchRef}
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={ts('chat.history.searchPlaceholder')}
            aria-label={ts('chat.history.searchPlaceholder')}
          />
        </div>

        {showFindWithAgent && (
          <div className={styles.findWithAgent}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void findWithAgent(search)}
            >
              <Search size={14} aria-hidden />
              {ts('chat.history.findWithAgent')}
            </Button>
          </div>
        )}

        <div className={styles.list} role="listbox" aria-label={ts('chat.history.showHistory')}>
          {!hasResults && (
            <div className={styles.empty}>
              {search.trim() ? ts('chat.history.noResults') : ts('chat.history.empty')}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key}>
              <div className={styles.groupLabel}>{ts(group.labelKey)}</div>
              {group.sessionIds.map((sessionId) => {
                const head = headById.get(sessionId)
                if (!head) return null
                const isPinned = pinnedIds.includes(sessionId)
                const isActive = activeSessionId === sessionId
                const title = head.title.trim() || untitled

                return (
                  <div key={sessionId} className={styles.itemRow}>
                    <button
                      type="button"
                      className={`${styles.itemButton} ${isActive ? styles.itemButtonActive : ''}`}
                      onClick={() => void switchSession(sessionId)}
                    >
                      <ChatHistoryScrollingTitle title={title} />
                      <span className={styles.itemMeta}>
                        {head.subtitle ? (
                          <span className={styles.itemSubtitle}>{head.subtitle}</span>
                        ) : (
                          <span />
                        )}
                        <span>{formatRelativeChatTime(head.lastUpdatedAt, now)}</span>
                      </span>
                    </button>
                    <div className={styles.itemActions}>
                      {!head.isArchived && (
                        <button
                          type="button"
                          className={styles.actionButton}
                          title={isPinned ? ts('chat.history.unpin') : ts('chat.history.pin')}
                          aria-label={isPinned ? ts('chat.history.unpin') : ts('chat.history.pin')}
                          onClick={(event) => {
                            event.stopPropagation()
                            void setPinned(sessionId, !isPinned)
                          }}
                        >
                          {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.actionButton}
                        title={
                          head.isArchived
                            ? ts('chat.history.restore')
                            : ts('chat.history.archive')
                        }
                        aria-label={
                          head.isArchived
                            ? ts('chat.history.restore')
                            : ts('chat.history.archive')
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          void setArchived(sessionId, !head.isArchived)
                        }}
                      >
                        {head.isArchived ? <RotateCcw size={13} /> : <Archive size={13} />}
                      </button>
                      {head.isArchived && (
                        <button
                          type="button"
                          className={styles.actionButton}
                          title={ts('chat.history.delete')}
                          aria-label={ts('chat.history.delete')}
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteSession(sessionId)
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.actionButton}
                        title={ts('chat.history.moreActions')}
                        aria-label={ts('chat.history.moreActions')}
                        onClick={(event) => {
                          event.stopPropagation()
                          setEntryMenu({
                            sessionId,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </GlassLens>
    </div>
  )

  const entryHead = entryMenu ? headById.get(entryMenu.sessionId) ?? null : null
  const entryIsPinned = entryMenu ? pinnedIds.includes(entryMenu.sessionId) : false

  return (
    <>
      {createPortal(menu, document.body)}
      <ChatHistoryEntryContextMenu
        menu={entryMenu}
        head={entryHead}
        isPinned={entryIsPinned}
        onClose={() => setEntryMenu(null)}
      />
    </>
  )
}
