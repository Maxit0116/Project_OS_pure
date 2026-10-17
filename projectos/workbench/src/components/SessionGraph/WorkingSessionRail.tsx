import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  graphRailTitle,
  type SessionGraphRailEntry,
  type SessionGraphRailLayout,
} from './sessionGraphRailLayout'
import { previewRailReorder } from './useSessionGraphDrag'
import styles from './WorkingSessionRail.module.css'

const EXPAND_DELAY_MS = 350
const COLLAPSE_DELAY_MS = 180

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
  dropHighlight?: 'rail' | 'graph' | 'folder' | null
  dropGraphId?: string | null
  dropFolderId?: string | null
  draggingGraphId?: string | null
  railDropIndex?: number | null
  onOpenGraph: (graphId: string) => void
  onCreate: () => void
  onCreateFolder: () => void
  onRemoveGraph: (graphId: string) => void
  onRemoveFolder: (folderId: string) => void
  onGraphPointerDown: (
    event: ReactPointerEvent,
    graphId: string,
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
  dropHighlight = null,
  dropGraphId = null,
  dropFolderId = null,
  draggingGraphId = null,
  railDropIndex = null,
  onOpenGraph,
  onCreate,
  onCreateFolder,
  onRemoveGraph,
  onRemoveFolder,
  onGraphPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)

  const isExpanded = forceExpanded || expanded
  const entries = layout.entries

  const { display, placeholderIndex } = useMemo(() => {
    if (!draggingGraphId) {
      return { display: entries, placeholderIndex: null as number | null }
    }
    return previewRailReorder(entries, draggingGraphId, railDropIndex)
  }, [draggingGraphId, entries, railDropIndex])

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [])

  useEffect(() => {
    if (draggingGraphId) suppressClickRef.current = true
  }, [draggingGraphId])

  useEffect(() => {
    if (!folderMenuId) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFolderMenuId(null)
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('[data-rail-folder-menu]')) return
      setFolderMenuId(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [folderMenuId])

  const clearTimers = () => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }

  const onEnter = () => {
    if (forceExpanded) return
    clearTimers()
    expandTimer.current = setTimeout(() => setExpanded(true), EXPAND_DELAY_MS)
  }

  const onLeave = () => {
    if (forceExpanded) return
    clearTimers()
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS)
  }

  const renderEntry = (entry: SessionGraphRailEntry, index: number) => {
    if (entry.kind === 'folder') {
      return (
        <FolderRailItem
          key={entry.id}
          entry={entry}
          index={index}
          expanded={isExpanded}
          heads={heads}
          activeGraphId={activeGraphId}
          menuOpen={folderMenuId === entry.id}
          dropActive={dropHighlight === 'folder' && dropFolderId === entry.id}
          onOpenMenu={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            setFolderMenuId(entry.id)
          }}
          onCloseMenu={() => setFolderMenuId(null)}
          onOpenGraph={(graphId) => {
            setFolderMenuId(null)
            onOpenGraph(graphId)
          }}
          onRemoveFolder={() => onRemoveFolder(entry.id)}
          onRemoveGraph={onRemoveGraph}
          onGraphPointerDown={onGraphPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )
    }
    const title = graphRailTitle(heads, entry.graphId, ts('chat.history.untitled'))
    const rep = pickGraphRepresentative(heads, entry.graphId)
    const members = sessionsInGraph(heads, entry.graphId)
    const status = members.some((m) => m.status === 'error')
      ? 'error'
      : members.some((m) => m.status === 'running')
        ? 'running'
        : members.some((m) => m.status === 'awaiting_review')
          ? 'awaiting_review'
          : 'idle'
    return (
      <GraphRailItem
        key={entry.graphId}
        graphId={entry.graphId}
        index={index}
        title={title}
        responsibility={rep?.responsibility}
        status={status}
        expanded={isExpanded}
        active={entry.graphId === activeGraphId}
        dropActive={dropHighlight === 'graph' && dropGraphId === entry.graphId}
        lifted={draggingGraphId === entry.graphId}
        memberCount={members.length}
        onOpen={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onOpenGraph(entry.graphId)
        }}
        onRemove={() => onRemoveGraph(entry.graphId)}
        onPointerDown={(event) => onGraphPointerDown(event, entry.graphId, title)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    )
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
          clearTimers()
          setExpanded(true)
        }}
        onBlurCapture={(event) => {
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
  index: number
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
      data-session-graph-drop="graph"
      data-graph-id={graphId}
    >
      <button
        type="button"
        className={`${styles.item} ${active ? styles.itemActive : ''}`}
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
          <TaskIcon size={18} strokeWidth={2} aria-hidden />
        </span>
        {expanded ? (
          <span className={styles.label}>
            <span className={styles.labelTitle}>{title}</span>
            <span className={styles.labelMeta}>
              <span className={`${styles.statusDot} ${STATUS_CLASS[status]}`} aria-hidden />
              {ts('chat.sessionGraph.graphCount', { count: memberCount })}
            </span>
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
  expanded,
  heads,
  activeGraphId,
  menuOpen,
  dropActive,
  onOpenMenu,
  onCloseMenu,
  onOpenGraph,
  onRemoveFolder,
  onRemoveGraph,
  onGraphPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  entry: Extract<SessionGraphRailEntry, { kind: 'folder' }>
  index: number
  expanded: boolean
  heads: ChatSessionHead[]
  activeGraphId: string | null
  menuOpen: boolean
  dropActive: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onOpenGraph: (graphId: string) => void
  onRemoveFolder: () => void
  onRemoveGraph: (graphId: string) => void
  onGraphPointerDown: Props['onGraphPointerDown']
  onPointerMove: Props['onPointerMove']
  onPointerUp: Props['onPointerUp']
}) {
  const { ts } = useI18n()
  const title = entry.title.trim() || ts('chat.sessionGraph.folderUntitled')
  const containsActive = entry.graphIds.includes(activeGraphId ?? '')

  if (expanded) {
    return (
      <div
        className={`${styles.folderBlock} ${dropActive ? styles.itemDropTarget : ''}`}
        data-rail-entry-index={index}
        data-session-graph-drop="folder"
        data-folder-id={entry.id}
      >
        <div className={styles.itemWrap}>
          <button
            type="button"
            className={`${styles.item} ${styles.folderHeader} ${
              containsActive ? styles.itemActive : ''
            }`}
            aria-label={title}
            title={title}
          >
            <span className={styles.icon}>
              <Folder size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.label}>
              <span className={styles.labelTitle}>{title}</span>
              <span className={styles.labelMeta}>
                {ts('chat.sessionGraph.folderCount', { count: entry.graphIds.length })}
              </span>
            </span>
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
        <div className={styles.folderChildren}>
          {entry.graphIds.map((graphId) => {
            const graphTitle = graphRailTitle(heads, graphId, ts('chat.history.untitled'))
            const rep = pickGraphRepresentative(heads, graphId)
            const task = classifySessionTask(graphTitle, rep?.responsibility)
            const TaskIcon = TASK_ICON[task]
            return (
              <div
                key={graphId}
                className={styles.itemWrap}
                data-session-graph-drop="graph"
                data-graph-id={graphId}
              >
                <button
                  type="button"
                  className={`${styles.item} ${styles.folderChild} ${
                    graphId === activeGraphId ? styles.itemActive : ''
                  }`}
                  data-task={task}
                  aria-current={graphId === activeGraphId ? 'true' : undefined}
                  aria-label={graphTitle}
                  title={graphTitle}
                  onClick={() => onOpenGraph(graphId)}
                  onPointerDown={(event) => onGraphPointerDown(event, graphId, graphTitle)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <span className={styles.icon}>
                    <TaskIcon size={16} strokeWidth={2} aria-hidden />
                  </span>
                  <span className={styles.label}>
                    <span className={styles.labelTitle}>{graphTitle}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  data-session-drag-ignore=""
                  aria-label={ts('chat.sessionGraph.removeGraph')}
                  title={ts('chat.sessionGraph.removeGraph')}
                  onClick={() => onRemoveGraph(graphId)}
                >
                  <X size={12} strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.folderCollapsedWrap} data-rail-entry-index={index}>
      <div
        className={`${styles.itemWrap} ${dropActive ? styles.itemDropTarget : ''}`}
        data-session-graph-drop="folder"
        data-folder-id={entry.id}
      >
        <button
          type="button"
          className={`${styles.item} ${containsActive ? styles.itemActive : ''}`}
          aria-label={title}
          title={title}
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
        >
          <span className={styles.icon}>
            <Folder size={18} strokeWidth={2} aria-hidden />
          </span>
          {entry.graphIds.length > 0 ? (
            <span className={styles.folderBadge} aria-hidden>
              {entry.graphIds.length}
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
      {menuOpen ? (
        <div className={styles.folderMenu} data-rail-folder-menu="" role="menu">
          <div className={styles.folderMenuTitle}>{title}</div>
          {entry.graphIds.length === 0 ? (
            <div className={styles.folderMenuEmpty}>{ts('chat.sessionGraph.folderEmpty')}</div>
          ) : (
            entry.graphIds.map((graphId) => {
              const graphTitle = graphRailTitle(heads, graphId, ts('chat.history.untitled'))
              return (
                <button
                  key={graphId}
                  type="button"
                  className={styles.folderMenuItem}
                  role="menuitem"
                  onClick={() => onOpenGraph(graphId)}
                >
                  {graphTitle}
                </button>
              )
            })
          )}
          <button
            type="button"
            className={styles.folderMenuDismiss}
            onClick={onCloseMenu}
          >
            {ts('chat.sessionGraph.folderDismiss')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
