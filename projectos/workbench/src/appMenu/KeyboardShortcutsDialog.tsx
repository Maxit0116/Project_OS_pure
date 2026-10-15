import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import Button from '../components/ui/Button'
import {
  handleTopmostOverlayEscape,
  registerOverlay,
} from '../components/overlays/overlayStack'
import {
  KEYBOARD_SHORTCUT_GROUPS,
  usesCommandShortcutGlyph,
} from './keyboardShortcutCatalog'
import styles from './KeyboardShortcutsDialog.module.css'

interface Props {
  onClose: () => void
}

export default function KeyboardShortcutsDialog({ onClose }: Props) {
  const { ts } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayTokenRef = useRef(Symbol('keyboard-shortcuts'))
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const macKeys = usesCommandShortcutGlyph()

  useEffect(() => {
    const token = overlayTokenRef.current
    const unregister = registerOverlay(token)
    dialogRef.current?.focus()
    const refocus = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const onKey = (event: KeyboardEvent) => {
      handleTopmostOverlayEscape(event, token, () => onCloseRef.current())
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
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {ts('keyboardShortcuts.title')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {ts('common.close')}
          </Button>
        </div>
        <div className={styles.list}>
          {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
            <section key={group.id} className={styles.group} aria-label={ts(group.labelKey)}>
              <h3 className={styles.groupTitle}>{ts(group.labelKey)}</h3>
              {group.items.map((item) => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.label}>{ts(item.labelKey)}</span>
                  <span className={styles.keys}>{macKeys ? item.keys.mac : item.keys.other}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
