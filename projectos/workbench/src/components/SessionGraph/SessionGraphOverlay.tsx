import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  ChatMessage,
  ChatSessionHead,
  ChatSessionMode,
  SessionGraphModel,
  SessionGraphStripItem,
} from '@contracts/index'
import {
  buildSessionGraph,
  chatSessionHasUserMessage,
  composerDraftHasContent,
  pickGraphRepresentative,
  resolveChatSessionClassification,
  resolveSessionGraphId,
  sessionsInGraph,
  sessionGraphShieldCssInsets,
  shouldHardDeleteInsteadOfMisc,
  SESSION_GRAPH_STRIP_MAX_ITEMS,
  type SessionGraphCssInsets,
} from '@contracts/index'
import { collectUserTurns } from '../ChatPanel/conversationNavTurns'
import {
  placeForkChildPositionClearOfObstacles,
  resolveSessionForkPlacementForPreview,
  buildSessionForkEdgePath,
  resolveSessionGraphOverlaps,
  type SessionForkPlacement,
  type SessionNodeBounds,
} from './sessionForkLayout'
import {
  Archive,
  Box,
  Bug,
  ChevronDown,
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
  estimateSessionNodeHeight,
  layoutSessionGraph,
  type SessionGraphLayout,
} from './layoutSessionGraph'
import { toneClassForChatMode } from '../ChatPanel/composer/chatModeVisuals'
import SessionStripWorkingTitle from './SessionStripWorkingTitle'
import { classifySessionTask } from './sessionTaskKind'
import {
  createRailFolder,
  emptySessionGraphRailLayout,
  findFolderEntry,
  graphRailTitle,
  insertFolderOnRail,
  insertGraphOnRail,
  loadSessionGraphRailLayout,
  moveFolderIntoFolder,
  moveGraphIntoFolder,
  removeFolderFromLayout,
  removeGraphFromLayout,
  renameRailFolder,
  resolveActiveGraphId,
  saveSessionGraphRailLayout,
  syncRailLayoutWithGraphs,
  type SessionGraphRailLayout,
} from './sessionGraphRailLayout'
import {
  applyCanvasPositionOverrides,
  emptySessionGraphCanvasLayout,
  getGraphCanvasPositions,
  loadSessionGraphCanvasLayout,
  pruneGraphCanvasPositions,
  saveSessionGraphCanvasLayout,
  setSessionCanvasPosition,
  setSessionCanvasPositions,
  type SessionGraphCanvasLayout,
} from './sessionGraphCanvasLayout'
import {
  readRailDropIndex,
  readSessionGraphDropTarget,
  useSessionGraphDrag,
  type SessionDragState,
  type SessionDropTarget,
} from './useSessionGraphDrag'

/**
 * Screen-px movement before a canvas node drag leaves pending (title/footer).
 * Keep above typical click jitter so title/footer can still fire click → open.
 */
