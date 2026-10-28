import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useConversationNavHost } from './ConversationNavHostContext'
import {
  adjacentTurnId,
  computeActiveTurnId,
  flashTurnHighlight,
  latestTurnId,
  scrollTurnIntoView,
  shouldShowConversationNav,
  type NavTurn,
} from './conversationNavTurns'
import { toneClassForChatMode } from './composer/chatModeVisuals'
import { useChatSidebarRailAnchor } from './useChatSidebarRailAnchor'
import { useScrollScrubReveal } from './useScrollScrubReveal'
import styles from './ConversationNavRail.module.css'

interface Props {
  turns: NavTurn[]
  scrollParentRef: RefObject<HTMLElement | null>
  /** Chat panel root — keyboard only when this scope is armed / focused. */
  scopeRef: RefObject<HTMLElement | null>
  modeLabel?: string
  /** CSS module class applied to the jumped message for a brief flash (M1). */
  flashClassName: string
}

export default function ConversationNavRail({
  turns,
  scrollParentRef,
  scopeRef,
  modeLabel,
  flashClassName,
}: Props) {
  const { ts } = useI18n()
  const host = useConversationNavHost()
  const labelId = useId()
  const railRef = useRef<HTMLElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const turnIds = useMemo(() => turns.map((turn) => turn.id), [turns])
  const [eligible, setEligible] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [railHovering, setRailHovering] = useState(false)
  const [tipAnchor, setTipAnchor] = useState<{ left: number; top: number } | null>(null)

  const { scrubbing, suppress } = useScrollScrubReveal(scrollParentRef, eligible)
  const anchor = useChatSidebarRailAnchor(host, eligible, railRef)

  const syncEligibilityAndActive = useCallback(() => {
    const parent = scrollParentRef.current
    const nextEligible = shouldShowConversationNav(turns.length, parent)
    setEligible(nextEligible)
    if (!nextEligible || !parent) {
      setActiveId(null)
      return
    }
    setActiveId(computeActiveTurnId(parent, turnIds))
  }, [scrollParentRef, turnIds, turns.length])

  useEffect(() => {
    syncEligibilityAndActive()
    const parent = scrollParentRef.current
    if (!parent) return

    const onScroll = () => {
      setActiveId(computeActiveTurnId(parent, turnIds))
    }
    parent.addEventListener('scroll', onScroll, { passive: true })

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncEligibilityAndActive())
        : null
    ro?.observe(parent)

    return () => {
      parent.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [scrollParentRef, syncEligibilityAndActive, turnIds])

  useEffect(() => {
    syncEligibilityAndActive()
  }, [turns, syncEligibilityAndActive])

  const jumpTo = useCallback(
    (messageId: string) => {
      const parent = scrollParentRef.current
      if (!parent) return
      setActiveId(messageId)
      suppress()
      scrollTurnIntoView(parent, messageId)
      flashTurnHighlight(parent, messageId, flashClassName)
    },
    [flashClassName, scrollParentRef, suppress],
  )

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return

    const inNavSurface = (node: Node | null) =>
      !!node && (railRef.current?.contains(node) ?? false)

    let armed = false
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      armed = scope.contains(target) || inNavSurface(target)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      const focusInside =
        scope.contains(document.activeElement) || inNavSurface(document.activeElement)
      if (!armed && !focusInside) return
      if (turns.length === 0) return

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
  }, [activeId, jumpTo, scopeRef, scrollParentRef, turnIds, turns.length])

  const revealed =
    eligible && (scrubbing || railHovering || focusedId != null)

  const previewId = hoveredId ?? focusedId
  const previewTurn = previewId ? turns.find((turn) => turn.id === previewId) : undefined

  // Keep the active bar visible inside the stack when the list is long.
  useEffect(() => {
    if (!revealed || !activeId || !stackRef.current) return
    const marker = Array.from(
      stackRef.current.querySelectorAll<HTMLElement>('[data-nav-turn-id]'),
    ).find((el) => el.getAttribute('data-nav-turn-id') === activeId)
    marker?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, revealed])

  // Keep the prompt card glued to the hovered marker across zoom / panel resize.
  useLayoutEffect(() => {
    if (!revealed || !previewId || !stackRef.current) {
      setTipAnchor(null)
      return
    }

    const stack = stackRef.current
    let raf = 0
    let cancelled = false

    const syncTip = () => {
      if (cancelled) return
      const marker = Array.from(
        stack.querySelectorAll<HTMLElement>('[data-nav-turn-id]'),
      ).find((el) => el.getAttribute('data-nav-turn-id') === previewId)
      if (!marker) {
        setTipAnchor(null)
        return
      }
      const rect = marker.getBoundingClientRect()
      const next = { left: rect.left - 8, top: rect.top + rect.height / 2 }
      setTipAnchor((prev) => {
        if (
          prev &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5
        ) {
          return prev
        }
        return next
      })
    }

    const tick = () => {
      if (cancelled) return
      syncTip()
      raf = window.requestAnimationFrame(tick)
    }

    syncTip()
    raf = window.requestAnimationFrame(tick)
    stack.addEventListener('scroll', syncTip, { passive: true })
    window.addEventListener('resize', syncTip)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', syncTip)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      stack.removeEventListener('scroll', syncTip)
      window.removeEventListener('resize', syncTip)
      viewport?.removeEventListener('resize', syncTip)
    }
  }, [previewId, revealed])

  if (!eligible || turns.length === 0 || !host || !anchor) return null

  const railStyle = {
    left: anchor.left,
    top: anchor.top,
    right: 'auto',
  } satisfies CSSProperties

  const tipStyle =
    tipAnchor != null
      ? ({
          left: tipAnchor.left,
          top: tipAnchor.top,
        } satisfies CSSProperties)
      : undefined

  return createPortal(
    <>
      <nav
        ref={railRef}
        className={`${styles.rail} ${revealed ? styles.revealed : ''}`}
        style={railStyle}
        aria-labelledby={labelId}
        aria-hidden={revealed ? undefined : true}
        data-conversation-nav-rail=""
        data-nav-side="left-exterior"
        data-revealed={revealed ? 'true' : 'false'}
        onPointerEnter={() => setRailHovering(true)}
        onPointerLeave={() => setRailHovering(false)}
      >
        <span id={labelId} className={styles.visuallyHidden}>
          {ts('chat.nav.railLabel')}
        </span>
        <div
          ref={stackRef}
          className={styles.stack}
          onWheel={(event) => {
            // Keep stack scrolling local — do not drive the chat transcript.
            event.stopPropagation()
          }}
        >
          {turns.map((turn) => {
            const isActive = turn.id === activeId
            const tone = toneClassForChatMode(turn.chatMode)
            const toneClass = tone ? styles[tone] : ''
            return (
              <button
                key={turn.id}
                type="button"
                data-nav-turn-id={turn.id}
                className={`${styles.marker} ${toneClass} ${isActive ? styles.markerActive : ''}`}
                aria-label={ts('chat.nav.markerLabel', { preview: turn.preview })}
                aria-current={isActive ? 'true' : undefined}
                tabIndex={revealed ? 0 : -1}
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
              </button>
            )
          })}
        </div>
      </nav>
      {revealed && previewTurn && tipStyle ? (
        <div
          className={styles.tooltip}
          style={tipStyle}
          role="tooltip"
          data-conversation-nav-tooltip=""
        >
          <span className={styles.tooltipPreview}>{previewTurn.preview}</span>
          {modeLabel || previewTurn.timestamp ? (
            <span className={styles.tooltipMeta}>
              {[modeLabel, formatTime(previewTurn.timestamp), statusLabel(previewTurn.status, ts)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </>,
    document.body,
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
