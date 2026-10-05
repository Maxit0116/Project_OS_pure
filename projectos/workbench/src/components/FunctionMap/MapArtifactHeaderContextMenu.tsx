import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MapArtifactType } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useRovingMenuFocus } from './useRovingMenuFocus'
import styles from './FunctionMapContextMenu.module.css'

const VIEWPORT_MARGIN = 8

export interface MapArtifactHeaderContextMenuState {
  x: number
  y: number
  artifactId: string
  artifactType: MapArtifactType
  restoreFocusTo?: HTMLElement
}

interface Props {
  menu: MapArtifactHeaderContextMenuState | null
  onClose: () => void
  onRename: () => void
  onAddStacked: () => void
}

export default function MapArtifactHeaderContextMenu({
  menu,
  onClose,
  onRename,
  onAddStacked,
}: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const handleMenuKeyDown = useRovingMenuFocus(
    menuRef,
    Boolean(menu),
    onClose,
    menu?.restoreFocusTo,
  )
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

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menu, onClose])

  if (!menu) return null

  const left = position?.x ?? menu.x
  const top = position?.y ?? menu.y

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ts('mapArtifacts.renameTitle')}
      data-zone-interactive
      style={{ left, top }}
      onKeyDown={handleMenuKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => {
          onRename()
          onClose()
        }}
      >
        {ts('mapArtifacts.renameTitle')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => {
          onAddStacked()
          onClose()
        }}
      >
        {ts('mapArtifacts.addStacked')}
      </button>
    </div>,
    document.body,
  )
}