const SESSION_NODE_DRAG_MOVE_PX = 6
/** Same tolerance: blank-canvas click vs pan. */
const SESSION_CANVAS_PAN_MOVE_PX = 6
import {
  SESSION_NODE_PREVIEW_DELAY_MS,
  SESSION_NODE_PREVIEW_HIDE_MS,
  SESSION_NODE_PREVIEW_MAX_HEIGHT,
  SESSION_NODE_PREVIEW_WIDTH,
  resolveSessionNodePreviewPosition,
} from './sessionNodePreview'
import {
  resolveLatestRevealMessageId,
  resolveSessionNodeStripPromptPreview,
  resolveStripChatMode,
  resolveStripRevealMessageId,
} from './sessionNodeStripPreview'
import { computeMiscFitCount } from './miscFitCount'
import {
  formatSessionGraphRelativeTime,
  isSessionGraphQuiet,
  sessionMatchesGraphQuery,
} from './sessionGraphCardMeta'
import WorkingSessionRail from './WorkingSessionRail'
import SessionNodeContextMenu, {
  type SessionNodeContextMenuState,
} from './SessionNodeContextMenu'
import SessionPromptHistorySheet from './SessionPromptHistorySheet'
import SessionSweepReviewSheet from './SessionSweepReviewSheet'
import SessionTidyReviewSheet from './SessionTidyReviewSheet'
import { useSessionSweepStore } from '../../state/sessionSweepStore'
import sheetStyles from './SessionGraphCenterSheet.module.css'
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
  shield: SessionGraphCssInsets
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
  const openSessionAtMessage = useChatSessionStore((s) => s.openSessionAtMessage)
  const clearPendingRevealMessage = useChatSessionStore((s) => s.clearPendingRevealMessage)
  const createSession = useChatSessionStore((s) => s.createSession)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const pendingSessionForkPlacement = useChatSessionStore((s) => s.pendingSessionForkPlacement)
  const clearPendingSessionForkPlacement = useChatSessionStore(
    (s) => s.clearPendingSessionForkPlacement,
  )
  const deleteSession = useChatSessionStore((s) => s.deleteSession)
  const placeSessionOnGraph = useChatSessionStore((s) => s.placeSessionOnGraph)
  const extractSubtreeToGraph = useChatSessionStore((s) => s.extractSubtreeToGraph)
  const mergeGraphs = useChatSessionStore((s) => s.mergeGraphs)
  const client = useWorkbenchStore((s) => s.client)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const pendingSweepPlan = useSessionSweepStore((s) => s.pendingPlan)
  const pendingTidyPlan = useSessionSweepStore((s) => s.pendingTidyPlan)
  const centerSheet = useSessionSweepStore((s) => s.centerSheet)
  const openSweepReview = useSessionSweepStore((s) => s.openSweepReview)
  const openTidyReview = useSessionSweepStore((s) => s.openTidyReview)
  const openPromptHistory = useSessionSweepStore((s) => s.openPromptHistory)
  const { ts } = useI18n()
  const [nodeContextMenu, setNodeContextMenu] = useState<SessionNodeContextMenuState | null>(
    null,
  )

  const [railLayout, setRailLayout] = useState<SessionGraphRailLayout>(() =>
    emptySessionGraphRailLayout(),
  )
  const [canvasLayout, setCanvasLayout] = useState<SessionGraphCanvasLayout>(() =>
    emptySessionGraphCanvasLayout(),
  )
  const [preferredGraphId, setPreferredGraphId] = useState<string | null>(null)
  const [forceRailExpanded, setForceRailExpanded] = useState(false)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [baseLayout, setBaseLayout] = useState<SessionGraphLayout | null>(null)
  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  /** Bumps when a card reports a new rendered height (live strip growth). */
  const [liveHeightsVersion, setLiveHeightsVersion] = useState(0)
  const liveNodeHeightsRef = useRef<Record<string, number>>({})
  const [nodeCanvasDrag, setNodeCanvasDrag] = useState<{
    sessionId: string
    graphId: string
    title: string
    mode: 'position' | 'semantic'
    x: number
    y: number
    target: SessionDropTarget | null
    railDropIndex: number | null
  } | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const canvasPannedRef = useRef(false)
  const blankSessionInFlightRef = useRef(false)
  const nodeDragRef = useRef<{
    sessionId: string
    graphId: string
    title: string
    ox: number
    oy: number
    px: number
    py: number
    pointerId: number
    mode: 'pending' | 'position' | 'semantic'
    lastCanvasX: number
    lastCanvasY: number
    target: SessionDropTarget | null
    railDropIndex: number | null
    /** Capture only after drag starts so title/footer still receive click. */
    captureEl: HTMLElement | null
  } | null>(null)
  const suppressNodeClickRef = useRef(false)
  const suppressMiscClickRef = useRef(false)
  const nodeDragCleanupRef = useRef<(() => void) | null>(null)
  const railLayoutRef = useRef(railLayout)
  railLayoutRef.current = railLayout
  const canvasLayoutRef = useRef(canvasLayout)
  canvasLayoutRef.current = canvasLayout
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const headsRef = useRef(heads)
  headsRef.current = heads

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
  const graphCanvasPositions = useMemo(
    () => getGraphCanvasPositions(canvasLayout, activeGraphId),
    [canvasLayout, activeGraphId],
  )
  const layout = useMemo(
    () =>
      baseLayout
        ? applyCanvasPositionOverrides(baseLayout, graphCanvasPositions, {
            liveIds: model.nodes.map((node) => node.id),
            fallbackHeights: Object.fromEntries(
              model.nodes.map((node) => [
                node.id,
                estimateSessionNodeHeight(
                  node.stripCount + (node.parentId ? 1 : 0),
                ),
              ]),
            ),
          })
        : null,
    [baseLayout, graphCanvasPositions, model.nodes],
  )

  /** Rendered card heights — edges must track these, not the stale ELK estimate. */
  const liveNodeHeights = useMemo(() => {
    void liveHeightsVersion
    const next: Record<string, number> = { ...(layout?.heights ?? {}) }
    for (const node of model.nodes) {
      const live = liveNodeHeightsRef.current[node.id]
      if (typeof live === 'number' && live > 0) {
        next[node.id] = live
      } else if (!(node.id in next)) {
        next[node.id] = estimateSessionNodeHeight(
          node.stripCount + (node.parentId ? 1 : 0),
        )
      }
    }
    return next
  }, [layout?.heights, liveHeightsVersion, model.nodes])

  /** Grow the pannable world when live cards outgrow the ELK estimate. */
  const worldSize = useMemo(() => {
    if (!layout) return null
    let width = layout.width
    let height = layout.height
    for (const node of model.nodes) {
      const position = layout.positions[node.id]
      if (!position) continue
      const nodeHeight = liveNodeHeights[node.id] ?? SESSION_NODE_HEIGHT
      width = Math.max(width, position.x + SESSION_NODE_WIDTH + 40)
      height = Math.max(height, position.y + nodeHeight + 40)
    }
    return { width, height }
  }, [layout, liveNodeHeights, model.nodes])
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {
    if (!projectId) {
      setRailLayout(emptySessionGraphRailLayout())
      setCanvasLayout(emptySessionGraphCanvasLayout())
      return
    }
    setRailLayout(loadSessionGraphRailLayout(projectId, heads))
    setCanvasLayout(loadSessionGraphCanvasLayout(projectId))
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

  const persistCanvas = useCallback(
    (next: SessionGraphCanvasLayout) => {
      setCanvasLayout(next)
      if (projectId) saveSessionGraphCanvasLayout(projectId, next)
    },
    [projectId],
  )

  const placeForkedChildOnCanvas = useCallback(
    (
      parentSessionId: string,
      childSessionId: string,
      placement: SessionForkPlacement,
    ): boolean => {
      const parentHead = headsRef.current.find((head) => head.id === parentSessionId)
      const graphId =
        (parentHead ? resolveSessionGraphId(parentHead) : null) ?? activeGraphId
      const currentLayout = layoutRef.current
      if (!graphId || !currentLayout) return false
      const parentPos = currentLayout.positions[parentSessionId]
      if (!parentPos) return false
      const parentHeight =
        liveNodeHeightsRef.current[parentSessionId] ??
        currentLayout.heights[parentSessionId] ??
        SESSION_NODE_HEIGHT
      const obstacles: SessionNodeBounds[] = Object.entries(currentLayout.positions)
        .filter(([id]) => id !== childSessionId)
        .map(([id, pos]) => ({
          id,
          x: pos.x,
          y: pos.y,
          width: SESSION_NODE_WIDTH,
          height:
            liveNodeHeightsRef.current[id] ??
            currentLayout.heights[id] ??
            SESSION_NODE_HEIGHT,
        }))
      // Ideal fork slot, then nudge clear of any overlapping cards.
      const point = placeForkChildPositionClearOfObstacles(
        { x: parentPos.x, y: parentPos.y, height: parentHeight },
        placement,
        obstacles,
        1,
      )
      persistCanvas(
        setSessionCanvasPosition(canvasLayoutRef.current, graphId, childSessionId, point),
      )
      return true
    },
    [activeGraphId, persistCanvas],
  )

  const forkFromNode = useCallback(
    async (
      parentSessionId: string,
      forkMessageId: string | undefined,
      placement: SessionForkPlacement,
    ): Promise<string | null> => {
      const childId = await forkSession(parentSessionId, forkMessageId, placement)
      if (!childId) return null
      // Match the store's eager child activation so the new card reads as selected.
      setFocusedSessionId(childId)
      // Place immediately so aside forks appear to the right without waiting for
      // the next ELK pass / pending effect tick.
      if (placeForkedChildOnCanvas(parentSessionId, childId, placement)) {
        clearPendingSessionForkPlacement()
      }
      return childId
    },
    [clearPendingSessionForkPlacement, forkSession, placeForkedChildOnCanvas],
  )

  useEffect(() => {
    if (!pendingSessionForkPlacement || !layout) return
    const { parentSessionId, childSessionId, placement } = pendingSessionForkPlacement
    if (!layout.positions[parentSessionId]) return
    if (!placeForkedChildOnCanvas(parentSessionId, childSessionId, placement)) return
    clearPendingSessionForkPlacement()
  }, [
    clearPendingSessionForkPlacement,
    layout,
    pendingSessionForkPlacement,
    placeForkedChildOnCanvas,
  ])

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

      // Manual remove: low-value / unused fork → hard delete; otherwise Misc.
      // Auto-classify still keeps graph-attached forks on the canvas (not Misc).
      if (client && projectId) {
        const record = await client.getChatSession(projectId, sessionId)
        if (record && shouldHardDeleteInsteadOfMisc(record)) {
          const deleted = await deleteSession(sessionId)
          if (deleted) {
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
            return
          }
          // Delete blocked (e.g. retained children) — fall through to Misc.
        }
      }

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
    [
      client,
      deleteSession,
      heads,
      placeSessionOnGraph,
      persistRail,
      preferredGraphId,
      projectId,
    ],
  )

  const handleDrop = useCallback(
    async (drag: SessionDragState, target: SessionDropTarget) => {
      const base = syncRailLayoutWithGraphs(
        railLayoutRef.current,
        useChatSessionStore.getState().heads,
      )

      // ——— Rail folder drag ———
      if (drag.source === 'rail' && drag.folderId) {
        if (target.kind === 'folder' && target.folderId) {
          persistRail(moveFolderIntoFolder(base, drag.folderId, target.folderId))
          return
        }
        if (target.kind === 'rail') {
          persistRail(insertFolderOnRail(base, drag.folderId, target.railDropIndex))
          return
        }
        return
      }

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
    onDragStart: (state) => {
      if (state.source === 'misc') suppressMiscClickRef.current = true
      setForceRailExpanded(true)
    },
    onDragEnd: () => setForceRailExpanded(false),
    onDrop: (state, target) => {
      void handleDrop(state, target)
    },
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (nodeDragRef.current) {
        const drag = nodeDragRef.current
        if (drag.mode !== 'pending') {
          setCanvasLayout((current) =>
            setSessionCanvasPosition(current, drag.graphId, drag.sessionId, {
              x: drag.ox,
              y: drag.oy,
            }),
          )
        }
        nodeDragCleanupRef.current?.()
        nodeDragCleanupRef.current = null
        nodeDragRef.current = null
        setNodeCanvasDrag(null)
        setForceRailExpanded(false)
        return
      }
      if (!sessionDrag) setSessionGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sessionDrag, setSessionGraphOpen])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    void layoutSessionGraph(model).then((next) => {
      if (!cancelled) setBaseLayout(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, model])

  useEffect(() => {
    if (!activeGraphId) return
    const liveIds = model.nodes.map((node) => node.id)
    const liveIdSet = new Set(liveIds)
    const heightIds = Object.keys(liveNodeHeightsRef.current)
    let heightsChanged = false
    for (const id of heightIds) {
      if (liveIdSet.has(id)) continue
      delete liveNodeHeightsRef.current[id]
      heightsChanged = true
    }
    if (heightsChanged) setLiveHeightsVersion((value) => value + 1)
    const pruned = pruneGraphCanvasPositions(
      canvasLayoutRef.current,
      activeGraphId,
      liveIds,
    )
    if (pruned !== canvasLayoutRef.current) persistCanvas(pruned)
  }, [activeGraphId, model.nodes, persistCanvas])

  const onNodeCardHeightChange = useCallback((sessionId: string, height: number) => {
    const prev = liveNodeHeightsRef.current[sessionId]
    if (prev === height) return
    liveNodeHeightsRef.current[sessionId] = height
    setLiveHeightsVersion((value) => value + 1)
  }, [])

  // When strip growth makes a card taller, push neighbors clear of overlaps.
  useEffect(() => {
    if (!open || !layout || !activeGraphId) return
    if (nodeCanvasDrag) return
    const bounds: SessionNodeBounds[] = []
    for (const node of model.nodes) {
      const position = layout.positions[node.id]
      if (!position) continue
      const liveHeight = liveNodeHeightsRef.current[node.id]
      bounds.push({
        id: node.id,
        x: position.x,
        y: position.y,
        width: SESSION_NODE_WIDTH,
        height:
          typeof liveHeight === 'number' && liveHeight > 0
            ? liveHeight
            : estimateSessionNodeHeight(
                node.stripCount + (node.parentId ? 1 : 0),
              ),
      })
    }
    const resolved = resolveSessionGraphOverlaps(bounds)
    if (!resolved.changed) return

    const updates: Record<string, { x: number; y: number }> = {}
    for (const node of model.nodes) {
      const next = resolved.positions[node.id]
      const current = layout.positions[node.id]
      if (!next || !current) continue
      if (next.x === current.x && next.y === current.y) continue
      updates[node.id] = next
    }
    if (Object.keys(updates).length === 0) return
    persistCanvas(
      setSessionCanvasPositions(canvasLayoutRef.current, activeGraphId, updates),
    )
  }, [
    activeGraphId,
    layout,
    liveHeightsVersion,
    model.nodes,
    nodeCanvasDrag,
    open,
    persistCanvas,
  ])

  const handleDropRef = useRef(handleDrop)
  handleDropRef.current = handleDrop
  const persistCanvasRef = useRef(persistCanvas)
  persistCanvasRef.current = persistCanvas

  const endNodeCanvasDrag = useCallback(() => {
    nodeDragCleanupRef.current?.()
    nodeDragCleanupRef.current = null
    nodeDragRef.current = null
    setNodeCanvasDrag(null)
    setForceRailExpanded(false)
  }, [])

  const onNodeCanvasPointerDown = useCallback(
    (
      event: ReactPointerEvent,
      payload: {
        sessionId: string
        graphId: string
        title: string
        x: number
        y: number
      },
    ) => {
      if (event.button !== 0) return
      // Strip items / branch / archive opt out of canvas drag. Title + footer
      // stay draggable; clear sticky suppress so their click can still open.
      if ((event.target as HTMLElement).closest('[data-session-drag-ignore]')) {
        suppressNodeClickRef.current = false
        return
      }
      if (sessionDrag || nodeDragRef.current) return
      event.stopPropagation()
      suppressNodeClickRef.current = false

      const graphId = activeGraphId ?? payload.graphId
      if (!graphId) return

      const pointerId = event.pointerId
      const captureEl = event.currentTarget as HTMLElement
      nodeDragRef.current = {
        sessionId: payload.sessionId,
        graphId,
        title: payload.title,
        ox: payload.x,
        oy: payload.y,
        px: event.clientX,
        py: event.clientY,
        pointerId,
        mode: 'pending',
        lastCanvasX: payload.x,
        lastCanvasY: payload.y,
        target: null,
        railDropIndex: null,
        captureEl,
      }

      const detach = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (nodeDragCleanupRef.current === detach) nodeDragCleanupRef.current = null
        try {
          if (captureEl.hasPointerCapture(pointerId)) {
            captureEl.releasePointerCapture(pointerId)
          }
        } catch {
          /* ignore */
        }
      }

      const finish = (clientX: number, clientY: number) => {
        detach()
        const drag = nodeDragRef.current
        if (!drag || drag.pointerId !== pointerId) return

        if (drag.mode === 'pending') {
          endNodeCanvasDrag()
          suppressNodeClickRef.current = false
          return
        }

        // Swallow only the click that ends this drag; do not leave suppress sticky
        // (that blocked opening a forked child card after any prior node move).
        suppressNodeClickRef.current = true
        window.setTimeout(() => {
          suppressNodeClickRef.current = false
        }, 0)

        if (drag.mode === 'semantic') {
          const el = document.elementFromPoint(clientX, clientY)
          let target = drag.target ?? readSessionGraphDropTarget(el)
          const overRail = Boolean(el?.closest?.('[data-working-session-rail]'))
          if (
            (!target || target.kind === 'canvas') &&
            overRail &&
            drag.railDropIndex != null
          ) {
            target = { kind: 'rail', railDropIndex: drag.railDropIndex }
          }
          if (target && target.kind === 'rail' && drag.railDropIndex != null) {
            target = { ...target, railDropIndex: drag.railDropIndex }
          }
          const reverted = setSessionCanvasPosition(
            canvasLayoutRef.current,
            drag.graphId,
            drag.sessionId,
            { x: drag.ox, y: drag.oy },
          )
          persistCanvasRef.current(reverted)
          endNodeCanvasDrag()
          if (target && target.kind !== 'canvas') {
            void handleDropRef.current(
              {
                sessionId: drag.sessionId,
                graphId: drag.graphId,
                folderId: null,
                title: drag.title,
                source: 'canvas',
                x: clientX,
                y: clientY,
                target,
                railDropIndex: target.railDropIndex ?? null,
              },
              target,
            )
          }
          return
        }

        persistCanvasRef.current(canvasLayoutRef.current)
        endNodeCanvasDrag()
      }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const drag = nodeDragRef.current
        if (!drag || drag.pointerId !== pointerId) return

        const dxScreen = moveEvent.clientX - drag.px
        const dyScreen = moveEvent.clientY - drag.py
        if (drag.mode === 'pending') {
          // Allow small click jitter on title/footer before treating as a drag.
          const startPx = SESSION_NODE_DRAG_MOVE_PX
          if (dxScreen * dxScreen + dyScreen * dyScreen < startPx * startPx) {
            return
          }
          suppressNodeClickRef.current = true
          // Capture only once dragging — early capture stole title/footer clicks.
          if (drag.captureEl) {
            try {
              drag.captureEl.setPointerCapture(pointerId)
            } catch {
              /* ignore */
            }
          }
        }
        moveEvent.preventDefault()

        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        const target = readSessionGraphDropTarget(el)
        const overRailHost = Boolean(el?.closest?.('[data-working-session-rail]'))
        const overRail =
          target?.kind === 'rail' ||
          target?.kind === 'graph' ||
          target?.kind === 'folder' ||
          overRailHost
        const railDropIndex = overRail
          ? readRailDropIndex(moveEvent.clientY, drag.graphId, null)
          : null
        // Only leave the canvas for true external drop zones — never treat
        // data-session-graph-drop="canvas" as a semantic target.
        const semantic =
          target?.kind === 'misc' ||
          target?.kind === 'rail' ||
          target?.kind === 'graph' ||
          target?.kind === 'folder'

        if (semantic) {
          const nextTarget = target
          if (drag.mode !== 'semantic') {
            setCanvasLayout((current) =>
              setSessionCanvasPosition(current, drag.graphId, drag.sessionId, {
                x: drag.lastCanvasX,
                y: drag.lastCanvasY,
              }),
            )
            setForceRailExpanded(true)
          }
          drag.mode = 'semantic'
          drag.target = nextTarget
          drag.railDropIndex = railDropIndex
          nodeDragRef.current = drag
          setNodeCanvasDrag({
            sessionId: drag.sessionId,
            graphId: drag.graphId,
            title: drag.title,
            mode: 'semantic',
            x: moveEvent.clientX,
            y: moveEvent.clientY,
            target: nextTarget,
            railDropIndex,
          })
          return
        }

        const scale = viewportRef.current.scale || 1
        const nextX = Math.max(0, drag.ox + dxScreen / scale)
        const nextY = Math.max(0, drag.oy + dyScreen / scale)
        drag.mode = 'position'
        drag.lastCanvasX = nextX
        drag.lastCanvasY = nextY
        drag.target = null
        drag.railDropIndex = null
        nodeDragRef.current = drag
        setCanvasLayout((current) =>
          setSessionCanvasPosition(current, drag.graphId, drag.sessionId, {
            x: nextX,
            y: nextY,
          }),
        )
        setNodeCanvasDrag({
          sessionId: drag.sessionId,
          graphId: drag.graphId,
          title: drag.title,
          mode: 'position',
          x: moveEvent.clientX,
          y: moveEvent.clientY,
          target: null,
          railDropIndex: null,
        })
        setForceRailExpanded(false)
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        finish(upEvent.clientX, upEvent.clientY)
      }

      nodeDragCleanupRef.current = detach
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [activeGraphId, endNodeCanvasDrag, sessionDrag],
  )

  /**
   * Blank-canvas click: clear graph selection and land on an unassociated empty
   * misc session (no parent / graph). Smart routing / tidy may attach it later.
   * Must stay above the `if (!open)` return so hook order is stable.
   */
  const activateBlankCanvasSession = useCallback(async () => {
    setFocusedSessionId(null)
    clearPendingRevealMessage()

    const activeId = useChatSessionStore.getState().activeSessionId
    const activeHead = useChatSessionStore
      .getState()
      .heads.find((head) => head.id === activeId)
    const { messages, composerDraft } = useWorkbenchStore.getState()
    const alreadyScratch =
      Boolean(activeHead) &&
      resolveChatSessionClassification(activeHead!) === 'misc' &&
      !activeHead!.parentSessionId &&
      !activeHead!.graphId?.trim() &&
      activeHead!.status !== 'running' &&
      activeHead!.status !== 'awaiting_review' &&
      !chatSessionHasUserMessage(messages) &&
      !composerDraftHasContent(composerDraft)

    if (alreadyScratch) {
      setRightPanelOpen(true)
      return
    }
    if (blankSessionInFlightRef.current) return
    blankSessionInFlightRef.current = true
    try {
      await createSession({ seedWelcome: false })
      setRightPanelOpen(true)
    } finally {
      blankSessionInFlightRef.current = false
    }
  }, [clearPendingRevealMessage, createSession, setRightPanelOpen])

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
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

  const activeDropTarget =
    sessionDrag?.target ??
    (nodeCanvasDrag?.mode === 'semantic' ? nodeCanvasDrag.target : null)
  const dropHighlight =
    activeDropTarget?.kind === 'rail' ||
    activeDropTarget?.kind === 'graph' ||
    activeDropTarget?.kind === 'folder'
      ? activeDropTarget.kind
      : null

  const semanticGhost =
    sessionDrag ??
    (nodeCanvasDrag?.mode === 'semantic'
      ? {
          sessionId: nodeCanvasDrag.sessionId,
          graphId: nodeCanvasDrag.graphId,
          folderId: null as string | null,
          title: nodeCanvasDrag.title,
          x: nodeCanvasDrag.x,
          y: nodeCanvasDrag.y,
        }
      : null)
  const ghostTitle = semanticGhost?.title ?? ''
  const ghostTask = semanticGhost
    ? classifySessionTask(
        ghostTitle,
        semanticGhost.sessionId
          ? heads.find((h) => h.id === semanticGhost.sessionId)?.responsibility
          : pickGraphRepresentative(heads, semanticGhost.graphId ?? '')?.responsibility,
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
        forceExpanded={forceRailExpanded || renamingFolderId != null}
        renamingFolderId={renamingFolderId}
        dropHighlight={dropHighlight}
        dropGraphId={activeDropTarget?.graphId ?? null}
        dropFolderId={activeDropTarget?.folderId ?? null}
        draggingGraphId={
          sessionDrag?.source === 'rail' ? sessionDrag.graphId : null
        }
        draggingFolderId={
          sessionDrag?.source === 'rail' ? sessionDrag.folderId : null
        }
        railDropIndex={
          sessionDrag?.railDropIndex ??
          (nodeCanvasDrag?.mode === 'semantic' ? nodeCanvasDrag.railDropIndex : null)
        }
        onOpenGraph={(graphId) => {
          void openGraph(graphId)
        }}
        onCreate={createWorkingSession}
        onCreateFolder={() => {
          const created = createRailFolder(
            railLayout,
            ts('chat.sessionGraph.folderUntitled'),
          )
          persistRail(created.layout)
          setRenamingFolderId(created.folderId)
        }}
        onRenameFolder={(folderId, title) => {
          persistRail(renameRailFolder(railLayoutRef.current, folderId, title))
          setRenamingFolderId(null)
        }}
        onCancelRenameFolder={() => {
          if (renamingFolderId) {
            const folder = findFolderEntry(railLayoutRef.current.entries, renamingFolderId)
            if (
              folder &&
              folder.children.length === 0 &&
              (!folder.title.trim() ||
                folder.title.trim() === ts('chat.sessionGraph.folderUntitled'))
            ) {
              persistRail(removeFolderFromLayout(railLayoutRef.current, renamingFolderId))
            }
          }
          setRenamingFolderId(null)
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
          if (renamingFolderId === folderId) setRenamingFolderId(null)
          persistRail(removeFolderFromLayout(mergedRail, folderId))
        }}
        onGraphPointerDown={(event, graphId, title) => {
          onSessionPointerDown(event, {
            graphId,
            title,
            source: 'rail',
          })
        }}
        onFolderPointerDown={(event, folderId, title) => {
          onSessionPointerDown(event, {
            folderId,
            title,
            source: 'rail',
          })
        }}
        onPointerMove={onSessionPointerMove}
        onPointerUp={onSessionPointerUp}
      />
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 className={styles.title}>
              {activeGraphId
                ? graphRailTitle(heads, activeGraphId, ts('chat.sessionGraph.title'))
                : ts('chat.sessionGraph.title')}
            </h2>
            <input
              className={styles.searchInput}
              type="search"
              value={filterQuery}
              placeholder={ts('chat.sessionGraph.searchPlaceholder')}
              aria-label={ts('chat.sessionGraph.searchAria')}
              title={ts('chat.sessionGraph.focusHint')}
              onChange={(event) => setFilterQuery(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            {pendingTidyPlan && pendingTidyPlan.clusters.length > 0 ? (
              <button
                type="button"
                className={sheetStyles.pendingBadge}
                onClick={() => openTidyReview()}
              >
                {ts('chat.sessionGraph.tidy.pendingBadge', {
                  count: pendingTidyPlan.clusters.length,
                })}
              </button>
            ) : null}
            {pendingSweepPlan && pendingSweepPlan.candidates.length > 0 ? (
              <button
                type="button"
                className={sheetStyles.pendingBadge}
                onClick={() => openSweepReview()}
              >
                {ts('chat.sessionGraph.sweep.pendingBadge', {
                  count: pendingSweepPlan.candidates.length,
                })}
              </button>
            ) : null}
          </div>
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
          className={`${styles.canvas} ${dragging || nodeCanvasDrag?.mode === 'position' ? styles.canvasDragging : ''} ${
            sessionDrag?.target?.kind === 'canvas' ? styles.canvasDropTarget : ''
          }`}
          data-session-graph-drop="canvas"
          onWheel={onWheel}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            if (sessionDrag || nodeDragRef.current) return
            if ((event.target as HTMLElement).closest('[data-session-node]')) return
            canvasPannedRef.current = false
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
            if (nodeDragRef.current) return
            const drag = dragRef.current
            if (!drag) return
            const dx = event.clientX - drag.px
            const dy = event.clientY - drag.py
            if (
              dx * dx + dy * dy >=
              SESSION_CANVAS_PAN_MOVE_PX * SESSION_CANVAS_PAN_MOVE_PX
            ) {
              canvasPannedRef.current = true
            }
            if (!canvasPannedRef.current) return
            setViewport((current) => ({
              ...current,
              x: drag.x + dx,
              y: drag.y + dy,
            }))
          }}
          onPointerUp={() => {
            if (nodeDragRef.current) return
            const wasPan = canvasPannedRef.current
            dragRef.current = null
            canvasPannedRef.current = false
            setDragging(false)
            if (!wasPan) void activateBlankCanvasSession()
          }}
          onPointerCancel={() => {
            if (nodeDragRef.current) return
            dragRef.current = null
            canvasPannedRef.current = false
            setDragging(false)
          }}
        >
          {model.nodes.length === 0 ? (
            <p className={styles.empty}>{ts('chat.sessionGraph.empty')}</p>
          ) : layout ? (
            <div
              className={styles.world}
              style={{
                width: worldSize?.width ?? layout.width,
                height: worldSize?.height ?? layout.height,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              }}
            >
              <svg
                className={styles.edges}
                width={worldSize?.width ?? layout.width}
                height={worldSize?.height ?? layout.height}
                aria-hidden
              >
                {model.edges.map((edge) => {
                  const source = layout.positions[edge.source]
                  const target = layout.positions[edge.target]
                  if (!source || !target) return null
                  const sourceHeight =
                    liveNodeHeights[edge.source] ?? SESSION_NODE_HEIGHT
                  const targetHeight =
                    liveNodeHeights[edge.target] ?? SESSION_NODE_HEIGHT
                  const child = model.nodes.find((node) => node.id === edge.target)
                  const { path, labelX, labelY } = buildSessionForkEdgePath(
                    source,
                    target,
                    sourceHeight,
                    targetHeight,
                    child
                      ? {
                          forkLayout: child.forkLayout === 'aside' ? 'aside' : 'below',
                          ...(typeof child.forkAnchorOffsetY === 'number'
                            ? { forkAnchorOffsetY: child.forkAnchorOffsetY }
                            : {}),
                        }
                      : null,
                  )
                  return (
                    <g key={`${edge.source}-${edge.target}`}>
                      <path className={`${styles.edge} ${styles.edgeFork}`} d={path} />
                      <text
                        className={styles.edgeLabel}
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {ts('chat.sessionGraph.edgeFork')}
                        {child?.forkMessageId ? ' ·' : ''}
                      </text>
                    </g>
                  )
                })}
              </svg>
              {model.nodes.map((node) => {
                const position = layout.positions[node.id]
                if (!position) return null
                const head = heads.find((item) => item.id === node.id)
                const title = node.title || ts('chat.history.untitled')
                const lifted =
                  sessionDrag?.sessionId === node.id ||
                  (nodeCanvasDrag?.mode === 'semantic' &&
                    nodeCanvasDrag.sessionId === node.id)
                const draggingNode =
                  nodeCanvasDrag?.mode === 'position' &&
                  nodeCanvasDrag.sessionId === node.id
                const matches = sessionMatchesGraphQuery(filterQuery, {
                  title,
                  responsibility: node.responsibility,
                  previewStrip: node.previewStrip,
                })
                // Selection uses the focused border only — never dim other cards.
                // Dim remains for filter mismatch so search stays scannable.
                const dimmed = !matches && filterQuery.trim().length > 0
                const height =
                  liveNodeHeights[node.id] ??
                  layout.heights[node.id] ??
                  SESSION_NODE_HEIGHT
                return (
                  <SessionNode
                    key={node.id}
                    head={head}
                    sessionId={node.id}
                    title={title}
                    responsibility={node.responsibility}
                    status={node.status}
                    previewStrip={node.previewStrip}
                    messageCount={node.messageCount}
                    lastUpdatedAt={node.lastUpdatedAt}
                    forked={Boolean(node.parentId)}
                    parentTitle={
                      node.parentId
                        ? heads.find((item) => item.id === node.parentId)?.title ||
                          ts('chat.history.untitled')
                        : undefined
                    }
                    parentSessionId={node.parentId}
                    active={node.id === activeSessionId}
                    focused={focusedSessionId === node.id}
                    dimmed={dimmed}
                    lifted={lifted}
                    dragging={draggingNode}
                    x={position.x}
                    y={position.y}
                    height={height}
                    onOpen={(revealMessageId) => {
                      // Title / footer: select card and jump to latest (or resolved) turn.
                      setFocusedSessionId(node.id)
                      void openSessionAtMessage(node.id, revealMessageId)
                    }}
                    onStripItem={(_item, revealMessageId) => {
                      setFocusedSessionId(node.id)
                      // Keep Session Graph open; ChatPanel still reveals the turn behind it.
                      void openSessionAtMessage(node.id, revealMessageId)
                    }}
                    onOpenParent={(parentId) => {
                      setFocusedSessionId(parentId)
                      void openSessionAtMessage(parentId)
                    }}
                    onBranch={() =>
                      forkFromNode(node.id, undefined, { forkLayout: 'below' })
                    }
                    onBranchFromMessage={(messageId, placement) =>
                      forkFromNode(node.id, messageId, placement)
                    }
                    onMisc={() => void demoteToMisc(node.id)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setNodeContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        sessionId: node.id,
                        restoreFocusTo: event.currentTarget,
                      })
                    }}
                    shouldSuppressClick={() => suppressNodeClickRef.current}
                    onCardHeightChange={onNodeCardHeightChange}
                    onPointerDown={(event) =>
                      onNodeCanvasPointerDown(event, {
                        sessionId: node.id,
                        graphId: node.graphId,
                        title,
                        x: position.x,
                        y: position.y,
                      })
                    }
                  />
                )
              })}
            </div>
          ) : null}
        </div>
        <MiscTray
          items={model.misc}
          activeSessionId={activeSessionId}
          dropActive={activeDropTarget?.kind === 'misc'}
          dragActive={Boolean(sessionDrag) || nodeCanvasDrag?.mode === 'semantic'}
          dragFromMisc={sessionDrag?.source === 'misc'}
          onOpen={(sessionId) => {
            if (suppressMiscClickRef.current) {
              suppressMiscClickRef.current = false
              return
            }
            openPromptHistory(sessionId)
          }}
          onDelete={(sessionId) => {
            void deleteSession(sessionId)
          }}
          onPointerDown={(event, sessionId, title) => {
            suppressMiscClickRef.current = false
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
      {semanticGhost ? (
        <div
          className={styles.sessionDragGhost}
          style={{ left: semanticGhost.x + 10, top: semanticGhost.y + 10 }}
          data-task={ghostTask ?? undefined}
          aria-hidden
        >
          {GhostIcon ? <GhostIcon size={16} strokeWidth={2} /> : null}
          <span>{ghostTitle}</span>
        </div>
      ) : null}
      <SessionNodeContextMenu
        menu={nodeContextMenu}
        onClose={() => setNodeContextMenu(null)}
        onViewHistory={(sessionId) => openPromptHistory(sessionId)}
        onBranch={(sessionId) =>
          void forkFromNode(sessionId, undefined, { forkLayout: 'below' })
        }
        onOpen={(sessionId) => void openSessionAtMessage(sessionId)}
      />
      {centerSheet?.type === 'tidy' && pendingTidyPlan ? (
        <SessionTidyReviewSheet
          plan={pendingTidyPlan}
          onLocate={(sessionId) => {
            setFocusedSessionId(sessionId)
            setFilterQuery('')
          }}
        />
      ) : null}
      {centerSheet?.type === 'sweep' && pendingSweepPlan ? (
        <SessionSweepReviewSheet
          plan={pendingSweepPlan}
          onLocate={(sessionId) => {
            setFocusedSessionId(sessionId)
            setFilterQuery('')
          }}
        />
      ) : null}
      {centerSheet?.type === 'history' ? (
        <SessionPromptHistorySheet sessionId={centerSheet.sessionId} />
      ) : null}
    </SessionGraphFrame>
  )
}

