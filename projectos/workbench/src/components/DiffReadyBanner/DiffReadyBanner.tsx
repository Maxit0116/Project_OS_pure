import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDiff } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  DIFF_READY_BANNER_AUTO_DISMISS_MS,
  DIFF_READY_SWIPE_DISMISS_THRESHOLD_PX,
} from '../../notifications/diffReadyNotification'
import styles from './DiffReadyBanner.module.css'

interface Props {
  title: string
  body: string
  destination: 'ask' | 'diff'
  onReview: () => void
  onDismiss: () => void
}

export default function DiffReadyBanner({ title, body, destination, onReview, onDismiss }: Props) {
  const { ts } = useI18n()
  const [dismissing, setDismissing] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartX = useRef<number | null>(null)
  const wheelAccum = useRef(0)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const animateDismiss = useCallback(() => {
    setDismissing(true)
    window.setTimeout(onDismiss, 220)
  }, [onDismiss])

  useEffect(() => {
    dismissTimer.current = setTimeout(animateDismiss, DIFF_READY_BANNER_AUTO_DISMISS_MS)
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [animateDismiss])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaX <= 0) {
      wheelAccum.current = 0
      return
    }
    event.preventDefault()
    wheelAccum.current += event.deltaX
    setDragOffset(Math.min(wheelAccum.current, 160))
    if (wheelAccum.current >= DIFF_READY_SWIPE_DISMISS_THRESHOLD_PX) {
      animateDismiss()
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragStartX.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return
    const delta = Math.max(0, event.clientX - dragStartX.current)
    setDragOffset(Math.min(delta, 160))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return
    const delta = Math.max(0, event.clientX - dragStartX.current)
    dragStartX.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (delta >= DIFF_READY_SWIPE_DISMISS_THRESHOLD_PX) {
      animateDismiss()
      return
    }
    setDragOffset(0)
    wheelAccum.current = 0
  }

  const handleReview = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    onReview()
  }

  return (
    <div
      className={`${styles.banner} ${dismissing ? styles.dismissing : ''} glass-overlay-enter`}
      style={{ transform: `translateX(${dragOffset}px)` }}
      role="status"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <button type="button" className={styles.content} onClick={handleReview}>
        <FileDiff className={styles.icon} size={18} strokeWidth={1.75} aria-hidden />
        <div className={styles.text}>
          <span className={styles.title}>{title}</span>
          <span className={styles.body}>{body}</span>
          <span className={styles.action}>
            {ts(destination === 'ask' ? 'diffReadyNotify.viewAnswerAction' : 'diffReadyNotify.reviewAction')}
          </span>
        </div>
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={animateDismiss}
        aria-label={ts('common.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
