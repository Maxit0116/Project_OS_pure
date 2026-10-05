import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileCode2, Layers2, MessageCircle } from 'lucide-react'
import type { ArchitectureLevel, MapArtifactType } from '@contracts/index'
import { useI18n } from '../../i18n'
import { MAP_CREATE_ARTIFACT_ACTIONS } from './mapCreateActions'
import { isNodeAgentArchitectureLevel } from './architectureView'
import { useRovingMenuFocus } from './useRovingMenuFocus'
import styles from './FunctionMapContextMenu.module.css'

const VIEWPORT_MARGIN = 8

export interface FunctionMapContextMenuState {
  x: number
  y: number
  anchorNodeId?: string
  anchorNodeName?: string
  anchorNodeLevel?: ArchitectureLevel
  anchorFilePath?: string
  anchorParentNodeId?: string
  restoreFocusTo?: HTMLElement
}

interface Props {
  menu: FunctionMapContextMenuState | null
  onClose: () => void
  onOpenNodeAgentChat: (nodeId: string) => void
  onOpenFile: (filePath: string, parentNodeId: string) => void
  onOpenFileAgent: (filePath: string, parentNodeId: string) => void
  onSelect: (type: MapArtifactType) => void
  onCreateWorkGroup: () => void
}

export default function FunctionMapContextMenu({
  menu,
  onClose,
  onOpenNodeAgentChat,
  onOpenFile,
  onOpenFileAgent,
  onSelect,
  onCreateWorkGroup,
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
  const showNodeAgentAction = Boolean(
    menu.anchorNodeId && isNodeAgentMenuTarget(menu.anchorNodeLevel),
  )
  const showOpenFileAction = Boolean(
    menu.anchorNodeLevel === 'code' &&
      menu.anchorFilePath &&
      menu.anchorParentNodeId,
  )

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ts('map.contextMenu.menuLabel')}
      data-zone-interactive
      style={{ left, top }}
      onKeyDown={handleMenuKeyDown}
    >
      {showOpenFileAction && menu.anchorFilePath && menu.anchorParentNodeId && (
        <>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-primary-menu-action="open-file"
            onClick={() => {
              onOpenFile(menu.anchorFilePath!, menu.anchorParentNodeId!)
              onClose()
            }}
          >
            <FileCode2
              className={styles.menuItemIcon}
              size={14}
              strokeWidth={1.75}
              aria-hidden
            />
            {ts('map.contextMenu.openFile')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-primary-menu-action="open-file-agent"
            onClick={() => {
              onOpenFileAgent(menu.anchorFilePath!, menu.anchorParentNodeId!)
              onClose()
            }}
          >
            <MessageCircle
              className={styles.menuItemIcon}
              size={14}
              strokeWidth={1.75}
              aria-hidden
            />
            {ts('map.contextMenu.openFileAgent')}
          </button>
          <div className={styles.separator} role="separator" />
        </>
      )}
      {showNodeAgentAction && menu.anchorNodeId && (
        <>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-primary-menu-action="node-agent"
            onClick={() => {
              onOpenNodeAgentChat(menu.anchorNodeId!)
              onClose()
            }}
          >
            <MessageCircle
              className={styles.menuItemIcon}
              size={14}
              strokeWidth={1.75}
              aria-hidden
            />
            {ts('map.contextMenu.openNodeAgentChat')}
          </button>
          <div className={styles.separator} role="separator" />
        </>
      )}
      <div className={styles.groupLabel} aria-hidden>
        {menu.anchorNodeName
          ? `${ts('map.contextMenu.create')} · ${menu.anchorNodeName}`
          : ts('map.contextMenu.create')}
      </div>
      {MAP_CREATE_ARTIFACT_ACTIONS.map(({ type, icon: Icon, labelKey }) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => {
            onSelect(type)
            onClose()
          }}
        >
          <Icon className={styles.menuItemIcon} size={14} strokeWidth={1.75} aria-hidden />
          {ts(labelKey)}
        </button>
      ))}
      <div className={styles.groupLabel} aria-hidden>
        {ts('map.workGroup.createWorkGroup')}
      </div>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => {
          onCreateWorkGroup()
          onClose()
        }}
      >
        <Layers2 className={styles.menuItemIcon} size={14} strokeWidth={1.75} aria-hidden />
        {ts('map.workGroup.createWorkGroup')}
      </button>
    </div>,
    document.body,
  )
}

export const isNodeAgentMenuTarget = isNodeAgentArchitectureLevel
