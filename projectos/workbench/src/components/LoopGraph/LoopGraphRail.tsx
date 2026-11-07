import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import type { LoopDocumentStatus, LoopGraphHead } from '@contracts/index'
import {
  CircleCheck,
  CircleDashed,
  FilePen,
  Folder,
  FolderOpen,
  FolderPlus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  countFolderLoops,
  folderContainsActiveLoop,
  type LoopGraphRailEntry,
  type LoopGraphRailFolderEntry,
  type LoopGraphRailLayout,
} from './loopGraphRailLayout'
import styles from './LoopGraphRail.module.css'

const EXPAND_DELAY_MS = 350
const COLLAPSE_DELAY_MS = 180
const FOLDER_REVEAL_MS = 40
const FOLDER_COLLAPSE_MS = 90

const STATUS_ICON = {
  draft: FilePen,
  compiled: CircleDashed,
  approved: CircleCheck,
  running: Play,
  paused: Pause,
  complete: CircleCheck,
  error: TriangleAlert,
} as const satisfies Record<LoopDocumentStatus, typeof FilePen>

const STATUS_DOT = {
  draft: '',
  compiled: styles.statusDotReview,
  approved: '',
  running: styles.statusDotRunning,
  paused: styles.statusDotReview,
  complete: '',
  error: styles.statusDotError,
} as const

type DragPayload =
  | { kind: 'loop'; loopId: string }
  | { kind: 'folder'; folderId: string }

interface Props {
  layout: LoopGraphRailLayout
  items: LoopGraphHead[]
  activeLoopId: string | null
  renamingFolderId?: string | null
  onOpen: (loopId: string) => void
  onCreate: () => void
  onCreateFolder: () => void
  onRenameFolder: (folderId: string, title: string) => void
  onCancelRenameFolder: () => void
  onRemoveFolder: (folderId: string) => void
  onMoveIntoFolder: (loopId: string, folderId: string) => void
  onMoveFolderIntoFolder: (folderId: string, targetFolderId: string) => void
  onMoveToRail: (loopId: string) => void
  onMoveFolderToRail: (folderId: string) => void
}

