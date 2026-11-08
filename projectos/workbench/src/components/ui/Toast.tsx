import { useCallback, useRef, useState } from 'react'
import { Check, Info, AlertTriangle, X, type LucideIcon } from 'lucide-react'
import { NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX } from '../../notifications/notificationCenterTypes'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface Props {
  toast: ToastItem
  onDismiss: (id: string) => void
}

const TYPE_ICON: Record<ToastType, LucideIcon> = {
  success: Check,
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
}

export default function Toast({ toast, onDismiss }: Props) {
  const IconComponent = TYPE_ICON[toast.type]
  const [dismissing, setDismissing] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartX = useRef<number | null>(null)
  const wheelAccum = useRef(0)

  const animateDismiss = useCallback(() => {
    setDismissing(true)
    window.setTimeout(() => onDismiss(toast.id), 180)
  }, [onDismiss, toast.id])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaX <= 0) {
      wheelAccum.current = 0
      return
    }
    event.preventDefault()
    wheelAccum.current += event.deltaX
    setDragOffset(Math.min(wheelAccum.current, 160))
    if (wheelAccum.current >= NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX) {
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
    if (delta >= NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX) {
      animateDismiss()
      return
    }
    setDragOffset(0)
    wheelAccum.current = 0
  }

  return (
    <div
      className={`${styles.toast} ${dismissing ? styles.dismissing : ''}`}
      style={{ transform: `translateX(${dragOffset}px)` }}
      role="status"
      data-toast-type={toast.type}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <IconComponent className={styles.icon} size={14} strokeWidth={1.75} aria-hidden />
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={animateDismiss}
        aria-label="Dismiss"
      >
        <X size={12} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}

export type { LucideIcon }
