import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Crown, MoreHorizontal, Users } from 'lucide-react'
import type {
  LoopWorkGroupCollaborationMode,
  LoopWorkGroupFrameBounds,
  LoopWorkGroupPort,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LoopWorkGroupFrame.module.css'

interface Props {
  workGroupId: string
  title: string
  bounds: LoopWorkGroupFrameBounds
  memberCount: number
  selected: boolean
  collaborationMode: LoopWorkGroupCollaborationMode
  coordinatorTitle?: string | null
  showPorts: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onTitleDragMove: (delta: { dx: number; dy: number }) => void
  onDissolve: () => void
  /** Double-click title bar → open secondary (L2) collaboration graph. */
  onOpenInterior: () => void
  onPortPointerDown: (workGroupId: string, port: LoopWorkGroupPort) => void
}

export default function LoopWorkGroupFrame({
  workGroupId,
  title,
  bounds,
  memberCount,
  selected,
  collaborationMode,
  coordinatorTitle,
  showPorts,
  onSelect,
  onRename,
  onTitleDragMove,
  onDissolve,
  onOpenInterior,
  onPortPointerDown,
}: Props) {
  const { ts } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ px: number; py: number; lastX: number; lastY: number } | null>(
    null,
  )

  useEffect(() => {
    if (!editing) setDraftTitle(title)
  }, [title, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commitTitle = () => {
    const next = draftTitle.trim()
    if (next && next !== title) onRename(next)
    else setDraftTitle(title)
    setEditing(false)
  }

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      commitTitle()
    }
    if (event.key === 'Escape') {
      setDraftTitle(title)
      setEditing(false)
    }
  }

  const onTitlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editing) return
    event.stopPropagation()
    onSelect()
    dragRef.current = {
      px: event.clientX,
      py: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onTitlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    if (dx === 0 && dy === 0) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    onTitleDragMove({ dx, dy })
  }

  const onTitlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    // Suppress accidental open after a real drag.
    if (
      drag &&
      (Math.abs(event.clientX - drag.px) > 4 || Math.abs(event.clientY - drag.py) > 4)
    ) {
      return
    }
  }

  const modeLabel = ts(`chat.loopGraph.workGroup.mode.${collaborationMode}`)

  return (
    <div
      className={`${styles.frame} ${selected ? styles.selected : ''}`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      data-loop-work-group={workGroupId}
    >
      {memberCount === 0 ? (
        <div
          className={styles.emptyHit}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            onSelect()
          }}
        />
      ) : null}
      <div
        className={styles.titleBar}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (editing) return
          onOpenInterior()
        }}
      >
        <Users size={13} strokeWidth={1.75} aria-hidden className={styles.titleIcon} />
        {editing ? (
          <input
            ref={inputRef}
            className={styles.titleInput}
            value={draftTitle}
            aria-label={ts('chat.loopGraph.workGroup.title')}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <span className={styles.titleText} title={title}>
            {title}
          </span>
        )}
        <span className={styles.memberBadge} title={ts('chat.loopGraph.workGroup.memberCount', { count: memberCount })}>
          {memberCount}
        </span>
        {coordinatorTitle ? (
          <span className={styles.crown} title={coordinatorTitle}>
            <Crown size={12} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <span className={styles.modeChip}>{modeLabel}</span>
        <div className={styles.menuWrap}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label={ts('chat.loopGraph.workGroup.title')}
            aria-expanded={menuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen((open) => !open)
            }}
          >
            <MoreHorizontal size={14} aria-hidden />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen(false)
                  onOpenInterior()
                }}
              >
                {ts('chat.loopGraph.workGroup.openInterior')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen(false)
                  setEditing(true)
                }}
              >
                {ts('chat.loopGraph.workGroup.rename')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen(false)
                  onDissolve()
                }}
              >
                {ts('chat.loopGraph.workGroup.dissolve')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {memberCount === 0 ? (
        <p className={styles.emptyHint}>{ts('chat.loopGraph.workGroup.emptyHint')}</p>
      ) : null}

      {showPorts ? (
        <>
          <button
            type="button"
            className={`${styles.port} ${styles.portIn}`}
            aria-label={ts('chat.loopGraph.workGroup.portIn')}
            data-loop-work-group-port="in"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              onSelect()
              onPortPointerDown(workGroupId, 'in')
            }}
          />
          <button
            type="button"
            className={`${styles.port} ${styles.portOut}`}
            aria-label={ts('chat.loopGraph.workGroup.portOut')}
            data-loop-work-group-port="out"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              onSelect()
              onPortPointerDown(workGroupId, 'out')
            }}
          />
        </>
      ) : null}
    </div>
  )
}
