import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Layers, MoreHorizontal, Trash2 } from 'lucide-react'
import {
  LOOP_LAYER_COLOR_KEYS,
  type LoopLayerColorKey,
  type LoopLayerRect,
  type LoopLayerResizeEdge,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LoopLayerFrame.module.css'

interface Props {
  layerId: string
  title: string
  colorKey: LoopLayerColorKey
  bounds: LoopLayerRect
  memberCount: number
  selected: boolean
  /**
   * When true (stage-layer create marquee armed), title/handles ignore
   * pointers so nested marquees can start inside a parent layer.
   */
  pointerPassThrough?: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onSetColor: (colorKey: LoopLayerColorKey) => void
  onDissolve: () => void
  onResizeEdgePointerDown: (
    layerId: string,
    edge: LoopLayerResizeEdge,
    event: ReactPointerEvent,
  ) => void
}

const COLOR_CLASS: Record<LoopLayerColorKey, string> = {
  coral: styles.color_coral,
  sand: styles.color_sand,
  sage: styles.color_sage,
  sky: styles.color_sky,
  lilac: styles.color_lilac,
  slate: styles.color_slate,
}

const DOT_CLASS: Record<LoopLayerColorKey, string> = {
  coral: styles.dot_coral,
  sand: styles.dot_sand,
  sage: styles.dot_sage,
  sky: styles.dot_sky,
  lilac: styles.dot_lilac,
  slate: styles.dot_slate,
}

const VIEWPORT_MARGIN = 8

export default function LoopLayerFrame({
  layerId,
  title,
  colorKey,
  bounds,
  memberCount,
  selected,
  pointerPassThrough = false,
  onSelect,
  onRename,
  onSetColor,
  onDissolve,
  onResizeEdgePointerDown,
}: Props) {
  const { ts } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) setDraftTitle(title)
  }, [title, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null)
      return
    }
    const button = menuButtonRef.current
    const menu = menuRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const menuWidth = menu?.offsetWidth ?? 160
    const menuHeight = menu?.offsetHeight ?? 160
    let left = rect.right - menuWidth
    let top = rect.bottom + 4
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
    if (left + menuWidth > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - menuWidth - VIEWPORT_MARGIN,
      )
    }
    if (top + menuHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, rect.top - menuHeight - 4)
    }
    setMenuPos({ top, left })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (menuButtonRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const commitTitle = () => {
    const next = draftTitle.trim()
    if (next && next !== title) onRename(next)
    else setDraftTitle(title)
    setEditing(false)
  }

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') commitTitle()
    if (event.key === 'Escape') {
      setDraftTitle(title)
      setEditing(false)
    }
  }

  const edgeDown =
    (edge: LoopLayerResizeEdge) => (event: ReactPointerEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      onSelect()
      onResizeEdgePointerDown(layerId, edge, event)
    }

  const requestDissolve = () => {
    setMenuOpen(false)
    onDissolve()
  }

  return (
    <div
      className={`${styles.frame} ${COLOR_CLASS[colorKey]} ${
        selected ? styles.selected : ''
      } ${pointerPassThrough ? styles.passThrough : ''}`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      data-loop-layer={layerId}
      aria-label={ts('chat.loopGraph.layer.frameLabel', { title })}
    >
      <div
        className={styles.titleBar}
        onPointerDown={(event) => {
          if (event.button !== 0 || editing) return
          event.stopPropagation()
          onSelect()
        }}
      >
        <Layers className={styles.titleIcon} size={13} strokeWidth={1.75} aria-hidden />
        {editing ? (
          <input
            ref={inputRef}
            className={styles.titleInput}
            value={draftTitle}
            aria-label={ts('chat.loopGraph.layer.rename')}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className={styles.titleText}
            title={ts('chat.loopGraph.layer.rename')}
            aria-label={`${title} — ${ts('chat.loopGraph.layer.rename')}`}
            onPointerDown={(event) => {
              // Keep select on the bar; don't let this start a canvas pan/drag.
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
              setMenuOpen(false)
              setEditing(true)
            }}
          >
            {title}
          </button>
        )}
        <span
          className={styles.memberBadge}
          title={ts('chat.loopGraph.layer.memberCount', { count: memberCount })}
        >
          {memberCount}
        </span>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={ts('chat.loopGraph.layer.dissolve')}
          title={ts('chat.loopGraph.layer.dissolve')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
            requestDissolve()
          }}
        >
          <Trash2 size={13} strokeWidth={1.75} aria-hidden />
        </button>
        <div className={styles.menuWrap}>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label={ts('chat.loopGraph.layer.menu')}
            aria-expanded={menuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
              setMenuOpen((open) => !open)
            }}
          >
            <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      {/* Interior is pointer-transparent so blank drags pan the canvas. */}

      {selected ? (
        <>
          <div className={`${styles.handle} ${styles.handleN}`} onPointerDown={edgeDown('n')} />
          <div className={`${styles.handle} ${styles.handleS}`} onPointerDown={edgeDown('s')} />
          <div className={`${styles.handle} ${styles.handleE}`} onPointerDown={edgeDown('e')} />
          <div className={`${styles.handle} ${styles.handleW}`} onPointerDown={edgeDown('w')} />
          <div
            className={`${styles.handle} ${styles.handleCorner} ${styles.handleNE}`}
            onPointerDown={edgeDown('ne')}
          />
          <div
            className={`${styles.handle} ${styles.handleCorner} ${styles.handleNW}`}
            onPointerDown={edgeDown('nw')}
          />
          <div
            className={`${styles.handle} ${styles.handleCorner} ${styles.handleSE}`}
            onPointerDown={edgeDown('se')}
          />
          <div
            className={`${styles.handle} ${styles.handleCorner} ${styles.handleSW}`}
            onPointerDown={edgeDown('sw')}
          />
        </>
      ) : null}

      {menuOpen
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.menuPortal}
              role="menu"
              style={
                menuPos
                  ? { top: menuPos.top, left: menuPos.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false)
                  setEditing(true)
                }}
              >
                {ts('chat.loopGraph.layer.rename')}
              </button>
              <div
                className={styles.colorRow}
                role="group"
                aria-label={ts('chat.loopGraph.layer.color')}
              >
                {LOOP_LAYER_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.colorDot} ${DOT_CLASS[key]} ${
                      key === colorKey ? styles.colorDotActive : ''
                    }`}
                    aria-label={key}
                    aria-pressed={key === colorKey}
                    onClick={() => {
                      onSetColor(key)
                      setMenuOpen(false)
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={requestDissolve}
              >
                <Trash2 size={12} strokeWidth={1.75} aria-hidden />
                {ts('chat.loopGraph.layer.dissolve')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
