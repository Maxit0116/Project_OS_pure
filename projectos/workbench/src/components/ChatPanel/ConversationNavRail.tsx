import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  adjacentTurnId,
  computeActiveTurnId,
  filterTurnsByQuery,
  flashTurnHighlight,
  latestTurnId,
  markerTopPercent,
  NAV_DENSE_TURN_THRESHOLD,
  scrollTurnIntoView,
  shouldShowConversationNav,
  type NavTurn,
} from './conversationNavTurns'
import styles from './ConversationNavRail.module.css'

interface Props {
  turns: NavTurn[]
  scrollParentRef: RefObject<HTMLElement | null>
  /** Chat panel root — keyboard only when this scope is armed / focused. */
  scopeRef: RefObject<HTMLElement | null>
  modeLabel?: string
  /** CSS module class applied to the jumped message for a brief flash (M1). */
  flashClassName: string
  onOpenActivity?: (activityId: string) => void
}

export default function ConversationNavRail({
  turns,
  scrollParentRef,
  scopeRef,
  modeLabel,
  flashClassName,
  onOpenActivity,
}: Props) {
  const { ts } = useI18n()
  const labelId = useId()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const turnIds = useMemo(() => turns.map((turn) => turn.id), [turns])
  const dense = turns.length >= NAV_DENSE_TURN_THRESHOLD
  const [visible, setVisible] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTurns = useMemo(
    () => filterTurnsByQuery(turns, searchQuery),
    [turns, searchQuery],
  )

  const syncVisibilityAndActive = useCallback(() => {
    const parent = scrollParentRef.current
    const nextVisible = shouldShowConversationNav(turns.length, parent)
    setVisible(nextVisible)
    if (!nextVisible || !parent) {
      setActiveId(null)
      return
    }
    setActiveId(computeActiveTurnId(parent, turnIds))
  }, [scrollParentRef, turnIds, turns.length])

  useEffect(() => {
    syncVisibilityAndActive()
    const parent = scrollParentRef.current
    if (!parent) return

    const onScroll = () => {
      setActiveId(computeActiveTurnId(parent, turnIds))
    }
    parent.addEventListener('scroll', onScroll, { passive: true })

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncVisibilityAndActive())
        : null
    ro?.observe(parent)

    return () => {
      parent.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [scrollParentRef, syncVisibilityAndActive, turnIds])

  useEffect(() => {
    syncVisibilityAndActive()
  }, [turns, syncVisibilityAndActive])

  const jumpTo = useCallback(
    (messageId: string) => {
      const parent = scrollParentRef.current
      if (!parent) return
      setActiveId(messageId)
      scrollTurnIntoView(parent, messageId)
      flashTurnHighlight(parent, messageId, flashClassName)
    },
    [flashClassName, scrollParentRef],
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return

    let armed = false
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      armed = scope.contains(target)
      if (searchOpen && !scope.contains(target)) {
        closeSearch()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return
      const focusInside = scope.contains(document.activeElement)
      if (!armed && !focusInside) return
      if (turns.length === 0) return

      // Alt+Shift+F — searchable prompt index (M2)
      if (event.shiftKey && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault()
        if (searchOpen) closeSearch()
        else openSearch()
        return
      }

      if (event.shiftKey) return

      const key = event.key
      if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'End') return

      event.preventDefault()
      const parent = scrollParentRef.current
      const current =
        activeId ?? (parent ? computeActiveTurnId(parent, turnIds) : turnIds[0] ?? null)
      if (key === 'ArrowUp') {
        const prev = adjacentTurnId(turnIds, current, 'prev')
        if (prev) jumpTo(prev)
        return
      }
      if (key === 'ArrowDown') {
        const next = adjacentTurnId(turnIds, current, 'next')
        if (next) jumpTo(next)
        return
      }
      const latest = latestTurnId(turnIds)
      if (latest) jumpTo(latest)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [
    activeId,
    closeSearch,
    jumpTo,
    openSearch,
    scopeRef,
    scrollParentRef,
    searchOpen,
    turnIds,
    turns.length,
  ])

  useEffect(() => {
    if (!searchOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSearch, searchOpen])

  if (!visible || turns.length === 0) return null

  const previewId = hoveredId ?? focusedId

  return (
    <nav
      className={`${styles.rail} ${dense ? styles.railDense : ''}`}
      aria-labelledby={labelId}
    >
      <span id={labelId} className={styles.visuallyHidden}>
        {ts('chat.nav.railLabel')}
      </span>
      <button
        type="button"
        className={`${styles.searchToggle} ${searchOpen ? styles.searchToggleActive : ''}`}
        aria-label={ts('chat.nav.openSearch')}
        aria-expanded={searchOpen}
        title={ts('chat.nav.openSearch')}
        onClick={() => (searchOpen ? closeSearch() : openSearch())}
      >
        <Search size={10} strokeWidth={2} aria-hidden />
      </button>

      {searchOpen ? (
        <div className={styles.searchPanel} role="dialog" aria-label={ts('chat.nav.searchTitle')}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={ts('chat.nav.searchPlaceholder')}
            aria-label={ts('chat.nav.searchPlaceholder')}
          />
          {filteredTurns.length === 0 ? (
            <div className={styles.searchEmpty}>{ts('chat.nav.searchEmpty')}</div>
          ) : (
            <ul className={styles.searchList}>
              {filteredTurns.map((turn) => (
                <li key={turn.id}>
                  <button
                    type="button"
                    className={`${styles.searchItem} ${
                      turn.id === activeId ? styles.searchItemActive : ''
                    }`}
                    onClick={() => {
                      jumpTo(turn.id)
                      closeSearch()
                    }}
                  >
                    {turn.preview}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className={styles.railTrack}>
        {turns.map((turn, index) => {
          const isActive = turn.id === activeId
          const showTip = previewId === turn.id && !searchOpen
          return (
            <button
              key={turn.id}
              type="button"
              className={`${styles.marker} ${isActive ? styles.markerActive : ''}`}
              style={{ top: `${markerTopPercent(index, turns.length)}%` }}
              aria-label={ts('chat.nav.markerLabel', { preview: turn.preview })}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => jumpTo(turn.id)}
              onMouseEnter={() => setHoveredId(turn.id)}
              onMouseLeave={() => setHoveredId((id) => (id === turn.id ? null : id))}
              onFocus={() => setFocusedId(turn.id)}
              onBlur={() => setFocusedId((id) => (id === turn.id ? null : id))}
            >
              <span className={styles.bar} aria-hidden />
              {turn.status ? (
                <span
                  className={`${styles.statusDot} ${statusClass(turn.status)}`}
                  aria-hidden
                />
              ) : null}
              {showTip ? (
                <span className={styles.tooltip} role="tooltip">
                  <span className={styles.tooltipPreview}>{turn.preview}</span>
                  {modeLabel || turn.timestamp ? (
                    <span className={styles.tooltipMeta}>
                      {[modeLabel, formatTime(turn.timestamp), statusLabel(turn.status, ts)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : null}
                  {turn.activityId && onOpenActivity ? (
                    <button
                      type="button"
                      className={styles.tooltipAction}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenActivity(turn.activityId!)
                      }}
                    >
                      {ts('chat.nav.openActivity')}
                    </button>
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function statusClass(status: NonNullable<NavTurn['status']>): string {
  switch (status) {
    case 'running':
      return styles.statusRunning
    case 'checkpoint':
      return styles.statusCheckpoint
    case 'error':
      return styles.statusError
    default:
      return ''
  }
}

function statusLabel(
  status: NavTurn['status'],
  ts: (path: string) => string,
): string {
  if (!status) return ''
  if (status === 'running') return ts('chat.nav.statusRunning')
  if (status === 'checkpoint') return ts('chat.nav.statusCheckpoint')
  if (status === 'error') return ts('chat.nav.statusError')
  return ''
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