type SessionNodePreviewTarget =
  | { kind: 'title' }
  | { kind: 'strip'; item: SessionGraphStripItem }

function sessionGraphStripsEqual(
  left: SessionGraphStripItem[] | null,
  right: SessionGraphStripItem[],
): boolean {
  if (!left || left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!
    const b = right[i]!
    if (
      a.id !== b.id ||
      a.kind !== b.kind ||
      a.title !== b.title ||
      a.ts !== b.ts ||
      a.messageId !== b.messageId ||
      a.chatMode !== b.chatMode
    ) {
      return false
    }
  }
  return true
}

function sessionGraphModeMapsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

function SessionNode({
  head,
  sessionId,
  title,
  responsibility,
  status,
  previewStrip,
  messageCount,
  lastUpdatedAt,
  forked,
  parentTitle,
  parentSessionId,
  active,
  focused,
  dimmed,
  lifted,
  dragging = false,
  x,
  y,
  height: _layoutHeight,
  onOpen,
  onStripItem,
  onOpenParent,
  onBranch,
  onBranchFromMessage,
  onMisc,
  onContextMenu,
  shouldSuppressClick,
  onCardHeightChange,
  onPointerDown,
}: {
  head: ChatSessionHead | undefined
  sessionId: string
  title: string
  responsibility?: string
  status: SessionGraphModel['nodes'][number]['status']
  previewStrip: SessionGraphStripItem[]
  messageCount: number
  lastUpdatedAt: string
  forked: boolean
  parentTitle?: string
  parentSessionId?: string | null
  active: boolean
  focused: boolean
  dimmed: boolean
  lifted: boolean
  dragging?: boolean
  x: number
  y: number
  height: number
  onOpen: (revealMessageId?: string | null) => void
  onStripItem: (
    item: SessionGraphStripItem,
    revealMessageId: string | null,
  ) => void
  onOpenParent: (parentSessionId: string) => void
  onBranch: () => void | Promise<unknown>
  onBranchFromMessage: (
    messageId: string,
    placement: SessionForkPlacement,
  ) => void | Promise<unknown>
  onMisc: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
  shouldSuppressClick: () => boolean
  onCardHeightChange: (sessionId: string, height: number) => void
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const liveMessages = useWorkbenchStore((s) => (active ? s.messages : null))
  const liveRefineLoading = useWorkbenchStore((s) =>
    active ? s.refineLoading : false,
  )
  const liveFlowStatus = useWorkbenchStore((s) =>
    active ? s.flowStatus : 'idle',
  )
  const task = classifySessionTask(title, responsibility)
  const TaskIcon = TASK_ICON[task]
  const taskLabel = ts(`chat.sessionGraph.task.${task}`)
  const description = responsibility?.trim() ?? ''
  const titlePreviewBody = description || ts('chat.sessionGraph.descriptionEmpty')
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const messagesCacheRef = useRef<ChatMessage[] | null>(null)
  const messagesRequestRef = useRef<Promise<ChatMessage[]> | null>(null)
  const previewRequestIdRef = useRef(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 })
  const [previewTarget, setPreviewTarget] = useState<SessionNodePreviewTarget | null>(
    null,
  )
  const [stripPromptBody, setStripPromptBody] = useState<string | null>(null)
  const [stripReplyBody, setStripReplyBody] = useState<string | null>(null)
  const [stripReplyExpanded, setStripReplyExpanded] = useState(false)
  const [stripForkMessageId, setStripForkMessageId] = useState<string | null>(null)
  const [stripPromptLoading, setStripPromptLoading] = useState(false)
  /** Resolved chatMode per strip row — matches Conversation Nav stack-bar colors. */
  const [stripModeById, setStripModeById] = useState<Record<string, string>>({})
  /**
   * Prefer live user turns (same ids/colors as Conversation Nav stack bars)
   * over curated digest rows that often share one throughMessageId.
   */
  const [turnStrip, setTurnStrip] = useState<SessionGraphStripItem[] | null>(null)
  const [branching, setBranching] = useState(false)
  // Oldest at top, newest at bottom (matches chat transcript order).
  // Forked cards lead with a parent-title citation instead of replaying parent chats.
  // Own turns prefer live turnStrip; fall back to head.previewStrip so a forked
  // child still shows new intents after persist even when it is not the active card.
  // Keep every turn in the list — card height caps at MAX and the strip scrolls.
  const displayStrip = useMemo(() => {
    const fromPreview = [...previewStrip]
      .filter((item) => !item.id.startsWith('note:parent-cite:'))
      .sort((a, b) => a.ts.localeCompare(b.ts))
    const ownTurns =
      turnStrip && turnStrip.length > 0 ? turnStrip : fromPreview
    if (!forked || !parentTitle?.trim()) return ownTurns
    const cite: SessionGraphStripItem = {
      id: `note:parent-cite:${sessionId}`,
      kind: 'note',
      title: parentTitle.trim(),
      ts: head?.createdAt ?? lastUpdatedAt,
    }
    return [cite, ...ownTurns]
  }, [
    forked,
    head?.createdAt,
    lastUpdatedAt,
    parentTitle,
    previewStrip,
    sessionId,
    turnStrip,
  ])
  const stripScrollable = displayStrip.length > SESSION_GRAPH_STRIP_MAX_ITEMS
  const cardHeight = estimateSessionNodeHeight(displayStrip.length)

  useEffect(() => {
    onCardHeightChange(sessionId, cardHeight)
  }, [cardHeight, onCardHeightChange, sessionId])

  const agentWorking =
    status === 'running' ||
    (active && (liveRefineLoading || liveFlowStatus === 'running'))
  const quiet = isSessionGraphQuiet(lastUpdatedAt, status)
  const relative = formatSessionGraphRelativeTime(lastUpdatedAt)
  const liveLabel =
    agentWorking
      ? ts('chat.sessionGraph.liveWorking')
      : status === 'awaiting_review'
        ? ts('chat.sessionGraph.liveNeedsYou')
        : null

  const previewStripRef = useRef(previewStrip)
  previewStripRef.current = previewStrip

  const applyTurnsToStrip = useCallback(
    (messages: ChatMessage[], options?: { allowEmpty?: boolean }) => {
      const turns = collectUserTurns(messages)
      if (turns.length === 0) {
        // Keep the last stable strip during selection switches / mid-load empties.
        if (options?.allowEmpty) {
          setTurnStrip(null)
        }
        return
      }
      // Keep the full turn list; the card viewport scrolls past MAX visible rows.
      const nextStrip: SessionGraphStripItem[] = turns.map((turn) => ({
        id: `intent:${turn.id}`,
        kind: 'intent' as const,
        title: turn.preview || turn.id,
        ts: turn.timestamp,
        messageId: turn.id,
        ...(turn.chatMode ? { chatMode: turn.chatMode as ChatSessionMode } : {}),
      }))
      const modes: Record<string, string> = {}
      for (const item of nextStrip) {
        if (item.chatMode) modes[item.id] = item.chatMode
      }
      setTurnStrip((prev) => (sessionGraphStripsEqual(prev, nextStrip) ? prev : nextStrip))
      setStripModeById((prev) => (sessionGraphModeMapsEqual(prev, modes) ? prev : modes))
    },
    [],
  )

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const placePreview = useCallback((anchor?: DOMRectReadOnly | HTMLElement | null) => {
    const fallback = nodeRef.current
    const rect =
      anchor && 'getBoundingClientRect' in anchor
        ? anchor.getBoundingClientRect()
        : (anchor ?? fallback?.getBoundingClientRect())
    if (!rect) return
    setPreviewPos(
      resolveSessionNodePreviewPosition(
        rect,
        SESSION_NODE_PREVIEW_WIDTH,
        SESSION_NODE_PREVIEW_MAX_HEIGHT,
      ),
    )
  }, [])

  const closePreview = useCallback(() => {
    clearOpenTimer()
    clearHideTimer()
    previewRequestIdRef.current += 1
    setPreviewOpen(false)
    setPreviewTarget(null)
    setStripPromptBody(null)
    setStripReplyBody(null)
    setStripReplyExpanded(false)
    setStripForkMessageId(null)
    setStripPromptLoading(false)
    // Leave `branching` alone; the in-flight fork clears it when finished.
  }, [clearHideTimer, clearOpenTimer])

  const loadSessionMessages = useCallback(async (): Promise<ChatMessage[]> => {
    if (messagesCacheRef.current) return messagesCacheRef.current
    if (messagesRequestRef.current) return messagesRequestRef.current
    if (!client || !projectId) return []
    const request = client
      .getChatSession(projectId, sessionId)
      .then((record) => {
        const messages = record?.messages ?? []
        messagesCacheRef.current = messages
        return messages
      })
      .catch(() => [] as ChatMessage[])
      .finally(() => {
        messagesRequestRef.current = null
      })
    messagesRequestRef.current = request
    return request
  }, [client, projectId, sessionId])

  // Invalidate before hydrate/sync so revision bumps actually refetch.
  useEffect(() => {
    messagesCacheRef.current = null
    messagesRequestRef.current = null
  }, [sessionId, lastUpdatedAt, messageCount])

  // Active session: mirror live workbench turns immediately on send.
  useEffect(() => {
    if (!active || !liveMessages) return
    messagesCacheRef.current = liveMessages
    // Empty live transcript on a non-empty head is usually a mid-switch race
    // between activeSessionId and applySessionToWorkbench — keep the strip.
    applyTurnsToStrip(liveMessages, { allowEmpty: messageCount === 0 })
  }, [active, applyTurnsToStrip, liveMessages, messageCount])

  // Inactive / background hydrate: refresh quietly without wiping the strip.
  // Do not depend on previewStrip identity — heads rebuilds would flash every card.
  useEffect(() => {
    if (active) return
    let cancelled = false
    void (async () => {
      const messages = await loadSessionMessages()
      if (cancelled) return
      const turns = collectUserTurns(messages)
      if (turns.length > 0) {
        applyTurnsToStrip(messages)
        return
      }
      if (messages.length === 0) {
        applyTurnsToStrip(messages, { allowEmpty: true })
        return
      }
      const strip = previewStripRef.current
      const next: Record<string, string> = {}
      for (const item of strip) {
        if (item.chatMode) next[item.id] = item.chatMode
        const mode = resolveStripChatMode(item, messages)
        if (mode) next[item.id] = mode
      }
      if (!cancelled) {
        setStripModeById((prev) => (sessionGraphModeMapsEqual(prev, next) ? prev : next))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    active,
    applyTurnsToStrip,
    lastUpdatedAt,
    loadSessionMessages,
    messageCount,
    sessionId,
  ])

  const hydrateStripPreview = useCallback(
    async (item: SessionGraphStripItem, requestId: number) => {
      setStripPromptLoading(true)
      setStripPromptBody(item.title)
      setStripReplyBody(null)
      setStripReplyExpanded(false)
      setStripForkMessageId(item.messageId ?? null)
      const messages = await loadSessionMessages()
      if (previewRequestIdRef.current !== requestId) return
      const resolved = resolveSessionNodeStripPromptPreview(item, messages)
      setStripPromptBody(resolved.body)
      setStripReplyBody(resolved.reply)
      setStripForkMessageId(resolved.forkMessageId)
      setStripPromptLoading(false)
    },
    [loadSessionMessages],
  )

  const revealPreview = useCallback(
    (
      target: SessionNodePreviewTarget,
      anchor?: DOMRectReadOnly | HTMLElement | null,
    ) => {
      if (lifted) return
      const requestId = previewRequestIdRef.current + 1
      previewRequestIdRef.current = requestId
      setPreviewTarget(target)
      placePreview(anchor)
      setPreviewOpen(true)
      if (target.kind === 'title') {
        setStripPromptBody(null)
        setStripReplyBody(null)
        setStripReplyExpanded(false)
        setStripForkMessageId(null)
        setStripPromptLoading(false)
        return
      }
      void hydrateStripPreview(target.item, requestId)
    },
    [hydrateStripPreview, lifted, placePreview],
  )

  const schedulePreviewOpen = useCallback(
    (
      target: SessionNodePreviewTarget,
      anchor?: DOMRectReadOnly | HTMLElement | null,
    ) => {
      if (lifted) return
      clearHideTimer()
      clearOpenTimer()
      // Switching targets while open should update immediately.
      if (previewOpen) {
        revealPreview(target, anchor)
        return
      }
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null
        revealPreview(target, anchor)
      }, SESSION_NODE_PREVIEW_DELAY_MS)
    },
    [clearHideTimer, clearOpenTimer, lifted, previewOpen, revealPreview],
  )

  const schedulePreviewClose = useCallback(() => {
    clearOpenTimer()
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      closePreview()
    }, SESSION_NODE_PREVIEW_HIDE_MS)
  }, [clearHideTimer, clearOpenTimer, closePreview])

  useEffect(() => () => closePreview(), [closePreview])

  useEffect(() => {
    if (lifted || dragging) closePreview()
  }, [closePreview, dragging, lifted])

  const stripPreviewItem =
    previewTarget?.kind === 'strip' ? previewTarget.item : null
  const stripPromptTitle = stripPreviewItem
    ? stripPromptBody ?? stripPreviewItem.title
    : null
  const previewLabel = ts('chat.sessionGraph.description')
  const previewAria = stripPreviewItem
    ? stripPromptTitle ?? stripPreviewItem.title
    : `${previewLabel}: ${title}`
  const canBranchFromPreview =
    Boolean(stripPreviewItem) && Boolean(stripForkMessageId) && !stripPromptLoading
  const canExpandReply =
    Boolean(stripPreviewItem) &&
    !stripPromptLoading &&
    Boolean(stripReplyBody?.trim())

  const chromePressRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  )
  const openLatestInFlightRef = useRef(false)

  const openAtLatest = useCallback(() => {
    if (openLatestInFlightRef.current) return
    openLatestInFlightRef.current = true
    window.setTimeout(() => {
      openLatestInFlightRef.current = false
    }, 400)
    void (async () => {
      const sessionMessages = await loadSessionMessages()
      onOpen(resolveLatestRevealMessageId(sessionMessages))
    })()
  }, [loadSessionMessages, onOpen])

  const onChromePointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return
    chromePressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }, [])

  const onChromePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const press = chromePressRef.current
      chromePressRef.current = null
      if (!press || press.pointerId !== event.pointerId) return
      // Parent may have started a real drag — don't open after a move.
      if (shouldSuppressClick()) return
      const dx = event.clientX - press.x
      const dy = event.clientY - press.y
      if (dx * dx + dy * dy >= SESSION_NODE_DRAG_MOVE_PX * SESSION_NODE_DRAG_MOVE_PX) {
        return
      }
      openAtLatest()
    },
    [openAtLatest, shouldSuppressClick],
  )

  return (
    <>
      <div
        ref={nodeRef}
        className={`${styles.node} ${active ? styles.nodeActive : ''} ${
          focused ? styles.nodeFocused : ''
        } ${dimmed ? styles.nodeDim : ''} ${lifted ? styles.nodeLifted : ''} ${
          dragging ? styles.nodeDragging : ''
        }`}
        style={{
          left: x,
          top: y,
          width: SESSION_NODE_WIDTH,
          // Live strip length drives height (grows/shrinks with rows, capped at MAX).
          height: cardHeight,
        }}
        data-session-node={head?.id}
        data-task={task}
        data-strip-scrollable={stripScrollable ? 'true' : undefined}
        onPointerDown={(event) => {
          closePreview()
          onPointerDown(event)
        }}
        onContextMenu={onContextMenu}
        onMouseLeave={schedulePreviewClose}
      >
        <div className={styles.nodeTop}>
          <span className={styles.taskMark} title={taskLabel}>
            <TaskIcon size={14} strokeWidth={1.75} aria-hidden />
            <span className={styles.taskName}>{taskLabel}</span>
          </span>
          <button
            type="button"
            className={styles.nodeTitle}
            onMouseEnter={(event) =>
              schedulePreviewOpen({ kind: 'title' }, event.currentTarget)
            }
            onPointerDown={onChromePointerDown}
            onPointerUp={onChromePointerUp}
            onPointerCancel={() => {
              chromePressRef.current = null
            }}
            // pointerup is the primary open path (drag capture used to steal click).
            onClick={(event) => {
              event.preventDefault()
            }}
            aria-current={active ? 'true' : undefined}
          >
            {title}
          </button>
          {liveLabel ? (
            <span
              className={`${styles.liveChip} ${
                agentWorking ? styles.liveChipWorking : styles.liveChipNeedsYou
              }`}
            >
              {liveLabel}
            </span>
          ) : (
            <span className={styles.status} title={ts(`chat.sessionGraph.status.${status}`)}>
              <span className={`${styles.statusDot} ${STATUS_CLASS[status]}`} aria-hidden />
            </span>
          )}
          <span className={styles.nodeActions}>
            <button
              type="button"
              className={styles.iconButton}
              data-session-drag-ignore=""
              aria-label={ts('chat.sessionGraph.branch')}
              title={ts('chat.sessionGraph.branch')}
              onClick={() => {
                void onBranch()
              }}
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
        <ol
          className={`${styles.strip} ${stripScrollable ? styles.stripScrollable : ''}`}
          data-session-drag-ignore=""
          onWheel={(event) => {
            // Keep wheel on a scrollable strip from zooming the graph canvas.
            if (stripScrollable) event.stopPropagation()
          }}
        >
          {displayStrip.length === 0 ? (
            <li className={styles.stripEmpty}>{ts('chat.sessionGraph.stripEmpty')}</li>
          ) : (
            displayStrip.map((item, index) => {
              const mode = stripModeById[item.id] ?? item.chatMode
              const tone = toneClassForChatMode(mode)
              const toneClass = tone ? styles[tone] : ''
              const isParentCite = item.id.startsWith('note:parent-cite:')
              const isLatestOwnTurn =
                !isParentCite &&
                item.kind === 'intent' &&
                index === displayStrip.length - 1
              const showWorking = agentWorking && isLatestOwnTurn
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.stripItem} ${toneClass}`}
                    data-kind={item.kind}
                    data-parent-cite={isParentCite ? 'true' : undefined}
                    data-working={showWorking ? 'true' : undefined}
                    data-chat-mode={mode ?? undefined}
                    data-session-drag-ignore=""
                    title={
                      isParentCite
                        ? ts('chat.sessionGraph.openParent')
                        : showWorking
                          ? ts('chat.sessionGraph.liveWorking')
                          : ts(`chat.sessionGraph.stripKind.${item.kind}`)
                    }
                    onMouseEnter={(event) => {
                      if (isParentCite) return
                      schedulePreviewOpen(
                        { kind: 'strip', item },
                        event.currentTarget,
                      )
                    }}
                    onClick={() => {
                      if (shouldSuppressClick()) return
                      if (isParentCite && parentSessionId) {
                        onOpenParent(parentSessionId)
                        return
                      }
                      void (async () => {
                        const sessionMessages = await loadSessionMessages()
                        const revealMessageId = resolveStripRevealMessageId(
                          item,
                          sessionMessages,
                        )
                        onStripItem(item, revealMessageId)
                      })()
                    }}
                  >
                    <span className={styles.stripGlyph} aria-hidden />
                    <span className={styles.stripTitle}>
                      {showWorking ? (
                        <SessionStripWorkingTitle title={item.title} />
                      ) : (
                        item.title
                      )}
                    </span>
                    <time className={styles.stripTime} dateTime={item.ts}>
                      {formatSessionGraphRelativeTime(item.ts)}
                    </time>
                  </button>
                </li>
              )
            })
          )}
        </ol>
        <div
          className={styles.nodeFoot}
          data-session-drag-handle=""
          role="button"
          tabIndex={0}
          onPointerDown={onChromePointerDown}
          onPointerUp={onChromePointerUp}
          onPointerCancel={() => {
            chromePressRef.current = null
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            openAtLatest()
          }}
        >
          <span className={styles.nodeFootMeta}>
            <span>
              {ts('chat.sessionGraph.messagesCount', { count: messageCount })}
            </span>
            {forked ? <span>{ts('chat.sessionGraph.forked')}</span> : null}
            {quiet ? (
              <span className={styles.quietMark} title={ts('chat.sessionGraph.quietTitle')}>
                {ts('chat.sessionGraph.quiet')}
              </span>
            ) : null}
          </span>
          <span>
            {relative
              ? ts('chat.sessionGraph.updated', { time: relative })
              : null}
          </span>
        </div>
      </div>
      {previewOpen && previewTarget
        ? createPortal(
            <aside
              className={styles.nodePreview}
              style={{
                left: previewPos.x,
                top: previewPos.y,
                width: SESSION_NODE_PREVIEW_WIDTH,
                maxHeight: SESSION_NODE_PREVIEW_MAX_HEIGHT,
              }}
              aria-label={previewAria}
              aria-live="polite"
              data-session-drag-ignore=""
              onMouseEnter={clearHideTimer}
              onMouseLeave={schedulePreviewClose}
              onPointerDown={(event) => {
                // Keep card drag / node pointerdown from stealing preview clicks.
                event.stopPropagation()
              }}
              onWheel={(event) => event.stopPropagation()}
            >
              {stripPreviewItem ? (
                <>
                  <div className={styles.nodePreviewHeader}>
                    <div
                      className={`${styles.nodePreviewTitle} ${styles.nodePreviewTitlePrompt} ${
                        stripPromptLoading ? styles.nodePreviewBodyLoading : ''
                      }`}
                    >
                      {stripPromptTitle}
                    </div>
                    {canExpandReply || stripPromptLoading ? (
                      <button
                        type="button"
                        className={`${styles.nodePreviewExpand} ${
                          stripReplyExpanded ? styles.nodePreviewExpandOpen : ''
                        }`}
                        aria-expanded={stripReplyExpanded}
                        aria-label={
                          stripReplyExpanded
                            ? ts('chat.sessionGraph.collapseReply')
                            : ts('chat.sessionGraph.expandReply')
                        }
                        disabled={stripPromptLoading || !canExpandReply}
                        onClick={() => setStripReplyExpanded((open) => !open)}
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  {stripReplyExpanded && stripReplyBody ? (
                    <div className={styles.nodePreviewBody}>{stripReplyBody}</div>
                  ) : null}
                  {stripForkMessageId || stripPromptLoading ? (
                    <div className={styles.nodePreviewActions}>
                      <button
                        type="button"
                        className={styles.nodePreviewBranch}
                        data-session-drag-ignore=""
                        disabled={!canBranchFromPreview || branching}
                        onPointerDown={(event) => {
                          // Prefer pointerdown over click: preview remounts / mid-press
                          // disable can drop the click before fork starts.
                          if (event.button !== 0) return
                          if (!stripForkMessageId || !canBranchFromPreview || branching) return
                          event.preventDefault()
                          event.stopPropagation()
                          const forkMessageId = stripForkMessageId
                          const stripItemId = stripPreviewItem?.id ?? null
                          clearHideTimer()
                          setBranching(true)
                          void (async () => {
                            try {
                              const messages = await loadSessionMessages()
                              const placement = resolveSessionForkPlacementForPreview(
                                displayStrip,
                                messages,
                                forkMessageId,
                                stripItemId,
                              )
                              await onBranchFromMessage(forkMessageId, placement)
                            } finally {
                              closePreview()
                              setBranching(false)
                            }
                          })()
                        }}
                      >
                        <GitBranch size={12} aria-hidden />
                        {ts('chat.sessionGraph.branchFromHere')}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className={styles.nodePreviewTitle}>{title}</div>
                  <div className={styles.nodePreviewLabel}>{previewLabel}</div>
                  <div className={styles.nodePreviewBody}>{titlePreviewBody}</div>
                </>
              )}
            </aside>,
            document.body,
          )
        : null}
    </>
  )
}

/** Match WorkingSessionRail Stage Manager hover cadence. */
const MISC_EXPAND_DELAY_MS = 350
const MISC_COLLAPSE_DELAY_MS = 180
const MISC_COLLAPSED_HEIGHT_PX = 44
const MISC_CHIP_ROW_PX = 32
const MISC_ROW_GAP_PX = 6
const MISC_PANEL_PAD_Y_PX = 8
const MISC_LIST_MAX_HEIGHT_PX = 5 * MISC_CHIP_ROW_PX + 4 * MISC_ROW_GAP_PX

function MiscTray({
  items,
  activeSessionId,
  dropActive,
  dragActive,
  dragFromMisc,
  onOpen,
  onDelete,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  items: ChatSessionHead[]
  activeSessionId: string | null
  dropActive: boolean
  dragActive: boolean
  dragFromMisc: boolean
  onOpen: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onPointerDown: (
    event: ReactPointerEvent,
    sessionId: string,
    title: string,
  ) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  const { ts } = useI18n()
  const canExpand = items.length > 0
  const [expanded, setExpanded] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const [fitCount, setFitCount] = useState(items.length)
  /** Clip overflow chips only after collapse height finishes — keeps exit as smooth as the rail. */
  const [clipOverflow, setClipOverflow] = useState(true)
  const [panelHeight, setPanelHeight] = useState(MISC_COLLAPSED_HEIGHT_PX)
  const expandTimerRef = useRef<number | null>(null)
  const collapseTimerRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const showFlyout = expanded && canExpand

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current != null) {
      window.clearTimeout(expandTimerRef.current)
      expandTimerRef.current = null
    }
  }, [])

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  const requestExpand = useCallback(() => {
    if (!canExpand) return
    clearCollapseTimer()
    if (expanded) return
    clearExpandTimer()
    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null
      setClipOverflow(false)
      setExpanded(true)
    }, MISC_EXPAND_DELAY_MS)
  }, [canExpand, clearCollapseTimer, clearExpandTimer, expanded])

  const requestCollapse = useCallback(() => {
    if (dragActive) return
    clearExpandTimer()
    clearCollapseTimer()
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null
      setExpanded(false)
    }, MISC_COLLAPSE_DELAY_MS)
  }, [clearCollapseTimer, clearExpandTimer, dragActive])

  useEffect(() => {
    if (!canExpand) {
      clearExpandTimer()
      clearCollapseTimer()
      setExpanded(false)
      setClipOverflow(true)
      setPanelHeight(MISC_COLLAPSED_HEIGHT_PX)
      return
    }
    if (dragActive && (dragFromMisc || dropActive || expanded)) {
      clearExpandTimer()
      clearCollapseTimer()
      setClipOverflow(false)
      setExpanded(true)
      return
    }
    if (!dragActive && !pointerInside && expanded) {
      requestCollapse()
    }
  }, [
    canExpand,
    clearCollapseTimer,
    clearExpandTimer,
    dragActive,
    dragFromMisc,
    dropActive,
    expanded,
    pointerInside,
    requestCollapse,
  ])

  useEffect(() => {
    return () => {
      clearExpandTimer()
      clearCollapseTimer()
    }
  }, [clearCollapseTimer, clearExpandTimer])

  useLayoutEffect(() => {
    if (showFlyout) {
      const list = listRef.current
      if (!list) return
      const listHeight = Math.min(list.scrollHeight, MISC_LIST_MAX_HEIGHT_PX)
      const next = Math.max(
        MISC_COLLAPSED_HEIGHT_PX,
        MISC_PANEL_PAD_Y_PX * 2 + listHeight,
      )
      setPanelHeight(next)
      return
    }
    setPanelHeight(MISC_COLLAPSED_HEIGHT_PX)
  }, [showFlyout, items])

  // If height transition is skipped (reduced motion) or transitionend is missed, still clip.
  useEffect(() => {
    if (showFlyout || clipOverflow) return undefined
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setClipOverflow(true)
      return undefined
    }
    const timer = window.setTimeout(() => setClipOverflow(true), 220)
    return () => window.clearTimeout(timer)
  }, [showFlyout, clipOverflow])

  useLayoutEffect(() => {
    if (showFlyout || items.length === 0) {
      setFitCount(items.length)
      return
    }
    const list = listRef.current
    const measure = measureRef.current
    if (!list || !measure) return

    const update = () => {
      const available = list.clientWidth
      const chipEls = measure.querySelectorAll<HTMLElement>('[data-misc-measure-chip]')
      const moreEl = measure.querySelector<HTMLElement>('[data-misc-measure-more]')
      const chipWidths = Array.from(chipEls).map((el) => el.getBoundingClientRect().width)
      const moreWidth = moreEl?.getBoundingClientRect().width ?? 36
      setFitCount(computeMiscFitCount(chipWidths, moreWidth, available))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(list)
    return () => observer.disconnect()
  }, [showFlyout, items, clipOverflow])

  const hiddenCount = clipOverflow ? Math.max(0, items.length - fitCount) : 0

  return (
    <div
      className={styles.miscRoot}
      onPointerEnter={() => {
        setPointerInside(true)
        requestExpand()
      }}
      onPointerLeave={() => {
        setPointerInside(false)
        requestCollapse()
      }}
      onFocusCapture={() => {
        if (canExpand) requestExpand()
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null
        if (next && event.currentTarget.contains(next)) return
        setPointerInside(false)
        requestCollapse()
      }}
    >
      <div className={styles.miscSpacer} aria-hidden />

      <div
        ref={panelRef}
        className={`${styles.miscPanel} ${showFlyout ? styles.miscPanelExpanded : ''} ${
          dropActive ? styles.miscDropTarget : ''
        }`}
        style={{ height: panelHeight }}
        data-session-graph-drop="misc"
        aria-expanded={showFlyout}
        role="region"
        aria-label={ts('chat.sessionGraph.misc')}
        onTransitionEnd={(event) => {
          if (event.propertyName !== 'height') return
          if (event.target !== panelRef.current) return
          if (!showFlyout) setClipOverflow(true)
        }}
      >
        <span className={styles.miscLabel}>{ts('chat.sessionGraph.misc')}</span>
        <div className={styles.miscList} ref={listRef}>
          {items.length === 0 ? (
            <span className={styles.miscHint}>{ts('chat.sessionGraph.miscDropHint')}</span>
          ) : (
            <>
              {items.map((item, index) => {
                const title = item.title.trim() || ts('chat.history.untitled')
                const subtitle = item.previewStrip?.[0]?.title?.trim() ?? ''
                const overflow = clipOverflow && index >= fitCount
                return (
                  <div
                    key={item.id}
                    className={`${styles.miscChip} ${
                      item.id === activeSessionId ? styles.miscChipActive : ''
                    } ${overflow ? styles.miscChipOverflow : ''}`}
                    role="button"
                    tabIndex={overflow ? -1 : 0}
                    aria-label={ts('chat.sessionGraph.contextMenu.viewHistory')}
                    onPointerDown={(event) => onPointerDown(event, item.id, title)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('[data-session-drag-ignore]')) {
                        return
                      }
                      onOpen(item.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onOpen(item.id)
                    }}
                  >
                    <div className={styles.miscChipBody}>
                      <span className={styles.miscTitle}>{title}</span>
                      {subtitle ? (
                        <span className={styles.miscSubtitle} title={subtitle}>
                          {subtitle}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={styles.miscButton}
                      data-session-drag-ignore=""
                      aria-label={ts('chat.sessionGraph.miscDelete')}
                      title={ts('chat.sessionGraph.miscDelete')}
                      tabIndex={overflow ? -1 : undefined}
                      onClick={() => onDelete(item.id)}
                    >
                      <X size={12} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                )
              })}
              <span
                className={`${styles.miscMore} ${hiddenCount > 0 ? '' : styles.miscMoreHidden}`}
                aria-hidden
              >
                {ts('chat.sessionGraph.miscMore', {
                  count: hiddenCount > 0 ? hiddenCount : 0,
                })}
              </span>
            </>
          )}
        </div>

        {items.length > 0 && clipOverflow ? (
          <div className={styles.miscMeasure} ref={measureRef} aria-hidden>
            {items.map((item) => {
              const title = item.title.trim() || ts('chat.history.untitled')
              return (
                <div key={item.id} className={styles.miscChip} data-misc-measure-chip="">
                  <span className={styles.miscTitle}>{title}</span>
                  <span className={styles.miscButton}>
                    <X size={12} strokeWidth={2} aria-hidden />
                  </span>
                </div>
              )
            })}
            <span className={styles.miscMore} data-misc-measure-more="">
              {ts('chat.sessionGraph.miscMore', { count: 99 })}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
