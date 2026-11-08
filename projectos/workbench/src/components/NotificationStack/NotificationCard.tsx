import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, FileDiff, Lightbulb, MessageSquareWarning, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  NOTIFICATION_MIN_LINGER_MS,
  NOTIFICATION_SWIPE_DELETE_REVEAL_PX,
  NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX,
  type AppNotification,
} from '../../notifications/notificationCenterTypes'
import styles from './NotificationStack.module.css'

interface Props {
  notification: AppNotification
  stacked?: boolean
  stackIndex?: number
  /** Collapsed typed stack: Clear deletes the whole group. */
  deleteWholeStack?: boolean
  muted?: boolean
  onActivate: (id: string) => void
  onArchive: (id: string) => void
  onDelete: () => void
  onExpandStack?: () => void
  onIgnore?: (id: string) => void
}

function iconFor(notification: AppNotification) {
  if (notification.kind === 'first_principles_suggest') return Lightbulb
  if (notification.kind === 'agent_diff') return FileDiff
  if (notification.kind === 'decision' || notification.kind === 'toast_warning') {
    return MessageSquareWarning
  }
  return Bell
}

/**
 * Mac Notification Center–inspired gestures:
 * - Swipe right → shelve (dismiss into Notification Center)
 * - Swipe left → reveal Clear (trash) on the right; click to delete
 */
