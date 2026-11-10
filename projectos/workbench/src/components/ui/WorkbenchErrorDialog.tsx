import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  handleTopmostOverlayEscape,
  registerOverlay,
} from '../overlays/overlayStack'
import styles from './WorkbenchErrorDialog.module.css'

interface Props {
  message: string
  onDismiss: () => void
}

export default function WorkbenchErrorDialog({ message, onDismiss }: Props) {
  const { ts } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayTokenRef = useRef(Symbol('workbench-error-dialog'))
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    const token = overlayTokenRef.current
    const unregister = registerOverlay(token)
    dialogRef.current?.focus()
    const refocus = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const onKey = (event: KeyboardEvent) => {
      handleTopmostOverlayEscape(event, token, () => onDismissRef.current())
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(refocus)
      document.removeEventListener('keydown', onKey)
      unregister()
    }
  }, [])

  return createPortal(
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdrop}
        aria-label={ts('common.close')}
        onClick={onDismiss}
      />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <AlertTriangle className={styles.icon} size={16} strokeWidth={1.75} aria-hidden />
            <h2 id={titleId} className={styles.title}>
              {ts('errors.dialogTitle')}
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('common.dismiss')}
            onClick={onDismiss}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p id={descriptionId} className={styles.message}>
          {message}
        </p>
      </div>
    </div>,
    document.body,
  )
}
