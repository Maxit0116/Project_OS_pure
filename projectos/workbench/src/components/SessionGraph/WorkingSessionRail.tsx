import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { ChatSessionHead } from '@contracts/index'
import {
  pickGraphRepresentative,
  sessionsInGraph,
} from '@contracts/index'
import {
  Box,
  Bug,
  Folder,
  FolderOpen,
  FolderPlus,
  GitPullRequest,
  LayoutTemplate,
  Map as MapIcon,
  Plus,
  Search,
  Terminal,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { classifySessionTask } from './sessionTaskKind'
import {
  countFolderItems,
  folderContainsActive,
  graphRailTitle,
  type SessionGraphRailEntry,
  type SessionGraphRailFolderEntry,
  type SessionGraphRailLayout,
} from './sessionGraphRailLayout'
import { previewRailReorder } from './useSessionGraphDrag'
import styles from './WorkingSessionRail.module.css'

const EXPAND_DELAY_MS = 350
const COLLAPSE_DELAY_MS = 180
const FOLDER_REVEAL_MS = 40
const FOLDER_COLLAPSE_MS = 90

const TASK_ICON = {
  explore: Search,
  plan: MapIcon,
  build: Box,
  fix: Bug,
  design: LayoutTemplate,
  git: GitPullRequest,
  setup: Terminal,
} as const

const STATUS_CLASS = {
  idle: '',
  running: styles.statusDotRunning,
  awaiting_review: styles.statusDotReview,
  error: styles.statusDotError,
} as const

interface Props {
  layout: SessionGraphRailLayout
  heads: ChatSessionHead[]
  activeGraphId: string | null
  forceExpanded?: boolean
  renamingFolderId?: string | null
  dropHighlight?: 'rail' | 'graph' | 'folder' | null
  dropGraphId?: string | null
  dropFolderId?: string | null
  draggingGraphId?: string | null
  draggingFolderId?: string | null
  railDropIndex?: number | null
  onOpenGraph: (graphId: string) => void
  onCreate: () => void
  onCreateFolder: () => void
  onRenameFolder: (folderId: string, title: string) => void
  onCancelRenameFolder: () => void
  onRemoveGraph: (graphId: string) => void
  onRemoveFolder: (folderId: string) => void
  onGraphPointerDown: (
    event: ReactPointerEvent,
    graphId: string,
    title: string,
  ) => void
  onFolderPointerDown: (
    event: ReactPointerEvent,
    folderId: string,
    title: string,
  ) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}

export default function WorkingSessionRail({
  layout,
  heads,
  activeGraphId,
  forceExpanded = false,
  renamingFolderId = null,
  dropHighlight = null,
  dropGraphId = null,
  dropFolderId = null,
  draggingGraphId = null,
  draggingFolderId = null,
  railDropIndex = null,
  onOpenGraph,
  onCreate,
  onCreateFolder,
  onRenameFolder,
  onCancelRenameFolder,
  onRemoveGraph,
  onRemoveFolder,
  onGraphPointerDown,
  onFolderPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Record<string, true>>({})
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const collapseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const suppressClickRef = useRef(false)

  const renaming = renamingFolderId != null
  const isExpanded = forceExpanded || expanded || renaming
  const dragging = draggingGraphId != null || draggingFolderId != null
  const entries = layout.entries

  const { display, placeholderIndex } = useMemo(() => {
    if (!draggingGraphId && !draggingFolderId) {
      return { display: entries, placeholderIndex: null as number | null }
    }
    return previewRailReorder(
      entries,
      draggingGraphId,
      railDropIndex,
      draggingFolderId,
    )
  }, [draggingFolderId, draggingGraphId, entries, railDropIndex])

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      for (const timer of revealTimers.current.values()) clearTimeout(timer)
      for (const timer of collapseTimers.current.values()) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (dragging) suppressClickRef.current = true
  }, [dragging])

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
    if (forceExpanded || renaming) return
    clearExpandTimers()
    expandTimer.current = setTimeout(() => setExpanded(true), EXPAND_DELAY_MS)
  }

  const onLeave = () => {
    if (forceExpanded || renaming) return
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
    if (renamingFolderId === folderId || dragging) return
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

  const renderGraph = (
    graphId: string,
    options: { index?: number; nested?: boolean } = {},
  ) => {
    const title = graphRailTitle(heads, graphId, ts('chat.history.untitled'))
    const rep = pickGraphRepresentative(heads, graphId)
    const members = sessionsInGraph(heads, graphId)
    const status = members.some((m) => m.status === 'error')
      ? 'error'
      : members.some((m) => m.status === 'running')
        ? 'running'
        : members.some((m) => m.status === 'awaiting_review')
          ? 'awaiting_review'
          : 'idle'
    return (
      <GraphRailItem
        key={graphId}
        graphId={graphId}
        index={options.index}
        nested={options.nested}
        title={title}
        responsibility={rep?.responsibility}
        status={status}
        expanded={isExpanded}
        active={graphId === activeGraphId}
        dropActive={dropHighlight === 'graph' && dropGraphId === graphId}
        lifted={draggingGraphId === graphId}
        memberCount={members.length}
        onOpen={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onOpenGraph(graphId)
        }}
        onRemove={() => onRemoveGraph(graphId)}
        onPointerDown={(event) => onGraphPointerDown(event, graphId, title)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    )
  }

  const renderFolder = (
    entry: SessionGraphRailFolderEntry,
    options: { index?: number; nested?: boolean } = {},
  ) => (
    <FolderRailItem
      key={entry.id}
      entry={entry}
      index={options.index}
      nested={options.nested}
      expanded={isExpanded}
      revealed={isRevealed(entry.id)}
      renaming={renamingFolderId === entry.id}
      activeGraphId={activeGraphId}
      dropActive={dropHighlight === 'folder' && dropFolderId === entry.id}
      lifted={draggingFolderId === entry.id}
      onRevealEnter={() => scheduleReveal(entry.id)}
      onRevealLeave={() => scheduleRevealCollapse(entry.id)}
      onCommitRename={(title) => onRenameFolder(entry.id, title)}
      onCancelRename={onCancelRenameFolder}
      onRemoveFolder={() => onRemoveFolder(entry.id)}
      onFolderPointerDown={onFolderPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      renderChild={(child) =>
        child.kind === 'graph'
          ? renderGraph(child.graphId, { nested: true })
          : renderFolder(child, { nested: true })
      }
    />
  )

  const renderEntry = (entry: SessionGraphRailEntry, index: number) => {
    if (entry.kind === 'folder') return renderFolder(entry, { index })
    return renderGraph(entry.graphId, { index })
  }

  const rows: ReactNode[] = []
  for (let i = 0; i < display.length; i += 1) {
    if (placeholderIndex === i) {
      rows.push(
        <div
          key="rail-drop-gap"
          className={styles.dropGap}
          data-rail-drop-gap=""
          data-rail-entry-index={i}
          aria-hidden
        />,
      )
    }
    rows.push(renderEntry(display[i] as SessionGraphRailEntry, i))
  }
  if (placeholderIndex != null && placeholderIndex >= display.length) {
    rows.push(
      <div
        key="rail-drop-gap-end"
        className={styles.dropGap}
        data-rail-drop-gap=""
        data-rail-entry-index={display.length}
        aria-hidden
      />,
    )
  }

  return (
    <div className={styles.slot} data-working-session-rail-slot="">
      <nav
        className={`${styles.rail} ${isExpanded ? styles.railExpanded : ''} ${
          dropHighlight === 'rail' || railDropIndex != null ? styles.railDropTarget : ''
        }`}
        aria-label={ts('chat.sessionGraph.workingRail')}
        data-working-session-rail=""
        data-expanded={isExpanded ? 'true' : 'false'}
        data-session-graph-drop="rail"
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
      >
        <div className={styles.list} data-working-session-rail-list="">
          {rows}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.create}
            aria-label={ts('chat.sessionGraph.createFolder')}
            title={ts('chat.sessionGraph.createFolder')}
            onClick={onCreateFolder}
          >
            <span className={styles.createIcon}>
              <FolderPlus size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.createLabel}>{ts('chat.sessionGraph.createFolder')}</span>
          </button>
          <button
            type="button"
            className={styles.create}
            aria-label={ts('chat.history.newChat')}
            title={ts('chat.history.newChat')}
            onClick={onCreate}
          >
            <span className={styles.createIcon}>
              <Plus size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.createLabel}>{ts('chat.history.newChat')}</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

