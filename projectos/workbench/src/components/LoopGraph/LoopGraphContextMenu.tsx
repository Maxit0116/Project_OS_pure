import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useRovingMenuFocus } from '../FunctionMap/useRovingMenuFocus'
import styles from './LoopGraphContextMenu.module.css'

const VIEWPORT_MARGIN = 8

export type LoopGraphContextMenuState =
  | {
      kind: 'blank'
      x: number
      y: number
      worldX: number
      worldY: number
      restoreFocusTo?: HTMLElement
    }
  | {
      kind: 'node'
      x: number
      y: number
      nodeId: string
      restoreFocusTo?: HTMLElement
    }
  | {
      kind: 'edge'
      x: number
      y: number
      edgeId: string
      restoreFocusTo?: HTMLElement
    }

interface Props {
  menu: LoopGraphContextMenuState | null
  onClose: () => void
  onCreateNode: (world: { x: number; y: number }) => void
  onConnectFrom: (nodeId: string) => void
  onViewDescription: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onDeleteEdge: (edgeId: string) => void
}

export default function LoopGraphContextMenu({
  menu,
  onClose,
  onCreateNode,
  onConnectFrom,
  onViewDescription,
  onDeleteNode,
  onDeleteEdge,
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
      if (menuRef.current && !menuRef.current.contains(target)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [menu, onClose])

  if (!menu) return null

  const left = position?.x ?? menu.x
  const top = position?.y ?? menu.y

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ts('chat.loopGraph.contextMenu')}
      data-zone-interactive
      style={{ left, top }}
      onKeyDown={handleMenuKeyDown}
    >
      {menu.kind === 'blank' ? (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => {
            onCreateNode({ x: menu.worldX, y: menu.worldY })
            onClose()
          }}
        >
          <Plus className={styles.menuItemIcon} size={14} aria-hidden />
          {ts('chat.loopGraph.addNode')}
        </button>
      ) : null}

      {menu.kind === 'node' ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onConnectFrom(menu.nodeId)
              onClose()
            }}
          >
            <GitBranch className={styles.menuItemIcon} size={14} aria-hidden />
            {ts('chat.loopGraph.connect')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onViewDescription(menu.nodeId)
              onClose()
            }}
          >
            <Eye className={styles.menuItemIcon} size={14} aria-hidden />
            {ts('chat.loopGraph.viewDescription')}
          </button>
          <div className={styles.separator} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onDeleteNode(menu.nodeId)
              onClose()
            }}
          >
            <Trash2 className={styles.menuItemIcon} size={14} aria-hidden />
            {ts('chat.loopGraph.deleteNode')}
          </button>
        </>
      ) : null}

      {menu.kind === 'edge' ? (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => {
            onDeleteEdge(menu.edgeId)
            onClose()
          }}
        >
          <Trash2 className={styles.menuItemIcon} size={14} aria-hidden />
          {ts('chat.loopGraph.deleteEdge')}
        </button>
      ) : null}
    </div>,
    document.body,
  )
}
