import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Building2, Crown, MoreHorizontal, Users } from 'lucide-react'
import type {
  LoopWorkGroupCollaborationMode,
  LoopWorkGroupFrameBounds,
  LoopWorkGroupPort,
} from '@contracts/index'
import { LOOP_WORK_GROUP_PORTS } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LoopWorkGroupFrame.module.css'

interface Props {
  workGroupId: string
  /** Full display title (department · task or task). */
  title: string
  /** Editable task segment only. */
  taskTitle: string
  /** Locked department label when this is a built-in department. */
  departmentName?: string | null
  bounds: LoopWorkGroupFrameBounds
  memberCount: number
  selected: boolean
  collaborationMode: LoopWorkGroupCollaborationMode
  coordinatorTitle?: string | null
  /** Built-in department: dissolve deletes members with the frame. */
  isDepartment?: boolean
  /** Open task editing as soon as this frame mounts / becomes pending. */
  startTaskEdit?: boolean
  showPorts: boolean
  /** Stage-layer create marquee armed — chrome ignores pointers. */
  pointerPassThrough?: boolean
  onSelect: () => void
  /** Commits the task name (not the full display title). */
  onRename: (taskTitle: string) => void
  onTaskEditConsumed?: () => void
  onTitleDragMove: (delta: { dx: number; dy: number }) => void
  /** Fired when title-bar pointer capture ends (commit work-group geometry). */
  onTitleDragEnd?: () => void
  onDissolve: () => void
  /** Double-click title bar → open secondary (L2) collaboration graph. */
  onOpenInterior: () => void
  onPortPointerDown: (workGroupId: string, port: LoopWorkGroupPort) => void
}

const PORT_CLASS: Record<LoopWorkGroupPort, string> = {
  n: styles.portN,
  e: styles.portE,
  s: styles.portS,
  w: styles.portW,
}

export default function LoopWorkGroupFrame({
  workGroupId,
  title,
  taskTitle,
  departmentName,
  bounds,
  memberCount,
  selected,
  collaborationMode,
  coordinatorTitle,
  isDepartment = false,
  startTaskEdit = false,
  showPorts,
  pointerPassThrough = false,
  onSelect,
  onRename,
  onTaskEditConsumed,
  onTitleDragMove,
  onTitleDragEnd,
  onDissolve,
  onOpenInterior,
  onPortPointerDown,
}: Props) {
  const { ts } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draftTask, setDraftTask] = useState(taskTitle)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ px: number; py: number; lastX: number; lastY: number } | null>(
    null,
  )

  useEffect(() => {
    if (!editing) setDraftTask(taskTitle)
  }, [taskTitle, editing])

  useEffect(() => {
    if (!startTaskEdit) return
    setEditing(true)
    setMenuOpen(false)
    onTaskEditConsumed?.()
    // Only react to the pending flag — avoid re-opening when parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTaskEditConsumed is a stable clear
  }, [startTaskEdit])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commitTask = () => {
    const next = draftTask.trim()
    if (next !== taskTitle.trim()) onRename(next)
    else setDraftTask(taskTitle)
    setEditing(false)
  }

  const onTaskKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      commitTask()
    }
    if (event.key === 'Escape') {
      setDraftTask(taskTitle)
      setEditing(false)
    }
  }

  const beginTaskEdit = () => {
    onSelect()
    setMenuOpen(false)
    setEditing(true)
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

  const endTitleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    onTitleDragEnd?.()
    // Suppress accidental open after a real drag.
    if (
      drag &&
      (Math.abs(event.clientX - drag.px) > 4 || Math.abs(event.clientY - drag.py) > 4)
    ) {
      return
    }
  }

  const modeLabel = ts(`chat.loopGraph.workGroup.mode.${collaborationMode}`)
  const TitleIcon = isDepartment ? Building2 : Users
  const taskPlaceholder = isDepartment
    ? ts('chat.loopGraph.workGroup.taskPlaceholderDepartment')
    : ts('chat.loopGraph.workGroup.taskPlaceholder')
  const needsTask = !taskTitle.trim()

  return (
    <div
      className={`${styles.frame} ${selected ? styles.selected : ''} ${
        pointerPassThrough ? styles.passThrough : ''
      }`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      data-loop-work-group={workGroupId}
      data-loop-work-group-department={isDepartment ? 'true' : undefined}
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
        onPointerUp={endTitleDrag}
        onPointerCancel={endTitleDrag}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (editing) return
          onOpenInterior()
        }}
      >
        <TitleIcon size={13} strokeWidth={1.75} aria-hidden className={styles.titleIcon} />
        {editing ? (
          <div className={styles.titleEditRow}>
            {departmentName ? (
              <span className={styles.deptPrefix} aria-hidden>
                {departmentName}
                <span className={styles.deptSep}> · </span>
              </span>
            ) : null}
            <input
              ref={inputRef}
              className={styles.titleInput}
              value={draftTask}
              placeholder={taskPlaceholder}
              aria-label={ts('chat.loopGraph.workGroup.taskLabel')}
              onChange={(event) => setDraftTask(event.target.value)}
              onBlur={commitTask}
              onKeyDown={onTaskKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
            />
          </div>
        ) : (
          <button
            type="button"
            className={`${styles.titleText} ${needsTask ? styles.titleTextNeedsTask : ''}`}
            title={`${title} — ${ts('chat.loopGraph.workGroup.rename')}`}
            aria-label={`${title} — ${ts('chat.loopGraph.workGroup.rename')}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              beginTaskEdit()
            }}
          >
            {title}
          </button>
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
                  beginTaskEdit()
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
                {ts(
                  isDepartment
                    ? 'chat.loopGraph.workGroup.deleteDepartment'
                    : 'chat.loopGraph.workGroup.dissolve',
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {memberCount === 0 ? (
        <p className={styles.emptyHint}>{ts('chat.loopGraph.workGroup.emptyHint')}</p>
      ) : null}

      {showPorts
        ? LOOP_WORK_GROUP_PORTS.map((port) => (
            <button
              key={port}
              type="button"
              className={`${styles.port} ${PORT_CLASS[port]}`}
              aria-label={ts(`chat.loopGraph.workGroup.port.${port}`)}
              data-loop-work-group-port={port}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                onSelect()
                onPortPointerDown(workGroupId, port)
              }}
            />
          ))
        : null}
    </div>
  )
}
