import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  computeLoopWorkGroupFrameBounds,
  defaultEmptyLoopWorkGroupFrame,
  isConfigNode,
  isIntentGraphReadyForCompile,
  isWorkGroupEndpoint,
  isNestedWorkGroupInteriorNode,
  isWorkGroupSurfaceAgent,
  listWorkGroupSurfaceAgentIds,
  sessionGraphShieldCssInsets,
  type AgentDefinition,
  type IntentEdgePort,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
  type LoopAgentConfigPort,
  type LoopSatelliteKind,
  type LoopWorkGroup,
  type LoopWorkGroupCollaborationMode,
  type LoopWorkGroupFrameBounds,
  type LoopWorkGroupPort,
} from '@contracts/index'
import {
  ArrowLeft,
  Crown,
  LayoutTemplate,
  Link2,
  Plus,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import {
  useLoopGraphStore,
  type LoopPhase,
  type LoopWiringViewMode,
} from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import AgentPicker from '../AgentWorkforce/AgentPicker'
import { openMarketplaceTalentLibrary } from '../Marketplace/openMarketplaceTalentLibrary'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import LoopGoalComposer from './LoopGoalComposer'
import LoopReviewPanel, { reviewApproveEnabled } from './LoopReviewPanel'
import LoopGraphContextMenu, {
  type LoopGraphContextMenuState,
} from './LoopGraphContextMenu'
import LoopConfigAssetPicker, {
  type ConfigAssetPick,
} from './LoopConfigAssetPicker'
import LoopGraphPalette from './LoopGraphPalette'
import LoopNodeDutyCard from './LoopNodeDutyCard'
import LoopWorkGroupFrame from './LoopWorkGroupFrame'
import LoopGraphRail from './LoopGraphRail'
import LoopRunSidePanel from './LoopRunSidePanel'
import LoopRunMaterialsPanel from './LoopRunMaterialsPanel'
import { LoopSaaSNodeCard } from './integrations/LoopSaaSNodeCard'
import type { LoopSaaSNodeCardState } from './integrations/LoopSaaSNodeCard'
import { runtimeStatusBlocksExecution } from './integrations/loopIntegrationRegistry'
import LoopDiamondAutosize from './LoopDiamondAutosize'
import {
  pointInFlatDiamond,
  type DiamondBox,
} from './loopDiamondGeometry'
import {
  decodePaletteDragPayload,
  isDiamondLoopNode,
  LOOP_PALETTE_MIME,
  visualForIntentNode,
} from './loopNodeVisuals'
import { toneFromNodeRecordStatus } from './loopRunVisuals'
import {
  AGENT_WIRING_PORTS,
  agentNodeWidth,
  agentWiringPortPoint,
  buildAgentWiringLayout,
  clampSatelliteToAgent,
  clearAgentSouthCorridorPatches,
  expectedConfigPort,
  findProvidesAgentForSatellite,
  isWorkGroupMemberAgent,
  LOOP_CONFIG_NODE_H,
  LOOP_CONFIG_NODE_W,
  LOOP_SATELLITE_BELOW_GAP,
  nodeBoxSize,
  parkSatelliteLocalX,
  resolveProvidesPort,
  satelliteIcon,
  slotLocalPoint,
  workflowPortBoxSize,
  workflowPortsForNode,
} from './loopWiringVisuals'
import {
  createLoopRailFolder,
  emptyLoopGraphRailLayout,
  findLoopFolderEntry,
  insertLoopFolderOnRail,
  insertLoopOnRail,
  loadLoopGraphRailLayout,
  moveLoopFolderIntoFolder,
  moveLoopIntoFolder,
  removeLoopFolderFromLayout,
  removeLoopFromLayout,
  renameLoopRailFolder,
  saveLoopGraphRailLayout,
  syncRailLayoutWithLoops,
  type LoopGraphRailLayout,
} from './loopGraphRailLayout'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
  nearestPort,
  portPoint,
  formatEdgeLabel,
  routeLoopEdge,
  routeProvidesCurve,
  snapGraphNodePosition,
} from './loopEdgeRouting'
import { loopNodePortSlots } from './loopPortAssignment'
import { routeAllLoopWorkflowEdges } from './loopEdgeBatchRouting'
import styles from './LoopGraphOverlay.module.css'

const NODE_W = LOOP_NODE_W
const NODE_H = LOOP_NODE_H