export default function NotificationCard({
  notification,
  stacked = false,
  stackIndex = 0,
  deleteWholeStack = false,
  muted = false,
  onActivate,
  onArchive,
  onDelete,
  onExpandStack,
  onIgnore,
}: Props) {
  const { ts } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'archiving' | 'deleting'>('idle')
  const [dragOffset, setDragOffset] = useState(0)
  const [clearOpen, setClearOpen] = useState(false)
  const dragStartX = useRef<number | null>(null)
  const dragStartOffset = useRef(0)
  const wheelAccum = useRef(0)
  const wheelSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const Icon = iconFor(notification)
  const interactive = !stacked || stackIndex === 0
  const isFpSuggest = notification.kind === 'first_principles_suggest'
  const canArchive =
    notification.ephemeral || Date.now() - notification.createdAt >= NOTIFICATION_MIN_LINGER_MS

  const closeClear = useCallback(() => {
    setClearOpen(false)
    setDragOffset(0)
    wheelAccum.current = 0
  }, [])

  const animateArchive = useCallback(() => {
    if (!canArchive) {
      closeClear()
      return
    }
    setClearOpen(false)
    setPhase('archiving')
    window.setTimeout(() => onArchive(notification.id), 200)
  }, [canArchive, closeClear, notification.id, onArchive])

  const animateDelete = useCallback(() => {
    setClearOpen(false)
    setPhase('deleting')
    window.setTimeout(() => onDelete(), 200)
  }, [onDelete])

  // Click outside / Escape closes the Clear rail (Mac NC behavior).
  useEffect(() => {
    if (!clearOpen) return undefined
    const onPointer = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) closeClear()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeClear()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [clearOpen, closeClear])

  const clampOffset = (delta: number) => {
    const maxRight = muted ? 0 : 180
    const maxLeft = -NOTIFICATION_SWIPE_DELETE_REVEAL_PX
    return Math.max(maxLeft, Math.min(maxRight, delta))
  }

  const settleFromOffset = (offset: number) => {
    if (!muted && offset >= NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX) {
      animateArchive()
      return
    }
    // Left swipe past half the Clear rail → snap open Clear.
    if (offset <= -NOTIFICATION_SWIPE_DELETE_REVEAL_PX * 0.45) {
      setClearOpen(true)
      setDragOffset(-NOTIFICATION_SWIPE_DELETE_REVEAL_PX)
      wheelAccum.current = -NOTIFICATION_SWIPE_DELETE_REVEAL_PX
      return
    }
    closeClear()
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!interactive || phase !== 'idle') return
    // Prefer horizontal trackpad intent; ignore mostly-vertical scrolls.
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 0.6) return
    event.preventDefault()
    event.stopPropagation()
    const next = clampOffset(
      (clearOpen ? -NOTIFICATION_SWIPE_DELETE_REVEAL_PX : wheelAccum.current) + event.deltaX,
    )
    wheelAccum.current = next
    setDragOffset(next)
    if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
    if (!muted && next >= NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX) {
      animateArchive()
      return
    }
    // Debounce settle so a continuous trackpad swipe feels like Mac NC.
    wheelSettleTimer.current = setTimeout(() => {
      settleFromOffset(wheelAccum.current)
    }, 120)
  }

  useEffect(() => {
    return () => {
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || phase !== 'idle') return
    if (event.button !== 0) return
    // Don't start a drag from explicit action controls (suggest CTAs).
    const target = event.target as HTMLElement
    if (
      target.closest(`.${styles.suggestPrimary}`) ||
      target.closest(`.${styles.suggestSecondary}`)
    ) {
      return
    }
    dragStartX.current = event.clientX
    dragStartOffset.current = clearOpen ? -NOTIFICATION_SWIPE_DELETE_REVEAL_PX : 0
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return
    const delta = event.clientX - dragStartX.current + dragStartOffset.current
    setDragOffset(clampOffset(delta))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return
    const delta = clampOffset(event.clientX - dragStartX.current + dragStartOffset.current)
    dragStartX.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    settleFromOffset(delta)
  }

  const handlePrimaryClick = () => {
    // A just-finished drag can still fire click — ignore tiny residual opens.
    if (clearOpen) {
      closeClear()
      return
    }
    if (Math.abs(dragOffset) > 4) return
    if (stacked && stackIndex === 0 && onExpandStack) {
      onExpandStack()
      return
    }
    onActivate(notification.id)
  }

  const actionLabel =
    notification.kind === 'first_principles_suggest'
      ? ts('firstPrinciples.suggestStart')
      : notification.destination === 'ask'
        ? ts('diffReadyNotify.viewAnswerAction')
        : notification.destination === 'reminder'
          ? ts('diffReadyNotify.openReminderAction')
          : notification.destination === 'decisions'
            ? ts('notificationCenter.openDecisionAction')
            : notification.destination === 'diff'
              ? ts('diffReadyNotify.reviewAction')
              : ts('notificationCenter.openAction')

  const stackTransform = stacked
    ? `translateY(${stackIndex * 10}px) scale(${1 - stackIndex * 0.04}) translateX(${dragOffset}px)`
    : `translateX(${dragOffset}px)`

  return (
    <div
      ref={shellRef}
      className={`${styles.cardShell} ${stacked ? styles.stackedCard : ''} ${
        muted ? styles.mutedCard : ''
      } ${clearOpen ? styles.clearOpen : ''}`}
      style={{
        zIndex: Math.max(1, 20 - stackIndex),
      }}
    >
      {/* Clear rail sits under the card on the RIGHT — revealed by left swipe. */}
      <div className={styles.clearRail} aria-hidden={!clearOpen}>
        <button
          type="button"
          className={styles.clearButton}
          aria-label={
            deleteWholeStack
              ? ts('notificationCenter.deleteStack')
              : ts('notificationCenter.delete')
          }
          tabIndex={clearOpen ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation()
            animateDelete()
          }}
        >
          <Trash2 size={15} strokeWidth={1.75} aria-hidden />
          <span className={styles.clearLabel}>{ts('notificationCenter.clear')}</span>
        </button>
      </div>

      <div
        className={`${styles.card} ${phase === 'archiving' ? styles.archiving : ''} ${
          phase === 'deleting' ? styles.deleting : ''
        }`}
        style={{
          transform: stackTransform,
          opacity: stacked ? Math.max(0.55, 1 - stackIndex * 0.18) : muted ? 0.78 : 1,
        }}
        role="status"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {isFpSuggest && !muted ? (
          <div className={styles.suggestBody}>
            <div className={styles.suggestCopy}>
              <Icon className={styles.icon} size={14} strokeWidth={1.75} aria-hidden />
              <div className={styles.text}>
                <span className={styles.title}>{notification.title}</span>
                <span className={styles.body}>{notification.body}</span>
              </div>
            </div>
            <div className={styles.suggestActions}>
              <button
                type="button"
                className={styles.suggestPrimary}
                onClick={(event) => {
                  event.stopPropagation()
                  onActivate(notification.id)
                }}
              >
                {actionLabel}
              </button>
              {onIgnore ? (
                <button
                  type="button"
                  className={styles.suggestSecondary}
                  onClick={(event) => {
                    event.stopPropagation()
                    onIgnore(notification.id)
                  }}
                >
                  {ts('firstPrinciples.suggestDismiss')}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button type="button" className={styles.content} onClick={handlePrimaryClick}>
            <Icon className={styles.icon} size={14} strokeWidth={1.75} aria-hidden />
            <div className={styles.text}>
              <span className={styles.title}>{notification.title}</span>
              <span className={styles.body}>{notification.body}</span>
              {!muted && notification.destination !== 'none' ? (
                <span className={styles.action}>{actionLabel}</span>
              ) : null}
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
