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
  areRequiredDutiesComplete,
  computeLoopLayerFrameBounds,
  computeLoopWorkGroupFrameBounds,
  defaultEmptyLoopWorkGroupFrame,
  hasDutyAssignment,
  isConfigNode,
  isIntentGraphReadyForCompile,
  getLoopDepartmentTemplate,
  isLoopDepartmentPaletteItem,
  resolveLoopWorkGroupTaskTitle,
  isWorkGroupEndpoint,
  isNestedWorkGroupInteriorNode,
  isWorkGroupSurfaceAgent,
  listWorkGroupSurfaceAgentIds,
  LOOP_PALETTE_ITEMS,
  LOOP_WORK_GROUP_PORTS,
  listStaffableCuratedPaletteIds,
  loopWorkGroupPortWorld,
  normalizeLoopWorkGroupPort,
  normalizeMarqueeRect,
  oppositeLoopWorkGroupPort,
  pickNodesInMarquee,
  resizeRectFromEdge,
  sessionGraphShieldCssInsets,
  type AgentDefinition,
  type IntentEdgePort,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
  type LoopAgentConfigPort,
  type LoopLayerRect,
  type LoopLayerResizeEdge,
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
import LoopWiringListPopover from './LoopWiringListPopover'
import {
  connectedWiringAssetIds,
  findWiringListForAgent,
  isWiringListKind,
  LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS,
  wiringListMembersOf,
} from '../../../../services/loop-wiring-list'
import { newLoopEntityId } from '../../state/loopAuthoring'
import LoopGraphPalette from './LoopGraphPalette'
import LoopNodeDutyCard from './LoopNodeDutyCard'
import LoopNodeDutyChecklist from './LoopNodeDutyChecklist'
import LoopWorkGroupFrame from './LoopWorkGroupFrame'
import LoopLayerFrame from './LoopLayerFrame'
import layerStyles from './LoopLayerFrame.module.css'
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
  routeLoopEdgePreview,
  routeProvidesCurve,
  snapGraphNodePosition,
} from './loopEdgeRouting'
import { loopNodePortSlots } from './loopPortAssignment'
import { routeAllLoopWorkflowEdges } from './loopEdgeBatchRouting'
import {
  DECISION_BRANCH_LABEL_T,
  decisionBranchLabelPoint,
  decisionBranchPatchForPort,
  isDecisionBranchSourceNode,
  isStockDecisionBranchLabel,
  pointAlongPolyline,
  resolveDecisionBranchDisplayLabel,
  decisionBranchLabelKeyFromBranchKey,
  type DecisionBranchLabelKey,
} from './loopDecisionBranch'
import {
  clientToWorldPoint,
  formatWorldTransform,
  rectIntersectsWorldView,
  visibleWorldRect,
  type LoopGraphViewport,
} from './loopGraphViewport'
import {
  setGeometryChromeDimmed,
  setWorldDomPositions,
  setWorldWorkGroupDomPosition,
} from './loopGraphDragDom'
import styles from './LoopGraphOverlay.module.css'

