import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderMinus, FolderOpen, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import styles from './CaptureCardContextMenu.module.css'

const VIEWPORT_MARGIN = 8

export type CaptureCardContextMenuState =
  | {
      kind: 'folder'
      folderId: string
      x: number
      y: number
    }
  | {
      kind: 'workspace'
      sessionId: string
      x: number
      y: number
    }

interface Props {
  menu: CaptureCardContextMenuState | null
  onClose: () => void
  onOpen: () => void
  onDissolve?: () => void
  onDelete: () => void
}

export default function CaptureCardContextMenu({
  menu,
  onClose,
  onOpen,
  onDissolve,
  onDelete,
}: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null)
      return
    }
    const el = menuRef.current
    if (!el) {
      setPosition({ x: menu.x, y: menu.y })
      return
    }
    const rect = el.getBoundingClientRect()
    let x = menu.x
    let y = menu.y
    if (x + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      x = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    }
    if (y + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      y = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN)
    }
    setPosition({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menu, onClose])

  if (!menu) return null

  const left = position?.x ?? menu.x
  const top = position?.y ?? menu.y
  const isFolder = menu.kind === 'folder'

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ts('spatialCaptures.cardContextMenu')}
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => {
          onOpen()
          onClose()
        }}
      >
        <FolderOpen className={styles.menuItemIcon} size={14} aria-hidden />
        {isFolder ? ts('spatialCaptures.openFolder') : ts('spatialCaptures.open')}
      </button>

      {isFolder && onDissolve ? (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => {
            onDissolve()
            onClose()
          }}
        >
          <FolderMinus className={styles.menuItemIcon} size={14} aria-hidden />
          {ts('spatialCaptures.dissolveFolder')}
        </button>
      ) : null}

      <div className={styles.separator} role="separator" />

      <button
        type="button"
        role="menuitem"
        className={`${styles.menuItem} ${styles.menuItemDanger}`}
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <Trash2 className={styles.menuItemIcon} size={14} aria-hidden />
        {isFolder
          ? ts('spatialCaptures.deleteFolderCascade')
          : ts('spatialCaptures.delete')}
      </button>
    </div>,
    document.body,
  )
}