export default function LoopGraphRail({
  layout,
  items,
  activeLoopId,
  renamingFolderId = null,
  onOpen,
  onCreate,
  onCreateFolder,
  onRenameFolder,
  onCancelRenameFolder,
  onRemoveFolder,
  onMoveIntoFolder,
  onMoveFolderIntoFolder,
  onMoveToRail,
  onMoveFolderToRail,
}: Props) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Record<string, true>>({})
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const collapseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const renaming = renamingFolderId != null
  const isExpanded = expanded || renaming
  const byId = new Map(items.map((item) => [item.id, item]))

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      for (const timer of revealTimers.current.values()) clearTimeout(timer)
      for (const timer of collapseTimers.current.values()) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!isExpanded && !renaming) setRevealedIds({})
  }, [isExpanded, renaming])

  useEffect(() => {
    if (renamingFolderId) {
      setRevealedIds((prev) => ({ ...prev, [renamingFolderId]: true }))
    }
  }, [renamingFolderId])

  const clearExpandTimers = () => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }

  const clearFolderTimer = (
    map: Map<string, ReturnType<typeof setTimeout>>,
    folderId: string,
  ) => {
    const timer = map.get(folderId)
    if (timer) {
      clearTimeout(timer)
      map.delete(folderId)
    }
  }

  const onEnter = () => {
    if (renaming) return
    clearExpandTimers()
    expandTimer.current = setTimeout(() => setExpanded(true), EXPAND_DELAY_MS)
  }

  const onLeave = () => {
    if (renaming) return
    clearExpandTimers()
    collapseTimer.current = setTimeout(() => {
      setExpanded(false)
      setRevealedIds({})
    }, COLLAPSE_DELAY_MS)
  }

  const scheduleReveal = (folderId: string) => {
    if (!isExpanded) return
    clearFolderTimer(collapseTimers.current, folderId)
    clearFolderTimer(revealTimers.current, folderId)
    if (revealedIds[folderId] || renamingFolderId === folderId) return
    revealTimers.current.set(
      folderId,
      setTimeout(() => {
        revealTimers.current.delete(folderId)
        setRevealedIds((prev) => ({ ...prev, [folderId]: true }))
      }, FOLDER_REVEAL_MS),
    )
  }

  const scheduleRevealCollapse = (folderId: string) => {
    if (renamingFolderId === folderId || dragPayload) return
    clearFolderTimer(revealTimers.current, folderId)
    clearFolderTimer(collapseTimers.current, folderId)
    collapseTimers.current.set(
      folderId,
      setTimeout(() => {
        collapseTimers.current.delete(folderId)
        setRevealedIds((prev) => {
          if (!prev[folderId]) return prev
          const next = { ...prev }
          delete next[folderId]
          return next
        })
      }, FOLDER_COLLAPSE_MS),
    )
  }

  const isRevealed = (folderId: string) =>
    Boolean(revealedIds[folderId] || renamingFolderId === folderId)

  const readDragPayload = (event: ReactDragEvent): DragPayload | null => {
    const folderId = event.dataTransfer.getData('text/folder-id')
    if (folderId) return { kind: 'folder', folderId }
    const loopId = event.dataTransfer.getData('text/loop-id')
    if (loopId) return { kind: 'loop', loopId }
    return dragPayload
  }

  const renderLoop = (
    loopId: string,
    options: { nested?: boolean; index?: number } = {},
  ) => {
    const item = byId.get(loopId)
    if (!item) return null
    const StatusIcon = STATUS_ICON[item.status] ?? RefreshCw
    const active = item.id === activeLoopId
    return (
      <div
        key={loopId}
        className={`${styles.itemWrap} ${
          dragPayload?.kind === 'loop' && dragPayload.loopId === loopId
            ? styles.itemLifted
            : ''
        }`}
        data-rail-entry-index={options.index}
        data-rail-nested={options.nested ? 'true' : undefined}
        draggable
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.setData('text/loop-id', loopId)
          event.dataTransfer.effectAllowed = 'move'
          setDragPayload({ kind: 'loop', loopId })
        }}
        onDragEnd={() => {
          setDragPayload(null)
          setDropFolderId(null)
        }}
      >
        <button
          type="button"
          className={`${styles.item} ${options.nested ? styles.folderChild : ''} ${
            active ? styles.itemActive : ''
          }`}
          data-status={item.status}
          aria-current={active ? 'true' : undefined}
          aria-label={item.title}
          title={item.title}
          onClick={() => onOpen(item.id)}
        >
          <span className={styles.icon}>
            <StatusIcon size={options.nested ? 16 : 18} strokeWidth={2} aria-hidden />
          </span>
          {isExpanded ? (
            <span className={styles.label}>
              <span className={styles.labelTitle}>{item.title}</span>
              {!options.nested ? (
                <span className={styles.labelMeta}>
                  <span
                    className={`${styles.statusDot} ${STATUS_DOT[item.status]}`}
                    aria-hidden
                  />
                  {ts(`chat.loopGraph.status.${item.status}`)} · r{item.draftRevision}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </div>
    )
  }

  const renderFolder = (
    entry: LoopGraphRailFolderEntry,
    options: { nested?: boolean; index?: number } = {},
  ): ReactNode => {
    const title = entry.title.trim() || ts('chat.loopGraph.folderUntitled')
    const containsActive = folderContainsActiveLoop(entry, activeLoopId)
    const itemCount = countFolderLoops(entry)
    const showOpen = isExpanded && isRevealed(entry.id)
    const dropActive = dropFolderId === entry.id
    const lifted =
      dragPayload?.kind === 'folder' && dragPayload.folderId === entry.id

    return (
      <div
        key={entry.id}
        className={`${styles.folderBlock} ${dropActive ? styles.itemDropTarget : ''} ${
          showOpen ? styles.folderBlockRevealed : ''
        } ${lifted ? styles.itemLifted : ''}`}
        data-rail-entry-index={options.index}
        data-rail-nested={options.nested ? 'true' : undefined}
        data-folder-id={entry.id}
        data-folder-revealed={showOpen ? 'true' : 'false'}
        draggable
        onPointerEnter={() => scheduleReveal(entry.id)}
        onPointerLeave={() => scheduleRevealCollapse(entry.id)}
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.setData('text/folder-id', entry.id)
          event.dataTransfer.effectAllowed = 'move'
          setDragPayload({ kind: 'folder', folderId: entry.id })
        }}
        onDragEnd={() => {
          setDragPayload(null)
          setDropFolderId(null)
        }}
        onDragOver={(event: ReactDragEvent) => {
          if (!dragPayload) return
          if (
            dragPayload.kind === 'folder' &&
            (dragPayload.folderId === entry.id ||
              event.currentTarget.contains(
                document.querySelector(`[data-folder-id="${dragPayload.folderId}"]`),
              ))
          ) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          setDropFolderId(entry.id)
          setRevealedIds((prev) => ({ ...prev, [entry.id]: true }))
        }}
        onDragLeave={(event: ReactDragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropFolderId((current) => (current === entry.id ? null : current))
          }
        }}
        onDrop={(event: ReactDragEvent) => {
          event.preventDefault()
          event.stopPropagation()
          const payload = readDragPayload(event)
          setDropFolderId(null)
          setDragPayload(null)
          if (!payload) return
          if (payload.kind === 'loop') {
            onMoveIntoFolder(payload.loopId, entry.id)
            return
          }
          if (payload.folderId !== entry.id) {
            onMoveFolderIntoFolder(payload.folderId, entry.id)
          }
        }}
      >
        <div className={styles.itemWrap}>
          <div
            className={`${styles.item} ${styles.folderHeader} ${
              options.nested ? styles.folderChild : ''
            } ${containsActive ? styles.itemActive : ''}`}
            aria-label={title}
            title={title}
            aria-expanded={showOpen}
          >
            <span className={styles.icon}>
              <span
                className={`${styles.folderIcon} ${showOpen ? styles.folderIconHidden : ''}`}
              >
                <Folder size={options.nested ? 16 : 18} strokeWidth={2} aria-hidden />
              </span>
              <span
                className={`${styles.folderIcon} ${styles.folderIconOpen} ${
                  showOpen ? '' : styles.folderIconHidden
                }`}
              >
                <FolderOpen size={options.nested ? 16 : 18} strokeWidth={2} aria-hidden />
              </span>
            </span>
            {isExpanded ? (
              renamingFolderId === entry.id ? (
                <FolderRenameField
                  initialValue={entry.title}
                  ariaLabel={ts('chat.loopGraph.renameFolder')}
                  onCommit={(next) => onRenameFolder(entry.id, next)}
                  onCancel={onCancelRenameFolder}
                />
              ) : (
                <span className={styles.label}>
                  <span className={styles.labelTitle}>{title}</span>
                  <span className={styles.labelMeta}>
                    {ts('chat.loopGraph.folderCount', { count: itemCount })}
                  </span>
                </span>
              )
            ) : itemCount > 0 ? (
              <span className={styles.folderBadge} aria-hidden>
                {itemCount}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.deleteButton}
            aria-label={ts('chat.loopGraph.removeFolder')}
            title={ts('chat.loopGraph.removeFolder')}
            onClick={() => onRemoveFolder(entry.id)}
          >
            <X size={12} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        {isExpanded ? (
          <div
            className={`${styles.folderChildren} ${showOpen ? styles.folderChildrenOpen : ''}`}
            data-folder-children=""
          >
            <div className={styles.folderChildrenInner}>
              {entry.children.length === 0 ? (
                <div className={styles.folderEmpty}>{ts('chat.loopGraph.folderEmpty')}</div>
              ) : (
                entry.children.map((child) =>
                  child.kind === 'loop'
                    ? renderLoop(child.loopId, { nested: true })
                    : renderFolder(child, { nested: true }),
                )
              )}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const renderEntry = (entry: LoopGraphRailEntry, index: number) => {
    if (entry.kind === 'folder') return renderFolder(entry, { index })
    return renderLoop(entry.loopId, { index })
  }

  return (
    <div className={styles.slot} data-loop-graph-rail-slot="">
      <nav
        className={`${styles.rail} ${isExpanded ? styles.railExpanded : ''}`}
        aria-label={ts('chat.loopGraph.rail')}
        data-loop-graph-rail=""
        data-expanded={isExpanded ? 'true' : 'false'}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocusCapture={() => {
          clearExpandTimers()
          setExpanded(true)
        }}
        onBlurCapture={(event) => {
          if (renaming) return
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onLeave()
          }
        }}
        onDragOver={(event) => {
          if (!dragPayload) return
          event.preventDefault()
        }}
        onDrop={(event) => {
          const target = event.target as Element | null
          if (target?.closest?.('[data-folder-id]')) return
          const payload = readDragPayload(event)
          setDragPayload(null)
          setDropFolderId(null)
          if (!payload) return
          if (payload.kind === 'loop') onMoveToRail(payload.loopId)
          else onMoveFolderToRail(payload.folderId)
        }}
      >
        <div className={styles.list} data-loop-graph-rail-list="">
          {layout.entries.map((entry, index) => renderEntry(entry, index))}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.create}
            aria-label={ts('chat.loopGraph.createFolder')}
            title={ts('chat.loopGraph.createFolder')}
            onClick={onCreateFolder}
          >
            <span className={styles.createIcon}>
              <FolderPlus size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.createLabel}>{ts('chat.loopGraph.createFolder')}</span>
          </button>
          <button
            type="button"
            className={styles.create}
            aria-label={ts('chat.loopGraph.create')}
            title={ts('chat.loopGraph.create')}
            onClick={onCreate}
          >
            <span className={styles.createIcon}>
              <Plus size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.createLabel}>{ts('chat.loopGraph.create')}</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

function FolderRenameField({
  initialValue,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initialValue: string
  ariaLabel: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState(initialValue)
  const committedRef = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit(value)
  }

  const cancel = () => {
    if (committedRef.current) return
    committedRef.current = true
    onCancel()
  }

  return (
    <form
      className={styles.renameForm}
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        commit()
      }}
    >
      <input
        ref={inputRef}
        className={styles.renameInput}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancel()
          }
        }}
      />
    </form>
  )
}