export default function LoopGraphOverlay() {
  const open = useChatSessionStore((s) => s.loopGraphOpen)
  const setLoopGraphOpen = useChatSessionStore((s) => s.setLoopGraphOpen)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const project = useWorkbenchStore((s) => s.project)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const heads = useLoopGraphStore((s) => s.heads)
  const document = useLoopGraphStore((s) => s.document)
  const phase = useLoopGraphStore((s) => s.phase)
  const wiringViewMode = useLoopGraphStore((s) => s.wiringViewMode)
  const setWiringViewMode = useLoopGraphStore((s) => s.setWiringViewMode)
  const compileResult = useLoopGraphStore((s) => s.compileResult)
  const error = useLoopGraphStore((s) => s.error)
  const connectingFromId = useLoopGraphStore((s) => s.connectingFromId)
  const pendingDelete = useLoopGraphStore((s) => s.pendingDelete)
  const loadForWorkspace = useLoopGraphStore((s) => s.loadForWorkspace)
  const clear = useLoopGraphStore((s) => s.clear)
  const setPhase = useLoopGraphStore((s) => s.setPhase)
  const openSavedFlowForRun = useLoopGraphStore((s) => s.openSavedFlowForRun)
  const selectLoop = useLoopGraphStore((s) => s.selectLoop)
  const createLoop = useLoopGraphStore((s) => s.createLoop)
  const deleteLoop = useLoopGraphStore((s) => s.deleteLoop)
  const updateDraft = useLoopGraphStore((s) => s.updateDraft)
  const setConnectingFrom = useLoopGraphStore((s) => s.setConnectingFrom)
  const setPendingDelete = useLoopGraphStore((s) => s.setPendingDelete)
  const beginAuthorNode = useLoopGraphStore((s) => s.beginAuthorNode)
  const beginAuthorNodeFromPalette = useLoopGraphStore((s) => s.beginAuthorNodeFromPalette)
  const setNodeAgentDefinition = useLoopGraphStore((s) => s.setNodeAgentDefinition)
  const beginAuthorConfigSatellite = useLoopGraphStore((s) => s.beginAuthorConfigSatellite)
  const updateConfigSatellite = useLoopGraphStore((s) => s.updateConfigSatellite)
  const applyWiringToAgentDefinition = useLoopGraphStore((s) => s.applyWiringToAgentDefinition)
  const saveWiringAsNewAgent = useLoopGraphStore((s) => s.saveWiringAsNewAgent)
  const settings = useWorkbenchStore((s) => s.settings)
  const setComposerMode = useLoopGraphStore((s) => s.setComposerMode)
  const beginAuthorEdge = useLoopGraphStore((s) => s.beginAuthorEdge)
  const client = useWorkbenchStore((s) => s.client)
  const beginCreateAgentComposer = useWorkbenchStore((s) => s.beginCreateAgentComposer)
  const exportCapabilityPack = useWorkbenchStore((s) => s.exportCapabilityPack)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const refineAuthoringTarget = useLoopGraphStore((s) => s.refineAuthoringTarget)
  const removeAuthoringTarget = useLoopGraphStore((s) => s.removeAuthoringTarget)
  const compile = useLoopGraphStore((s) => s.compile)
  const approve = useLoopGraphStore((s) => s.approve)
  const pauseRun = useLoopGraphStore((s) => s.pauseRun)
  const resumeRun = useLoopGraphStore((s) => s.resumeRun)
  const advanceRun = useLoopGraphStore((s) => s.advanceRun)
  const resolveHitl = useLoopGraphStore((s) => s.resolveHitl)
  const runHistory = useLoopGraphStore((s) => s.runHistory)
  const refreshRunHistory = useLoopGraphStore((s) => s.refreshRunHistory)
  const linkActiveSession = useLoopGraphStore((s) => s.linkActiveSession)
  const setCanvasSelectedNodeId = useLoopGraphStore((s) => s.setCanvasSelectedNodeId)
  const selectedWorkGroupId = useLoopGraphStore((s) => s.selectedWorkGroupId)
  const setSelectedWorkGroupId = useLoopGraphStore((s) => s.setSelectedWorkGroupId)
  const renameWorkGroup = useLoopGraphStore((s) => s.renameWorkGroup)
  const updateWorkGroup = useLoopGraphStore((s) => s.updateWorkGroup)
  const addNodeToWorkGroup = useLoopGraphStore((s) => s.addNodeToWorkGroup)
  const focusedWorkGroupId = useLoopGraphStore((s) => s.focusedWorkGroupId)
  const enterWorkGroupGraph = useLoopGraphStore((s) => s.enterWorkGroupGraph)
  const exitWorkGroupGraph = useLoopGraphStore((s) => s.exitWorkGroupGraph)
  const removeNodeFromWorkGroup = useLoopGraphStore((s) => s.removeNodeFromWorkGroup)
  const reflowWorkGroupSurfaceLayout = useLoopGraphStore(
    (s) => s.reflowWorkGroupSurfaceLayout,
  )
  const layoutDraftSemantically = useLoopGraphStore(
    (s) => s.layoutDraftSemantically,
  )
  const dissolveWorkGroup = useLoopGraphStore((s) => s.dissolveWorkGroup)
  const moveWorkGroup = useLoopGraphStore((s) => s.moveWorkGroup)
  const beginFocusedEdit = useLoopGraphStore((s) => s.beginFocusedEdit)
  const clearAuthoringFocus = useLoopGraphStore((s) => s.clearAuthoringFocus)
  const canvasSelectedEdgeId = useLoopGraphStore((s) => s.canvasSelectedEdgeId)

  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [diamondBoxes, setDiamondBoxes] = useState<Record<string, DiamondBox>>(
    {},
  )
  // L2 interior uses full Loops Graph cards; L1 surface keeps compact chips.
  const sizeOpts = useMemo(
    () => ({
      diamondBoxes,
      compactWorkGroupMembers: !focusedWorkGroupId,
    }),
    [diamondBoxes, focusedWorkGroupId],
  )
  const reportDiamondBox = useCallback((nodeId: string, size: DiamondBox) => {
    setDiamondBoxes((prev) => {
      const cur = prev[nodeId]
      if (cur && cur.width === size.width && cur.height === size.height) {
        return prev
      }
      return { ...prev, [nodeId]: size }
    })
  }, [])
  const draftNodeIds = useMemo(
    () => (document?.draft.nodes ?? []).map((node) => node.id).join('\0'),
    [document?.draft.nodes],
  )
  useEffect(() => {
    const ids = new Set(draftNodeIds ? draftNodeIds.split('\0') : [])
    setDiamondBoxes((prev) => {
      let changed = false
      const next: Record<string, DiamondBox> = {}
      for (const [id, box] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = box
        else changed = true
      }
      return changed ? next : prev
    })
  }, [draftNodeIds])
  const [dragging, setDragging] = useState(false)
  /**
   * Exit preview for a matrix-locked work-group chip.
   * Document position stays fixed so the dashed frame does not resize while dragging.
   * Ref stays in sync for pointer-up (React state can lag one frame).
   */
  const [workGroupExitGhost, setWorkGroupExitGhost] = useState<{
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    title: string
  } | null>(null)
  const workGroupExitGhostRef = useRef<{
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    title: string
  } | null>(null)
  const [railLayout, setRailLayout] = useState<LoopGraphRailLayout>(() =>
    emptyLoopGraphRailLayout(),
  )
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(null)
  const setSelectedNodeId = (nodeId: string | null) => {
    setSelectedNodeIdState(nodeId)
    setCanvasSelectedNodeId(nodeId)
    if (nodeId) setSelectedWorkGroupId(null)
    if (!nodeId) clearAuthoringFocus()
  }
  const selectWorkGroup = (workGroupId: string | null) => {
    setSelectedWorkGroupId(workGroupId)
    if (workGroupId) {
      setSelectedNodeIdState(null)
      setCanvasSelectedNodeId(null)
      clearAuthoringFocus()
      // Do NOT reflow here — frame size only changes on confirmed join/leave.
    }
  }
  const railLayoutRef = useRef(railLayout)
  railLayoutRef.current = railLayout
  const [acceptedAssumptions, setAcceptedAssumptions] = useState<Record<string, boolean>>({})
  const [confirmedCycles, setConfirmedCycles] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<LoopGraphContextMenuState | null>(null)
  const [dutyCardNodeId, setDutyCardNodeId] = useState<string | null>(null)
  const [switchAgentMenu, setSwitchAgentMenu] = useState<{
    nodeId: string
    x: number
    y: number
  } | null>(null)
  const [workforceAgents, setWorkforceAgents] = useState<AgentDefinition[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [paletteDropActive, setPaletteDropActive] = useState(false)
  const [pointerWorld, setPointerWorld] = useState<{ x: number; y: number } | null>(null)
  const [wiringPicker, setWiringPicker] = useState<{
    agentNodeId: string
    kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
    anchor: { x: number; y: number }
  } | null>(null)
  const [satelliteFillPicker, setSatelliteFillPicker] = useState<{
    nodeId: string
    kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
    anchor: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    if (wiringViewMode !== 'compact' || !document) return
    const selected = selectedNodeId
      ? document.draft.nodes.find((node) => node.id === selectedNodeId)
      : null
    if (selected && isConfigNode(selected)) {
      setSelectedNodeId(null)
    }
    const duty = dutyCardNodeId
      ? document.draft.nodes.find((node) => node.id === dutyCardNodeId)
      : null
    if (duty && isConfigNode(duty)) {
      setDutyCardNodeId(null)
    }
  }, [wiringViewMode, document, selectedNodeId, dutyCardNodeId])

  useEffect(() => {
    if (phase !== 'draw' && focusedWorkGroupId) {
      exitWorkGroupGraph()
    }
  }, [phase, focusedWorkGroupId, exitWorkGroupGraph])

  // L2 starts at a readable origin after interior layout — reset pan/zoom.
  useEffect(() => {
    if (!focusedWorkGroupId) return
    setViewport({ x: 32, y: 32, scale: 1 })
  }, [focusedWorkGroupId])

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  /** Blank-canvas pointer start — used to treat a short press as deselect click. */
  const blankPointerRef = useRef<{ x: number; y: number } | null>(null)
  const nodeDragRef = useRef<{
    id: string
    ox: number
    oy: number
    px: number
    py: number
    /** Config satellites that should translate with an Agent drag. */
    followers: Array<{ id: string; ox: number; oy: number }>
    /** Surface agent already in a work group — drag is exit-only (matrix fixed). */
    workGroupLocked?: boolean
    homeWorkGroupId?: string
  } | null>(null)
  /**
   * While exiting a matrix chip, keep the dashed frame at the pre-drag size.
   * Size may change only after confirmed join/leave + reflow.
   */
  const frozenWorkGroupFrameRef = useRef<{
    workGroupId: string
    bounds: LoopWorkGroupFrameBounds
  } | null>(null)
  const connectingSourceSlotRef = useRef<{
    port: IntentEdgePort
    index: number
  } | null>(null)
  const connectingWorkGroupPortRef = useRef<LoopWorkGroupPort | null>(null)

  const workflowEdgeRoutes = useMemo(() => {
    if (!document) return new Map()
    return routeAllLoopWorkflowEdges({
      draft: document.draft,
      sizeOf: (node) => nodeBoxSize(node, document.draft, sizeOpts),
      pendingLabel: ts('chat.loopGraph.edgeLabelPending'),
    })
  }, [document, sizeOpts, ts])

  useEffect(() => {
    if (!open || !project) return
    void loadForWorkspace()
  }, [open, project, loadForWorkspace])

  useEffect(() => {
    setAcceptedAssumptions({})
    setConfirmedCycles({})
  }, [compileResult?.specDraft.version])

  useEffect(() => {
    if (!project?.projectId) {
      setRailLayout(emptyLoopGraphRailLayout())
      return
    }
    setRailLayout(loadLoopGraphRailLayout(project.projectId))
  }, [project?.projectId])

  const mergedRail = useMemo(
    () => syncRailLayoutWithLoops(railLayout, heads),
    [railLayout, heads],
  )

  const persistRail = (next: LoopGraphRailLayout) => {
    setRailLayout(next)
    if (project?.projectId) saveLoopGraphRailLayout(project.projectId, next)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (connectingFromId) {
          setConnectingFrom(null)
          setPointerWorld(null)
          connectingWorkGroupPortRef.current = null
          connectingSourceSlotRef.current = null
          return
        }
        if (selectedWorkGroupId) {
          setSelectedWorkGroupId(null)
          return
        }
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        if (pendingDelete) {
          setPendingDelete(null)
          return
        }
        setLoopGraphOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    connectingFromId,
    selectedWorkGroupId,
    contextMenu,
    pendingDelete,
    setConnectingFrom,
    setPendingDelete,
    setLoopGraphOpen,
    setSelectedWorkGroupId,
  ])

  useEffect(() => {
    clear()
  }, [project?.projectId, clear])

  useEffect(() => {
    if (!dutyCardNodeId || !document) return
    if (!document.draft.nodes.some((node) => node.id === dutyCardNodeId)) {
      setDutyCardNodeId(null)
    }
  }, [document, dutyCardNodeId])

  useEffect(() => {
    if (!open) return undefined
    const el = canvasRef.current
    if (!el) return undefined
    const sync = () => {
      setCanvasSize({
        width: Math.max(1, el.clientWidth),
        height: Math.max(1, el.clientHeight),
      })
    }
    sync()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [open, phase, document?.id])

  useEffect(() => {
    if (phase !== 'run') return
    void refreshRunHistory()
  }, [phase, document?.id, refreshRunHistory])

  const activeInstance = useMemo(() => {
    const instances = document?.instances ?? []
    return (
      [...instances]
        .reverse()
        .find((item) =>
          ['queued', 'running', 'paused', 'awaiting_hitl', 'awaiting_review'].includes(item.status),
        ) ?? instances[instances.length - 1]
    )
  }, [document])

  const draftAhead =
    Boolean(activeInstance) &&
    Boolean(document) &&
    document!.draft.revision !==
      document!.approvedSpecs.find((spec) => spec.version === activeInstance?.specVersion)
        ?.graphRevision

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  const draft = document?.draft ?? {
    revision: 0,
    graphPrompt: '',
    nodes: [] as IntentGraphNode[],
    edges: [] as IntentGraphEdge[],
    workGroups: [] as LoopWorkGroup[],
    workGroupSeq: 0,
  }
  const workGroups = draft.workGroups ?? []

  const compileReady = isIntentGraphReadyForCompile(draft)

  const patchDraft = (next: IntentGraph) => {
    updateDraft({ ...next, revision: draft.revision + 1 })
  }

  const updateNode = (nodeId: string, patch: Partial<IntentGraphNode>) => {
    // Always patch against the live store draft — a render-closure `draft`
    // can predate remove/reflow and silently restore workgroup membership.
    const live = useLoopGraphStore.getState().document?.draft ?? draft
    updateDraft({
      ...live,
      nodes: live.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...patch } : node,
      ),
    })
  }

  /** Nudge MCP satellites off Agent south corridors after an S workflow link. */
  const clearSouthCorridorsForAgents = (agentIds: string[]) => {
    const latest = useLoopGraphStore.getState().document?.draft ?? draft
    const unique = [...new Set(agentIds.filter(Boolean))]
    const byId = new Map<string, { x: number; y: number }>()
    for (const agentId of unique) {
      const agent = latest.nodes.find((node) => node.id === agentId)
      if (!agent || (agent.type ?? 'agent') !== 'agent') continue
      for (const patch of clearAgentSouthCorridorPatches(agent, latest)) {
        byId.set(patch.id, patch.position)
      }
    }
    if (byId.size === 0) return
    patchDraft({
      ...latest,
      nodes: latest.nodes.map((node) => {
        const next = byId.get(node.id)
        return next ? { ...node, position: next } : node
      }),
    })
  }

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 40, y: 40 }
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    }
  }

  const placeFromPalette = async (
    paletteItemId: string,
    position: { x: number; y: number },
    screenAnchor?: { x: number; y: number },
  ) => {
    if (paletteItemId === 'workgroup.create') {
      const id = await beginAuthorNodeFromPalette(paletteItemId, {
        x: Math.max(16, position.x - 140),
        y: Math.max(16, position.y - 80),
      })
      if (id) selectWorkGroup(id)
      return
    }
    const id = await beginAuthorNodeFromPalette(paletteItemId, {
      x: Math.max(16, position.x - NODE_W / 2),
      y: Math.max(16, position.y - NODE_H / 2),
    })
    if (!id) return
    setSelectedNodeId(id)
    const fillKind =
      paletteItemId === 'config.model'
        ? ('model' as const)
        : paletteItemId === 'config.skill'
          ? ('skill' as const)
          : paletteItemId === 'config.mcp'
            ? ('mcp' as const)
            : null
    if (fillKind && screenAnchor) {
      setSatelliteFillPicker({
        nodeId: id,
        kind: fillKind,
        anchor: screenAnchor,
      })
    }
  }

  const workGroupFrameBounds = (
    group: LoopWorkGroup,
  ): LoopWorkGroupFrameBounds => {
    // L1 frame hugs surface Agents only — interior Logic/Action/Human stay in L2.
    const surfaceIds = new Set(listWorkGroupSurfaceAgentIds(group, draft.nodes))
    const memberBounds = group.memberNodeIds
      .filter((memberId) => surfaceIds.has(memberId))
      .map((memberId) => {
        const node = draft.nodes.find((item) => item.id === memberId)
        if (!node) return null
        const size = nodeBoxSize(node, draft, sizeOpts)
        return {
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: size.width,
          height: size.height,
        }
      })
      .filter(
        (
          rect,
        ): rect is {
          id: string
          x: number
          y: number
          width: number
          height: number
        } => Boolean(rect),
      )
    return (
      computeLoopWorkGroupFrameBounds(memberBounds) ??
      defaultEmptyLoopWorkGroupFrame(
        group.origin ?? { x: 80, y: 80 },
      )
    )
  }

  const pointInFrame = (
    point: { x: number; y: number },
    bounds: LoopWorkGroupFrameBounds,
  ) =>
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height

  const workGroupPortWorld = (
    bounds: LoopWorkGroupFrameBounds,
    port: LoopWorkGroupPort,
  ) => ({
    x: port === 'in' ? bounds.x : bounds.x + bounds.width,
    y: bounds.y + bounds.height / 2,
  })

  const startConnectFromWorkGroup = (
    workGroupId: string,
    port: LoopWorkGroupPort,
    bounds: LoopWorkGroupFrameBounds,
  ) => {
    connectingWorkGroupPortRef.current = port
    connectingSourceSlotRef.current = null
    setConnectingFrom(workGroupId)
    setPointerWorld(workGroupPortWorld(bounds, port))
  }

  const finishConnectToWorkGroup = (
    workGroupId: string,
    port: LoopWorkGroupPort,
  ) => {
    if (!connectingFromId || connectingFromId === workGroupId) {
      startConnectFromWorkGroup(
        workGroupId,
        port,
        workGroupFrameBounds(
          workGroups.find((group) => group.id === workGroupId) ?? {
            id: workGroupId,
            title: 'Workgroup',
            memberNodeIds: [],
            collaborationMode: 'coordinator',
            createdAt: '',
            updatedAt: '',
            origin: { x: 0, y: 0 },
          },
        ),
      )
      return
    }
    const sourceIsWg = isWorkGroupEndpoint(connectingFromId, workGroups)
    const workGroupPort = sourceIsWg
      ? (connectingWorkGroupPortRef.current ?? 'out')
      : port
    void beginAuthorEdge(connectingFromId, workGroupId, {
      workGroupPort,
      ...(sourceIsWg
        ? {}
        : {
            sourcePort: connectingSourceSlotRef.current?.port,
            sourcePortIndex: connectingSourceSlotRef.current?.index ?? 0,
            targetPort: port === 'in' ? ('w' as IntentEdgePort) : ('e' as IntentEdgePort),
          }),
    }).finally(() => {
      connectingWorkGroupPortRef.current = null
      connectingSourceSlotRef.current = null
      setPointerWorld(null)
    })
  }

  const openDutyCard = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setDutyCardNodeId(nodeId)
  }

  const placeWiredAsset = async (
    agentNodeId: string,
    asset: ConfigAssetPick,
  ) => {
    const agent = draft.nodes.find((node) => node.id === agentNodeId)
    if (!agent) return
    const port =
      asset.kind === 'model' ? 'model' : asset.kind === 'mcp' ? 'mcp' : 'skill'
    const layout = buildAgentWiringLayout(agent, draft)
    const stack = layout.slots.filter(
      (slot) => slot.port === port && slot.satelliteId,
    ).length
    const mcpCount =
      layout.slots.filter((slot) => slot.port === 'mcp' && slot.satelliteId).length +
      (port === 'mcp' ? 1 : 0)
    const skillCount =
      layout.slots.filter((slot) => slot.port === 'skill' && slot.satelliteId)
        .length + (port === 'skill' ? 1 : 0)
    const nextWidth = agentNodeWidth(mcpCount, skillCount)
    const anchor = agentWiringPortPoint(agent, port, { draft })
    // Bias new satellites toward the growing end of their port group, but keep
    // MCP (and any corridor invaders) clear of the Agent south workflow lane.
    const group = layout.groups.find((item) => item.port === port)
    const preferredCenter = group
      ? group.buttonX
      : Math.min(
          nextWidth - LOOP_CONFIG_NODE_W / 2 - 8,
          Math.max(LOOP_CONFIG_NODE_W / 2 + 8, anchor.x - agent.position.x),
        )
    const localLeft = parkSatelliteLocalX({
      port,
      preferredCenterX: preferredCenter,
      agentWidth: nextWidth,
      stackIndex: port === 'mcp' ? stack : 0,
    })
    const agentSize = nodeBoxSize(agent, draft, sizeOpts)
    const position = {
      x: agent.position.x + localLeft,
      y:
        agent.position.y +
        agentSize.height +
        LOOP_SATELLITE_BELOW_GAP +
        stack * (LOOP_CONFIG_NODE_H + 10),
    }
    if (asset.kind === 'model') {
      await beginAuthorConfigSatellite({
        satelliteKind: 'model',
        title: `Model · ${asset.name}`,
        configRef: { modelProfileId: asset.id },
        position,
        wireToAgentId: agentNodeId,
      })
      return
    }
    if (asset.kind === 'skill') {
      await beginAuthorConfigSatellite({
        satelliteKind: 'skill',
        title: `Skill · ${asset.name}`,
        configRef: { skillId: asset.id },
        position,
        wireToAgentId: agentNodeId,
      })
      return
    }
    await beginAuthorConfigSatellite({
      satelliteKind: 'mcp',
      title: `MCP · ${asset.name}`,
      configRef: { mcpServerId: asset.id },
      position,
      wireToAgentId: agentNodeId,
    })
  }

  const addNodeAt = (position: { x: number; y: number }) => {
    void beginAuthorNode({
      x: Math.max(16, position.x - NODE_W / 2),
      y: Math.max(16, position.y - NODE_H / 2),
    }).then((nodeId) => {
      if (nodeId) setSelectedNodeId(nodeId)
    })
  }

  const addNodeCentered = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      addNodeAt({
        x: 40 + draft.nodes.length * 24,
        y: 40 + draft.nodes.length * 24,
      })
      return
    }
    addNodeAt({
      x: (rect.width / 2 - viewport.x) / viewport.scale,
      y: (rect.height / 2 - viewport.y) / viewport.scale,
    })
  }

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(1.8, Math.max(0.45, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)))
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  const workGroupBoundsById = (() => {
    const map = new Map<string, LoopWorkGroupFrameBounds>()
    const frozen = frozenWorkGroupFrameRef.current
    for (const group of workGroups) {
      if (frozen && frozen.workGroupId === group.id) {
        map.set(group.id, frozen.bounds)
      } else {
        map.set(group.id, workGroupFrameBounds(group))
      }
    }
    return map
  })()

  const focusedWorkGroup = focusedWorkGroupId
    ? workGroups.find((group) => group.id === focusedWorkGroupId) ?? null
    : null

  const hideWiringSatellites = wiringViewMode === 'compact'
  // Plain Set — must NOT use hooks here (this block runs after `if (!open) return null`).
  const workGroupMemberIds = (() => {
    const ids = new Set<string>()
    for (const node of draft.nodes) {
      if (isWorkGroupMemberAgent(node)) ids.add(node.id)
    }
    return ids
  })()

  const nodeVisibleOnCanvas = (node: IntentGraphNode): boolean => {
    if (focusedWorkGroupId) {
      if (isConfigNode(node)) {
        if (hideWiringSatellites) return false
        return draft.edges.some(
          (edge) =>
            edge.kind === 'provides' &&
            edge.source === node.id &&
            draft.nodes.some(
              (target) =>
                target.id === edge.target &&
                target.workGroupId === focusedWorkGroupId,
            ),
        )
      }
      return node.workGroupId === focusedWorkGroupId
    }
    // L1: hide Action/Logic/Human only when nested in a work group (L2).
    if (isNestedWorkGroupInteriorNode(node)) return false
    if (isConfigNode(node)) {
      if (hideWiringSatellites) return false
      // Work-group surface Agents render as compact chips — hide their satellites.
      const feedsMember = draft.edges.some(
        (edge) =>
          edge.kind === 'provides' &&
          edge.source === node.id &&
          workGroupMemberIds.has(edge.target),
      )
      return !feedsMember
    }
    return true
  }

  const canvasNodes = draft.nodes.filter(nodeVisibleOnCanvas)

  const worldWidth = Math.max(
    800,
    ...canvasNodes.map((node) => {
      const size = nodeBoxSize(node, draft, sizeOpts)
      return node.position.x + size.width + 80
    }),
    ...[...workGroupBoundsById.values()].map((bounds) => bounds.x + bounds.width + 80),
    pointerWorld ? pointerWorld.x + 40 : 0,
  )
  const worldHeight = Math.max(
    600,
    ...canvasNodes.map((node) => {
      const size = nodeBoxSize(node, draft, sizeOpts)
      return node.position.y + size.height + 120
    }),
    ...[...workGroupBoundsById.values()].map(
      (bounds) => bounds.y + bounds.height + 120,
    ),
    pointerWorld ? pointerWorld.y + 40 : 0,
  )

  const connectingSource = connectingFromId
    ? draft.nodes.find((node) => node.id === connectingFromId)
    : null
  const connectingWorkGroup = connectingFromId
    ? workGroups.find((group) => group.id === connectingFromId)
    : null

  const previewRoute =
    connectingWorkGroup && pointerWorld
      ? (() => {
          const bounds =
            workGroupBoundsById.get(connectingWorkGroup.id) ??
            defaultEmptyLoopWorkGroupFrame(
              connectingWorkGroup.origin ?? { x: 80, y: 80 },
            )
          const port = connectingWorkGroupPortRef.current ?? 'out'
          const origin = workGroupPortWorld(bounds, port)
          const synthetic: IntentGraphNode = {
            id: connectingWorkGroup.id,
            title: connectingWorkGroup.title,
            prompt: '',
            position: { x: origin.x - 1, y: origin.y - 1 },
          }
          return routeLoopEdge({
            source: synthetic,
            endPoint: pointerWorld,
            sourcePort: port === 'in' ? 'w' : 'e',
            sourceAllowedPorts: port === 'in' ? ['w'] : ['e'],
            obstacles: draft.nodes,
            obstacleSize: (node) => nodeBoxSize(node, draft, sizeOpts),
            width: 2,
            height: 2,
          })
        })()
      : connectingSource && pointerWorld
        ? (() => {
            const ports = workflowPortBoxSize(connectingSource, draft, sizeOpts)
            const allowed = workflowPortsForNode(connectingSource, draft)
            return routeLoopEdge({
              source: connectingSource,
              endPoint: pointerWorld,
              sourcePort: nearestPort(
                connectingSource,
                pointerWorld,
                ports.width,
                ports.height,
                allowed,
              ),
              sourceAllowedPorts: allowed,
              obstacles: draft.nodes,
              obstacleSize: (node) => nodeBoxSize(node, draft, sizeOpts),
              width: ports.width,
              height: ports.height,
            })
          })()
        : null

  const startConnectFrom = (
    nodeId: string,
    seedWorld?: { x: number; y: number },
    sourcePort?: IntentEdgePort,
    sourcePortIndex = 0,
  ) => {
    const node = draft.nodes.find((item) => item.id === nodeId)
    setConnectingFrom(nodeId)
    if (sourcePort) {
      connectingSourceSlotRef.current = {
        port: sourcePort,
        index: sourcePortIndex,
      }
    } else {
      connectingSourceSlotRef.current = null
    }
    if (seedWorld) {
      setPointerWorld(seedWorld)
      return
    }
    if (node) {
      const ports = workflowPortBoxSize(node, draft, sizeOpts)
      const allowed = workflowPortsForNode(node, draft)
      const fallback = allowed.includes('s') ? 's' : (allowed[0] ?? 'e')
      const port =
        sourcePort && allowed.includes(sourcePort) ? sourcePort : fallback
      const slots = loopNodePortSlots(node, ports.width, ports.height, allowed)
      const slot =
        slots.find(
          (item) => item.port === port && item.index === sourcePortIndex,
        ) ?? slots.find((item) => item.port === port)
      setPointerWorld(
        portPoint(
          node,
          port,
          ports.width,
          ports.height,
          slot?.along ?? 0.5,
        ),
      )
    }
  }

  const steps: Array<{ id: LoopPhase; label: string }> = [
    { id: 'draw', label: ts('chat.loopGraph.phase.draw') },
    { id: 'review', label: ts('chat.loopGraph.phase.review') },
    { id: 'run', label: ts('chat.loopGraph.phase.run') },
  ]

  const wiringViewModes: Array<{ id: LoopWiringViewMode; label: string }> = [
    { id: 'full', label: ts('chat.loopGraph.wiringView.full') },
    { id: 'compact', label: ts('chat.loopGraph.wiringView.compact') },
  ]

  const pendingDeleteLabel =
    pendingDelete?.type === 'node'
      ? ts('chat.loopGraph.deleteNodeConfirm')
      : ts('chat.loopGraph.deleteEdgeConfirm')

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.loopGraph.title')}
    >
      <LoopGraphRail
        layout={mergedRail}
        items={heads}
        activeLoopId={document?.id ?? null}
        renamingFolderId={renamingFolderId}
        onOpen={(id) => void selectLoop(id)}
        onCreate={() => void createLoop()}
        onCreateFolder={() => {
          const created = createLoopRailFolder(
            railLayoutRef.current,
            ts('chat.loopGraph.folderUntitled'),
          )
          persistRail(created.layout)
          setRenamingFolderId(created.folderId)
        }}
        onRenameFolder={(folderId, title) => {
          persistRail(renameLoopRailFolder(railLayoutRef.current, folderId, title))
          setRenamingFolderId(null)
        }}
        onCancelRenameFolder={() => {
          if (renamingFolderId) {
            const folder = findLoopFolderEntry(
              railLayoutRef.current.entries,
              renamingFolderId,
            )
            if (
              folder &&
              folder.children.length === 0 &&
              (!folder.title.trim() ||
                folder.title.trim() === ts('chat.loopGraph.folderUntitled'))
            ) {
              persistRail(
                removeLoopFolderFromLayout(railLayoutRef.current, renamingFolderId),
              )
            }
          }
          setRenamingFolderId(null)
        }}
        onRemoveLoop={(loopId) => {
          void deleteLoop(loopId).then((ok) => {
            if (ok) {
              persistRail(removeLoopFromLayout(railLayoutRef.current, loopId))
            }
          })
        }}
        onRemoveFolder={(folderId) => {
          if (renamingFolderId === folderId) setRenamingFolderId(null)
          persistRail(removeLoopFolderFromLayout(mergedRail, folderId))
        }}
        onMoveIntoFolder={(loopId, folderId) => {
          persistRail(moveLoopIntoFolder(railLayoutRef.current, loopId, folderId))
        }}
        onMoveFolderIntoFolder={(folderId, targetFolderId) => {
          persistRail(
            moveLoopFolderIntoFolder(railLayoutRef.current, folderId, targetFolderId),
          )
        }}
        onMoveToRail={(loopId) => {
          persistRail(insertLoopOnRail(railLayoutRef.current, loopId))
        }}
        onMoveFolderToRail={(folderId) => {
          persistRail(insertLoopFolderOnRail(railLayoutRef.current, folderId))
        }}
      />
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <input
              className={styles.title}
              value={document?.title ?? ts('chat.loopGraph.title')}
              aria-label={ts('chat.loopGraph.rename')}
              disabled={!document}
              onChange={(event) => {
                if (!document) return
                updateDraft(document.draft, event.target.value)
              }}
            />
            <div className={styles.stepper} role="tablist" aria-label={ts('chat.loopGraph.phases')}>
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={phase === step.id}
                  className={`${styles.step} ${phase === step.id ? styles.stepActive : ''}`}
                  onClick={() => setPhase(step.id)}
                >
                  {step.label}
                </button>
              ))}
            </div>
            {phase === 'draw' && !focusedWorkGroupId ? (
              <div
                className={styles.wiringViewToggle}
                role="tablist"
                aria-label={ts('chat.loopGraph.wiringView.label')}
              >
                {wiringViewModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={wiringViewMode === mode.id}
                    className={`${styles.step} ${
                      wiringViewMode === mode.id ? styles.stepActive : ''
                    }`}
                    title={ts(`chat.loopGraph.wiringView.${mode.id}Hint`)}
                    onClick={() => setWiringViewMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            ) : null}
            {phase === 'draw' && focusedWorkGroup ? (
              <div
                className={styles.workGroupBreadcrumb}
                aria-label={ts('chat.loopGraph.workGroup.interiorLabel')}
              >
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => exitWorkGroupGraph()}
                  title={ts('chat.loopGraph.workGroup.exitInterior')}
                  aria-label={ts('chat.loopGraph.workGroup.exitInterior')}
                >
                  <ArrowLeft size={14} aria-hidden />
                </button>
                <span className={styles.workGroupBreadcrumbText}>
                  {ts('chat.loopGraph.workGroup.interiorBreadcrumb', {
                    title: focusedWorkGroup.title,
                  })}
                </span>
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            {phase === 'draw' ? (
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={addNodeCentered}
                  disabled={!document}
                  title={ts('chat.loopGraph.addNode')}
                  aria-label={ts('chat.loopGraph.addNode')}
                >
                  <Plus size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => layoutDraftSemantically({ diamondBoxes })}
                  disabled={!document || (document.draft.nodes.length === 0)}
                  title={ts('chat.loopGraph.layoutSemantically')}
                  aria-label={ts('chat.loopGraph.layoutSemantically')}
                >
                  <LayoutTemplate size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.iconButtonPrimary}`}
                  onClick={() => void compile()}
                  disabled={!document || !compileReady}
                  title={ts('chat.loopGraph.compile')}
                  aria-label={ts('chat.loopGraph.compile')}
                >
                  <Sparkles size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => openSavedFlowForRun()}
                  disabled={!document}
                  title={ts('chat.loopGraph.openSavedFlowForRun')}
                  aria-label={ts('chat.loopGraph.openSavedFlowForRun')}
                  data-loop-open-saved-flow-run=""
                >
                  {ts('chat.loopGraph.openSavedFlowForRun')}
                </button>
              </>
            ) : null}
            {phase === 'review' ? (
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() => void approve()}
                disabled={
                  !reviewApproveEnabled({
                    compileResult,
                    draftRevision: document?.draft.revision ?? -1,
                    acceptedAssumptions,
                    confirmedCycles,
                  })
                }
              >
                {ts('chat.loopGraph.approve')}
              </button>
            ) : null}
            {phase === 'run' ? (
              <>
                <button type="button" className={styles.actionButton} onClick={() => void pauseRun()}>
                  {ts('chat.loopGraph.pause')}
                </button>
                <button type="button" className={styles.actionButton} onClick={() => void resumeRun()}>
                  {ts('chat.loopGraph.resume')}
                </button>
                <button type="button" className={styles.actionButton} onClick={() => void advanceRun()}>
                  {ts('chat.loopGraph.advance')}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.loopGraph.linkSession')}
              title={ts('chat.loopGraph.linkSession')}
              disabled={!document || !activeSessionId}
              onClick={() => void linkActiveSession()}
            >
              <Link2 size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.loopGraph.exportWorkflow')}
              title={ts('chat.loopGraph.exportWorkflow')}
              disabled={!document || document.draft.nodes.length === 0}
              onClick={() => {
                if (!document) return
                void (async () => {
                  const pack = await exportCapabilityPack({
                    kind: 'workflow',
                    loopId: document.id,
                  })
                  if (!pack || pack.kind !== 'workflow') return
                  try {
                    await navigator.clipboard.writeText(pack.packJson)
                    pushToast({
                      type: 'success',
                      message: ts('chat.loopGraph.exportWorkflowCopied'),
                    })
                  } catch {
                    pushToast({
                      type: 'error',
                      message: ts('chat.marketplace.loadFailed'),
                    })
                  }
                })()
              }}
            >
              <Share2 size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.closeButton}
              aria-label={ts('chat.loopGraph.close')}
              onClick={() => setLoopGraphOpen(false)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        {draftAhead ? (
          <div className={styles.banner}>{ts('chat.loopGraph.versionConflict')}</div>
        ) : null}
        {phase === 'draw' && connectingFromId ? (
          <div className={styles.banner} data-loop-connecting-hint="">
            {ts('chat.loopGraph.connectingHint')}
          </div>
        ) : null}

        <div className={styles.body}>
          <div className={styles.stage}>
            {phase === 'review' && compileResult ? (
              <LoopReviewPanel
                compileResult={compileResult}
                draftRevision={document?.draft.revision ?? 0}
                goalContext={
                  document?.confirmedGoalContext ?? document?.draftGoalContext ?? null
                }
                activeInstance={activeInstance}
                acceptedAssumptions={acceptedAssumptions}
                confirmedCycles={confirmedCycles}
                onAcceptedAssumptionsChange={setAcceptedAssumptions}
                onConfirmedCyclesChange={setConfirmedCycles}
                onBackToDraw={() => setPhase('draw')}
                onResolveHitl={(answers) => void resolveHitl(answers)}
              />
            ) : (
              <div
                ref={canvasRef}
                className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''} ${
                  connectingFromId ? styles.canvasConnecting : ''
                } ${paletteDropActive ? styles.canvasDropTarget : ''}`}
                onWheel={onWheel}
                onDragOver={(event) => {
                  if (phase !== 'draw') return
                  const types = Array.from(event.dataTransfer.types)
                  if (
                    !types.includes(LOOP_PALETTE_MIME) &&
                    !types.includes('text/plain')
                  ) {
                    return
                  }
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setPaletteDropActive(true)
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) {
                    setPaletteDropActive(false)
                  }
                }}
                onDrop={(event) => {
                  if (phase !== 'draw') return
                  event.preventDefault()
                  setPaletteDropActive(false)
                  const raw =
                    event.dataTransfer.getData(LOOP_PALETTE_MIME) ||
                    event.dataTransfer.getData('text/plain')
                  const paletteItemId =
                    decodePaletteDragPayload(raw) ||
                    (raw.startsWith('{') ? null : raw.trim() || null)
                  if (!paletteItemId) return
                  const world = clientToWorld(event.clientX, event.clientY)
                  void placeFromPalette(paletteItemId, world, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                onContextMenu={(event) => {
                  if (phase !== 'draw' || !document) return
                  event.preventDefault()
                  // Right-click may be retargeted to the canvas after pointer capture
                  // from a prior node pointerdown — resolve the hit under the cursor.
                  const hitFromTarget =
                    event.target instanceof Element
                      ? event.target.closest('[data-loop-node], [data-loop-edge]')
                      : null
                  const hitFromPoint = globalThis.document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest('[data-loop-node], [data-loop-edge]')
                  const hit = hitFromTarget ?? hitFromPoint ?? null
                  if (hit) {
                    const nodeId = hit.getAttribute('data-loop-node')
                    const edgeId = hit.getAttribute('data-loop-edge')
                    if (nodeId) {
                      const hitNode = draft.nodes.find((item) => item.id === nodeId)
                      setSelectedNodeId(nodeId)
                      setContextMenu({
                        kind: 'node',
                        x: event.clientX,
                        y: event.clientY,
                        nodeId,
                        isAgentNode: (hitNode?.type ?? 'agent') === 'agent',
                        restoreFocusTo: event.currentTarget,
                      })
                      return
                    }
                    if (edgeId) {
                      setContextMenu({
                        kind: 'edge',
                        x: event.clientX,
                        y: event.clientY,
                        edgeId,
                        restoreFocusTo: event.currentTarget,
                      })
                      return
                    }
                  }
                  const world = clientToWorld(event.clientX, event.clientY)
                  setContextMenu({
                    kind: 'blank',
                    x: event.clientX,
                    y: event.clientY,
                    worldX: world.x,
                    worldY: world.y,
                    restoreFocusTo: event.currentTarget,
                  })
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  if ((event.target as HTMLElement).closest('[data-loop-node]')) return
                  if ((event.target as HTMLElement).closest('[data-loop-edge]')) return
                  if (
                    (event.target as HTMLElement).closest('[data-loop-work-group]')
                  ) {
                    return
                  }
                  if (connectingFromId && event.button === 0) {
                    setConnectingFrom(null)
                    setPointerWorld(null)
                    return
                  }
                  blankPointerRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                  }
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
                  if (connectingFromId) {
                    setPointerWorld(clientToWorld(event.clientX, event.clientY))
                  }
                  const nodeDrag = nodeDragRef.current
                  if (nodeDrag && document) {
                    const dx = (event.clientX - nodeDrag.px) / viewport.scale
                    const dy = (event.clientY - nodeDrag.py) / viewport.scale
                    // Matrix-locked chips: never write positions during drag —
                    // that would resize the AABB frame. Ghost only.
                    if (nodeDrag.workGroupLocked) {
                      const locked = draft.nodes.find((n) => n.id === nodeDrag.id)
                      const size = locked
                        ? nodeBoxSize(locked, draft, sizeOpts)
                        : { width: 104, height: 28 }
                      const ghost = {
                        nodeId: nodeDrag.id,
                        x: nodeDrag.ox + dx,
                        y: nodeDrag.oy + dy,
                        width: size.width,
                        height: size.height,
                        title: locked?.title || 'Agent',
                      }
                      workGroupExitGhostRef.current = ghost
                      setWorkGroupExitGhost(ghost)
                      return
                    }
                    const rawAgentPos = {
                      x: nodeDrag.ox + dx,
                      y: nodeDrag.oy + dy,
                    }
                    const draggingNode = draft.nodes.find(
                      (node) => node.id === nodeDrag.id,
                    )
                    // Solo config satellite drag: keep it under its provides agent.
                    if (
                      draggingNode &&
                      isConfigNode(draggingNode) &&
                      nodeDrag.followers.length === 0
                    ) {
                      const host = findProvidesAgentForSatellite(
                        draggingNode.id,
                        draft,
                      )
                      const clamped = host
                        ? clampSatelliteToAgent({
                            agentPosition: host.position,
                            agentSize: nodeBoxSize(host, draft, sizeOpts),
                            satellitePosition: rawAgentPos,
                          })
                        : rawAgentPos
                      updateNode(nodeDrag.id, { position: clamped })
                      return
                    }
                    const nextById = new Map<string, { x: number; y: number }>([
                      [nodeDrag.id, rawAgentPos],
                    ])
                    if (draggingNode && !isConfigNode(draggingNode)) {
                      const agentSize = nodeBoxSize(
                        draggingNode,
                        draft,
                        sizeOpts,
                      )
                      for (const follower of nodeDrag.followers) {
                        nextById.set(
                          follower.id,
                          clampSatelliteToAgent({
                            agentPosition: rawAgentPos,
                            agentSize,
                            satellitePosition: {
                              x: follower.ox + dx,
                              y: follower.oy + dy,
                            },
                          }),
                        )
                      }
                    } else {
                      for (const follower of nodeDrag.followers) {
                        nextById.set(follower.id, {
                          x: follower.ox + dx,
                          y: follower.oy + dy,
                        })
                      }
                    }
                    if (nextById.size === 1) {
                      updateNode(nodeDrag.id, {
                        position: nextById.get(nodeDrag.id)!,
                      })
                    } else {
                      patchDraft({
                        ...draft,
                        nodes: draft.nodes.map((node) => {
                          const next = nextById.get(node.id)
                          return next ? { ...node, position: next } : node
                        }),
                      })
                    }
                    return
                  }
                  const drag = dragRef.current
                  if (!drag) return
                  setViewport((current) => ({
                    ...current,
                    x: drag.x + event.clientX - drag.px,
                    y: drag.y + event.clientY - drag.py,
                  }))
                }}
                onPointerUp={(event) => {
                  const blankStart = blankPointerRef.current
                  blankPointerRef.current = null
                  if (
                    blankStart &&
                    !nodeDragRef.current &&
                    Math.hypot(
                      event.clientX - blankStart.x,
                      event.clientY - blankStart.y,
                    ) < 5
                  ) {
                    setSelectedNodeId(null)
                    selectWorkGroup(null)
                    clearAuthoringFocus()
                  }

                  const nodeDrag = nodeDragRef.current
                  const exitGhost = workGroupExitGhostRef.current
                  workGroupExitGhostRef.current = null
                  setWorkGroupExitGhost(null)
                  if (nodeDrag && document) {
                    const latestDraft =
                      useLoopGraphStore.getState().document?.draft ?? draft
                    const moving =
                      latestDraft.nodes.find((n) => n.id === nodeDrag.id) ??
                      draft.nodes.find((n) => n.id === nodeDrag.id)
                    if (moving && !isConfigNode(moving)) {
                      const surfaceLocked =
                        Boolean(nodeDrag.workGroupLocked) &&
                        isWorkGroupSurfaceAgent(moving)

                      const resolveFrame = (group: LoopWorkGroup) => {
                        const frozen = frozenWorkGroupFrameRef.current
                        if (frozen && frozen.workGroupId === group.id) {
                          return frozen.bounds
                        }
                        return (
                          workGroupBoundsById.get(group.id) ??
                          workGroupFrameBounds(group)
                        )
                      }

                      if (surfaceLocked && phase === 'draw') {
                        // Leave: ghost center vs frozen home frame.
                        const ghostPos = exitGhost
                          ? { x: exitGhost.x, y: exitGhost.y }
                          : {
                              x:
                                nodeDrag.ox +
                                (event.clientX - nodeDrag.px) / viewport.scale,
                              y:
                                nodeDrag.oy +
                                (event.clientY - nodeDrag.py) / viewport.scale,
                            }
                        const settledSize = exitGhost
                          ? {
                              width: exitGhost.width,
                              height: exitGhost.height,
                            }
                          : nodeBoxSize(moving, latestDraft, sizeOpts)
                        const center = {
                          x: ghostPos.x + settledSize.width / 2,
                          y: ghostPos.y + settledSize.height / 2,
                        }
                        const homeGroupId =
                          nodeDrag.homeWorkGroupId ?? moving.workGroupId
                        const homeGroup = homeGroupId
                          ? (latestDraft.workGroups ?? []).find(
                              (group) => group.id === homeGroupId,
                            )
                          : undefined
                        const exitFrame = homeGroup
                          ? resolveFrame(homeGroup)
                          : null
                        const stillInside =
                          exitFrame && pointInFrame(center, exitFrame)
                        frozenWorkGroupFrameRef.current = null
                        if (!stillInside && homeGroupId) {
                          // Atomic leave + exit position (do NOT follow with
                          // updateNode on a stale render draft — that restored
                          // membership and undid matrix reflow).
                          removeNodeFromWorkGroup(moving.id, {
                            exitPosition: ghostPos,
                          })
                        }
                      } else if (phase === 'draw') {
                        // Join/leave for free-canvas agents: hit-test the *drop*
                        // position BEFORE workflow snap (snap can yank the node
                        // outside the dashed frame and cancel a valid join).
                        const movingSize = nodeBoxSize(
                          moving,
                          latestDraft,
                          sizeOpts,
                        )
                        const dropCenter = {
                          x: moving.position.x + movingSize.width / 2,
                          y: moving.position.y + movingSize.height / 2,
                        }
                        const hitGroup = (latestDraft.workGroups ?? []).find(
                          (group) =>
                            pointInFrame(dropCenter, resolveFrame(group)),
                        )

                        if (
                          hitGroup &&
                          moving.workGroupId !== hitGroup.id
                        ) {
                          const ok = addNodeToWorkGroup(hitGroup.id, moving.id)
                          if (!ok) {
                            const isAgent =
                              !isConfigNode(moving) &&
                              (moving.type ?? 'agent') === 'agent'
                            pushToast({
                              type: 'info',
                              message: ts(
                                isAgent && !moving.agentDefinitionId
                                  ? 'chat.loopGraph.workGroup.addRejectedGeneral'
                                  : 'chat.loopGraph.workGroup.addRejectedType',
                              ),
                              autoDismiss: 4200,
                            })
                          }
                          // Joined → matrix reflow owns position; skip snap.
                        } else if (
                          !hitGroup &&
                          moving.workGroupId &&
                          isWorkGroupSurfaceAgent(moving)
                        ) {
                          // Free-dragged surface agent ended outside any frame.
                          removeNodeFromWorkGroup(moving.id)
                        } else {
                          // Free canvas: keep existing neighbor snap.
                          const neighbors = latestDraft.edges
                            .filter(
                              (edge) =>
                                edge.kind !== 'provides' &&
                                (edge.source === moving.id ||
                                  edge.target === moving.id),
                            )
                            .map((edge) => {
                              const otherId =
                                edge.source === moving.id
                                  ? edge.target
                                  : edge.source
                              const other = latestDraft.nodes.find(
                                (n) => n.id === otherId,
                              )
                              if (!other) return null
                              const otherSize = nodeBoxSize(
                                other,
                                latestDraft,
                                sizeOpts,
                              )
                              const localPort =
                                edge.source === moving.id
                                  ? edge.sourcePort
                                  : edge.targetPort
                              return {
                                position: other.position,
                                width: otherSize.width,
                                height: otherSize.height,
                                localPort,
                              }
                            })
                            .filter(
                              (
                                item,
                              ): item is {
                                position: { x: number; y: number }
                                width: number
                                height: number
                                localPort: IntentEdgePort | undefined
                              } => Boolean(item),
                            )
                          const snapped = snapGraphNodePosition({
                            position: moving.position,
                            width: movingSize.width,
                            height: movingSize.height,
                            neighbors,
                          })
                          if (
                            Math.abs(snapped.x - moving.position.x) > 0.5 ||
                            Math.abs(snapped.y - moving.position.y) > 0.5
                          ) {
                            const dx = snapped.x - moving.position.x
                            const dy = snapped.y - moving.position.y
                            if (nodeDrag.followers.length === 0) {
                              updateNode(moving.id, { position: snapped })
                            } else {
                              const live =
                                useLoopGraphStore.getState().document?.draft ??
                                latestDraft
                              const agentSize = nodeBoxSize(
                                moving,
                                live,
                                sizeOpts,
                              )
                              patchDraft({
                                ...live,
                                nodes: live.nodes.map((node) => {
                                  if (node.id === moving.id) {
                                    return { ...node, position: snapped }
                                  }
                                  const follower = nodeDrag.followers.find(
                                    (f) => f.id === node.id,
                                  )
                                  if (!follower) return node
                                  return {
                                    ...node,
                                    position: clampSatelliteToAgent({
                                      agentPosition: snapped,
                                      agentSize,
                                      satellitePosition: {
                                        x: node.position.x + dx,
                                        y: node.position.y + dy,
                                      },
                                    }),
                                  }
                                }),
                              })
                            }
                          }
                        }
                      }
                    }
                  }
                  frozenWorkGroupFrameRef.current = null
                  dragRef.current = null
                  nodeDragRef.current = null
                  setDragging(false)
                  try {
                    canvasRef.current?.releasePointerCapture?.(event.pointerId)
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {!document ? (
                  <p className={styles.empty}>{ts('chat.loopGraph.empty')}</p>
                ) : draft.nodes.length === 0 && workGroups.length === 0 ? (
                  <p className={styles.empty}>{ts('chat.loopGraph.canvasEmpty')}</p>
                ) : (
                  <>
                  {focusedWorkGroup ? (
                    <p className={styles.workGroupInteriorHint} role="status">
                      {ts('chat.loopGraph.workGroup.interiorHint')}
                    </p>
                  ) : null}
                  <div
                    className={styles.world}
                    style={{
                      width: worldWidth,
                      height: worldHeight,
                      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                    }}
                  >
                    {!focusedWorkGroupId
                      ? workGroups.map((group) => {
                          const bounds =
                            workGroupBoundsById.get(group.id) ??
                            defaultEmptyLoopWorkGroupFrame(
                              group.origin ?? { x: 80, y: 80 },
                            )
                          const coordinator = group.coordinatorNodeId
                            ? draft.nodes.find(
                                (node) => node.id === group.coordinatorNodeId,
                              )
                            : null
                          const surfaceCount = listWorkGroupSurfaceAgentIds(
                            group,
                            draft.nodes,
                          ).length
                          return (
                            <LoopWorkGroupFrame
                              key={group.id}
                              workGroupId={group.id}
                              title={group.title}
                              bounds={bounds}
                              memberCount={surfaceCount}
                              selected={selectedWorkGroupId === group.id}
                              collaborationMode={group.collaborationMode}
                              coordinatorTitle={coordinator?.title}
                              showPorts={phase === 'draw'}
                              onSelect={() => selectWorkGroup(group.id)}
                              onRename={(title) => renameWorkGroup(group.id, title)}
                              onTitleDragMove={({ dx, dy }) => {
                                moveWorkGroup(group.id, {
                                  dx: dx / viewport.scale,
                                  dy: dy / viewport.scale,
                                })
                              }}
                              onDissolve={() => dissolveWorkGroup(group.id)}
                              onOpenInterior={() => enterWorkGroupGraph(group.id)}
                              onPortPointerDown={(workGroupId, port) => {
                                finishConnectToWorkGroup(workGroupId, port)
                              }}
                            />
                          )
                        })
                      : null}
                    <svg className={styles.edges} width={worldWidth} height={worldHeight}>
                      {draft.edges.map((edge) => {
                        if (edge.kind === 'provides') {
                          if (hideWiringSatellites) return null
                          if (
                            !focusedWorkGroupId &&
                            workGroupMemberIds.has(edge.target)
                          ) {
                            return null
                          }
                        }
                        const sourceNode = draft.nodes.find((node) => node.id === edge.source)
                        const targetNode = draft.nodes.find((node) => node.id === edge.target)
                        // L1: hide collaboration edges that stay entirely inside one work group.
                        if (
                          !focusedWorkGroupId &&
                          sourceNode?.workGroupId &&
                          sourceNode.workGroupId === targetNode?.workGroupId
                        ) {
                          return null
                        }
                        const sourceWg = !sourceNode
                          ? workGroups.find((group) => group.id === edge.source)
                          : null
                        const targetWg = !targetNode
                          ? workGroups.find((group) => group.id === edge.target)
                          : null
                        // L2: only edges between nodes visible in the focused subgraph.
                        if (focusedWorkGroupId) {
                          if (sourceWg || targetWg) return null
                          if (
                            !sourceNode ||
                            !targetNode ||
                            !nodeVisibleOnCanvas(sourceNode) ||
                            !nodeVisibleOnCanvas(targetNode)
                          ) {
                            return null
                          }
                        }
                        if ((!sourceNode && !sourceWg) || (!targetNode && !targetWg)) {
                          return null
                        }
                        const source: IntentGraphNode = sourceNode
                          ? sourceNode
                          : (() => {
                              const bounds =
                                workGroupBoundsById.get(sourceWg!.id) ??
                                defaultEmptyLoopWorkGroupFrame(
                                  sourceWg!.origin ?? { x: 80, y: 80 },
                                )
                              const port =
                                edge.workGroupPort === 'in' ? 'in' : 'out'
                              const origin = workGroupPortWorld(bounds, port)
                              return {
                                id: sourceWg!.id,
                                title: sourceWg!.title,
                                prompt: '',
                                position: { x: origin.x - 1, y: origin.y - 1 },
                              }
                            })()
                        const target: IntentGraphNode = targetNode
                          ? targetNode
                          : (() => {
                              const bounds =
                                workGroupBoundsById.get(targetWg!.id) ??
                                defaultEmptyLoopWorkGroupFrame(
                                  targetWg!.origin ?? { x: 80, y: 80 },
                                )
                              const port =
                                edge.workGroupPort === 'out' ? 'out' : 'in'
                              const origin = workGroupPortWorld(bounds, port)
                              return {
                                id: targetWg!.id,
                                title: targetWg!.title,
                                prompt: '',
                                position: { x: origin.x - 1, y: origin.y - 1 },
                              }
                            })()
                        const sourceSize = sourceNode
                          ? nodeBoxSize(sourceNode, draft, sizeOpts)
                          : { width: 2, height: 2 }
                        const provides = edge.kind === 'provides'
                        const providesPort =
                          provides && sourceNode
                            ? resolveProvidesPort(edge.configPort, sourceNode) ??
                              expectedConfigPort(sourceNode) ??
                              'model'
                            : null
                        let routed: { d: string; mid: { x: number; y: number } }
                        if (provides && providesPort && sourceNode && targetNode) {
                          // Capability wiring stays curved so it reads as Agent↔config,
                          // not as a normal workflow depends/conditional edge.
                          const start = {
                            x: source.position.x + sourceSize.width / 2,
                            y: source.position.y,
                          }
                          const end = agentWiringPortPoint(target, providesPort, {
                            draft,
                            satelliteId: source.id,
                          })
                          routed = routeProvidesCurve({ start, end })
                        } else {
                          const batched =
                            sourceNode && targetNode
                              ? workflowEdgeRoutes.get(edge.id)
                              : undefined
                          if (batched) {
                            routed = {
                              d: batched.d,
                              mid: batched.mid,
                            }
                          } else {
                            const sourcePorts = sourceNode
                              ? workflowPortBoxSize(sourceNode, draft, sizeOpts)
                              : { width: 2, height: 2 }
                            const targetPorts = targetNode
                              ? workflowPortBoxSize(targetNode, draft, sizeOpts)
                              : { width: 2, height: 2 }
                            const labelForRoute =
                              formatEdgeLabel(
                                edge.branchKey
                                  ? `${edge.branchKey}: ${edge.prompt ?? ''}`
                                  : (edge.prompt ?? ''),
                              ) || ts('chat.loopGraph.edgeLabelPending')
                            routed = routeLoopEdge({
                              source,
                              target,
                              sourcePort: sourceNode
                                ? edge.sourcePort
                                : edge.workGroupPort === 'in'
                                  ? 'w'
                                  : 'e',
                              targetPort: targetNode
                                ? edge.targetPort
                                : edge.workGroupPort === 'out'
                                  ? 'e'
                                  : 'w',
                              sourceAllowedPorts: sourceNode
                                ? workflowPortsForNode(sourceNode, draft)
                                : edge.workGroupPort === 'in'
                                  ? ['w']
                                  : ['e'],
                              targetAllowedPorts: targetNode
                                ? workflowPortsForNode(targetNode, draft)
                                : edge.workGroupPort === 'out'
                                  ? ['e']
                                  : ['w'],
                              obstacles: draft.nodes,
                              obstacleSize: (node) =>
                                nodeBoxSize(node, draft, sizeOpts),
                              width: sourcePorts.width,
                              height: sourcePorts.height,
                              targetWidth: targetPorts.width,
                              targetHeight: targetPorts.height,
                              labelText: labelForRoute,
                            })
                          }
                        }
                        const incomplete =
                          !provides && (!edge.prompt?.trim() || !edge.kind)
                        const feedback = edge.kind === 'feedback'
                        const conditional = edge.kind === 'conditional'
                        const fallback = edge.kind === 'fallback'
                        const label = provides
                          ? providesPort ??
                            ts('chat.loopGraph.wiringProvides')
                          : formatEdgeLabel(
                              edge.branchKey
                                ? `${edge.branchKey}: ${edge.prompt ?? ''}`
                                : (edge.prompt ?? ''),
                            ) || ts('chat.loopGraph.edgeLabelPending')
                        return (
                          <g key={edge.id} data-loop-edge={edge.id}>
                            <path
                              className={styles.edgeHit}
                              d={routed.d}
                              onContextMenu={(event) => {
                                if (phase !== 'draw') return
                                event.preventDefault()
                                event.stopPropagation()
                                setContextMenu({
                                  kind: 'edge',
                                  x: event.clientX,
                                  y: event.clientY,
                                  edgeId: edge.id,
                                  restoreFocusTo: canvasRef.current ?? undefined,
                                })
                              }}
                            />
                            <path
                              className={`${styles.edge} ${
                                feedback ? styles.edgeFeedback : ''
                              } ${conditional ? styles.edgeConditional : ''} ${
                                fallback ? styles.edgeFallback : ''
                              } ${
                                provides ? styles.edgeProvides : ''
                              } ${incomplete ? styles.edgeIncomplete : ''}`}
                              d={routed.d}
                              pointerEvents="none"
                            />
                            {!provides ? (
                              <foreignObject
                                className={styles.edgeLabelForeign}
                                x={routed.mid.x}
                                y={routed.mid.y}
                                width={1}
                                height={1}
                                pointerEvents="auto"
                              >
                                <div
                                  className={`${styles.edgeLabelChip} ${
                                    incomplete ? styles.edgeLabelChipPending : ''
                                  } ${
                                    canvasSelectedEdgeId === edge.id
                                      ? styles.edgeLabelChipSelected
                                      : ''
                                  }`}
                                  title={label}
                                  data-loop-edge-label={edge.id}
                                  role="button"
                                  tabIndex={phase === 'draw' ? 0 : -1}
                                  onPointerDown={(event) => {
                                    if (phase !== 'draw' || event.button !== 0) return
                                    event.stopPropagation()
                                  }}
                                  onClick={(event) => {
                                    if (phase !== 'draw') return
                                    event.stopPropagation()
                                    setSelectedNodeId(null)
                                    selectWorkGroup(null)
                                    void beginFocusedEdit({
                                      type: 'edge',
                                      id: edge.id,
                                    })
                                  }}
                                  onKeyDown={(event) => {
                                    if (phase !== 'draw') return
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setSelectedNodeId(null)
                                    selectWorkGroup(null)
                                    void beginFocusedEdit({
                                      type: 'edge',
                                      id: edge.id,
                                    })
                                  }}
                                >
                                  {label}
                                </div>
                              </foreignObject>
                            ) : null}
                          </g>
                        )
                      })}
                      {previewRoute ? (
                        <path
                          className={`${styles.edge} ${styles.edgePreview}`}
                          d={previewRoute.d}
                          pointerEvents="none"
                        />
                      ) : null}
                    </svg>
                    {draft.nodes.map((node) => {
                      if (!nodeVisibleOnCanvas(node)) return null
                      const configSatellite = isConfigNode(node)
                      const isCursor = activeInstance?.cursorNodeId === node.id
                      const isHitl =
                        activeInstance?.status === 'awaiting_hitl' && isCursor
                      const recordStatus = activeInstance?.nodeRecords?.find(
                        (item) => item.nodeId === node.id,
                      )?.status
                      const runTone =
                        phase === 'run'
                          ? toneFromNodeRecordStatus(recordStatus, {
                              isCursor,
                              instanceAwaitingHitl:
                                activeInstance?.status === 'awaiting_hitl',
                            })
                          : null
                      const isAgentDuty =
                        !configSatellite && (node.type ?? 'agent') === 'agent'
                      // Compact chip only on L1 surface; L2 shows full Agent cards + wiring.
                      const inWorkGroup =
                        !focusedWorkGroupId && isWorkGroupMemberAgent(node)
                      const incomplete = configSatellite
                        ? !node.satelliteKind
                        : !node.prompt.trim()
                      const wiringLayout =
                        isAgentDuty && !inWorkGroup
                          ? buildAgentWiringLayout(node, draft)
                          : null
                      const size = nodeBoxSize(node, draft, sizeOpts)
                      const portSize = workflowPortBoxSize(node, draft, sizeOpts)
                      const visual = visualForIntentNode(node)
                      const diamond = isDiamondLoopNode(node)
                      const NodeIcon = visual.Icon
                      const ConfigIcon = satelliteIcon(node.satelliteKind)
                      const categoryClass =
                        visual.categoryClass === 'catAgent'
                          ? styles.catAgent
                          : visual.categoryClass === 'catAction'
                            ? styles.catAction
                            : visual.categoryClass === 'catLogic'
                              ? styles.catLogic
                              : visual.categoryClass === 'catHuman'
                                ? styles.catHuman
                                : visual.categoryClass === 'catConfig'
                                  ? styles.catConfig
                                  : styles.catDraft
                      const modelWired = Boolean(
                        wiringLayout?.slots.some(
                          (slot) => slot.port === 'model' && slot.satelliteId,
                        ),
                      )
                      const isCoordinator = workGroups.some(
                        (group) => group.coordinatorNodeId === node.id,
                      )
                      return (
                        <div
                          key={node.id}
                          className={`${styles.node} ${categoryClass} ${
                            configSatellite ? styles.nodeConfig : ''
                          } ${
                            isAgentDuty && !inWorkGroup ? styles.nodeAgentWired : ''
                          } ${inWorkGroup ? styles.nodeWorkGroupMember : ''} ${
                            diamond ? styles.nodeDiamond : ''
                          } ${
                            selectedNodeId === node.id ? styles.nodeActive : ''
                          } ${connectingFromId === node.id ? styles.nodeConnecting : ''} ${
                            incomplete && !inWorkGroup ? styles.nodeIncomplete : ''
                          } ${isCursor && phase === 'run' ? styles.nodeRunning : ''} ${
                            isHitl ? styles.nodeHitl : ''
                          } ${
                            runTone === 'succeeded'
                              ? styles.nodeSucceeded
                              : runTone === 'failed' || runTone === 'blocked'
                                ? styles.nodeFailed
                                : runTone === 'waiting' || runTone === 'waiting_approval'
                                  ? styles.nodeHitl
                                  : ''
                          } ${
                            visual.integrationIconKey && !inWorkGroup
                              ? styles.nodeSaas
                              : ''
                          } ${
                            visual.defaultRuntimeStatus &&
                            runtimeStatusBlocksExecution(visual.defaultRuntimeStatus)
                              ? styles.nodeSaasBlocked
                              : ''
                          } ${
                            workGroupExitGhost?.nodeId === node.id
                              ? styles.nodeWorkGroupMemberDragging
                              : ''
                          }`}
                          style={{
                            left: node.position.x,
                            top: node.position.y,
                            width: size.width,
                            minHeight: size.height,
                            ...(diamond || inWorkGroup
                              ? { height: size.height, minHeight: size.height }
                              : null),
                          }}
                          data-loop-node={node.id}
                          data-loop-node-status={runTone ?? undefined}
                          data-loop-integration={visual.integrationId ?? undefined}
                          data-loop-runtime-status={visual.defaultRuntimeStatus ?? undefined}
                          aria-label={`${visual.shortLabel}: ${node.title || ts('chat.loopGraph.untitledNode')}`}
                          onDoubleClick={(event) => {
                            if (diamond) {
                              const t = event.target as Element | null
                              if (
                                !t?.closest?.('[data-loop-diamond-hit]') &&
                                !t?.closest?.('[data-loop-port]')
                              ) {
                                return
                              }
                            }
                            event.stopPropagation()
                            if (configSatellite) {
                              const kind =
                                node.satelliteKind === 'model' ||
                                node.satelliteKind === 'skill' ||
                                node.satelliteKind === 'mcp'
                                  ? node.satelliteKind
                                  : null
                              if (kind) {
                                setSatelliteFillPicker({
                                  nodeId: node.id,
                                  kind,
                                  anchor: { x: event.clientX, y: event.clientY },
                                })
                              }
                              return
                            }
                            openDutyCard(node.id)
                          }}
                          onContextMenu={(event) => {
                            if (phase !== 'draw') return
                            if (diamond) {
                              const t = event.target as Element | null
                              if (
                                !t?.closest?.('[data-loop-diamond-hit]') &&
                                !t?.closest?.('[data-loop-port]')
                              ) {
                                return
                              }
                            }
                            event.preventDefault()
                            event.stopPropagation()
                            // Cancel any accidental drag started before contextmenu.
                            nodeDragRef.current = null
                            setSelectedNodeId(node.id)
                            setContextMenu({
                              kind: 'node',
                              x: event.clientX,
                              y: event.clientY,
                              nodeId: node.id,
                              isAgentNode: isAgentDuty,
                              restoreFocusTo: event.currentTarget,
                            })
                          }}
                          onPointerDown={(event) => {
                            // Ignore right/middle click so contextmenu is not stolen by
                            // pointer capture on the canvas (which only showed "Add node").
                            if (event.button !== 0) return
                            const clickWorld = clientToWorld(event.clientX, event.clientY)
                            const hitPortEl = (event.target as HTMLElement | null)
                              ?.closest?.('[data-loop-port]') as HTMLElement | null
                            const hitPortAttr = hitPortEl?.getAttribute(
                              'data-loop-port',
                            ) as IntentEdgePort | null
                            const hitPortIndexRaw =
                              hitPortEl?.getAttribute('data-loop-port-index')
                            const hitPortIndex = hitPortIndexRaw
                              ? Number.parseInt(hitPortIndexRaw, 10)
                              : 0
                            const hitConfigPort = (event.target as HTMLElement | null)
                              ?.closest?.('[data-loop-config-port]')
                              ?.getAttribute('data-loop-config-port') as
                              | LoopAgentConfigPort
                              | null
                            const hitDiamondSurface = Boolean(
                              (event.target as HTMLElement | null)?.closest?.(
                                '[data-loop-diamond-hit]',
                              ),
                            )
                            // Diamond AABB corners are empty — only the painted
                            // rhombus (or its ports) may start a drag/select.
                            if (diamond && !hitPortAttr && !hitConfigPort) {
                              const inShape =
                                hitDiamondSurface ||
                                pointInFlatDiamond(
                                  clickWorld.x - node.position.x,
                                  clickWorld.y - node.position.y,
                                  size.width,
                                  size.height,
                                )
                              if (!inShape) return
                            }
                            event.stopPropagation()
                            setSelectedNodeId(node.id)
                            if (
                              phase === 'draw' &&
                              !configSatellite &&
                              !connectingFromId
                            ) {
                              void beginFocusedEdit({ type: 'node', id: node.id })
                            }
                            if (connectingFromId) {
                              if (
                                connectingFromId !== node.id &&
                                connectingWorkGroup
                              ) {
                                const targetAllowed = workflowPortsForNode(
                                  node,
                                  draft,
                                )
                                const targetPort =
                                  hitPortAttr && targetAllowed.includes(hitPortAttr)
                                    ? hitPortAttr
                                    : nearestPort(
                                        node,
                                        clickWorld,
                                        portSize.width,
                                        portSize.height,
                                        targetAllowed,
                                      )
                                void beginAuthorEdge(connectingFromId, node.id, {
                                  workGroupPort:
                                    connectingWorkGroupPortRef.current ?? 'out',
                                  targetPort,
                                  targetPortIndex: Number.isFinite(hitPortIndex)
                                    ? hitPortIndex
                                    : 0,
                                }).then(() => {
                                  setPointerWorld(null)
                                  connectingWorkGroupPortRef.current = null
                                  connectingSourceSlotRef.current = null
                                })
                              } else if (
                                connectingFromId !== node.id &&
                                connectingSource
                              ) {
                                const targetAllowed = workflowPortsForNode(
                                  node,
                                  draft,
                                )
                                const sourceAllowed = workflowPortsForNode(
                                  connectingSource,
                                  draft,
                                )
                                // Config hit → provides into strip ports; otherwise
                                // full N/E/S/W workflow (Agent S kept clear of MCP).
                                const targetPort = hitConfigPort
                                  ? ('s' as IntentEdgePort)
                                  : hitPortAttr &&
                                      targetAllowed.includes(hitPortAttr)
                                    ? hitPortAttr
                                    : nearestPort(
                                        node,
                                        clickWorld,
                                        portSize.width,
                                        portSize.height,
                                        targetAllowed,
                                      )
                                const sourcePorts = workflowPortBoxSize(
                                  connectingSource,
                                  draft,
                                  sizeOpts,
                                )
                                const sourceSlot = connectingSourceSlotRef.current
                                const sourcePort =
                                  sourceSlot?.port &&
                                  sourceAllowed.includes(sourceSlot.port)
                                    ? sourceSlot.port
                                    : nearestPort(
                                        connectingSource,
                                        portPoint(
                                          node,
                                          targetPort,
                                          portSize.width,
                                          portSize.height,
                                        ),
                                        sourcePorts.width,
                                        sourcePorts.height,
                                        sourceAllowed,
                                      )
                                void beginAuthorEdge(connectingFromId, node.id, {
                                  sourcePort,
                                  targetPort,
                                  sourcePortIndex: sourceSlot?.index ?? 0,
                                  targetPortIndex: Number.isFinite(hitPortIndex)
                                    ? hitPortIndex
                                    : 0,
                                  ...(hitConfigPort
                                    ? { configPort: hitConfigPort, kind: 'provides' }
                                    : {}),
                                }).then(() => {
                                  setPointerWorld(null)
                                  connectingSourceSlotRef.current = null
                                  if (hitConfigPort) return
                                  const agents: string[] = []
                                  if (sourcePort === 's') agents.push(connectingFromId)
                                  if (targetPort === 's') agents.push(node.id)
                                  if (agents.length > 0) clearSouthCorridorsForAgents(agents)
                                })
                              }
                              return
                            }
                            const followers =
                              isAgentDuty
                                ? draft.edges
                                    .filter(
                                      (edge) =>
                                        edge.kind === 'provides' &&
                                        edge.target === node.id,
                                    )
                                    .map((edge) =>
                                      draft.nodes.find(
                                        (item) =>
                                          item.id === edge.source &&
                                          isConfigNode(item),
                                      ),
                                    )
                                    .filter(
                                      (item): item is IntentGraphNode =>
                                        Boolean(item),
                                    )
                                    .map((item) => ({
                                      id: item.id,
                                      ox: item.position.x,
                                      oy: item.position.y,
                                    }))
                                : []
                            const homeWorkGroupId = !focusedWorkGroupId
                              ? node.workGroupId ||
                                workGroups.find((group) =>
                                  group.memberNodeIds.includes(node.id),
                                )?.id
                              : undefined
                            const lockToMatrix =
                              Boolean(homeWorkGroupId) &&
                              isWorkGroupSurfaceAgent(node)
                            if (lockToMatrix && homeWorkGroupId) {
                              const homeGroup = workGroups.find(
                                (group) => group.id === homeWorkGroupId,
                              )
                              if (homeGroup) {
                                // Freeze dashed frame for the whole exit gesture.
                                frozenWorkGroupFrameRef.current = {
                                  workGroupId: homeWorkGroupId,
                                  bounds: workGroupFrameBounds(homeGroup),
                                }
                              }
                            } else {
                              frozenWorkGroupFrameRef.current = null
                            }
                            nodeDragRef.current = {
                              id: node.id,
                              ox: node.position.x,
                              oy: node.position.y,
                              px: event.clientX,
                              py: event.clientY,
                              followers: lockToMatrix ? [] : followers,
                              workGroupLocked: lockToMatrix,
                              ...(homeWorkGroupId
                                ? { homeWorkGroupId }
                                : {}),
                            }
                            // Capture on the canvas so locked-drag moves hit the
                            // handler that refuses to mutate member positions.
                            canvasRef.current?.setPointerCapture?.(event.pointerId)
                          }}
                        >
                          {!configSatellite &&
                            (connectingFromId || selectedNodeId === node.id) &&
                            loopNodePortSlots(
                              node,
                              portSize.width,
                              portSize.height,
                              workflowPortsForNode(node, draft),
                            ).map((slot) => {
                              const point = portPoint(
                                node,
                                slot.port,
                                portSize.width,
                                portSize.height,
                                slot.along,
                              )
                              const active =
                                connectingFromId === node.id &&
                                previewRoute?.sourcePort === slot.port &&
                                (connectingSourceSlotRef.current?.index ??
                                  0) === slot.index
                              return (
                                <span
                                  key={`${slot.port}:${slot.index}`}
                                  className={`${styles.port} ${active ? styles.portActive : ''}`}
                                  style={{
                                    left: point.x - node.position.x,
                                    top: point.y - node.position.y,
                                  }}
                                  data-loop-port={slot.port}
                                  data-loop-port-index={slot.index}
                                  aria-hidden
                                  onPointerDown={(event) => {
                                    event.stopPropagation()
                                    event.preventDefault()
                                    const seed = clientToWorld(event.clientX, event.clientY)
                                    if (
                                      connectingFromId &&
                                      connectingFromId !== node.id &&
                                      connectingSource
                                    ) {
                                      const sourcePorts = workflowPortBoxSize(
                                        connectingSource,
                                        draft,
                                        sizeOpts,
                                      )
                                      const sourceSlot =
                                        connectingSourceSlotRef.current
                                      const sourcePort =
                                        sourceSlot?.port ??
                                        nearestPort(
                                          connectingSource,
                                          portPoint(
                                            node,
                                            slot.port,
                                            portSize.width,
                                            portSize.height,
                                            slot.along,
                                          ),
                                          sourcePorts.width,
                                          sourcePorts.height,
                                          workflowPortsForNode(
                                            connectingSource,
                                            draft,
                                          ),
                                        )
                                      void beginAuthorEdge(
                                        connectingFromId,
                                        node.id,
                                        {
                                          sourcePort,
                                          targetPort: slot.port,
                                          sourcePortIndex:
                                            sourceSlot?.index ?? 0,
                                          targetPortIndex: slot.index,
                                        },
                                      ).then(() => {
                                        setPointerWorld(null)
                                        connectingSourceSlotRef.current = null
                                        const agents: string[] = []
                                        if (sourcePort === 's') {
                                          agents.push(connectingFromId)
                                        }
                                        if (slot.port === 's') {
                                          agents.push(node.id)
                                        }
                                        if (agents.length > 0) {
                                          clearSouthCorridorsForAgents(agents)
                                        }
                                      })
                                      return
                                    }
                                    startConnectFrom(
                                      node.id,
                                      seed,
                                      slot.port,
                                      slot.index,
                                    )
                                  }}
                                />
                              )
                            })}
                          {configSatellite ? (
                            <span
                              className={`${styles.nodeConfigLogo} ${categoryClass}`}
                              title={node.title || visual.shortLabel}
                              aria-hidden
                            >
                              <ConfigIcon size={18} strokeWidth={1.75} />
                            </span>
                          ) : visual.integrationId && visual.integrationIconKey ? (
                            <LoopSaaSNodeCard
                              embedded
                              integrationId={visual.integrationId}
                              operationLabel={
                                visual.operationLabel ?? visual.shortLabel
                              }
                              titleOverride={node.title || undefined}
                              runtimeStatus={visual.defaultRuntimeStatus}
                              state={(() => {
                                if (selectedNodeId === node.id) return 'selected'
                                if (isCursor && phase === 'run') return 'running'
                                if (isHitl) return 'awaiting_hitl'
                                if (
                                  runTone === 'failed' ||
                                  runTone === 'blocked'
                                ) {
                                  return 'error'
                                }
                                if (runTone === 'succeeded') return 'complete'
                                return 'idle'
                              })() as LoopSaaSNodeCardState}
                            />
                          ) : diamond ? (
                            <LoopDiamondAutosize
                              shellClassName={styles.nodeDiamondShell}
                              bodyClassName={styles.nodeDiamondBody}
                              onBoxSize={(box) => reportDiamondBox(node.id, box)}
                            >
                              <div className={styles.nodeTop}>
                                {runTone ? (
                                  <span
                                    className={`${styles.statusDot} ${styles[`status_${runTone}`] ?? ''}`}
                                    title={runTone}
                                    aria-label={runTone}
                                  />
                                ) : null}
                                <span
                                  className={`${styles.nodeIcon} ${categoryClass}`}
                                  title={visual.shortLabel}
                                  aria-hidden
                                >
                                  <NodeIcon size={15} strokeWidth={1.75} />
                                </span>
                                <span className={styles.nodeTitle}>
                                  {node.title || visual.shortLabel}
                                </span>
                                {incomplete ? (
                                  <span className={styles.incompleteMark}>
                                    {ts('chat.loopGraph.incomplete')}
                                  </span>
                                ) : null}
                              </div>
                              <div className={styles.nodeTask}>
                                {node.prompt.trim()
                                  ? node.prompt
                                  : ts('chat.loopGraph.descriptionEmpty')}
                              </div>
                            </LoopDiamondAutosize>
                          ) : inWorkGroup ? (
                            <div className={styles.nodeWorkGroupMemberInner}>
                              {runTone ? (
                                <span
                                  className={`${styles.statusDot} ${styles[`status_${runTone}`] ?? ''}`}
                                  title={runTone}
                                  aria-label={runTone}
                                />
                              ) : null}
                              <span
                                className={`${styles.nodeIcon} ${categoryClass}`}
                                title={visual.shortLabel}
                                aria-hidden
                              >
                                <NodeIcon size={13} strokeWidth={1.75} />
                              </span>
                              <span className={styles.nodeTitle}>
                                {node.title || visual.shortLabel}
                              </span>
                              {isCoordinator ? (
                                <span
                                  className={styles.nodeWorkGroupCrown}
                                  title={ts('chat.loopGraph.workGroup.coordinator')}
                                >
                                  <Crown size={11} strokeWidth={1.75} aria-hidden />
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              <div className={styles.nodeTop}>
                                {runTone ? (
                                  <span
                                    className={`${styles.statusDot} ${styles[`status_${runTone}`] ?? ''}`}
                                    title={runTone}
                                    aria-label={runTone}
                                  />
                                ) : null}
                                <span
                                  className={`${styles.nodeIcon} ${categoryClass}`}
                                  title={visual.shortLabel}
                                  aria-hidden
                                >
                                  <NodeIcon size={15} strokeWidth={1.75} />
                                </span>
                                <span className={styles.nodeTitle}>
                                  {node.title || visual.shortLabel}
                                </span>
                                {incomplete ? (
                                  <span className={styles.incompleteMark}>
                                    {ts('chat.loopGraph.incomplete')}
                                  </span>
                                ) : null}
                              </div>
                              <div className={styles.nodeTask}>
                                {node.prompt.trim()
                                  ? node.prompt
                                  : ts('chat.loopGraph.descriptionEmpty')}
                              </div>
                            </>
                          )}
                          {isAgentDuty && wiringLayout ? (
                            <>
                              <div className={styles.wiringStrip}>
                                {wiringLayout.groups.map((group) => {
                                  const def = AGENT_WIRING_PORTS.find(
                                    (item) => item.id === group.port,
                                  )
                                  if (!def) return null
                                  const PortIcon = def.Icon
                                  const warn =
                                    group.port === 'model' && !modelWired
                                  const wired = group.slotIndexes.some(
                                    (index) =>
                                      wiringLayout.slots[index]?.satelliteId,
                                  )
                                  return (
                                    <button
                                      key={group.port}
                                      type="button"
                                      className={`${styles.wiringIconButton} ${
                                        warn ? styles.wiringIconButtonWarn : ''
                                      } ${wired ? styles.wiringIconButtonWired : ''}`}
                                      style={{ left: group.buttonX }}
                                      title={ts(
                                        `chat.loopGraph.wiringPort_${group.port}`,
                                      )}
                                      aria-label={ts(
                                        `chat.loopGraph.wiringPort_${group.port}`,
                                      )}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setWiringPicker({
                                          agentNodeId: node.id,
                                          kind:
                                            group.port === 'skill'
                                              ? 'skill'
                                              : group.port,
                                          anchor: {
                                            x: event.clientX,
                                            y: event.clientY,
                                          },
                                        })
                                      }}
                                      onPointerDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      <PortIcon
                                        size={14}
                                        strokeWidth={1.75}
                                        aria-hidden
                                      />
                                    </button>
                                  )
                                })}
                              </div>
                              {wiringLayout.slots.map((slot, slotIndex) => {
                                const point = slotLocalPoint(
                                  wiringLayout,
                                  slotIndex,
                                )
                                return (
                                  <span
                                    key={slot.key}
                                    className={`${styles.port} ${styles.portConfigHidden}`}
                                    style={{ left: point.x, top: point.y }}
                                    data-loop-config-port={slot.port}
                                    data-loop-config-slot={slot.key}
                                    aria-hidden
                                    onPointerDown={(event) => {
                                      event.stopPropagation()
                                      event.preventDefault()
                                      if (
                                        connectingFromId &&
                                        connectingFromId !== node.id &&
                                        connectingSource
                                      ) {
                                        void beginAuthorEdge(
                                          connectingFromId,
                                          node.id,
                                          {
                                            sourcePort: 'n',
                                            targetPort: 's',
                                            configPort: slot.port,
                                            kind: 'provides',
                                          },
                                        ).then(() => setPointerWorld(null))
                                        return
                                      }
                                      startConnectFrom(
                                        node.id,
                                        {
                                          x: node.position.x + point.x,
                                          y: node.position.y + point.y,
                                        },
                                        's',
                                      )
                                    }}
                                  />
                                )
                              })}
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                    {workGroupExitGhost ? (
                      <div
                        className={`${styles.node} ${styles.catAgent} ${styles.nodeWorkGroupMember} ${styles.nodeWorkGroupExitGhost}`}
                        style={{
                          left: workGroupExitGhost.x,
                          top: workGroupExitGhost.y,
                          width: workGroupExitGhost.width,
                          height: workGroupExitGhost.height,
                          minHeight: workGroupExitGhost.height,
                        }}
                        data-loop-work-group-exit-ghost=""
                        aria-hidden
                      >
                        <div className={styles.nodeWorkGroupMemberInner}>
                          <span className={styles.nodeTitle}>
                            {workGroupExitGhost.title}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  </>
                )}
              </div>
            )}

            {phase === 'draw' && document ? <LoopGoalComposer /> : null}

            {(() => {
              const dutyNode = dutyCardNodeId
                ? document?.draft.nodes.find((item) => item.id === dutyCardNodeId)
                : null
              if (!dutyNode || phase === 'review') return null
              const canvasEl = canvasRef.current
              // Host covers the whole stage (canvas + composer). Keep the card
              // fully inside the canvas band so composer never covers the form.
              const canvasW = canvasEl?.clientWidth ?? canvasSize.width
              const canvasH = canvasEl?.clientHeight ?? canvasSize.height
              const cardW = Math.min(380, Math.max(280, canvasW - 24))
              const cardH = Math.min(520, Math.max(280, canvasH - 16))
              let left =
                viewport.x + (dutyNode.position.x + NODE_W) * viewport.scale + 12
              let top = viewport.y + dutyNode.position.y * viewport.scale
              if (left + cardW > canvasW - 8) {
                left =
                  viewport.x + dutyNode.position.x * viewport.scale - cardW - 12
              }
              left = Math.max(8, Math.min(left, canvasW - cardW - 8))
              top = Math.max(8, Math.min(top, canvasH - cardH - 8))
              return (
                <div className={styles.dutyCardHost} data-loop-duty-host="">
                  <LoopNodeDutyCard
                    node={dutyNode}
                    specNode={
                      document?.approvedSpecs
                        .at(-1)
                        ?.nodes.find((item) => item.id === dutyNode.id) ?? null
                    }
                    activeInstance={activeInstance}
                    readOnly={phase !== 'draw'}
                    left={left}
                    top={top}
                    onClose={() => setDutyCardNodeId(null)}
                    onChange={(patch) => {
                      if (phase !== 'draw') return
                      updateNode(dutyNode.id, patch)
                    }}
                  />
                </div>
              )
            })()}

            {phase === 'run' ? (
              <div className={styles.runPanel}>
                <LoopRunMaterialsPanel />
                {activeInstance?.status === 'awaiting_hitl' ? (
                  <div className={styles.hitlActions}>
                    {(activeInstance.hitlQuestionIds ?? ['continue']).map((questionId) => {
                      const isApproval = questionId.includes('approval')
                      const isReview = questionId.includes('review')
                      return (
                        <div key={questionId} className={styles.hitlGroup}>
                          <div className={styles.runEvent}>{questionId}</div>
                          {isApproval ? (
                            <>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                data-loop-hitl-approve=""
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'approve',
                                      editedPayload: { approved: true },
                                    },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlApprove')}
                              </button>
                              <button
                                type="button"
                                className={styles.actionButton}
                                data-loop-hitl-reject=""
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'reject' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlReject')}
                              </button>
                              <button
                                type="button"
                                className={styles.actionButton}
                                data-loop-hitl-takeover=""
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'takeover',
                                      editedPayload: { humanTakeover: true },
                                    },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlTakeover')}
                              </button>
                            </>
                          ) : null}
                          {isReview ? (
                            <>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'accept' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlAccept')}
                              </button>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() =>
                                  void resolveHitl([
                                    { questionId, answer: 'request_changes' },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlRequestChanges')}
                              </button>
                            </>
                          ) : null}
                          {!isApproval && !isReview ? (
                            <>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'stop' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlStop')}
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'continue' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlContinue')}
                              </button>
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                {activeInstance ? (
                  <LoopRunSidePanel
                    instance={activeInstance}
                    history={runHistory}
                  />
                ) : null}
              </div>
            ) : null}
            {phase === 'draw' && selectedWorkGroupId
              ? (() => {
                  const selectedGroup = workGroups.find(
                    (group) => group.id === selectedWorkGroupId,
                  )
                  if (!selectedGroup) return null
                  const members = selectedGroup.memberNodeIds
                    .map((id) => draft.nodes.find((node) => node.id === id))
                    .filter((node): node is IntentGraphNode => Boolean(node))
                  return (
                    <div className={styles.workGroupPanel} data-loop-work-group-panel="">
                      <h3 className={styles.workGroupPanelTitle}>
                        {selectedGroup.title}
                      </h3>
                      <div className={styles.workGroupPanelRow}>
                        <label className={styles.workGroupPanelLabel} htmlFor="loop-wg-mode">
                          {ts('chat.loopGraph.workGroup.mode.label')}
                        </label>
                        <select
                          id="loop-wg-mode"
                          className={styles.workGroupPanelSelect}
                          value={selectedGroup.collaborationMode}
                          onChange={(event) =>
                            updateWorkGroup(selectedGroup.id, {
                              collaborationMode: event.target
                                .value as LoopWorkGroupCollaborationMode,
                            })
                          }
                        >
                          <option value="coordinator">
                            {ts('chat.loopGraph.workGroup.mode.coordinator')}
                          </option>
                          <option value="serial">
                            {ts('chat.loopGraph.workGroup.mode.serial')}
                          </option>
                          <option value="parallel_join">
                            {ts('chat.loopGraph.workGroup.mode.parallel_join')}
                          </option>
                        </select>
                      </div>
                      {selectedGroup.collaborationMode === 'coordinator' ? (
                        <div className={styles.workGroupPanelRow}>
                          <label
                            className={styles.workGroupPanelLabel}
                            htmlFor="loop-wg-coordinator"
                          >
                            {ts('chat.loopGraph.workGroup.coordinator')}
                          </label>
                          <select
                            id="loop-wg-coordinator"
                            className={styles.workGroupPanelSelect}
                            value={selectedGroup.coordinatorNodeId ?? ''}
                            onChange={(event) =>
                              updateWorkGroup(selectedGroup.id, {
                                coordinatorNodeId: event.target.value || null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {members.map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.title || ts('chat.loopGraph.untitledNode')}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={styles.workGroupPanelDissolve}
                        onClick={() => dissolveWorkGroup(selectedGroup.id)}
                      >
                        {ts('chat.loopGraph.workGroup.dissolve')}
                      </button>
                    </div>
                  )
                })()
              : null}
          </div>
          {phase === 'draw' ? (
            <LoopGraphPalette
              onPlaced={(id) => {
                const isWorkGroup = (document?.draft.workGroups ?? []).some(
                  (group) => group.id === id,
                )
                if (isWorkGroup) selectWorkGroup(id)
                else setSelectedNodeId(id)
              }}
              resolveClickPosition={() => {
                const rect = canvasRef.current?.getBoundingClientRect()
                if (!rect) return { x: 80, y: 80 }
                return {
                  x: (rect.width / 2 - viewport.x) / viewport.scale,
                  y: (rect.height / 2 - viewport.y) / viewport.scale,
                }
              }}
            />
          ) : null}
        </div>
      </div>

      <LoopGraphContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onCreateNode={addNodeAt}
        onCreateAgent={() => {
          beginCreateAgentComposer('loop')
          void setComposerMode('create_agent')
        }}
        onConnectFrom={(nodeId) => startConnectFrom(nodeId)}
        onOpenDuty={openDutyCard}
        onSwitchAgent={(nodeId, anchor) => {
          setSwitchAgentMenu({ nodeId, x: anchor.x, y: anchor.y })
          if (client?.listWorkforceAgents && project) {
            setAgentsLoading(true)
            void client
              .listWorkforceAgents({ projectId: project.projectId })
              .then((result) => setWorkforceAgents(result.agents))
              .catch(() => setWorkforceAgents([]))
              .finally(() => setAgentsLoading(false))
          }
        }}
        onApplyWiring={(nodeId) => {
          const bound = draft.nodes.find((node) => node.id === nodeId)?.agentDefinitionId
          if (!bound) {
            pushToast({
              type: 'info',
              message: ts('chat.loopGraph.wiringApplyNeedsAgent'),
              autoDismiss: 4200,
            })
            return
          }
          if (!window.confirm(ts('chat.loopGraph.wiringApplyConfirm'))) return
          void applyWiringToAgentDefinition(nodeId)
        }}
        onSaveWiringAsAgent={(nodeId) => {
          const node = draft.nodes.find((item) => item.id === nodeId)
          const name = window.prompt(
            ts('chat.loopGraph.wiringSaveAsPrompt'),
            node?.title || 'Specialized Agent',
          )
          if (name == null) return
          void saveWiringAsNewAgent(nodeId, {
            displayName: name.trim() || node?.title,
          })
        }}
        onDeleteNode={(nodeId) => setPendingDelete({ type: 'node', id: nodeId })}
        onDeleteEdge={(edgeId) => setPendingDelete({ type: 'edge', id: edgeId })}
      />

      {wiringPicker
        ? createPortal(
            <LoopConfigAssetPicker
              kind={wiringPicker.kind}
              anchor={wiringPicker.anchor}
              onCancel={() => setWiringPicker(null)}
              onPick={(asset) => {
                const agentNodeId = wiringPicker.agentNodeId
                setWiringPicker(null)
                void placeWiredAsset(agentNodeId, asset)
              }}
            />,
            globalThis.document.body,
          )
        : null}

      {satelliteFillPicker
        ? createPortal(
            <LoopConfigAssetPicker
              kind={satelliteFillPicker.kind}
              anchor={satelliteFillPicker.anchor}
              onCancel={() => setSatelliteFillPicker(null)}
              onPick={(asset) => {
                const nodeId = satelliteFillPicker.nodeId
                setSatelliteFillPicker(null)
                if (asset.kind === 'model') {
                  updateConfigSatellite(nodeId, {
                    title: `Model · ${asset.name}`,
                    configRef: { modelProfileId: asset.id },
                  })
                  return
                }
                if (asset.kind === 'skill') {
                  updateConfigSatellite(nodeId, {
                    title: `Skill · ${asset.name}`,
                    configRef: { skillId: asset.id },
                  })
                  return
                }
                updateConfigSatellite(nodeId, {
                  title: `MCP · ${asset.name}`,
                  configRef: { mcpServerId: asset.id },
                })
              }}
            />,
            globalThis.document.body,
          )
        : null}

      {switchAgentMenu
        ? createPortal(
            <div
              className={styles.switchAgentPopover}
              style={{ left: switchAgentMenu.x, top: switchAgentMenu.y }}
              data-zone-interactive
              onMouseDown={(event) => event.stopPropagation()}
            >
              <AgentPicker
                agents={workforceAgents}
                selectedDefinitionId={
                  draft.nodes.find((node) => node.id === switchAgentMenu.nodeId)
                    ?.agentDefinitionId ?? null
                }
                loading={agentsLoading}
                onSelectGeneral={() => {
                  setNodeAgentDefinition(switchAgentMenu.nodeId, null, {
                    wiringBase: { skillIds: [], mcpServerIds: [] },
                  })
                  setSwitchAgentMenu(null)
                }}
                onSelectAgent={(definitionId) => {
                  const match = workforceAgents.find((agent) => agent.definitionId === definitionId)
                  const listingId = match?.config.marketplaceProvenance?.listingId
                  const catalogListings =
                    useWorkbenchStore.getState().agentCatalogView?.document.listings ?? []
                  const template = listingId
                    ? catalogListings.find((entry) => entry.id === listingId)
                    : undefined
                  const defaultModelId =
                    settings?.execution?.defaultModelProfileId ??
                    settings?.modelProfiles?.find((profile) => profile.isDefault)?.id ??
                    settings?.modelProfiles?.[0]?.id
                  setNodeAgentDefinition(switchAgentMenu.nodeId, definitionId, {
                    title: match?.config.displayName,
                    wiringBase: match
                      ? {
                          modelProfileId:
                            match.config.modelProfileId ?? defaultModelId ?? undefined,
                          skillIds: match.config.skillIds ?? [],
                          mcpServerIds: match.config.mcpServerIds ?? [],
                        }
                      : undefined,
                    ...(template?.suggestedLoopAgentRole
                      ? { agentRole: template.suggestedLoopAgentRole }
                      : {}),
                  })
                  setSwitchAgentMenu(null)
                }}
                onBrowseTalentLibrary={() => {
                  setSwitchAgentMenu(null)
                  openMarketplaceTalentLibrary()
                }}
                onCreateAgent={() => {
                  setSwitchAgentMenu(null)
                  beginCreateAgentComposer('loop')
                  void setComposerMode('create_agent')
                }}
              />
            </div>,
            globalThis.document.body,
          )
        : null}

      {pendingDelete ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={pendingDeleteLabel}
          >
            <p>{pendingDeleteLabel}</p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setPendingDelete(null)}
              >
                {ts('chat.loopGraph.deleteCancel')}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void refineAuthoringTarget(pendingDelete)}
              >
                {ts('chat.loopGraph.deleteRefine')}
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                onClick={() => void removeAuthoringTarget(pendingDelete)}
              >
                {ts('chat.loopGraph.deleteRemove')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </GraphOverlayFrame>
  )
}
