import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react'
import type { ChatSessionHead, SessionGraphModel } from '@contracts/index'
import {
  buildSessionGraph,
  pickGraphRepresentative,
  resolveSessionGraphId,
  sessionsInGraph,
  sessionGraphShieldInsets,
  type SessionGraphInsets,
} from '@contracts/index'
import {
  Archive,
  Box,
  Bug,
  GitBranch,
  GitPullRequest,
  LayoutTemplate,
  Map as MapIcon,
  Search,
  Terminal,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import {
  SESSION_NODE_HEIGHT,
  SESSION_NODE_WIDTH,
  layoutSessionGraph,
  type SessionGraphLayout,
} from './layoutSessionGraph'
import { classifySessionTask } from './sessionTaskKind'
import {
  createRailFolder,
  emptySessionGraphRailLayout,
  graphRailTitle,
  insertGraphOnRail,
  loadSessionGraphRailLayout,
  moveGraphIntoFolder,
  removeFolderFromLayout,
  removeGraphFromLayout,
  resolveActiveGraphId,
  saveSessionGraphRailLayout,
  syncRailLayoutWithGraphs,
  type SessionGraphRailLayout,
} from './sessionGraphRailLayout'
import {
  useSessionGraphDrag,
  type SessionDragState,
  type SessionDropTarget,
} from './useSessionGraphDrag'
import WorkingSessionRail from './WorkingSessionRail'
import styles from './SessionGraphOverlay.module.css'

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

/** @deprecated Prefer GraphOverlayFrame — kept for existing imports/tests. */
export function SessionGraphFrame({
  shield,
  resizing,
  label,
  children,
}: {
  shield: SessionGraphInsets
  resizing: boolean
  label: string
  children: ReactNode
}) {
  return (
    <GraphOverlayFrame shield={shield} resizing={resizing} label={label}>
      {children}
    </GraphOverlayFrame>
  )
}

export default function SessionGraphOverlay() {
  const open = useChatSessionStore((s) => s.sessionGraphOpen)
  const heads = useChatSessionStore((s) => s.heads)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const setSessionGraphOpen = useChatSessionStore((s) => s.setSessionGraphOpen)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const createSession = useChatSessionStore((s) => s.createSession)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const placeSessionOnGraph = useChatSessionStore((s) => s.placeSessionOnGraph)
  const extractSubtreeToGraph = useChatSessionStore((s) => s.extractSubtreeToGraph)
  const mergeGraphs = useChatSessionStore((s) => s.mergeGraphs)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const leftPanelWidth = useWorkbenchStore((s) => s.leftPanelWidth)
  const rightPanelWidth = useWorkbenchStore((s) => s.rightPanelWidth)
  const terminalHeight = useWorkbenchStore((s) => s.terminalHeight)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const [railLayout, setRailLayout] = useState<SessionGraphRailLayout>(() =>
    emptySessionGraphRailLayout(),
  )
  const [preferredGraphId, setPreferredGraphId] = useState<string | null>(null)
  const [forceRailExpanded, setForceRailExpanded] = useState(false)
  const [layout, setLayout] = useState<SessionGraphLayout | null>(null)
  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const railLayoutRef = useRef(railLayout)
  railLayoutRef.current = railLayout

  const activeGraphId = useMemo(
    () => resolveActiveGraphId(heads, activeSessionId, preferredGraphId),
    [heads, activeSessionId, preferredGraphId],
  )
  const model = useMemo(
    () => buildSessionGraph(heads, { graphId: activeGraphId }),
    [heads, activeGraphId],
  )
  const mergedRail = useMemo(
    () => syncRailLayoutWithGraphs(railLayout, heads),
    [railLayout, heads],
  )

  useEffect(() => {
    if (!projectId) {
      setRailLayout(emptySessionGraphRailLayout())
      return
    }
    setRailLayout(loadSessionGraphRailLayout(projectId, heads))
    // Only re-load when project changes; heads migration uses current heads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const persistRail = useCallback(
    (next: SessionGraphRailLayout) => {
      setRailLayout(next)
      if (projectId) saveSessionGraphRailLayout(projectId, next)
    },
    [projectId],
  )

  const openGraph = useCallback(
    async (graphId: string) => {
      setPreferredGraphId(graphId)
      const rep = pickGraphRepresentative(heads, graphId)
      if (rep) {
        await switchSession(rep.id)
        setRightPanelOpen(true)
      }
    },
    [heads, setRightPanelOpen, switchSession],
  )

  const demoteToMisc = useCallback(
    async (sessionId: string) => {
      const head = heads.find((item) => item.id === sessionId)
      const graphId = head ? resolveSessionGraphId(head) : null
      await placeSessionOnGraph(sessionId, { mode: 'misc' })
      if (graphId) {
        const remaining = sessionsInGraph(
          useChatSessionStore.getState().heads,
          graphId,
        )
        if (remaining.length === 0) {
          persistRail(removeGraphFromLayout(railLayoutRef.current, graphId))
          if (preferredGraphId === graphId) setPreferredGraphId(null)
        }
      }
    },
    [heads, placeSessionOnGraph, persistRail, preferredGraphId],
  )

  const handleDrop = useCallback(
    async (drag: SessionDragState, target: SessionDropTarget) => {
      const base = syncRailLayoutWithGraphs(
        railLayoutRef.current,
        useChatSessionStore.getState().heads,
      )

      // ——— Rail graph drag ———
      if (drag.source === 'rail' && drag.graphId) {
        if (target.kind === 'misc') {
          const members = sessionsInGraph(useChatSessionStore.getState().heads, drag.graphId)
          for (const member of members) {
            await placeSessionOnGraph(member.id, { mode: 'misc' })
          }
          persistRail(removeGraphFromLayout(base, drag.graphId))
          if (preferredGraphId === drag.graphId) setPreferredGraphId(null)
          return
        }
        if (target.kind === 'graph' && target.graphId) {
          await mergeGraphs(drag.graphId, target.graphId)
          persistRail(removeGraphFromLayout(base, drag.graphId))
          setPreferredGraphId(target.graphId)
          return
        }
        if (target.kind === 'folder' && target.folderId) {
          persistRail(moveGraphIntoFolder(base, drag.graphId, target.folderId))
          return
        }
        if (target.kind === 'rail') {
          persistRail(insertGraphOnRail(base, drag.graphId, target.railDropIndex))
          return
        }
        if (target.kind === 'canvas') {
          // Dropping a whole graph onto canvas just focuses it.
          setPreferredGraphId(drag.graphId)
          return
        }
        return
      }

      // ——— Session drag (misc / canvas) ———
      const sessionId = drag.sessionId
      if (!sessionId) return

      if (target.kind === 'misc') {
        await demoteToMisc(sessionId)
        return
      }

      if (target.kind === 'canvas') {
        const graphId = activeGraphId
        const placed = await placeSessionOnGraph(
          sessionId,
          graphId ? { mode: 'current-graph', graphId } : { mode: 'new-graph' },
        )
        const nextGraphId = graphId ?? placed?.graphId ?? null
        if (nextGraphId) {
          persistRail(insertGraphOnRail(base, nextGraphId))
          setPreferredGraphId(nextGraphId)
        }
        return
      }

      if (target.kind === 'rail') {
        // Canvas → rail blank: extract whole subtree into a new graph.
        if (drag.source === 'canvas') {
          const result = await extractSubtreeToGraph(sessionId)
          if (!result) return
          persistRail(insertGraphOnRail(base, result.newGraphId, target.railDropIndex))
          setPreferredGraphId(result.newGraphId)
          const rep = pickGraphRepresentative(
            useChatSessionStore.getState().heads,
            result.newGraphId,
          )
          if (rep) void switchSession(rep.id)
          return
        }
        // Misc → rail: new graph with this session as sole root.
        const head = await placeSessionOnGraph(sessionId, { mode: 'new-graph' })
        if (!head?.graphId) return
        persistRail(insertGraphOnRail(base, head.graphId, target.railDropIndex))
        setPreferredGraphId(head.graphId)
        return
      }

      if (target.kind === 'graph' && target.graphId) {
        // Join target graph as independent root (session only; not whole source graph).
        await placeSessionOnGraph(sessionId, {
          mode: 'join-graph',
          graphId: target.graphId,
        })
        setPreferredGraphId(target.graphId)
        return
      }

      if (target.kind === 'folder' && target.folderId) {
        if (drag.source === 'canvas') {
          const result = await extractSubtreeToGraph(sessionId)
          if (!result) return
          persistRail(
            moveGraphIntoFolder(
              insertGraphOnRail(base, result.newGraphId),
              result.newGraphId,
              target.folderId,
            ),
          )
          setPreferredGraphId(result.newGraphId)
          return
        }
        const head = await placeSessionOnGraph(sessionId, { mode: 'new-graph' })
        if (!head?.graphId) return
        persistRail(
          moveGraphIntoFolder(
            insertGraphOnRail(base, head.graphId),
            head.graphId,
            target.folderId,
          ),
        )
        setPreferredGraphId(head.graphId)
      }
    },
    [
      activeGraphId,
      demoteToMisc,
      extractSubtreeToGraph,
      mergeGraphs,
      placeSessionOnGraph,
      persistRail,
      preferredGraphId,
      switchSession,
    ],
  )

  const {
    drag: sessionDrag,
    onPointerDown: onSessionPointerDown,
    onPointerMove: onSessionPointerMove,
    onPointerUp: onSessionPointerUp,
  } = useSessionGraphDrag({
    onDragStart: () => setForceRailExpanded(true),
    onDragEnd: () => setForceRailExpanded(false),
    onDrop: (state, target) => {
      void handleDrop(state, target)
    },
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sessionDrag) setSessionGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sessionDrag, setSessionGraphOpen])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    void layoutSessionGraph(model).then((next) => {
      if (!cancelled) setLayout(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, model])

  if (!open) return null

  const shield = sessionGraphShieldInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
    leftWidth: leftPanelWidth,
    rightWidth: rightPanelWidth,
    terminalHeight,
  })

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(1.8, Math.max(0.45, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)))
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  const createWorkingSession = () => {
    void createSession().then(() => {
      setRightPanelOpen(true)
    })
  }

  const dropHighlight =
    sessionDrag?.target?.kind === 'rail' ||
    sessionDrag?.target?.kind === 'graph' ||
    sessionDrag?.target?.kind === 'folder'
      ? sessionDrag.target.kind
      : null

  const ghostTitle = sessionDrag?.title ?? ''
  const ghostTask = sessionDrag
    ? classifySessionTask(
        ghostTitle,
        sessionDrag.sessionId
          ? heads.find((h) => h.id === sessionDrag.sessionId)?.responsibility
          : pickGraphRepresentative(heads, sessionDrag.graphId ?? '')?.responsibility,
      )
    : null
  const GhostIcon = ghostTask ? TASK_ICON[ghostTask] : null

  return (
    <SessionGraphFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.sessionGraph.title')}
    >
      <WorkingSessionRail
        layout={mergedRail}
        heads={heads}
        activeGraphId={activeGraphId}
        forceExpanded={forceRailExpanded}
        dropHighlight={dropHighlight}
        dropGraphId={sessionDrag?.target?.graphId ?? null}
        dropFolderId={sessionDrag?.target?.folderId ?? null}
        draggingGraphId={
          sessionDrag?.source === 'rail' ? sessionDrag.graphId : null
        }
        railDropIndex={sessionDrag?.railDropIndex ?? null}
        onOpenGraph={(graphId) => {
          void openGraph(graphId)
        }}
        onCreate={createWorkingSession}
        onCreateFolder={() => {
          persistRail(createRailFolder(railLayout, ts('chat.sessionGraph.folderUntitled')))
        }}
        onRemoveGraph={(graphId) => {
          void (async () => {
            const members = sessionsInGraph(heads, graphId)
            for (const member of members) {
              await placeSessionOnGraph(member.id, { mode: 'misc' })
            }
            persistRail(removeGraphFromLayout(railLayoutRef.current, graphId))
            if (preferredGraphId === graphId) setPreferredGraphId(null)
          })()
        }}
        onRemoveFolder={(folderId) => {
          persistRail(removeFolderFromLayout(mergedRail, folderId))
        }}
        onGraphPointerDown={(event, graphId, title) => {
          onSessionPointerDown(event, {
            graphId,
            title,
            source: 'rail',
          })
        }}
        onPointerMove={onSessionPointerMove}
        onPointerUp={onSessionPointerUp}
      />
      <div className={styles.main}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            {activeGraphId
              ? graphRailTitle(heads, activeGraphId, ts('chat.sessionGraph.title'))
              : ts('chat.sessionGraph.title')}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.sessionGraph.close')}
            onClick={() => setSessionGraphOpen(false)}
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div
          className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''} ${
            sessionDrag?.target?.kind === 'canvas' ? styles.canvasDropTarget : ''
          }`}
          data-session-graph-drop="canvas"
          onWheel={onWheel}
          onPointerDown={(event) => {
            if (sessionDrag) return
            if ((event.target as HTMLElement).closest('[data-session-node]')) return
            dragRef.current = {
              x: viewport.x,
              y: viewport.y,
              px: event.clientX,
              py: event.clientY,
            }
            setDragging(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag) return
            setViewport((current) => ({
              ...current,
              x: drag.x + event.clientX - drag.px,
              y: drag.y + event.clientY - drag.py,
            }))
          }}
          onPointerUp={() => {
            dragRef.current = null
            setDragging(false)
          }}
        >
          {model.nodes.length === 0 ? (
            <p className={styles.empty}>{ts('chat.sessionGraph.empty')}</p>
          ) : layout ? (
            <div
              className={styles.world}
              style={{
                width: layout.width,
                height: layout.height,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              }}
            >
              <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden>
                {model.edges.map((edge) => {
                  const source = layout.positions[edge.source]
                  const target = layout.positions[edge.target]
                  if (!source || !target) return null
                  const x1 = source.x + SESSION_NODE_WIDTH / 2
                  const y1 = source.y + SESSION_NODE_HEIGHT
                  const x2 = target.x + SESSION_NODE_WIDTH / 2
                  const y2 = target.y
                  const mid = (y1 + y2) / 2
                  return (
                    <path
                      key={`${edge.source}-${edge.target}`}
                      className={styles.edge}
                      d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                    />
                  )
                })}
              </svg>
              {model.nodes.map((node) => {
                const position = layout.positions[node.id]
                if (!position) return null
                const head = heads.find((item) => item.id === node.id)
                const title = node.title || ts('chat.history.untitled')
                const lifted = sessionDrag?.sessionId === node.id
                return (
                  <SessionNode
                    key={node.id}
                    head={head}
                    title={title}
                    responsibility={node.responsibility}
                    status={node.status}
                    active={node.id === activeSessionId}
                    lifted={lifted}
                    x={position.x}
                    y={position.y}
                    onOpen={() => void switchSession(node.id)}
                    onBranch={() => void forkSession(node.id)}
                    onMisc={() => void demoteToMisc(node.id)}
                    onPointerDown={(event) =>
                      onSessionPointerDown(event, {
                        sessionId: node.id,
                        graphId: node.graphId,
                        title,
                        source: 'canvas',
                      })
                    }
                    onPointerMove={onSessionPointerMove}
                    onPointerUp={onSessionPointerUp}
                  />
                )
              })}
            </div>
          ) : null}
        </div>
        <MiscTray
          items={model.misc}
          activeSessionId={activeSessionId}
          dropActive={sessionDrag?.target?.kind === 'misc'}
          onOpen={(sessionId) => void switchSession(sessionId)}
          onPromote={(sessionId) => {
            void placeSessionOnGraph(
              sessionId,
              activeGraphId
                ? { mode: 'current-graph', graphId: activeGraphId }
                : { mode: 'new-graph' },
            ).then((head) => {
              if (!head?.graphId) return
              persistRail(insertGraphOnRail(railLayoutRef.current, head.graphId))
              setPreferredGraphId(head.graphId)
            })
          }}
          onPointerDown={(event, sessionId, title) => {
            onSessionPointerDown(event, {
              sessionId,
              title,
              source: 'misc',
            })
          }}
          onPointerMove={onSessionPointerMove}
          onPointerUp={onSessionPointerUp}
        />
      </div>
      {sessionDrag ? (
        <div
          className={styles.sessionDragGhost}
          style={{ left: sessionDrag.x + 10, top: sessionDrag.y + 10 }}
          data-task={ghostTask ?? undefined}
          aria-hidden
        >
          {GhostIcon ? <GhostIcon size={16} strokeWidth={2} /> : null}
          <span>{ghostTitle}</span>
        </div>
      ) : null}
    </SessionGraphFrame>
  )
}

function SessionNode({
  head,
  title,
  responsibility,
  status,
  active,
  lifted,
  x,
  y,
  onOpen,
  onBranch,
  onMisc,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  head: ChatSessionHead | undefined
  title: string
  responsibility?: string
  status: SessionGraphModel['nodes'][number]['status']
  active: boolean
  lifted: boolean
  x: number
  y: number
  onOpen: () => void
  onBranch: () => void
  onMisc: () => void
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  const { ts } = useI18n()
  const task = classifySessionTask(title, responsibility)
  const TaskIcon = TASK_ICON[task]
  const taskLabel = ts(`chat.sessionGraph.task.${task}`)
  return (
    <div
      className={`${styles.node} ${active ? styles.nodeActive : ''} ${
        lifted ? styles.nodeLifted : ''
      }`}
      style={{ left: x, top: y, width: SESSION_NODE_WIDTH, height: SESSION_NODE_HEIGHT }}
      data-session-node={head?.id}
      data-task={task}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.nodeTop}>
        <span className={styles.taskMark} title={taskLabel}>
          <TaskIcon size={14} strokeWidth={1.75} aria-hidden />
          <span className={styles.taskName}>{taskLabel}</span>
        </span>
        <button type="button" className={styles.nodeTitle} onClick={onOpen} aria-current={active ? 'true' : undefined}>
          {title}
        </button>
      </div>
      {responsibility ? <span className={styles.nodeResponsibility}>{responsibility}</span> : null}
      <div className={styles.nodeMeta}>
        <span className={styles.status}>
          <span className={`${styles.statusDot} ${STATUS_CLASS[status]}`} aria-hidden />
          {ts(`chat.sessionGraph.status.${status}`)}
        </span>
        <span className={styles.nodeActions}>
          <button
            type="button"
            className={styles.iconButton}
            data-session-drag-ignore=""
            aria-label={ts('chat.sessionGraph.branch')}
            title={ts('chat.sessionGraph.branch')}
            onClick={onBranch}
          >
            <GitBranch size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            data-session-drag-ignore=""
            aria-label={ts('chat.sessionGraph.moveToMisc')}
            title={ts('chat.sessionGraph.moveToMisc')}
            onClick={onMisc}
          >
            <Archive size={14} aria-hidden />
          </button>
        </span>
      </div>
    </div>
  )
}

function MiscTray({
  items,
  activeSessionId,
  dropActive,
  onOpen,
  onPromote,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  items: ChatSessionHead[]
  activeSessionId: string | null
  dropActive: boolean
  onOpen: (sessionId: string) => void
  onPromote: (sessionId: string) => void
  onPointerDown: (
    event: ReactPointerEvent,
    sessionId: string,
    title: string,
  ) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  const { ts } = useI18n()
  return (
    <div
      className={`${styles.misc} ${dropActive ? styles.miscDropTarget : ''}`}
      data-session-graph-drop="misc"
    >
      <span className={styles.miscLabel}>{ts('chat.sessionGraph.misc')}</span>
      <div className={styles.miscList}>
        {items.length === 0 ? (
          <span className={styles.miscHint}>{ts('chat.sessionGraph.miscDropHint')}</span>
        ) : (
          items.map((item) => {
            const title = item.title.trim() || ts('chat.history.untitled')
            return (
              <div
                key={item.id}
                className={`${styles.miscChip} ${item.id === activeSessionId ? styles.miscChipActive : ''}`}
                onPointerDown={(event) => onPointerDown(event, item.id, title)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <button type="button" className={styles.miscTitle} onClick={() => onOpen(item.id)}>
                  {title}
                </button>
                <button
                  type="button"
                  className={styles.miscButton}
                  data-session-drag-ignore=""
                  aria-label={ts('chat.sessionGraph.moveToGraph')}
                  title={ts('chat.sessionGraph.moveToGraph')}
                  onClick={() => onPromote(item.id)}
                >
                  +
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
