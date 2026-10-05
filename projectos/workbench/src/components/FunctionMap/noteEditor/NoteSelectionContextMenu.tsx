import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { useI18n } from '../../../i18n'
import menuStyles from '../FunctionMapContextMenu.module.css'
import {
  applyNoteHighlight,
  clearNoteHighlight,
  clearTextColor,
  selectionHasNoteHighlight,
  selectionHasTextColor,
} from './noteSelectionUtils'
import { useRovingMenuFocus } from '../useRovingMenuFocus'

const VIEWPORT_MARGIN = 8

export interface NoteSelectionContextMenuState {
  x: number
  y: number
  restoreFocusTo?: HTMLElement
}

export type NoteSelectionMenuAction =
  | 'changeTextColor'
  | 'highlightBackground'
  | 'clearTextColor'
  | 'clearHighlight'

interface Props {
  menu: NoteSelectionContextMenuState | null
  editor: Editor | null
  onClose: () => void
  onAction: (action: NoteSelectionMenuAction) => void
}

export default function NoteSelectionContextMenu({ menu, editor, onClose, onAction }: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const handleMenuKeyDown = useRovingMenuFocus(
    menuRef,
    Boolean(menu),
    onClose,
    menu?.restoreFocusTo,
  )
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  const canClearTextColor = editor ? selectionHasTextColor(editor) : false
  const canClearHighlight = editor ? selectionHasNoteHighlight(editor) : false

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
  }, [menu, canClearTextColor, canClearHighlight])

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

  if (!menu || !editor) return null

  const left = position?.x ?? menu.x
  const top = position?.y ?? menu.y

  const handleImmediateAction = (action: NoteSelectionMenuAction) => {
    if (action === 'highlightBackground') {
      applyNoteHighlight(editor)
    } else if (action === 'clearTextColor') {
      clearTextColor(editor)
    } else if (action === 'clearHighlight') {
      clearNoteHighlight(editor)
    } else {
      onAction(action)
      return
    }
    onClose()
  }

  const items: Array<{
    action: NoteSelectionMenuAction
    labelKey:
      | 'mapArtifacts.noteChangeTextColor'
      | 'mapArtifacts.noteHighlightBackground'
      | 'mapArtifacts.noteClearTextColor'
      | 'mapArtifacts.noteClearHighlight'
    disabled?: boolean
  }> = [
    { action: 'changeTextColor', labelKey: 'mapArtifacts.noteChangeTextColor' },
    { action: 'highlightBackground', labelKey: 'mapArtifacts.noteHighlightBackground' },
    {
      action: 'clearTextColor',
      labelKey: 'mapArtifacts.noteClearTextColor',
      disabled: !canClearTextColor,
    },
    {
      action: 'clearHighlight',
      labelKey: 'mapArtifacts.noteClearHighlight',
      disabled: !canClearHighlight,
    },
  ]

  return createPortal(
    <div
      ref={menuRef}
      className={menuStyles.menu}
      role="menu"
      aria-label={ts('mapArtifacts.noteSelectionMenuLabel')}
      data-zone-interactive
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={menuStyles.menuItem}
          disabled={item.disabled}
          aria-disabled={item.disabled || undefined}
          onClick={() => {
            if (item.disabled) return
            handleImmediateAction(item.action)
          }}
        >
          {ts(item.labelKey)}
        </button>
      ))}
    </div>,
    document.body,
  )
}
