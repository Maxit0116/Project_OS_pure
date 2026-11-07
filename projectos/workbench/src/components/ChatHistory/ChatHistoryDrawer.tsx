import { useEffect, useMemo, useRef, useState } from 'react'
import { sessionGraphShieldCssInsets, type ChatSessionHead } from '@contracts/index'
import { Archive, MoreHorizontal, Pin, PinOff, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import ChatHistoryEntryContextMenu, {
  type ChatHistoryEntryMenuState,
} from './ChatHistoryEntryContextMenu'
import {
  formatRelativeChatTime,
  groupChatHistorySessions,
} from './chatHistoryGrouping'
import ChatHistoryScrollingTitle from './ChatHistoryScrollingTitle'
import styles from './ChatHistoryDrawer.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Chat history list as a left-of-chat drawer with GraphOverlay-style terminal squeeze.
 */
export default function ChatHistoryDrawer({ open, onClose }: Props) {
  const { ts } = useI18n()
  const heads = useChatSessionStore((s) => s.heads)
  const pinnedIds = useChatSessionStore((s) => s.pinnedIds)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const setPinned = useChatSessionStore((s) => s.setPinned)
  const setArchived = useChatSessionStore((s) => s.setArchived)
  const deleteSession = useChatSessionStore((s) => s.deleteSession)
  const findWithAgent = useChatSessionStore((s) => s.findWithAgent)

  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)

  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [entryMenu, setEntryMenu] = useState<ChatHistoryEntryMenuState | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
      if (panelRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-chat-history-toggle]')) return
      if ((target as Element).closest?.('[data-chat-history-entry-menu]')) return
      setEntryMenu(null)
      onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, onClose])

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

  if (!open || !rightPanelOpen) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: true,
    terminalOpen,
  })

  const hasResults = groups.length > 0
  const showFindWithAgent = search.trim().length > 0
  const untitled = ts('chat.history.untitled')

  const entryHead = entryMenu ? headById.get(entryMenu.sessionId) ?? null : null
  const entryIsPinned = entryMenu ? pinnedIds.includes(entryMenu.sessionId) : false

  return (
    <>
      <div
        className={`${styles.shield} ${panelResizing ? styles.shieldResizing : ''}`}
        style={{
          top: shield.top,
          right: shield.right,
          bottom: shield.bottom,
          left: shield.left,
        }}
        data-chat-history-drawer-shield=""
      >
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-label={ts('chat.history.showHistory')}
          data-chat-history-drawer=""
        >
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
        </div>
      </div>
      <ChatHistoryEntryContextMenu
        menu={entryMenu}
        head={entryHead}
        isPinned={entryIsPinned}
        onClose={() => setEntryMenu(null)}
      />
    </>
  )
}