function GraphRailItem({
  graphId,
  index,
  nested = false,
  title,
  responsibility,
  status,
  expanded,
  active,
  dropActive,
  lifted,
  memberCount,
  onOpen,
  onRemove,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  graphId: string
  index?: number
  nested?: boolean
  title: string
  responsibility?: string
  status: ChatSessionHead['status']
  expanded: boolean
  active: boolean
  dropActive: boolean
  lifted: boolean
  memberCount: number
  onOpen: () => void
  onRemove: () => void
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  const { ts } = useI18n()
  const task = classifySessionTask(title, responsibility)
  const TaskIcon = TASK_ICON[task]
  return (
    <div
      className={`${styles.itemWrap} ${lifted ? styles.itemLifted : ''} ${
        dropActive ? styles.itemDropTarget : ''
      }`}
      data-rail-entry-index={index}
      data-rail-nested={nested ? 'true' : undefined}
      data-session-graph-drop="graph"
      data-graph-id={graphId}
    >
      <button
        type="button"
        className={`${styles.item} ${nested ? styles.folderChild : ''} ${
          active ? styles.itemActive : ''
        }`}
        data-task={task}
        aria-current={active ? 'true' : undefined}
        aria-label={title}
        title={title}
        onClick={onOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className={styles.icon}>
          <TaskIcon size={nested ? 16 : 18} strokeWidth={2} aria-hidden />
        </span>
        {expanded ? (
          <span className={styles.label}>
            <span className={styles.labelTitle}>{title}</span>
            {!nested ? (
              <span className={styles.labelMeta}>
                <span className={`${styles.statusDot} ${STATUS_CLASS[status]}`} aria-hidden />
                {ts('chat.sessionGraph.graphCount', { count: memberCount })}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={styles.deleteButton}
        data-session-drag-ignore=""
        aria-label={ts('chat.sessionGraph.removeGraph')}
        title={ts('chat.sessionGraph.removeGraph')}
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
      >
        <X size={12} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  )
}

function FolderRailItem({
  entry,
  index,
  nested = false,
  expanded,
  revealed,
  renaming,
  activeGraphId,
  dropActive,
  lifted,
  onRevealEnter,
  onRevealLeave,
  onCommitRename,
  onCancelRename,
  onRemoveFolder,
  onFolderPointerDown,
  onPointerMove,
  onPointerUp,
  renderChild,
}: {
  entry: SessionGraphRailFolderEntry
  index?: number
  nested?: boolean
  expanded: boolean
  revealed: boolean
  renaming: boolean
  activeGraphId: string | null
  dropActive: boolean
  lifted: boolean
  onRevealEnter: () => void
  onRevealLeave: () => void
  onCommitRename: (title: string) => void
  onCancelRename: () => void
  onRemoveFolder: () => void
  onFolderPointerDown: Props['onFolderPointerDown']
  onPointerMove: Props['onPointerMove']
  onPointerUp: Props['onPointerUp']
  renderChild: (child: SessionGraphRailEntry) => ReactNode
}) {
  const { ts } = useI18n()
  const title = entry.title.trim() || ts('chat.sessionGraph.folderUntitled')
  const containsActive = folderContainsActive(entry, activeGraphId)
  const itemCount = countFolderItems(entry)
  const showOpen = expanded && (revealed || renaming)

  return (
    <div
      className={`${styles.folderBlock} ${dropActive ? styles.itemDropTarget : ''} ${
        showOpen ? styles.folderBlockRevealed : ''
      } ${lifted ? styles.itemLifted : ''}`}
      data-rail-entry-index={index}
      data-rail-nested={nested ? 'true' : undefined}
      data-session-graph-drop="folder"
      data-folder-id={entry.id}
      data-folder-revealed={showOpen ? 'true' : 'false'}
      onPointerEnter={onRevealEnter}
      onPointerLeave={onRevealLeave}
    >
      <div className={styles.itemWrap}>
        <button
          type="button"
          className={`${styles.item} ${styles.folderHeader} ${
            nested ? styles.folderChild : ''
          } ${containsActive ? styles.itemActive : ''}`}
          aria-label={title}
          title={title}
          aria-expanded={showOpen}
          onPointerDown={(event) => onFolderPointerDown(event, entry.id, title)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className={styles.icon}>
            <span className={`${styles.folderIcon} ${showOpen ? styles.folderIconHidden : ''}`}>
              <Folder size={nested ? 16 : 18} strokeWidth={2} aria-hidden />
            </span>
            <span
              className={`${styles.folderIcon} ${styles.folderIconOpen} ${
                showOpen ? '' : styles.folderIconHidden
              }`}
            >
              <FolderOpen size={nested ? 16 : 18} strokeWidth={2} aria-hidden />
            </span>
          </span>
          {expanded ? (
            renaming ? (
              <FolderRenameField
                initialValue={entry.title}
                ariaLabel={ts('chat.sessionGraph.renameFolder')}
                onCommit={onCommitRename}
                onCancel={onCancelRename}
              />
            ) : (
              <span className={styles.label}>
                <span className={styles.labelTitle}>{title}</span>
                <span className={styles.labelMeta}>
                  {ts('chat.sessionGraph.folderCount', { count: itemCount })}
                </span>
              </span>
            )
          ) : itemCount > 0 ? (
            <span className={styles.folderBadge} aria-hidden>
              {itemCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          data-session-drag-ignore=""
          aria-label={ts('chat.sessionGraph.removeFolder')}
          title={ts('chat.sessionGraph.removeFolder')}
          onClick={onRemoveFolder}
        >
          <X size={12} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {expanded ? (
        <div
          className={`${styles.folderChildren} ${showOpen ? styles.folderChildrenOpen : ''}`}
          data-folder-children=""
        >
          <div className={styles.folderChildrenInner}>
            {entry.children.length === 0 ? (
              <div className={styles.folderEmpty}>{ts('chat.sessionGraph.folderEmpty')}</div>
            ) : (
              entry.children.map((child) => renderChild(child))
            )}
          </div>
        </div>
      ) : null}
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
      data-session-drag-ignore=""
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