const DEFAULT_VIEWPORT: LoopGraphViewport = { x: 32, y: 32, scale: 1 }

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
  const appendWiringListMember = useLoopGraphStore((s) => s.appendWiringListMember)
  const removeWiringListMember = useLoopGraphStore((s) => s.removeWiringListMember)
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
  const patchDutyProgress = useLoopGraphStore((s) => s.patchDutyProgress)
  const mutateDutyChecklist = useLoopGraphStore((s) => s.mutateDutyChecklist)
  const runHistory = useLoopGraphStore((s) => s.runHistory)
  const refreshRunHistory = useLoopGraphStore((s) => s.refreshRunHistory)
  const linkActiveSession = useLoopGraphStore((s) => s.linkActiveSession)
  const setCanvasSelectedNodeId = useLoopGraphStore((s) => s.setCanvasSelectedNodeId)
  const selectedWorkGroupId = useLoopGraphStore((s) => s.selectedWorkGroupId)
  const setSelectedWorkGroupId = useLoopGraphStore((s) => s.setSelectedWorkGroupId)
  const selectedLayerId = useLoopGraphStore((s) => s.selectedLayerId)
  const setSelectedLayerId = useLoopGraphStore((s) => s.setSelectedLayerId)
  const createLayerFromMembers = useLoopGraphStore((s) => s.createLayerFromMembers)
  const renameLayer = useLoopGraphStore((s) => s.renameLayer)
  const setLayerColor = useLoopGraphStore((s) => s.setLayerColor)
  const setLayerMembers = useLoopGraphStore((s) => s.setLayerMembers)
  const dissolveLayer = useLoopGraphStore((s) => s.dissolveLayer)
  const renameWorkGroup = useLoopGraphStore((s) => s.renameWorkGroup)
  const pendingWorkGroupTaskEditId = useLoopGraphStore(
    (s) => s.pendingWorkGroupTaskEditId,
  )
  const requestWorkGroupTaskEdit = useLoopGraphStore(
    (s) => s.requestWorkGroupTaskEdit,
  )
  const updateWorkGroup = useLoopGraphStore((s) => s.updateWorkGroup)
  const proposeWorkGroupStaffing = useLoopGraphStore(
    (s) => s.proposeWorkGroupStaffing,
  )
  const confirmWorkGroupStaffingProposal = useLoopGraphStore(
    (s) => s.confirmWorkGroupStaffingProposal,
  )
  const dismissWorkGroupStaffingProposal = useLoopGraphStore(
    (s) => s.dismissWorkGroupStaffingProposal,
  )
  const addNodeToWorkGroup = useLoopGraphStore((s) => s.addNodeToWorkGroup)
  const reflowWorkGroupSurfaceLayout = useLoopGraphStore(
    (s) => s.reflowWorkGroupSurfaceLayout,
  )
  const focusedWorkGroupId = useLoopGraphStore((s) => s.focusedWorkGroupId)
  const enterWorkGroupGraph = useLoopGraphStore((s) => s.enterWorkGroupGraph)
  const exitWorkGroupGraph = useLoopGraphStore((s) => s.exitWorkGroupGraph)
  const removeNodeFromWorkGroup = useLoopGraphStore((s) => s.removeNodeFromWorkGroup)
  const layoutDraftSemantically = useLoopGraphStore(
    (s) => s.layoutDraftSemantically,
  )
  const dissolveWorkGroup = useLoopGraphStore((s) => s.dissolveWorkGroup)
  const moveWorkGroup = useLoopGraphStore((s) => s.moveWorkGroup)
  const beginFocusedEdit = useLoopGraphStore((s) => s.beginFocusedEdit)
  const clearAuthoringFocus = useLoopGraphStore((s) => s.clearAuthoringFocus)
  const canvasSelectedEdgeId = useLoopGraphStore((s) => s.canvasSelectedEdgeId)

  const [viewport, setViewport] = useState<LoopGraphViewport>(DEFAULT_VIEWPORT)
  /** Always mirrors the live camera — including mid-pan DOM-only updates. */
  const viewportRef = useRef<LoopGraphViewport>(DEFAULT_VIEWPORT)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [staffingReason, setStaffingReason] = useState('')
  const [staffingPaletteId, setStaffingPaletteId] = useState('')
  const [diamondBoxes, setDiamondBoxes] = useState<Record<string, DiamondBox>>(
    {},
  )
  const staffablePaletteIds = useMemo(
    () =>
      listStaffableCuratedPaletteIds(LOOP_PALETTE_ITEMS.map((item) => item.id)),
    [],
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
    if (nodeId) {
      setSelectedWorkGroupId(null)
      setSelectedLayerId(null)
    }
    if (!nodeId) clearAuthoringFocus()
  }
  const selectWorkGroup = (workGroupId: string | null) => {
    setSelectedWorkGroupId(workGroupId)
    if (workGroupId) {
      setSelectedNodeIdState(null)
      setCanvasSelectedNodeId(null)
      setSelectedLayerId(null)
      clearAuthoringFocus()
      // Do NOT reflow here — frame size only changes on confirmed join/leave.
    }
  }

  const selectLayer = (layerId: string | null) => {
    setSelectedLayerId(layerId)
    if (layerId) {
      setSelectedNodeIdState(null)
      setCanvasSelectedNodeId(null)
      setSelectedWorkGroupId(null)
      clearAuthoringFocus()
    }
  }

  const [layerMarqueeArmed, setLayerMarqueeArmed] = useState(false)
  const [layerMarqueeRect, setLayerMarqueeRect] = useState<LoopLayerRect | null>(
    null,
  )
  const layerGestureRef = useRef<
    | null
    | { kind: 'create'; x0: number; y0: number }
    | {
        kind: 'resize'
        layerId: string
        edge: LoopLayerResizeEdge
        base: LoopLayerRect
      }
  >(null)

  const cancelLayerGesture = useCallback(() => {
    layerGestureRef.current = null
    setLayerMarqueeRect(null)
    setLayerMarqueeArmed(false)
  }, [])

  const armCreateStageLayer = useCallback(() => {
    layerGestureRef.current = null
    setLayerMarqueeRect(null)
    setLayerMarqueeArmed(true)
    setSelectedWorkGroupId(null)
    setSelectedLayerId(null)
    pushToast({
      type: 'info',
      message: ts('chat.loopGraph.layer.createHint'),
      autoDismiss: 4200,
    })
  }, [pushToast, setSelectedLayerId, setSelectedWorkGroupId, ts])

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
  const [wiringListPopover, setWiringListPopover] = useState<{
    listNodeId: string
    kind: 'mcp' | 'skill'
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

  const commitViewport = useCallback((next: LoopGraphViewport) => {
    viewportRef.current = next
    if (worldRef.current) {
      worldRef.current.style.transform = formatWorldTransform(next)
    }
    setViewport(next)
  }, [])

  const applyViewportDom = useCallback((next: LoopGraphViewport) => {
    viewportRef.current = next
    if (worldRef.current) {
      worldRef.current.style.transform = formatWorldTransform(next)
    }
  }, [])

  // L2 starts at a readable origin after interior layout — reset pan/zoom.
  useEffect(() => {
    if (!focusedWorkGroupId) return
    commitViewport(DEFAULT_VIEWPORT)
  }, [focusedWorkGroupId, commitViewport])

  // Fingerprint L1 chip content so title/prompt edits repack the matrix.
  const workGroupChipFingerprint = useMemo(() => {
    if (!document?.draft.workGroups?.length) return ''
    return (document.draft.workGroups ?? [])
      .map((group) => {
        const surfaceIds = listWorkGroupSurfaceAgentIds(
          group,
          document.draft.nodes,
        )
        return `${group.id}:${surfaceIds
          .map((id) => {
            const node = document.draft.nodes.find((item) => item.id === id)
            if (!node) return id
            return [
              id,
              node.title,
              node.prompt,
              node.dutyItems?.length ?? 0,
            ].join('~')
          })
          .join('|')}`
      })
      .join(';')
  }, [document?.draft.nodes, document?.draft.workGroups])

  // Repack L1 chips when the open document / chip content changes (no-op if packed).
  useEffect(() => {
    if (!document || focusedWorkGroupId || !workGroupChipFingerprint) return
    for (const group of document.draft.workGroups ?? []) {
      reflowWorkGroupSurfaceLayout(group.id)
    }
  }, [
    document,
    focusedWorkGroupId,
    reflowWorkGroupSurfaceLayout,
    workGroupChipFingerprint,
  ])

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
    /** Live DOM positions while dragging (store commits on pointerup). */
    pendingById: Map<string, { x: number; y: number }>
  } | null>(null)
  /**
   * Work-group / department title drag: DOM-only translation mid-gesture,
   * one `moveWorkGroup` commit on pointerup.
   */
  const workGroupDragRef = useRef<{
    id: string
    accDx: number
    accDy: number
    frameStart: { x: number; y: number }
    nodeStarts: Array<{ id: string; x: number; y: number }>
  } | null>(null)
  const edgesLayerRef = useRef<SVGSVGElement | null>(null)
  const branchLabelLayerRef = useRef<HTMLDivElement | null>(null)
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

  const [editingBranchEdgeId, setEditingBranchEdgeId] = useState<string | null>(
    null,
  )
  const [editingBranchDraft, setEditingBranchDraft] = useState('')

  // Keep Condition / Approval branch chips aligned with the live source port.
  // Port change → always refresh branchLabel (每次跟随). Stable port → fill gaps only.
  useEffect(() => {
    if (!document || phase !== 'draw') return
    const draft = document.draft
    const resolveLabel = (key: DecisionBranchLabelKey) =>
      ts(`chat.loopGraph.decisionBranch.${key}`)
    let changed = false
    const nextEdges = draft.edges.map((edge) => {
      if (edge.kind === 'provides') return edge
      const source = draft.nodes.find((node) => node.id === edge.source)
      if (!isDecisionBranchSourceNode(source)) return edge
      const port =
        workflowEdgeRoutes.get(edge.id)?.sourcePort ?? edge.sourcePort ?? 's'
      const patch = decisionBranchPatchForPort(port, source, resolveLabel)
      if (edge.sourcePort !== port) {
        changed = true
        return {
          ...edge,
          ...patch,
          ...(patch.kind ? { kind: patch.kind } : {}),
        }
      }
      let next = edge
      let dirty = false
      if (!edge.sourcePort) {
        next = { ...next, sourcePort: port }
        dirty = true
      }
      if (!edge.branchKey) {
        next = { ...next, branchKey: patch.branchKey }
        dirty = true
      }
      if (!edge.branchLabel?.trim()) {
        next = { ...next, branchLabel: patch.branchLabel }
        dirty = true
      } else {
        const labelKey = decisionBranchLabelKeyFromBranchKey(
          edge.branchKey ?? patch.branchKey,
        )
        // Refresh stock Agree/同意 chips to the active locale without wiping custom text.
        if (
          labelKey &&
          isStockDecisionBranchLabel(edge.branchLabel, labelKey) &&
          edge.branchLabel !== patch.branchLabel
        ) {
          next = { ...next, branchLabel: patch.branchLabel }
          dirty = true
        }
      }
      if (
        patch.kind === 'conditional' &&
        (!edge.kind || edge.kind === 'depends')
      ) {
        next = { ...next, kind: 'conditional' }
        dirty = true
      }
      if (dirty) changed = true
      return dirty ? next : edge
    })
    if (!changed) return
    updateDraft({
      ...draft,
      revision: draft.revision + 1,
      edges: nextEdges,
    })
  }, [document, phase, ts, updateDraft, workflowEdgeRoutes])

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
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (
        !typing &&
        selectedLayerId &&
        phase === 'draw' &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault()
        dissolveLayer(selectedLayerId)
        return
      }
      if (event.key === 'Escape') {
        if (layerMarqueeArmed || layerGestureRef.current) {
          cancelLayerGesture()
          return
        }
        if (connectingFromId) {
          setConnectingFrom(null)
          setPointerWorld(null)
          connectingWorkGroupPortRef.current = null
          connectingSourceSlotRef.current = null
          return
        }
        if (selectedLayerId) {
          setSelectedLayerId(null)
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
    selectedLayerId,
    layerMarqueeArmed,
    contextMenu,
    pendingDelete,
    phase,
    cancelLayerGesture,
    dissolveLayer,
    setConnectingFrom,
    setPendingDelete,
    setLoopGraphOpen,
    setSelectedWorkGroupId,
    setSelectedLayerId,
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
    const tick = window.setInterval(() => {
      void useLoopGraphStore.getState().fireDueSchedules()
    }, 5_000)
    return () => window.clearInterval(tick)
  }, [open])

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
    layers: [],
    layerSeq: 0,
  }
  const workGroups = draft.workGroups ?? []
  const layers = draft.layers ?? []

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
    return clientToWorldPoint(clientX, clientY, rect, viewportRef.current)
  }

  const placeFromPalette = async (
    paletteItemId: string,
    position: { x: number; y: number },
    screenAnchor?: { x: number; y: number },
  ) => {
    if (
      paletteItemId === 'workgroup.create' ||
      isLoopDepartmentPaletteItem(paletteItemId)
    ) {
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

  /** L1 duty nodes only — layers stay on the main loop canvas (not L2). */
  const layerEligibleNodeBounds = () =>
    draft.nodes
      .filter((node) => !isConfigNode(node))
      .filter((node) => !isNestedWorkGroupInteriorNode(node))
      .map((node) => {
        const size = nodeBoxSize(node, draft, sizeOpts)
        return {
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: size.width,
          height: size.height,
        }
      })

  const layerFrameBoundsFor = (memberNodeIds: string[]): LoopLayerRect | null => {
    const byId = new Map(
      layerEligibleNodeBounds().map((bounds) => [bounds.id, bounds]),
    )
    const memberBounds = memberNodeIds
      .map((id) => byId.get(id))
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
    return computeLoopLayerFrameBounds(memberBounds)
  }

  const commitLayerMarquee = (rect: LoopLayerRect) => {
    const memberIds = pickNodesInMarquee(layerEligibleNodeBounds(), rect)
    const gesture = layerGestureRef.current
    layerGestureRef.current = null
    setLayerMarqueeRect(null)
    setLayerMarqueeArmed(false)
    if (!gesture) return
    if (gesture.kind === 'create') {
      if (memberIds.length === 0) {
        pushToast({
          type: 'info',
          message: ts('chat.loopGraph.layer.emptySelection'),
          autoDismiss: 3600,
        })
        return
      }
      const id = createLayerFromMembers(memberIds)
      if (id) selectLayer(id)
      return
    }
    if (memberIds.length === 0) {
      pushToast({
        type: 'info',
        message: ts('chat.loopGraph.layer.emptyResize'),
        autoDismiss: 3600,
      })
      return
    }
    setLayerMembers(gesture.layerId, memberIds)
    selectLayer(gesture.layerId)
  }

  const beginLayerResize = (
    layerId: string,
    edge: LoopLayerResizeEdge,
    event: { clientX: number; clientY: number; pointerId: number },
  ) => {
    const layer = layers.find((item) => item.id === layerId)
    if (!layer) return
    const base = layerFrameBoundsFor(layer.memberNodeIds)
    if (!base) return
    const world = clientToWorld(event.clientX, event.clientY)
    layerGestureRef.current = { kind: 'resize', layerId, edge, base }
    setLayerMarqueeArmed(false)
    setLayerMarqueeRect(resizeRectFromEdge(base, edge, world))
    selectLayer(layerId)
    canvasRef.current?.setPointerCapture?.(event.pointerId)
  }

  const pointInFrame = (
    point: { x: number; y: number },
    bounds: LoopWorkGroupFrameBounds,
  ) =>
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height

  const startConnectFromWorkGroup = (
    workGroupId: string,
    port: LoopWorkGroupPort,
    bounds: LoopWorkGroupFrameBounds,
  ) => {
    connectingWorkGroupPortRef.current = port
    connectingSourceSlotRef.current = null
    setConnectingFrom(workGroupId)
    setPointerWorld(loopWorkGroupPortWorld(bounds, port))
  }

  /** Nearest N/E/S/W attach on a work-group frame for a world-space click. */
  const nearestWorkGroupPort = (
    bounds: LoopWorkGroupFrameBounds,
    world: { x: number; y: number },
  ): LoopWorkGroupPort => {
    let best: LoopWorkGroupPort = 'e'
    let bestDist = Number.POSITIVE_INFINITY
    for (const port of LOOP_WORK_GROUP_PORTS) {
      const point = loopWorkGroupPortWorld(bounds, port)
      const dist =
        (point.x - world.x) ** 2 + (point.y - world.y) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = port
      }
    }
    return best
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
      ? normalizeLoopWorkGroupPort(
          connectingWorkGroupPortRef.current,
          'e',
        )
      : port
    void beginAuthorEdge(connectingFromId, workGroupId, {
      workGroupPort,
      ...(sourceIsWg
        ? {}
        : {
            sourcePort: connectingSourceSlotRef.current?.port,
            sourcePortIndex: connectingSourceSlotRef.current?.index ?? 0,
            targetPort: port as IntentEdgePort,
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
    // When a list already owns this port, append into it instead of spawning
    // another satellite (normalize would fold it anyway).
    if (port === 'mcp' || port === 'skill') {
      const existingList = findWiringListForAgent(agentNodeId, port, draft)
      if (existingList) {
        appendWiringListMember(existingList.id, {
          id: newLoopEntityId('node'),
          title:
            port === 'mcp'
              ? `MCP · ${asset.name}`
              : `Skill · ${asset.name}`,
          kind: port,
          configRef:
            port === 'mcp'
              ? { mcpServerId: asset.id }
              : { skillId: asset.id },
        })
        return
      }
    }
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
    const vp = viewportRef.current
    addNodeAt({
      x: (rect.width / 2 - vp.x) / vp.scale,
      y: (rect.height / 2 - vp.y) / vp.scale,
    })
  }

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const current = viewportRef.current
    const nextScale = Math.min(
      1.8,
      Math.max(0.45, current.scale * (event.deltaY > 0 ? 0.92 : 1.08)),
    )
    commitViewport({ ...current, scale: nextScale })
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

  const layerWorldBounds = !focusedWorkGroupId
    ? layers
        .map((layer) => layerFrameBoundsFor(layer.memberNodeIds))
        .filter((bounds): bounds is LoopLayerRect => Boolean(bounds))
    : []

  // Frustum for mount culling — based on committed viewport (refreshes after pan).
  // Plain calc (not useMemo): this block sits after `if (!open) return null`.
  const viewRect = visibleWorldRect(viewport, canvasSize)

  const worldWidth = Math.max(
    800,
    ...canvasNodes.map((node) => {
      const size = nodeBoxSize(node, draft, sizeOpts)
      return node.position.x + size.width + 80
    }),
    ...[...workGroupBoundsById.values()].map((bounds) => bounds.x + bounds.width + 80),
    ...layerWorldBounds.map((bounds) => bounds.x + bounds.width + 80),
    layerMarqueeRect ? layerMarqueeRect.x + layerMarqueeRect.width + 40 : 0,
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
    ...layerWorldBounds.map((bounds) => bounds.y + bounds.height + 120),
    layerMarqueeRect ? layerMarqueeRect.y + layerMarqueeRect.height + 40 : 0,
    pointerWorld ? pointerWorld.y + 40 : 0,
  )

  const nodeInFrustum = (
    position: { x: number; y: number },
    size: { width: number; height: number },
  ) =>
    // Uses committed viewport. Mid-pan the camera can slide ahead of this
    // frustum; pointerup commits and remounts. Avoid tying cull to `dragging`
    // or the pan-start re-render would mount the entire graph.
    rectIntersectsWorldView(
      position.x,
      position.y,
      size.width,
      size.height,
      viewRect,
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
          const port = normalizeLoopWorkGroupPort(
            connectingWorkGroupPortRef.current,
            'e',
          )
          const origin = loopWorkGroupPortWorld(bounds, port)
          const synthetic: IntentGraphNode = {
            id: connectingWorkGroup.id,
            title: connectingWorkGroup.title,
            prompt: '',
            position: { x: origin.x - 1, y: origin.y - 1 },
          }
          return routeLoopEdgePreview({
            source: synthetic,
            endPoint: pointerWorld,
            sourcePort: port,
            width: 2,
            height: 2,
          })
        })()
      : connectingSource && pointerWorld
        ? (() => {
            const ports = workflowPortBoxSize(connectingSource, draft, sizeOpts)
            const allowed = workflowPortsForNode(connectingSource, draft)
            const locked = connectingSourceSlotRef.current?.port
            const sourcePort =
              locked && allowed.includes(locked)
                ? locked
                : nearestPort(
                    connectingSource,
                    pointerWorld,
                    ports.width,
                    ports.height,
                    allowed,
                  )
            const lockedIndex = connectingSourceSlotRef.current?.index ?? 0
            const slots = loopNodePortSlots(
              connectingSource,
              ports.width,
              ports.height,
              allowed,
            )
            const along =
              slots.find(
                (slot) =>
                  slot.port === sourcePort && slot.index === lockedIndex,
              )?.along ??
              slots.find((slot) => slot.port === sourcePort)?.along ??
              0.5
            return routeLoopEdgePreview({
              source: connectingSource,
              endPoint: pointerWorld,
              sourcePort,
              width: ports.width,
              height: ports.height,
              sourceAlong: along,
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
                } ${paletteDropActive ? styles.canvasDropTarget : ''} ${
                  layerMarqueeArmed ? styles.canvasLayerMarquee : ''
                }`}
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
                  // Create-marquee may start inside a parent layer / empty work-group
                  // frame; those hit targets are pass-through while armed.
                  if (
                    !layerMarqueeArmed &&
                    (event.target as HTMLElement).closest('[data-loop-work-group]')
                  ) {
                    return
                  }
                  if (
                    !layerMarqueeArmed &&
                    (event.target as HTMLElement).closest('[data-loop-layer]')
                  ) {
                    return
                  }
                  if (connectingFromId && event.button === 0) {
                    setConnectingFrom(null)
                    setPointerWorld(null)
                    return
                  }
                  if (
                    layerMarqueeArmed &&
                    phase === 'draw' &&
                    !focusedWorkGroupId
                  ) {
                    const world = clientToWorld(event.clientX, event.clientY)
                    layerGestureRef.current = {
                      kind: 'create',
                      x0: world.x,
                      y0: world.y,
                    }
                    setLayerMarqueeRect(
                      normalizeMarqueeRect(world.x, world.y, world.x, world.y),
                    )
                    blankPointerRef.current = null
                    dragRef.current = null
                    setDragging(false)
                    event.currentTarget.setPointerCapture(event.pointerId)
                    return
                  }
                  blankPointerRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                  }
                  const vp = viewportRef.current
                  dragRef.current = {
                    x: vp.x,
                    y: vp.y,
                    px: event.clientX,
                    py: event.clientY,
                  }
                  setDragging(true)
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  const layerGesture = layerGestureRef.current
                  if (layerGesture) {
                    const world = clientToWorld(event.clientX, event.clientY)
                    if (layerGesture.kind === 'create') {
                      setLayerMarqueeRect(
                        normalizeMarqueeRect(
                          layerGesture.x0,
                          layerGesture.y0,
                          world.x,
                          world.y,
                        ),
                      )
                    } else {
                      setLayerMarqueeRect(
                        resizeRectFromEdge(
                          layerGesture.base,
                          layerGesture.edge,
                          world,
                        ),
                      )
                    }
                    return
                  }
                  if (connectingFromId) {
                    setPointerWorld(clientToWorld(event.clientX, event.clientY))
                  }
                  const nodeDrag = nodeDragRef.current
                  if (nodeDrag && document) {
                    const scale = viewportRef.current.scale
                    const dx = (event.clientX - nodeDrag.px) / scale
                    const dy = (event.clientY - nodeDrag.py) / scale
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
                    const nextById = new Map<string, { x: number; y: number }>()
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
                      nextById.set(nodeDrag.id, clamped)
                    } else {
                      nextById.set(nodeDrag.id, rawAgentPos)
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
                    }
                    // DOM-only mid-drag — avoid Zustand + full edge re-route.
                    nodeDrag.pendingById = nextById
                    setWorldDomPositions(worldRef.current, nextById)
                    return
                  }
                  const drag = dragRef.current
                  if (!drag) return
                  // Pan via DOM transform only — avoid re-rendering every node
                  // on each pointermove when the canvas is dense.
                  applyViewportDom({
                    ...viewportRef.current,
                    x: drag.x + event.clientX - drag.px,
                    y: drag.y + event.clientY - drag.py,
                  })
                }}
                onPointerUp={(event) => {
                  if (layerGestureRef.current && layerMarqueeRect) {
                    commitLayerMarquee(layerMarqueeRect)
                    try {
                      canvasRef.current?.releasePointerCapture?.(event.pointerId)
                    } catch {
                      /* ignore */
                    }
                    dragRef.current = null
                    setDragging(false)
                    return
                  }
                  if (layerGestureRef.current) {
                    cancelLayerGesture()
                  }

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
                    selectLayer(null)
                    clearAuthoringFocus()
                  }

                  const nodeDrag = nodeDragRef.current
                  const exitGhost = workGroupExitGhostRef.current
                  workGroupExitGhostRef.current = null
                  setWorkGroupExitGhost(null)
                  if (nodeDrag && document) {
                    const scale = viewportRef.current.scale
                    const dx =
                      (event.clientX - nodeDrag.px) / scale
                    const dy =
                      (event.clientY - nodeDrag.py) / scale
                    const pending =
                      nodeDrag.pendingById.size > 0
                        ? nodeDrag.pendingById
                        : new Map<string, { x: number; y: number }>([
                            [
                              nodeDrag.id,
                              {
                                x: nodeDrag.ox + dx,
                                y: nodeDrag.oy + dy,
                              },
                            ],
                          ])

                    // Commit DOM-only drag into the draft once.
                    if (!nodeDrag.workGroupLocked && pending.size > 0) {
                      const live =
                        useLoopGraphStore.getState().document?.draft ?? draft
                      const moved = [...pending.entries()].some(([id, pos]) => {
                        const node = live.nodes.find((item) => item.id === id)
                        if (!node) return true
                        return (
                          Math.abs(node.position.x - pos.x) > 0.5 ||
                          Math.abs(node.position.y - pos.y) > 0.5
                        )
                      })
                      if (moved) {
                        patchDraft({
                          ...live,
                          nodes: live.nodes.map((node) => {
                            const next = pending.get(node.id)
                            return next ? { ...node, position: next } : node
                          }),
                        })
                      }
                    }

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
                              x: nodeDrag.ox + dx,
                              y: nodeDrag.oy + dy,
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
                            const snapDx = snapped.x - moving.position.x
                            const snapDy = snapped.y - moving.position.y
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
                                        x: node.position.x + snapDx,
                                        y: node.position.y + snapDy,
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
                  setGeometryChromeDimmed(
                    edgesLayerRef.current,
                    branchLabelLayerRef.current,
                    false,
                  )
                  frozenWorkGroupFrameRef.current = null
                  // Commit camera after DOM-only pan so React culling / duty
                  // card anchors catch up in one frame (not per pointermove).
                  if (dragRef.current) {
                    commitViewport(viewportRef.current)
                  }
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
                {layerMarqueeArmed || layerMarqueeRect ? (
                  <div className={layerStyles.hintBanner} role="status">
                    {!layerMarqueeArmed &&
                    layerGestureRef.current?.kind === 'resize'
                      ? ts('chat.loopGraph.layer.resizeHint')
                      : ts('chat.loopGraph.layer.createHint')}
                  </div>
                ) : null}
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
                    ref={worldRef}
                    className={`${styles.world} ${
                      dragging ? styles.worldPanning : ''
                    }`}
                    style={{
                      width: worldWidth,
                      height: worldHeight,
                      // While panning, prefer the live ref so an incidental
                      // re-render cannot snap the camera back to stale state.
                      transform: formatWorldTransform(
                        dragging ? viewportRef.current : viewport,
                      ),
                    }}
                  >
                    {!focusedWorkGroupId
                      ? [...layers]
                          .map((layer) => {
                            const bounds = layerFrameBoundsFor(
                              layer.memberNodeIds,
                            )
                            return { layer, bounds }
                          })
                          .filter(
                            (
                              item,
                            ): item is {
                              layer: (typeof layers)[number]
                              bounds: LoopLayerRect
                            } => Boolean(item.bounds),
                          )
                          // Larger parents under smaller nested children; selected on top.
                          .sort((a, b) => {
                            const areaA = a.bounds.width * a.bounds.height
                            const areaB = b.bounds.width * b.bounds.height
                            if (areaA !== areaB) return areaB - areaA
                            const aSelected = a.layer.id === selectedLayerId ? 1 : 0
                            const bSelected = b.layer.id === selectedLayerId ? 1 : 0
                            return aSelected - bSelected
                          })
                          .map(({ layer, bounds }) => {
                            // Formal frame stays frozen while judgment marquee is active.
                            const resizeGesture = layerGestureRef.current
                            const formalBounds =
                              resizeGesture?.kind === 'resize' &&
                              resizeGesture.layerId === layer.id
                                ? resizeGesture.base
                                : bounds
                            if (
                              !nodeInFrustum(
                                { x: formalBounds.x, y: formalBounds.y },
                                {
                                  width: formalBounds.width,
                                  height: formalBounds.height,
                                },
                              )
                            ) {
                              return null
                            }
                            return (
                              <LoopLayerFrame
                                key={layer.id}
                                layerId={layer.id}
                                title={layer.title}
                                colorKey={layer.colorKey}
                                bounds={formalBounds}
                                memberCount={layer.memberNodeIds.length}
                                selected={selectedLayerId === layer.id}
                                pointerPassThrough={
                                  layerMarqueeArmed ||
                                  (Boolean(layerMarqueeRect) &&
                                    layerGestureRef.current?.kind === 'create')
                                }
                                onSelect={() => selectLayer(layer.id)}
                                onRename={(title) => renameLayer(layer.id, title)}
                                onSetColor={(colorKey) =>
                                  setLayerColor(layer.id, colorKey)
                                }
                                onDissolve={() => dissolveLayer(layer.id)}
                                onResizeEdgePointerDown={(
                                  id,
                                  edge,
                                  pointerEvent,
                                ) => {
                                  beginLayerResize(id, edge, pointerEvent)
                                }}
                              />
                            )
                          })
                      : null}
                    {layerMarqueeRect ? (
                      <div
                        className={layerStyles.marquee}
                        style={{
                          left: layerMarqueeRect.x,
                          top: layerMarqueeRect.y,
                          width: layerMarqueeRect.width,
                          height: layerMarqueeRect.height,
                        }}
                        aria-hidden
                      />
                    ) : null}
                    {!focusedWorkGroupId
                      ? workGroups.map((group) => {
                          const bounds =
                            workGroupBoundsById.get(group.id) ??
                            defaultEmptyLoopWorkGroupFrame(
                              group.origin ?? { x: 80, y: 80 },
                            )
                          if (
                            !nodeInFrustum(
                              { x: bounds.x, y: bounds.y },
                              { width: bounds.width, height: bounds.height },
                            )
                          ) {
                            return null
                          }
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
                              taskTitle={resolveLoopWorkGroupTaskTitle(
                                group,
                                group.departmentTemplateId
                                  ? getLoopDepartmentTemplate(
                                      group.departmentTemplateId,
                                    )?.title
                                  : null,
                              )}
                              departmentName={
                                group.departmentTemplateId
                                  ? getLoopDepartmentTemplate(
                                      group.departmentTemplateId,
                                    )?.title ?? null
                                  : null
                              }
                              bounds={bounds}
                              memberCount={surfaceCount}
                              selected={selectedWorkGroupId === group.id}
                              collaborationMode={group.collaborationMode}
                              coordinatorTitle={coordinator?.title}
                              isDepartment={Boolean(group.departmentTemplateId)}
                              startTaskEdit={
                                pendingWorkGroupTaskEditId === group.id
                              }
                              showPorts={
                                phase === 'draw' &&
                                (selectedWorkGroupId === group.id ||
                                  Boolean(connectingFromId))
                              }
                              pointerPassThrough={
                                layerMarqueeArmed ||
                                (Boolean(layerMarqueeRect) &&
                                  layerGestureRef.current?.kind === 'create')
                              }
                              onSelect={() => selectWorkGroup(group.id)}
                              onRename={(taskTitle) =>
                                renameWorkGroup(group.id, taskTitle)
                              }
                              onTaskEditConsumed={() =>
                                requestWorkGroupTaskEdit(null)
                              }
                              onTitleDragMove={({ dx, dy }) => {
                                const scale = viewportRef.current.scale
                                const worldDx = dx / scale
                                const worldDy = dy / scale
                                let drag = workGroupDragRef.current
                                if (!drag || drag.id !== group.id) {
                                  const memberSet = new Set(group.memberNodeIds)
                                  const nodeStarts: Array<{
                                    id: string
                                    x: number
                                    y: number
                                  }> = []
                                  for (const node of draft.nodes) {
                                    if (memberSet.has(node.id)) {
                                      nodeStarts.push({
                                        id: node.id,
                                        x: node.position.x,
                                        y: node.position.y,
                                      })
                                      continue
                                    }
                                    if (!isConfigNode(node)) continue
                                    const feeds = draft.edges.some(
                                      (edge) =>
                                        edge.kind === 'provides' &&
                                        edge.source === node.id &&
                                        memberSet.has(edge.target),
                                    )
                                    if (feeds) {
                                      nodeStarts.push({
                                        id: node.id,
                                        x: node.position.x,
                                        y: node.position.y,
                                      })
                                    }
                                  }
                                  drag = {
                                    id: group.id,
                                    accDx: 0,
                                    accDy: 0,
                                    frameStart: { x: bounds.x, y: bounds.y },
                                    nodeStarts,
                                  }
                                  workGroupDragRef.current = drag
                                  setGeometryChromeDimmed(
                                    edgesLayerRef.current,
                                    branchLabelLayerRef.current,
                                    true,
                                  )
                                }
                                drag.accDx += worldDx
                                drag.accDy += worldDy
                                setWorldWorkGroupDomPosition(
                                  worldRef.current,
                                  drag.id,
                                  {
                                    x: drag.frameStart.x + drag.accDx,
                                    y: drag.frameStart.y + drag.accDy,
                                  },
                                )
                                const nodePositions = new Map<
                                  string,
                                  { x: number; y: number }
                                >()
                                for (const start of drag.nodeStarts) {
                                  nodePositions.set(start.id, {
                                    x: start.x + drag.accDx,
                                    y: start.y + drag.accDy,
                                  })
                                }
                                setWorldDomPositions(
                                  worldRef.current,
                                  nodePositions,
                                )
                              }}
                              onTitleDragEnd={() => {
                                const drag = workGroupDragRef.current
                                workGroupDragRef.current = null
                                setGeometryChromeDimmed(
                                  edgesLayerRef.current,
                                  branchLabelLayerRef.current,
                                  false,
                                )
                                if (
                                  !drag ||
                                  (drag.accDx === 0 && drag.accDy === 0)
                                ) {
                                  return
                                }
                                moveWorkGroup(drag.id, {
                                  dx: drag.accDx,
                                  dy: drag.accDy,
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
                    <svg
                      ref={edgesLayerRef}
                      className={styles.edges}
                      width={worldWidth}
                      height={worldHeight}
                    >
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
                              const stored = normalizeLoopWorkGroupPort(
                                edge.workGroupPort,
                                'e',
                              )
                              // Stored port is the source WG attachment when
                              // the edge leaves a work group.
                              const port = stored
                              const origin = loopWorkGroupPortWorld(bounds, port)
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
                              const stored = normalizeLoopWorkGroupPort(
                                edge.workGroupPort,
                                'w',
                              )
                              // Source-WG edges only store the exit port —
                              // approach the target on the opposite side.
                              const port = sourceWg
                                ? oppositeLoopWorkGroupPort(stored)
                                : stored
                              const origin = loopWorkGroupPortWorld(bounds, port)
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
                        const targetSize = targetNode
                          ? nodeBoxSize(targetNode, draft, sizeOpts)
                          : { width: 2, height: 2 }
                        // Skip edges whose both ends are off-screen (idle camera).
                        if (
                          !nodeInFrustum(source.position, sourceSize) &&
                          !nodeInFrustum(target.position, targetSize)
                        ) {
                          return null
                        }
                        const provides = edge.kind === 'provides'
                        const providesPort =
                          provides && sourceNode
                            ? resolveProvidesPort(edge.configPort, sourceNode) ??
                              expectedConfigPort(sourceNode) ??
                              'model'
                            : null
                        let routed: {
                          d: string
                          mid: { x: number; y: number }
                          sourceNear: { x: number; y: number }
                        }
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
                          const providesRoute = routeProvidesCurve({ start, end })
                          routed = {
                            ...providesRoute,
                            sourceNear: pointAlongPolyline(
                              providesRoute.points ?? [start, end],
                              DECISION_BRANCH_LABEL_T,
                            ),
                          }
                        } else {
                          const batched =
                            sourceNode && targetNode
                              ? workflowEdgeRoutes.get(edge.id)
                              : undefined
                          if (batched) {
                            routed = {
                              d: batched.d,
                              mid: batched.mid,
                              sourceNear: batched.sourceNear,
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
                            const fallback = routeLoopEdge({
                              source,
                              target,
                              sourcePort: sourceNode
                                ? edge.sourcePort
                                : normalizeLoopWorkGroupPort(
                                    edge.workGroupPort,
                                    'e',
                                  ),
                              targetPort: targetNode
                                ? edge.targetPort
                                : sourceWg
                                  ? oppositeLoopWorkGroupPort(
                                      normalizeLoopWorkGroupPort(
                                        edge.workGroupPort,
                                        'e',
                                      ),
                                    )
                                  : normalizeLoopWorkGroupPort(
                                      edge.workGroupPort,
                                      'w',
                                    ),
                              sourceAllowedPorts: sourceNode
                                ? workflowPortsForNode(sourceNode, draft)
                                : [
                                    normalizeLoopWorkGroupPort(
                                      edge.workGroupPort,
                                      'e',
                                    ),
                                  ],
                              targetAllowedPorts: targetNode
                                ? workflowPortsForNode(targetNode, draft)
                                : [
                                    sourceWg
                                      ? oppositeLoopWorkGroupPort(
                                          normalizeLoopWorkGroupPort(
                                            edge.workGroupPort,
                                            'e',
                                          ),
                                        )
                                      : normalizeLoopWorkGroupPort(
                                          edge.workGroupPort,
                                          'w',
                                        ),
                                  ],
                              obstacles: draft.nodes,
                              obstacleSize: (node) =>
                                nodeBoxSize(node, draft, sizeOpts),
                              width: sourcePorts.width,
                              height: sourcePorts.height,
                              targetWidth: targetPorts.width,
                              targetHeight: targetPorts.height,
                              labelText: labelForRoute,
                            })
                            routed = {
                              d: fallback.d,
                              mid: fallback.mid,
                              sourceNear: pointAlongPolyline(
                                fallback.points,
                                DECISION_BRANCH_LABEL_T,
                              ),
                            }
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
                      const size = nodeBoxSize(node, draft, sizeOpts)
                      if (!nodeInFrustum(node.position, size)) return null
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
                      // L1 surface: duty card without wiring strip. L2: full Agent + wiring.
                      const inWorkGroup =
                        !focusedWorkGroupId && isWorkGroupMemberAgent(node)
                      const incomplete = configSatellite
                        ? !node.satelliteKind
                        : !(
                            hasDutyAssignment(node) ||
                            (node.dutyItems?.length ?? 0) > 0 ||
                            Boolean(node.prompt.trim())
                          )
                      const wiringLayout =
                        isAgentDuty && !inWorkGroup
                          ? buildAgentWiringLayout(node, draft)
                          : null
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
                            configSatellite && isWiringListKind(node.satelliteKind)
                              ? styles.nodeConfigList
                              : ''
                          } ${
                            isAgentDuty && !inWorkGroup ? styles.nodeAgentWired : ''
                          } ${inWorkGroup ? styles.nodeWorkGroupMember : ''} ${
                            diamond ? styles.nodeDiamond : ''
                          } ${
                            selectedNodeId === node.id ? styles.nodeActive : ''
                          } ${connectingFromId === node.id ? styles.nodeConnecting : ''} ${
                            incomplete ? styles.nodeIncomplete : ''
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
                            // Lock AABB height whenever ports are computed from
                            // size.height — otherwise content growth leaves the
                            // south workflow port floating inside the card.
                            ...(diamond ||
                            inWorkGroup ||
                            (isAgentDuty && !inWorkGroup) ||
                            isWiringListKind(node.satelliteKind)
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
                              if (
                                node.satelliteKind === 'mcp_list' ||
                                node.satelliteKind === 'skill_list'
                              ) {
                                setWiringListPopover({
                                  listNodeId: node.id,
                                  kind:
                                    node.satelliteKind === 'mcp_list'
                                      ? 'mcp'
                                      : 'skill',
                                  anchor: {
                                    x: event.clientX,
                                    y: event.clientY,
                                  },
                                })
                                return
                              }
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
                            if (layerMarqueeArmed && !layerGestureRef.current) {
                              cancelLayerGesture()
                            }
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
                            // L1 work-group chips are not workflow endpoints —
                            // elevate an in-progress wire onto the frame instead.
                            if (
                              connectingFromId &&
                              inWorkGroup &&
                              node.workGroupId &&
                              connectingFromId !== node.workGroupId
                            ) {
                              const bounds =
                                workGroupBoundsById.get(node.workGroupId) ??
                                defaultEmptyLoopWorkGroupFrame(
                                  workGroups.find(
                                    (group) => group.id === node.workGroupId,
                                  )?.origin ?? node.position,
                                )
                              finishConnectToWorkGroup(
                                node.workGroupId,
                                nearestWorkGroupPort(bounds, clickWorld),
                              )
                              return
                            }
                            if (inWorkGroup && connectingFromId) {
                              return
                            }
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
                                  workGroupPort: normalizeLoopWorkGroupPort(
                                    connectingWorkGroupPortRef.current,
                                    'e',
                                  ),
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
                              pendingById: new Map(),
                              ...(homeWorkGroupId
                                ? { homeWorkGroupId }
                                : {}),
                            }
                            if (!lockToMatrix) {
                              setGeometryChromeDimmed(
                                edgesLayerRef.current,
                                branchLabelLayerRef.current,
                                true,
                              )
                            }
                            // Capture on the canvas so locked-drag moves hit the
                            // handler that refuses to mutate member positions.
                            canvasRef.current?.setPointerCapture?.(event.pointerId)
                          }}
                        >
                          {!configSatellite &&
                            !inWorkGroup &&
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
                                    // Complete an in-progress wire onto this port.
                                    // Work-group endpoints must be handled here —
                                    // connectingSource is only set for node→node.
                                    if (
                                      connectingFromId &&
                                      connectingFromId !== node.id &&
                                      connectingWorkGroup
                                    ) {
                                      void beginAuthorEdge(
                                        connectingFromId,
                                        node.id,
                                        {
                                          workGroupPort:
                                            normalizeLoopWorkGroupPort(
                                              connectingWorkGroupPortRef.current,
                                              'e',
                                            ),
                                          targetPort: slot.port,
                                          targetPortIndex: slot.index,
                                        },
                                      ).then(() => {
                                        setPointerWorld(null)
                                        connectingWorkGroupPortRef.current =
                                          null
                                        connectingSourceSlotRef.current = null
                                      })
                                      return
                                    }
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
                          {configSatellite &&
                          isWiringListKind(node.satelliteKind) ? (
                            (() => {
                              const listMembers = wiringListMembersOf(node)
                              const visible = listMembers.slice(
                                0,
                                LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS,
                              )
                              const hidden = Math.max(
                                0,
                                listMembers.length -
                                  LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS,
                              )
                              return (
                                <div
                                  className={styles.nodeConfigListCard}
                                  data-loop-wiring-list={node.satelliteKind}
                                >
                                  <div className={styles.nodeConfigListCardHeader}>
                                    <span
                                      className={`${styles.nodeConfigListCardIcon} ${categoryClass}`}
                                      aria-hidden
                                    >
                                      <ConfigIcon
                                        size={12}
                                        strokeWidth={1.75}
                                      />
                                    </span>
                                    <span className={styles.nodeConfigListCardTitle}>
                                      {node.title || visual.shortLabel}
                                    </span>
                                  </div>
                                  <ul className={styles.nodeConfigListCardRows}>
                                    {visible.map((member) => (
                                      <li
                                        key={member.id}
                                        className={styles.nodeConfigListCardRow}
                                        title={member.title}
                                      >
                                        {member.title.replace(
                                          /^(MCP|Skill)\s*·\s*/i,
                                          '',
                                        )}
                                      </li>
                                    ))}
                                    {hidden > 0 ? (
                                      <li
                                        className={styles.nodeConfigListCardMore}
                                      >
                                        {ts('chat.loopGraph.wiringListMore', {
                                          count: hidden,
                                        })}
                                      </li>
                                    ) : null}
                                  </ul>
                                </div>
                              )
                            })()
                          ) : configSatellite ? (
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
                                <LoopNodeDutyChecklist
                                  node={node}
                                  specNode={
                                    document?.approvedSpecs
                                      .find(
                                        (spec) =>
                                          spec.version ===
                                          activeInstance?.specVersion,
                                      )
                                      ?.nodes.find((item) => item.id === node.id) ??
                                    document?.pendingCompile?.specDraft.nodes.find(
                                      (item) => item.id === node.id,
                                    ) ??
                                    null
                                  }
                                  runtimeItems={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyItems
                                  }
                                  progress={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyProgress
                                  }
                                  compact
                                  interactive={Boolean(
                                    isHitl && (node.type === 'human' || node.humanMode),
                                  )}
                                  allowAdd={Boolean(
                                    isCursor &&
                                      phase === 'run' &&
                                      (isHitl ||
                                        activeInstance?.status === 'running'),
                                  )}
                                  onToggle={(itemId, status) => {
                                    void patchDutyProgress(node.id, itemId, status)
                                  }}
                                  onAdd={(text) => {
                                    void mutateDutyChecklist(node.id, {
                                      op: 'add',
                                      text,
                                      kind:
                                        node.type === 'human' ? 'human' : 'machine',
                                    })
                                  }}
                                />
                              </div>
                            </LoopDiamondAutosize>
                          ) : inWorkGroup ? (
                            <div className={styles.nodeWorkGroupMemberInner}>
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
                                  <NodeIcon size={14} strokeWidth={1.75} />
                                </span>
                                <span className={styles.nodeTitle}>
                                  {node.title || visual.shortLabel}
                                </span>
                                {isCoordinator ? (
                                  <span
                                    className={styles.nodeWorkGroupSupervisorBadge}
                                    title={ts('chat.loopGraph.workGroup.supervisorHint')}
                                  >
                                    <Crown size={11} strokeWidth={1.75} aria-hidden />
                                    <span>
                                      {ts('chat.loopGraph.workGroup.supervisor')}
                                    </span>
                                  </span>
                                ) : null}
                                {incomplete ? (
                                  <span className={styles.incompleteMark}>
                                    {ts('chat.loopGraph.incomplete')}
                                  </span>
                                ) : null}
                              </div>
                              <div className={styles.nodeTask}>
                                <LoopNodeDutyChecklist
                                  node={node}
                                  specNode={
                                    document?.approvedSpecs
                                      .find(
                                        (spec) =>
                                          spec.version ===
                                          activeInstance?.specVersion,
                                      )
                                      ?.nodes.find((item) => item.id === node.id) ??
                                    document?.pendingCompile?.specDraft.nodes.find(
                                      (item) => item.id === node.id,
                                    ) ??
                                    null
                                  }
                                  runtimeItems={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyItems
                                  }
                                  progress={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyProgress
                                  }
                                  compact
                                  interactive={Boolean(
                                    isHitl &&
                                      (node.type === 'human' || node.humanMode),
                                  )}
                                  onToggle={(itemId, status) => {
                                    void patchDutyProgress(node.id, itemId, status)
                                  }}
                                />
                              </div>
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
                                <LoopNodeDutyChecklist
                                  node={node}
                                  specNode={
                                    document?.approvedSpecs
                                      .find(
                                        (spec) =>
                                          spec.version ===
                                          activeInstance?.specVersion,
                                      )
                                      ?.nodes.find((item) => item.id === node.id) ??
                                    document?.pendingCompile?.specDraft.nodes.find(
                                      (item) => item.id === node.id,
                                    ) ??
                                    null
                                  }
                                  runtimeItems={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyItems
                                  }
                                  progress={
                                    activeInstance?.nodeRecords?.find(
                                      (item) => item.nodeId === node.id,
                                    )?.dutyProgress
                                  }
                                  compact
                                  interactive={Boolean(
                                    isHitl && (node.type === 'human' || node.humanMode),
                                  )}
                                  allowAdd={Boolean(
                                    isCursor &&
                                      phase === 'run' &&
                                      (isHitl ||
                                        activeInstance?.status === 'running'),
                                  )}
                                  onToggle={(itemId, status) => {
                                    void patchDutyProgress(node.id, itemId, status)
                                  }}
                                  onAdd={(text) => {
                                    void mutateDutyChecklist(node.id, {
                                      op: 'add',
                                      text,
                                      kind:
                                        node.type === 'human' ? 'human' : 'machine',
                                    })
                                  }}
                                />
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
                              {wiringLayout.groups.map((group) => {
                                // One icon-aligned attach point per port —
                                // all satellites of that port share it.
                                const point = {
                                  x: group.buttonX,
                                  y: wiringLayout.height,
                                }
                                return (
                                  <span
                                    key={`wiring-port:${group.port}`}
                                    className={`${styles.port} ${styles.portConfigHidden}`}
                                    style={{ left: point.x, top: point.y }}
                                    data-loop-config-port={group.port}
                                    data-loop-config-slot={`${group.port}:attach`}
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
                                            configPort: group.port,
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
                          <div className={styles.nodeTop}>
                            <span className={styles.nodeTitle}>
                              {workGroupExitGhost.title}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {/* Above nodes — SVG edge foreignObjects sit under diamonds and were invisible. */}
                    <div
                      ref={branchLabelLayerRef}
                      className={styles.branchLabelLayer}
                      aria-hidden={false}
                    >
                      {draft.edges.map((edge) => {
                        if (edge.kind === 'provides') return null
                        const sourceNode = draft.nodes.find(
                          (node) => node.id === edge.source,
                        )
                        if (!isDecisionBranchSourceNode(sourceNode)) return null
                        if (
                          !focusedWorkGroupId &&
                          sourceNode.workGroupId &&
                          draft.nodes.find((n) => n.id === edge.target)
                            ?.workGroupId === sourceNode.workGroupId
                        ) {
                          return null
                        }
                        if (focusedWorkGroupId) {
                          if (!nodeVisibleOnCanvas(sourceNode)) return null
                          const targetNode = draft.nodes.find(
                            (node) => node.id === edge.target,
                          )
                          if (
                            targetNode &&
                            !nodeVisibleOnCanvas(targetNode)
                          ) {
                            return null
                          }
                        }
                        const batched = workflowEdgeRoutes.get(edge.id)
                        const sourceSize = nodeBoxSize(
                          sourceNode,
                          draft,
                          sizeOpts,
                        )
                        const sourceBox = {
                          x: sourceNode.position.x,
                          y: sourceNode.position.y,
                          width: sourceSize.width,
                          height: sourceSize.height,
                        }
                        const port =
                          batched?.sourcePort ?? edge.sourcePort ?? 's'
                        const anchor = batched
                          ? decisionBranchLabelPoint(
                              batched.points,
                              sourceBox,
                            )
                          : (() => {
                              // WG / unbatched edges: park outside the diamond by port.
                              const cx =
                                sourceBox.x + sourceBox.width / 2
                              const cy =
                                sourceBox.y + sourceBox.height / 2
                              const gap = 18
                              if (port === 's')
                                return {
                                  x: cx,
                                  y: sourceBox.y + sourceBox.height + gap,
                                }
                              if (port === 'n')
                                return { x: cx, y: sourceBox.y - gap }
                              if (port === 'w')
                                return { x: sourceBox.x - gap, y: cy }
                              return {
                                x: sourceBox.x + sourceBox.width + gap,
                                y: cy,
                              }
                            })()
                        const displayLabel = resolveDecisionBranchDisplayLabel(
                          edge,
                          (key) => ts(`chat.loopGraph.decisionBranch.${key}`),
                        )
                        return (
                          <div
                            key={`branch-label-${edge.id}`}
                            className={styles.branchLabelAnchor}
                            style={{ left: anchor.x, top: anchor.y }}
                            data-loop-branch-label={edge.id}
                          >
                            {editingBranchEdgeId === edge.id &&
                            phase === 'draw' ? (
                              <input
                                className={styles.branchLabelInput}
                                value={editingBranchDraft}
                                aria-label={ts(
                                  'chat.loopGraph.decisionBranch.editHint',
                                )}
                                autoFocus
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setEditingBranchDraft(event.target.value)
                                }
                                onBlur={() => {
                                  const live =
                                    useLoopGraphStore.getState().document
                                      ?.draft ?? draft
                                  const source =
                                    live.nodes.find(
                                      (node) => node.id === edge.source,
                                    ) ?? sourceNode
                                  const port =
                                    workflowEdgeRoutes.get(edge.id)
                                      ?.sourcePort ??
                                    edge.sourcePort ??
                                    's'
                                  const fallbackLabel =
                                    source &&
                                    isDecisionBranchSourceNode(source)
                                      ? decisionBranchPatchForPort(
                                          port,
                                          source,
                                          (key) =>
                                            ts(
                                              `chat.loopGraph.decisionBranch.${key}`,
                                            ),
                                        ).branchLabel
                                      : ts(
                                          'chat.loopGraph.decisionBranch.placeholder',
                                        )
                                  const nextLabel =
                                    editingBranchDraft.trim() ||
                                    fallbackLabel ||
                                    '…'
                                  updateDraft({
                                    ...live,
                                    revision: live.revision + 1,
                                    edges: live.edges.map((item) =>
                                      item.id === edge.id
                                        ? { ...item, branchLabel: nextLabel }
                                        : item,
                                    ),
                                  })
                                  setEditingBranchEdgeId(null)
                                  setEditingBranchDraft('')
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    ;(
                                      event.target as HTMLInputElement
                                    ).blur()
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    setEditingBranchEdgeId(null)
                                    setEditingBranchDraft('')
                                  }
                                  event.stopPropagation()
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className={`${styles.branchLabelChip} ${
                                  !displayLabel
                                    ? styles.branchLabelChipPending
                                    : ''
                                }`}
                                title={ts(
                                  'chat.loopGraph.decisionBranch.editHint',
                                )}
                                tabIndex={phase === 'draw' ? 0 : -1}
                                onPointerDown={(event) => {
                                  if (phase !== 'draw' || event.button !== 0)
                                    return
                                  event.stopPropagation()
                                }}
                                onClick={(event) => {
                                  if (phase !== 'draw') return
                                  event.stopPropagation()
                                  setEditingBranchEdgeId(edge.id)
                                  setEditingBranchDraft(displayLabel)
                                }}
                              >
                                {displayLabel ||
                                  ts(
                                    'chat.loopGraph.decisionBranch.placeholder',
                                  )}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
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
                    {(() => {
                      const cursorId = activeInstance.cursorNodeId
                      const cursorDraft = cursorId
                        ? draft.nodes.find((item) => item.id === cursorId)
                        : undefined
                      const cursorSpec =
                        document?.approvedSpecs
                          .find(
                            (spec) =>
                              spec.version === activeInstance.specVersion,
                          )
                          ?.nodes.find((item) => item.id === cursorId) ?? null
                      const cursorRecord = activeInstance.nodeRecords?.find(
                        (item) => item.nodeId === cursorId,
                      )
                      const cursorProgress = cursorRecord?.dutyProgress
                      const runtimeItems = cursorRecord?.dutyItems
                      const dutyReady = runtimeItems?.length
                        ? areRequiredDutiesComplete(
                            runtimeItems.map((item) => ({
                              id: item.id,
                              required: item.required !== false,
                            })),
                            cursorProgress,
                          )
                        : cursorSpec
                          ? areRequiredDutiesComplete(
                              cursorSpec.acceptance.map((item) => ({
                                id: item.id,
                                required: true,
                              })),
                              cursorProgress,
                            )
                          : true
                      return cursorDraft &&
                        (cursorDraft.type === 'human' || cursorDraft.humanMode) ? (
                        <div className={styles.hitlDutyBlock}>
                          <div className={styles.runEvent}>
                            {ts('chat.loopGraph.dutyChecklist')}
                          </div>
                          <LoopNodeDutyChecklist
                            node={cursorDraft}
                            specNode={cursorSpec}
                            runtimeItems={runtimeItems}
                            progress={cursorProgress}
                            compact={false}
                            interactive
                            allowAdd
                            onToggle={(itemId, status) => {
                              void patchDutyProgress(
                                cursorDraft.id,
                                itemId,
                                status,
                              )
                            }}
                            onAdd={(text) => {
                              void mutateDutyChecklist(cursorDraft.id, {
                                op: 'add',
                                text,
                                kind: 'human',
                              })
                            }}
                          />
                          {!dutyReady ? (
                            <p className={styles.hitlDutyHint}>
                              {ts('chat.loopGraph.dutyReleaseBlocked')}
                            </p>
                          ) : null}
                        </div>
                      ) : null
                    })()}
                    {(activeInstance.hitlQuestionIds ?? ['continue']).map((questionId) => {
                      const isApproval = questionId.includes('approval')
                      const isReview = questionId.includes('review')
                      const isHumanGate =
                        questionId.startsWith('human_') ||
                        questionId.startsWith('decide_')
                      const cursorId = activeInstance.cursorNodeId
                      const cursorSpec =
                        document?.approvedSpecs
                          .find(
                            (spec) =>
                              spec.version === activeInstance.specVersion,
                          )
                          ?.nodes.find((item) => item.id === cursorId) ?? null
                      const cursorRecord = activeInstance.nodeRecords?.find(
                        (item) => item.nodeId === cursorId,
                      )
                      const cursorProgress = cursorRecord?.dutyProgress
                      const runtimeItems = cursorRecord?.dutyItems
                      const dutyReady =
                        !isHumanGate ||
                        (runtimeItems?.length
                          ? areRequiredDutiesComplete(
                              runtimeItems.map((item) => ({
                                id: item.id,
                                required: item.required !== false,
                              })),
                              cursorProgress,
                            )
                          : !cursorSpec ||
                            areRequiredDutiesComplete(
                              cursorSpec.acceptance.map((item) => ({
                                id: item.id,
                                required: true,
                              })),
                              cursorProgress,
                            ))
                      return (
                        <div key={questionId} className={styles.hitlGroup}>
                          <div className={styles.runEvent}>{questionId}</div>
                          {isApproval ? (
                            <>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                data-loop-hitl-approve=""
                                disabled={!dutyReady}
                                title={
                                  dutyReady
                                    ? undefined
                                    : ts('chat.loopGraph.dutyReleaseBlocked')
                                }
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'approve',
                                      editedPayload: {
                                        approved: true,
                                        requireDutyComplete: true,
                                      },
                                    },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlConfirmRelease')}
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
                                disabled={!dutyReady}
                                title={
                                  dutyReady
                                    ? undefined
                                    : ts('chat.loopGraph.dutyReleaseBlocked')
                                }
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'accept',
                                      editedPayload: { requireDutyComplete: true },
                                    },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlConfirmRelease')}
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
                                disabled={!dutyReady}
                                title={
                                  dutyReady
                                    ? undefined
                                    : ts('chat.loopGraph.dutyReleaseBlocked')
                                }
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'continue',
                                      ...(isHumanGate
                                        ? {
                                            editedPayload: {
                                              requireDutyComplete: true,
                                            },
                                          }
                                        : {}),
                                    },
                                  ])
                                }
                              >
                                {isHumanGate
                                  ? ts('chat.loopGraph.hitlConfirmRelease')
                                  : ts('chat.loopGraph.hitlContinue')}
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
            {phase === 'draw' && selectedLayerId && !selectedWorkGroupId
              ? (() => {
                  const selectedLayer = layers.find(
                    (layer) => layer.id === selectedLayerId,
                  )
                  if (!selectedLayer) return null
                  const members = selectedLayer.memberNodeIds
                    .map((id) => draft.nodes.find((node) => node.id === id))
                    .filter((node): node is IntentGraphNode => Boolean(node))
                  return (
                    <div className={styles.workGroupPanel} data-loop-layer-panel="">
                      <h3 className={styles.workGroupPanelTitle}>
                        {ts('chat.loopGraph.layer.panelTitle')}: {selectedLayer.title}
                      </h3>
                      <div className={styles.workGroupPanelRow}>
                        <span className={styles.workGroupPanelLabel}>
                          {ts('chat.loopGraph.layer.members')}
                        </span>
                        <ul className={styles.layerMemberList}>
                          {members.map((node) => (
                            <li key={node.id}>
                              {node.title || ts('chat.loopGraph.untitledNode')}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        className={styles.workGroupPanelDissolve}
                        onClick={() => dissolveLayer(selectedLayer.id)}
                      >
                        {ts('chat.loopGraph.layer.dissolve')}
                      </button>
                    </div>
                  )
                })()
              : null}
            {phase === 'draw' && selectedWorkGroupId
              ? (() => {
                  const selectedGroup = workGroups.find(
                    (group) => group.id === selectedWorkGroupId,
                  )
                  if (!selectedGroup) return null
                  const members = selectedGroup.memberNodeIds
                    .map((id) => draft.nodes.find((node) => node.id === id))
                    .filter((node): node is IntentGraphNode => Boolean(node))
                  const departmentName = selectedGroup.departmentTemplateId
                    ? getLoopDepartmentTemplate(selectedGroup.departmentTemplateId)
                        ?.title ?? null
                    : null
                  const taskValue = resolveLoopWorkGroupTaskTitle(
                    selectedGroup,
                    departmentName,
                  )
                  return (
                    <div className={styles.workGroupPanel} data-loop-work-group-panel="">
                      <h3 className={styles.workGroupPanelTitle}>
                        {selectedGroup.title}
                      </h3>
                      {departmentName ? (
                        <div className={styles.workGroupPanelRow}>
                          <span className={styles.workGroupPanelLabel}>
                            {ts('chat.loopGraph.workGroup.departmentLabel')}
                          </span>
                          <span className={styles.workGroupPanelValue}>
                            {departmentName}
                          </span>
                        </div>
                      ) : null}
                      <div className={styles.workGroupPanelRow}>
                        <label
                          className={styles.workGroupPanelLabel}
                          htmlFor="loop-wg-task"
                        >
                          {ts('chat.loopGraph.workGroup.taskLabel')}
                        </label>
                        <input
                          id="loop-wg-task"
                          className={styles.workGroupPanelSelect}
                          value={taskValue}
                          placeholder={
                            departmentName
                              ? ts(
                                  'chat.loopGraph.workGroup.taskPlaceholderDepartment',
                                )
                              : ts('chat.loopGraph.workGroup.taskPlaceholder')
                          }
                          onChange={(event) =>
                            renameWorkGroup(selectedGroup.id, event.target.value)
                          }
                        />
                      </div>
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
                            {ts('chat.loopGraph.workGroup.supervisor')}
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
                          <p className={styles.workGroupPanelHint}>
                            {ts('chat.loopGraph.workGroup.supervisorHint')}
                          </p>
                        </div>
                      ) : null}
                      <div className={styles.workGroupPanelRow}>
                        <span className={styles.workGroupPanelLabel}>
                          {ts('chat.loopGraph.workGroup.staffing.title')}
                        </span>
                        <select
                          className={styles.workGroupPanelSelect}
                          value={staffingPaletteId}
                          onChange={(event) =>
                            setStaffingPaletteId(event.target.value)
                          }
                          aria-label={ts(
                            'chat.loopGraph.workGroup.staffing.pickSpecialist',
                          )}
                        >
                          <option value="">
                            {ts(
                              'chat.loopGraph.workGroup.staffing.autoSuggest',
                            )}
                          </option>
                          {staffablePaletteIds.map((paletteId) => {
                            const item = LOOP_PALETTE_ITEMS.find(
                              (entry) => entry.id === paletteId,
                            )
                            return (
                              <option key={paletteId} value={paletteId}>
                                {item?.title ?? paletteId}
                              </option>
                            )
                          })}
                        </select>
                        <textarea
                          className={styles.workGroupPanelTextarea}
                          rows={2}
                          value={staffingReason}
                          placeholder={ts(
                            'chat.loopGraph.workGroup.staffing.reasonPlaceholder',
                          )}
                          onChange={(event) =>
                            setStaffingReason(event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className={styles.workGroupPanelAction}
                          onClick={() => {
                            const proposalId = proposeWorkGroupStaffing(
                              selectedGroup.id,
                              {
                                reason:
                                  staffingReason.trim() ||
                                  ts(
                                    'chat.loopGraph.workGroup.staffing.defaultReason',
                                  ),
                                ...(staffingPaletteId
                                  ? {
                                      suggestedPaletteItemId: staffingPaletteId,
                                    }
                                  : {}),
                                ...(selectedGroup.coordinatorNodeId
                                  ? {
                                      requestedByNodeId:
                                        selectedGroup.coordinatorNodeId,
                                    }
                                  : {}),
                              },
                            )
                            if (proposalId) {
                              setStaffingReason('')
                              setStaffingPaletteId('')
                            }
                          }}
                        >
                          {ts('chat.loopGraph.workGroup.staffing.propose')}
                        </button>
                      </div>
                      {(selectedGroup.staffingProposals ?? []).filter(
                        (item) => item.status === 'pending',
                      ).length > 0 ? (
                        <ul className={styles.workGroupStaffingList}>
                          {(selectedGroup.staffingProposals ?? [])
                            .filter((item) => item.status === 'pending')
                            .map((proposal) => {
                              const label =
                                proposal.suggestedTitle ??
                                LOOP_PALETTE_ITEMS.find(
                                  (entry) =>
                                    entry.id ===
                                    proposal.suggestedPaletteItemId,
                                )?.title ??
                                proposal.suggestedPaletteItemId ??
                                'Specialist'
                              return (
                                <li
                                  key={proposal.id}
                                  className={styles.workGroupStaffingItem}
                                >
                                  <div className={styles.workGroupStaffingMeta}>
                                    <strong>{label}</strong>
                                    <span>{proposal.reason}</span>
                                  </div>
                                  <div
                                    className={styles.workGroupStaffingActions}
                                  >
                                    <button
                                      type="button"
                                      className={styles.workGroupPanelAction}
                                      onClick={() => {
                                        void confirmWorkGroupStaffingProposal(
                                          selectedGroup.id,
                                          proposal.id,
                                        )
                                      }}
                                    >
                                      {ts(
                                        'chat.loopGraph.workGroup.staffing.accept',
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.workGroupPanelGhost}
                                      onClick={() =>
                                        dismissWorkGroupStaffingProposal(
                                          selectedGroup.id,
                                          proposal.id,
                                        )
                                      }
                                    >
                                      {ts(
                                        'chat.loopGraph.workGroup.staffing.dismiss',
                                      )}
                                    </button>
                                  </div>
                                </li>
                              )
                            })}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        className={styles.workGroupPanelDissolve}
                        onClick={() => dissolveWorkGroup(selectedGroup.id)}
                      >
                        {ts(
                          selectedGroup.departmentTemplateId
                            ? 'chat.loopGraph.workGroup.deleteDepartment'
                            : 'chat.loopGraph.workGroup.dissolve',
                        )}
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
                  x:
                    (rect.width / 2 - viewportRef.current.x) /
                    viewportRef.current.scale,
                  y:
                    (rect.height / 2 - viewportRef.current.y) /
                    viewportRef.current.scale,
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
        onCreateStageLayer={
          phase === 'draw' && !focusedWorkGroupId
            ? armCreateStageLayer
            : undefined
        }
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
              connectedIds={(() => {
                if (
                  wiringPicker.kind === 'mcp' ||
                  wiringPicker.kind === 'skill'
                ) {
                  return connectedWiringAssetIds(
                    wiringPicker.agentNodeId,
                    wiringPicker.kind,
                    draft,
                  )
                }
                // Model: single profile from a provides model satellite.
                const ids: string[] = []
                for (const edge of draft.edges) {
                  if (
                    edge.kind !== 'provides' ||
                    edge.target !== wiringPicker.agentNodeId
                  ) {
                    continue
                  }
                  const source = draft.nodes.find(
                    (node) => node.id === edge.source,
                  )
                  const modelId = source?.configRef?.modelProfileId
                  if (source?.satelliteKind === 'model' && modelId) {
                    ids.push(modelId)
                  }
                }
                return ids
              })()}
              onCancel={() => setWiringPicker(null)}
              onPick={(asset) => {
                const agentNodeId = wiringPicker.agentNodeId
                setWiringPicker(null)
                if (
                  (asset.kind === 'mcp' || asset.kind === 'skill') &&
                  connectedWiringAssetIds(
                    agentNodeId,
                    asset.kind,
                    draft,
                  ).includes(asset.id)
                ) {
                  // Already wired — checkmark is informational; skip duplicate.
                  return
                }
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

      {wiringListPopover
        ? (() => {
            const listNode = draft.nodes.find(
              (node) => node.id === wiringListPopover.listNodeId,
            )
            if (!listNode || !isWiringListKind(listNode.satelliteKind)) {
              return null
            }
            const members = wiringListMembersOf(listNode)
            return createPortal(
              <LoopWiringListPopover
                kind={wiringListPopover.kind}
                title={listNode.title || visualForIntentNode(listNode).shortLabel}
                members={members}
                anchor={wiringListPopover.anchor}
                onClose={() => setWiringListPopover(null)}
                onRemove={(memberId) => {
                  removeWiringListMember(listNode.id, memberId)
                  // List may expand/delete after normalize — close if gone.
                  const next = useLoopGraphStore.getState().document?.draft
                  const still = next?.nodes.find((node) => node.id === listNode.id)
                  if (!still || !isWiringListKind(still.satelliteKind)) {
                    setWiringListPopover(null)
                  }
                }}
                onAdd={() => {
                  setWiringListPopover(null)
                  const agent = findProvidesAgentForSatellite(listNode.id, draft)
                  if (!agent) return
                  setWiringPicker({
                    agentNodeId: agent.id,
                    kind: wiringListPopover.kind,
                    anchor: wiringListPopover.anchor,
                  })
                }}
              />,
              globalThis.document.body,
            )
          })()
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
