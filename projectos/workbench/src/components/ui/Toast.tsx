import { CheckCircle2, Info, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react'
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

const TYPE_CLASS: Record<ToastType, string> = {
  success: styles.success,
  info: styles.info,
  warning: styles.warning,
  error: styles.error,
}

const TYPE_ICON: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
}

export default function Toast({ toast, onDismiss }: Props) {
  const IconComponent = TYPE_ICON[toast.type]
  return (
    <div className={`${styles.toast} ${TYPE_CLASS[toast.type]} glass-overlay-enter`} role="status">
      <IconComponent className={styles.icon} size={16} strokeWidth={1.75} aria-hidden />
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export type { LucideIcon }
