import { useWorkbenchStore } from '../../state/workbenchStore'
import Toast from './Toast'
import styles from './ToastContainer.module.css'

export default function ToastContainer() {
  const toasts = useWorkbenchStore((s) => s.toasts)
  const dismissToast = useWorkbenchStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
