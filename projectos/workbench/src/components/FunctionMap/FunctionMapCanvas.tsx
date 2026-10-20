import { useEffect, useLayoutEffect, useMemo, useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  useReactFlow,
  useNodesState,
  type Node,
  type NodeChange,
  type Edge,
  type FitViewOptions,
  type Viewport,
  type OnNodeDrag,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import { useFunctionMap } from './FunctionMapContext'
import FeatureNode, { isPurposeFirstArchitectureLevel } from './FeatureNode'
import { nodeCardBlurb } from './nodeCopy'
import ArchitectureLayerNode from './ArchitectureLayerNode'
import FloatingStraightEdge from './FloatingStraightEdge'
import C4OrthogonalEdge from './c4/C4OrthogonalEdge'
import { fitEdgeLabel } from './c4/edgeLabelFit'
import { routeAllOrthogonalEdges, type OrthogonalRouteResult, type RouteRect, type RoutedEdgeSpec } from './c4/orthogonalRoute'
import { liveRouteFrame } from './c4/liveEdgeRoutes'
import { fitBoundaryToMembers, snapshotBoundaryMembers } from './c4/boundaryFit'
import { mapArtifactNodeTypes } from './mapArtifactNodeTypes'
import C4FlowNode from './c4/C4FlowNode'
import C4BoundaryFlowNode from './c4/C4BoundaryFlowNode'
import { buildDiagram } from './c4/buildDiagram'
import { layoutFromC4Diagram } from './c4/layoutFromC4Diagram'
import { applyElkLayoutToDiagram } from './c4/layoutWithElk'
import {
  applyOverlayToPositions,
  clearC4LayoutOverlayForView,
  loadC4LayoutOverlay,
  pruneC4LayoutOverlayForView,
  upsertC4LayoutPositions,
} from './c4/c4LayoutOverlay'
import type { C4Diagram } from './c4/types'
import type {
  ArchitectureLayer,
  FunctionalEdge,
  FunctionalNode,
  MapArtifact,
  MapArtifactType,
} from '@contracts/index'
import {
  deriveExecutionEdges,
  focusNodeIdSet,
  summarizeNodeLiveActivity,
} from '../../../../services/live-graph/index.js'
import { impactStructureGraph } from '../../../../services/structure-graph-impact.js'
import type { LiveExecutionEdge } from '@contracts/index'
import type { BoundsRect } from '@contracts/index'
import {
  getActiveStackMember,
  getStackMembers,
  getStackNodeId,
  groupArtifactsForCanvas,
  type MapArtifactStackGroup,
  collectCanvasUnitBounds,
  computeWorkGroupFrameBounds,
  getMemberNodeBounds,
  getWorkGroupMemberNodeId,
  propagateWorkGroupMemberResize,
  WORK_GROUP_MEMBER_GAP,
} from '@contracts/index'
import MapSnapGuides from './MapSnapGuides'
import {
  isAdjacentSnapKind,
  isDetachedFromGroup,
  commitArtifactSnap,
  expandSnapThresholds,
  resolveArtifactSnap,
  resolveArtifactSnapWithSticky,
  shouldPreferTabMerge,
  snapThresholdsForZoom,
  type SnapGuideLine,
  type SnapResult,
} from './mapArtifactSnap'
import {
  createViewportPersistenceGuard,
  fitSingleMatchingNode,
} from './viewportPersistenceGuard'
import {
  applyArtifactDragMutationWithRollback,
  clearWorkGroupDragStartPositions,
  consumeArtifactDragStartPosition,
  type ArtifactDragPosition,
} from './artifactDragPersistence'
import { createFunctionMapNodeIdIndex } from './functionMapNodeClassification'
import {
  separateFromObstacles,
  translateBounds,
  Z_ARTIFACT,
  Z_DRAG_LIFT,
  Z_FEATURE,
  Z_WORKGROUP,
} from './mapWorkGroupOverlap'
import { getMapArtifactDisplayTitle } from './mapArtifactTitle'
import { resolveArtifactDropTarget } from './mapArtifactStack'
import styles from './FunctionMap.module.css'
import FunctionMapContextMenu, {
  type FunctionMapContextMenuState,
} from './FunctionMapContextMenu'
import MapArtifactHeaderContextMenu, {
  type MapArtifactHeaderContextMenuState,
} from './MapArtifactHeaderContextMenu'
import MapArtifactTitleDialog from './MapArtifactTitleDialog'
import MapWorkGroupCreateDialog from './MapWorkGroupCreateDialog'
import {
  buildMapArtifactTitlePatch,
  getMapArtifactStoredTitle,
} from './mapArtifactTitle'
import type { MapArtifactResizeEndParams } from './useMapArtifactPointerResize'
import { blurActiveNoteEditor } from './noteEditor/noteSelectionUtils'
import type { MapArtifactPlacement } from '../../state/mapArtifactCreateFlow'
import { pickMapImageFile } from './pickMapImageFile'
import { computeMapImageCardSize } from '@contracts/index'
import {
  type GridArea,
  DEFAULT_GRID_AREA,
  NODE_WIDTH,
  NODE_HEIGHT,
  GRID_MARGIN,
  MIN_FIT_ZOOM,
  computeFillGridLayout,
} from './autoGridLayout'
import { computeCrossMinLayout, type ExclusionRect } from './crossMinLayout'
import {
  clearMapViewportSession,
  getUserMapViewport,
  peekMapViewportSession,
  rememberUserMapViewport,
  syncAutoMapViewport,
} from './mapViewportSession'
import {
  computeLayeredArchitectureLayout,
  type ArchitectureLayerBandLayout,
} from './layeredArchitectureLayout'
import {
  resolveRenderableLayerBands,
  sanitizeLayerBandsForNodes,
} from './mergeFullLayerBands'
import { EDGE_COLORS, formatC4EdgeLabel } from './edgePresentation'
import C4NodeDetailDrawer from './C4NodeDetailDrawer'
import {
  openCodeNodeFile,
  openCodeNodeInEditor,
  resolveCodeNodeTarget,
} from './codeNodeInteraction'
import {
  resolveMapBlankDoubleClickAction,
  resolveMapNodeDoubleClickAction,
} from './mapLayerNavigation'
import {
  architectureScopeForSelection,
  computeOneHopLinkedIds,
  projectArchitectureView,
} from './architectureView'
import { useReducedMotion3d } from './hooks/useReducedMotion3d'
import {
  LAYER_FOCUS_TRANSITION_MS,
  sampleLayerFocusTransition,
  type LayerFocusLayoutSnapshot,
  type LayerFocusTransition,
  type LayerFocusTransitionSample,
} from './layerFocusTransition'

function layoutSnapshotToLayerFocus(snapshot: LayoutSnapshot): LayerFocusLayoutSnapshot {
  return {
    positionsById: snapshot.positionsById,
    layerBands: snapshot.layerBands,
    viewport: snapshot.viewport,
  }
}

function layerBandFramesToLayoutBands(
  frames: LayerFocusTransitionSample['layerBands'],
): ArchitectureLayerBandLayout[] {
  return frames.map((band) => ({
    id: band.id,
    label: band.label,
    description: band.description,
    position: band.position,
    width: band.width,
    height: band.height,
  }))
}

function sampleToLayoutSnapshot(
  sample: LayerFocusTransitionSample,
  area: GridArea,
): LayoutSnapshot {
  return {
    area,
    positionsById: sample.positionsById,
    layerBands: layerBandFramesToLayoutBands(sample.layerBands),
    viewport: sample.viewport,
  }
}

interface ActiveLayerFocusTransition extends LayerFocusTransition {
  layoutFromFull: LayoutSnapshot
  layoutToFull: LayoutSnapshot
  pendingComplete?: boolean
}

const ARTIFACT_LINK_EDGE_COLOR = 'var(--color-violet)'

const LIVE_EXEC_EDGE_COLORS: Record<LiveExecutionEdge['kind'], string> = {
  read_context: '#3b82f6',
  edit_create: '#f59e0b',
  impact: '#a78bfa',
  delegation: '#14b8a6',
}

function toLiveExecutionFlowEdge(
  edge: LiveExecutionEdge,
  resolveOpacity: (edgeId: string, sourceId: string, targetId: string) => number,
): Edge {
  const color = LIVE_EXEC_EDGE_COLORS[edge.kind]
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: 'floatingStraight' as const,
    animated: edge.kind !== 'impact',
    selectable: false,
    focusable: false,
    data: {
      liveExecution: true,
      liveKind: edge.kind,
      inferred: edge.inferred,
      detailVisibility: 'always',
      relationship: edge.label,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color,
    },
    style: {
      stroke: color,
      strokeWidth: edge.kind === 'impact' ? 1.4 : 2,
      strokeDasharray: edge.inferred ? '2 4' : '8 4',
      opacity: resolveOpacity(edge.id, edge.sourceNodeId, edge.targetNodeId),
    },
    label: edge.label,
    labelStyle: { fill: 'var(--color-text-primary)', fontSize: 10, fontWeight: 600 },
    labelBgStyle: {
      fill: 'var(--color-bg-elevated)',
      fillOpacity: 0.96,
      stroke: color,
      strokeOpacity: 0.35,
    },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 6,
    zIndex: 2,
    interactionWidth: 16,
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--color-success)',
  in_progress: 'var(--color-warning)',
  error: 'var(--color-error)',
  suggested: 'var(--color-text-muted)',
}

/** Feature cards (legacy) and classic C4 shapes share selection/drill handlers. */
function isArchitectureFlowNodeType(type: string | undefined): boolean {
  return type === 'feature' || type === 'c4Shape'
}

const nodeTypes = {
  architectureLayer: ArchitectureLayerNode,
  feature: FeatureNode,
  c4Shape: C4FlowNode,
  c4Boundary: C4BoundaryFlowNode,
  ...mapArtifactNodeTypes,
}

/** Dashed C4 system/container frame — below feature nodes. */
const Z_C4_BOUNDARY = 1
const edgeTypes = {
  floatingStraight: FloatingStraightEdge,
  c4Orthogonal: C4OrthogonalEdge,
}

function parallelEdgeIndex(
  edges: Array<{ id: string; source: string; target: string }>,
  edgeId: string,
  source: string,
  target: string,
): { parallelIndex: number; parallelCount: number } {
  const key = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`)
  const pair = key(source, target)
  const siblings = edges.filter((edge) => key(edge.source, edge.target) === pair)
  const parallelIndex = Math.max(
    0,
    siblings.findIndex((edge) => edge.id === edgeId),
  )
  return { parallelIndex, parallelCount: Math.max(1, siblings.length) }
}

// Allow nodes to grow past native size so the graph fills the panel instead of
// sitting small in the middle. The edge-aware layout already matches the panel
// aspect, so this mostly enlarges rather than spreads. Raised so large/wide
// panels are not capped before the grid actually fills the available area.
const FIT_MAX_ZOOM = 2.2
const DEFAULT_FIT_OPTIONS: FitViewOptions = { padding: 0.24, maxZoom: FIT_MAX_ZOOM }
/** Breathing room kept between a node box and the zoom controls / minimap. */
const CHROME_EXCLUSION_GAP = 12

interface Props {
  bleed?: boolean
}

/** True visible function-map viewport in canvas-relative pixels. */
interface SafeRect {
  sx: number
  sy: number
  sw: number
  sh: number
  /**
   * Rectangles (canvas-relative px) of overlay chrome — zoom controls and the
   * minimap — that nodes must not sit under. The full viewport is usable except
   * these corners.
   */
  chromeRects: { x: number; y: number; w: number; h: number }[]
  /**
   * True when bleed mode had to use the full canvas because the chrome
   * sentinel was not measurable yet. That rect is replaced a frame later
   * and must not move the camera.
   */
  provisional?: boolean
}

interface LayoutEdgeInput {
  source: string
  target: string
}

interface LayoutSnapshot {
  area: GridArea
  positionsById: Record<string, { x: number; y: number }>
  layerBands: ArchitectureLayerBandLayout[]
  viewport: Viewport
}

function layoutSnapshotsEqual(a: LayoutSnapshot, b: LayoutSnapshot, epsilon = 0.5): boolean {
  if (
    Math.abs(a.area.originX - b.area.originX) >= epsilon ||
    Math.abs(a.area.originY - b.area.originY) >= epsilon ||
    Math.abs(a.area.width - b.area.width) >= epsilon ||
    Math.abs(a.area.height - b.area.height) >= epsilon
  ) {
    return false
  }

  if (
    Math.abs(a.viewport.x - b.viewport.x) >= epsilon ||
    Math.abs(a.viewport.y - b.viewport.y) >= epsilon ||
    Math.abs(a.viewport.zoom - b.viewport.zoom) >= 0.001
  ) {
    return false
  }

  const aIds = Object.keys(a.positionsById)
  const bIds = Object.keys(b.positionsById)
  if (aIds.length !== bIds.length) return false

  for (const id of aIds) {
    const aPos = a.positionsById[id]
    const bPos = b.positionsById[id]
    if (!aPos || !bPos) return false
    if (Math.abs(aPos.x - bPos.x) >= epsilon || Math.abs(aPos.y - bPos.y) >= epsilon) {
      return false
    }
  }

  if (a.layerBands.length !== b.layerBands.length) return false
  for (let index = 0; index < a.layerBands.length; index += 1) {
    const aBand = a.layerBands[index]
    const bBand = b.layerBands[index]
    if (!aBand || !bBand || aBand.id !== bBand.id) return false
    if (
      Math.abs(aBand.position.x - bBand.position.x) >= epsilon ||
      Math.abs(aBand.position.y - bBand.position.y) >= epsilon ||
      Math.abs(aBand.width - bBand.width) >= epsilon ||
      Math.abs(aBand.height - bBand.height) >= epsilon
    ) {
      return false
    }
  }

  return true
}

function measureSafeRect(
  flowEl: HTMLElement,
  bleed: boolean,
  viewportChromeEl: HTMLElement | null,
  chromeInsets: { left: number; right: number; top: number; bottom: number },
): SafeRect | null {
  const flowRect = flowEl.getBoundingClientRect()
  if (flowRect.width < 1 || flowRect.height < 1) return null

  let safeLeft: number
  let safeTop: number
  let safeRight: number
  let safeBottom: number
  let provisional = false

  if (bleed && viewportChromeEl) {
    const chromeRect = viewportChromeEl.getBoundingClientRect()
    if (chromeRect.width >= 1 && chromeRect.height >= 1) {
      safeLeft = chromeRect.left
      safeTop = chromeRect.top
      safeRight = chromeRect.right
      safeBottom = chromeRect.bottom
    } else if (chromeInsets.top > 40) {
      // Sentinel ref attached but not yet measurable — use published insets.
      safeLeft = chromeInsets.left
      safeTop = chromeInsets.top
      safeRight = window.innerWidth - chromeInsets.right
      safeBottom = window.innerHeight - chromeInsets.bottom
    } else {
      // Fall back to the full bleed canvas until chrome metrics are ready.
      provisional = true
      safeLeft = flowRect.left
      safeTop = flowRect.top
      safeRight = flowRect.right
      safeBottom = flowRect.bottom
    }
  } else if (bleed && chromeInsets.top > 40) {
    // Fallback while the sentinel ref is attaching — chromeInsets are
    // published by MapChromeAnchor from the same rect.
    safeLeft = chromeInsets.left
    safeTop = chromeInsets.top
    safeRight = window.innerWidth - chromeInsets.right
    safeBottom = window.innerHeight - chromeInsets.bottom
  } else {
    provisional = bleed
    safeLeft = flowRect.left
    safeTop = flowRect.top
    safeRight = flowRect.right
    safeBottom = flowRect.bottom
  }

  // We intentionally do NOT reserve the whole bottom band above the zoom
  // controls (bottom-left) and minimap (bottom-right). Those widgets only sit in
  // the two corners, so reserving a full-width strip wasted the bottom-center of
  // the viewport. Instead we keep the full rect usable and export the exact
  // widget rectangles as exclusion zones — the layout fills the space between
  // the controls and minimap while leaving those corners empty.
  const chromeRects: { x: number; y: number; w: number; h: number }[] = []
  flowEl.querySelectorAll('.react-flow__controls, .react-flow__minimap').forEach((el) => {
    const r = (el as HTMLElement).getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return
    chromeRects.push({
      x: r.left - flowRect.left,
      y: r.top - flowRect.top,
      w: r.width,
      h: r.height,
    })
  })

  const sw = safeRight - safeLeft
  const sh = safeBottom - safeTop
  if (sw < NODE_WIDTH || sh < NODE_HEIGHT) return null

  return {
    sx: safeLeft - flowRect.left,
    sy: safeTop - flowRect.top,
    sw,
    sh,
    chromeRects,
    provisional,
  }
}

function sanitizeLayoutBands(
  bands: ArchitectureLayerBandLayout[],
  nodes: FunctionalNode[],
  positionsById: Record<string, { x: number; y: number }>,
  configuredLayers: ArchitectureLayer[] | undefined,
): ArchitectureLayerBandLayout[] {
  return sanitizeLayerBandsForNodes({
    bands,
    nodes,
    positionsById,
    configuredLayers,
  })
}

function buildLayout(
  nodes: FunctionalNode[],
  edges: LayoutEdgeInput[],
  layers: ArchitectureLayer[],
  safe: SafeRect,
): LayoutSnapshot {
  const nodeIds = nodes.map((node) => node.id)
  const area: GridArea = {
    originX: 0,
    originY: 0,
    width: Math.max(NODE_WIDTH, safe.sw - GRID_MARGIN * 2),
    height: Math.max(NODE_HEIGHT, safe.sh - GRID_MARGIN * 2),
  }

  const padW = safe.sw - GRID_MARGIN * 2
  const padH = safe.sh - GRID_MARGIN * 2

  type Bounds = { minX: number; minY: number; width: number; height: number }
  const fit = (bounds: Bounds) => {
    const zoom = Math.min(
      FIT_MAX_ZOOM,
      Math.max(
        MIN_FIT_ZOOM,
        Math.min(padW / Math.max(bounds.width, 1), padH / Math.max(bounds.height, 1)),
      ),
    )
    const tx = safe.sx + GRID_MARGIN + (padW - bounds.width * zoom) / 2 - bounds.minX * zoom
    const ty = safe.sy + GRID_MARGIN + (padH - bounds.height * zoom) / 2 - bounds.minY * zoom
    return { zoom, tx, ty }
  }

  const layoutOnce = (exclusions: ExclusionRect[]) =>
    computeCrossMinLayout(nodeIds, edges, area, exclusions)

  // Map a chrome widget rect (canvas px) into layout/grid space using a fit:
  //   gridCoord = (canvasPx - translate) / zoom - GRID_MARGIN
  // (the layout normalizes so the grid's own origin sits at +GRID_MARGIN).
  const toExclusions = (f: { zoom: number; tx: number; ty: number }): ExclusionRect[] =>
    safe.chromeRects.map((r) => ({
      x: (r.x - CHROME_EXCLUSION_GAP - f.tx) / f.zoom - GRID_MARGIN,
      y: (r.y - CHROME_EXCLUSION_GAP - f.ty) / f.zoom - GRID_MARGIN,
      w: (r.w + CHROME_EXCLUSION_GAP * 2) / f.zoom,
      h: (r.h + CHROME_EXCLUSION_GAP * 2) / f.zoom,
    }))

  if (nodes.length > 0 && nodes.every((node) => node.layer)) {
    const layered = computeLayeredArchitectureLayout(nodes, layers, area, edges)
    const f = fit(layered.bounds)
    return {
      area,
      positionsById: layered.positionsById,
      layerBands: layered.bands,
      viewport: { x: f.tx, y: f.ty, zoom: f.zoom },
    }
  }

  // Start from an exclusion-free layout to learn the transform, then iterate:
  // the fit zoom feeds the chrome→grid mapping and re-packing can change the
  // zoom, so repeat until the fit stabilizes (a few passes converge).
  let layout = layoutOnce([])
  let f = fit(layout.bounds)
  if (safe.chromeRects.length > 0) {
    for (let iter = 0; iter < 4; iter++) {
      const next = layoutOnce(toExclusions(f))
      const nf = fit(next.bounds)
      const stable = Math.abs(nf.zoom - f.zoom) < 0.01
      layout = next
      f = nf
      if (stable) break
    }
    // Final pack using the settled transform so the excluded cells match the
    // exact on-screen zoom/translate (removes sub-pixel grazes with chrome).
    layout = layoutOnce(toExclusions(f))
  }

  return {
    area,
    positionsById: layout.positionsById,
    layerBands: [],
    viewport: { x: f.tx, y: f.ty, zoom: f.zoom },
  }
}

function defaultPositionsById(nodeIds: string[]): Record<string, { x: number; y: number }> {
  const grid = computeFillGridLayout(nodeIds.length, DEFAULT_GRID_AREA)
  const out: Record<string, { x: number; y: number }> = {}
  nodeIds.forEach((id, i) => {
    out[id] = grid.positions[i] ?? { x: 0, y: 0 }
  })
  return out
}

function resolveArtifactScopeLabel(
  artifact: MapArtifact,
  featureNodes: { id: string; name: string }[],
  ts: (key: string) => string,
): string {
  if (artifact.scope === 'project') {
    return ts('mapArtifacts.scopeProject')
  }
  const node = featureNodes.find((candidate) => candidate.id === artifact.nodeId)
  return node?.name ?? artifact.nodeId ?? ts('mapArtifacts.scopeNode')
}

function boundsFromFlowNode(node: Node): BoundsRect | null {
  const width =
    (typeof node.measured?.width === 'number' ? node.measured.width : undefined) ??
    (typeof node.width === 'number' ? node.width : undefined) ??
    (typeof node.style?.width === 'number' ? node.style.width : undefined)
  const height =
    (typeof node.measured?.height === 'number' ? node.measured.height : undefined) ??
    (typeof node.height === 'number' ? node.height : undefined) ??
    (typeof node.style?.height === 'number' ? node.style.height : undefined)
  if (width === undefined || height === undefined) {
    return null
  }
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  }
}

function collectWorkGroupFrameBounds(
  artifacts: MapArtifact[],
  workGroups: { id: string; memberNodeIds: string[] }[],
  excludeWorkGroupIds?: Iterable<string | null | undefined>,
): BoundsRect[] {
  const excluded = new Set(
    [...(excludeWorkGroupIds ?? [])].filter((id): id is string => typeof id === 'string'),
  )
  const frames: BoundsRect[] = []
  for (const group of workGroups) {
    if (excluded.has(group.id)) {
      continue
    }
    const frame = computeWorkGroupFrameBounds(
      collectCanvasUnitBounds(artifacts, group.memberNodeIds),
    )
    if (frame) {
      frames.push({ ...frame, id: group.id })
    }
  }
  return frames
}

/** Free features + free (non-member) artifacts that a WorkGroup must not cover. */
function collectForeignNodeObstaclesForWorkGroup(
  flowNodes: Node[],
  memberNodeIds: Set<string>,
): BoundsRect[] {
  const obstacles: BoundsRect[] = []
  for (const node of flowNodes) {
    if (node.type === 'map_workgroup') {
      continue
    }
    if (node.type === 'map_artifact_stack') {
      if (memberNodeIds.has(node.id)) {
        continue
      }
      const bounds = boundsFromFlowNode(node)
      if (bounds) {
        obstacles.push(bounds)
      }
      continue
    }
    if (isArchitectureFlowNodeType(node.type)) {
      const width =
        typeof node.style?.width === 'number'
          ? node.style.width
          : typeof node.width === 'number'
            ? node.width
            : NODE_WIDTH
      const height =
        typeof node.style?.height === 'number'
          ? node.style.height
          : typeof node.height === 'number'
            ? node.height
            : NODE_HEIGHT
      obstacles.push({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width,
        height,
      })
    }
  }
  return obstacles
}

function clearDragElevation(setFlowNodes: (updater: (current: Node[]) => Node[]) => void) {
  setFlowNodes((current) =>
    current.map((node) => {
      if (node.type === 'map_workgroup') {
        return node.zIndex === Z_WORKGROUP ? node : { ...node, zIndex: Z_WORKGROUP }
      }
      if (node.type === 'map_artifact_stack') {
        return node.zIndex === Z_ARTIFACT ? node : { ...node, zIndex: Z_ARTIFACT }
      }
      if (isArchitectureFlowNodeType(node.type)) {
        return node.zIndex === Z_FEATURE ? node : { ...node, zIndex: Z_FEATURE }
      }
      return node
    }),
  )
}

function resolveGeometryArtifactId(
  nodeId: string,
  artifacts: MapArtifact[],
): string | null {
  const solo = artifacts.find((artifact) => artifact.id === nodeId)
  if (solo) return solo.id
  const members = getStackMembers(artifacts, nodeId)
  if (members.length === 0) return null
  return getActiveStackMember(members).id
}

function positionsApproxEqual(
  a: { x: number; y: number },
  b: { x: number; y: number },
  epsilon = 0.5,
) {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon
}

/**
 * Merge store-derived node data into an existing flow node without dropping RF metrics.
 * Losing `measured`/`width`/`height` makes cards/features vanish (visibility:hidden) while
 * WorkGroup frames remasure and reappear first — matching the “only WG boxes remain” bug.
 */
function mergeDerivedFlowNode(derived: Node, existing: Node): Node {
  const derivedWidth =
    typeof derived.width === 'number'
      ? derived.width
      : typeof derived.style?.width === 'number'
        ? derived.style.width
        : undefined
  const derivedHeight =
    typeof derived.height === 'number'
      ? derived.height
      : typeof derived.style?.height === 'number'
        ? derived.style.height
        : undefined

  const width = derivedWidth ?? existing.width ?? existing.measured?.width
  const height = derivedHeight ?? existing.height ?? existing.measured?.height

  let measured = existing.measured
  if (typeof width === 'number' && typeof height === 'number') {
    if (!measured || measured.width !== width || measured.height !== height) {
      measured = { width, height }
    }
  }

  return {
    ...derived,
    selected: existing.selected,
    dragging: existing.dragging,
    measured,
    ...(typeof width === 'number' ? { width } : null),
    ...(typeof height === 'number' ? { height } : null),
  }
}

function applyWorkGroupFrameToFlowNode(
  node: Node,
  frame: { x: number; y: number; width: number; height: number },
): Node {
  return {
    ...node,
    position: { x: frame.x, y: frame.y },
    width: frame.width,
    height: frame.height,
    style: {
      ...node.style,
      width: frame.width,
      height: frame.height,
      pointerEvents: 'none',
    },
  }
}

/** Ignore callback/closure identity churn inside node.data — only visual/content fields matter. */
function joinFlowNodeVisualKey(parts: readonly unknown[]): string {
  return parts
    .map((part) => {
      const value = part === undefined ? 'undefined' : String(part)
      return `${value.length}:${value}`
    })
    .join('')
}

function flowNodeDataVisualKey(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>
  if (node.type === 'feature') {
    const live = data.liveSummary as { primaryKind?: string; primaryStatus?: string; activeCount?: number } | null | undefined
    return joinFlowNodeVisualKey([
      data.label,
      data.nameEn,
      data.status,
      data.nodeType,
      data.route,
      data.fileCount,
      data.confidence,
      data.isSelected,
      data.isBouncing,
      data.dimmed,
      data.focusOpacity,
      data.flash,
      live?.primaryKind,
      live?.primaryStatus,
      live?.activeCount,
    ])
  }
  if (node.type === 'c4Shape') {
    const members = Array.isArray(data.members) ? data.members.join(',') : ''
    const live = data.liveSummary as { primaryKind?: string; primaryStatus?: string; activeCount?: number } | null | undefined
    return joinFlowNodeVisualKey([
      data.shape,
      data.label,
      data.description,
      data.technology,
      data.stereotype,
      members,
      data.selected,
      data.dimmed,
      data.canOpenGraph,
      data.openGraphLabel,
      live?.primaryKind,
      live?.primaryStatus,
      live?.activeCount,
    ])
  }
  if (node.type === 'c4Boundary') {
    return joinFlowNodeVisualKey([
      data.label,
      data.description,
      data.collapsed ? 'collapsed' : 'expanded',
    ])
  }
  if (node.type === 'map_artifact_stack') {
    const active = data.activeArtifact as {
      id?: string
      title?: string
      size?: { width?: number; height?: number }
    } | undefined
    const members = data.stackMembers as Array<{ id?: string }> | undefined
    return joinFlowNodeVisualKey([
      data.artifactId,
      data.stackNodeId,
      data.scopeLabel,
      data.isSelected,
      data.linked,
      data.dimmed,
      active?.id,
      active?.title,
      active?.size?.width,
      active?.size?.height,
      joinFlowNodeVisualKey(members?.map((member) => member.id) ?? []),
    ])
  }
  if (node.type === 'map_workgroup') {
    return joinFlowNodeVisualKey([
      data.workGroupId,
      data.title,
      data.isSelected,
      data.dimmed,
    ])
  }
  if (node.type === 'architectureLayer') {
    return JSON.stringify({
      label: data.label,
      opacity: data.opacity,
    })
  }
  return String(node.id)
}

function buildStackFlowNode(
  group: MapArtifactStackGroup,
  options: {
    selectedNodeId: string | null
    selectedArtifactId: string | null
    scopeLabelFor: (artifact: MapArtifact) => string
    onHeaderContextMenu?: (event: ReactMouseEvent, artifact: MapArtifact) => void
    onStackDetach: (artifactId: string, screenPoint: { x: number; y: number }) => void
    onStackMerge: (artifactId: string, targetNodeId: string) => void
    onStackReorder?: (stackId: string, orderedIds: string[]) => void
    onGeometryResizeStart?: (memberNodeId: string) => void
    onGeometryResize?: (memberNodeId: string, params: MapArtifactResizeEndParams) => void
    onGeometryResizeEnd?: (
      memberNodeId: string,
      params: MapArtifactResizeEndParams,
    ) => void | Promise<void>
  },
): Node {
  const active = group.active
  const linked =
    !!options.selectedNodeId &&
    active.scope === 'node' &&
    active.nodeId === options.selectedNodeId
  const dimmed = !!options.selectedNodeId && !linked
  const isSelected = group.members.some((member) => member.id === options.selectedArtifactId)

  return {
    id: group.nodeId,
    type: 'map_artifact_stack',
    position: active.position,
    draggable: true,
    width: active.size.width,
    height: active.size.height,
    style: { width: active.size.width, height: active.size.height },
    data: {
      artifact: active,
      artifactId: active.id,
      activeArtifact: active,
      stackMembers: group.members,
      stackNodeId: group.nodeId,
      scopeLabel: options.scopeLabelFor(active),
      isSelected,
      linked,
      dimmed,
      onHeaderContextMenu: options.onHeaderContextMenu
        ? (event: ReactMouseEvent) => options.onHeaderContextMenu?.(event, active)
        : undefined,
      onStackDetach: options.onStackDetach,
      onStackMerge: options.onStackMerge,
      onStackReorder:
        group.stackId && options.onStackReorder
          ? (orderedIds: string[]) => options.onStackReorder?.(group.stackId!, orderedIds)
          : undefined,
      onGeometryResizeStart: options.onGeometryResizeStart,
      onGeometryResize: options.onGeometryResize,
      onGeometryResizeEnd: options.onGeometryResizeEnd,
    },
  }
}

function FunctionMapCanvasInner({ bleed }: Props) {
  const { fitView, setViewport, screenToFlowPosition, getViewport, getNodes } = useReactFlow()
  const {
    nodes,
    edges,
    graphNodes,
    graphEdges,
    fileIndex,
    fileRelations,
    architecture,
    architectureViews,
    architectureLevel,
    architectureScopeId,
    activeViewKey,
    collapsedBoundaryIds,
    toggleBoundaryCollapsed,
    layoutResetToken,
    confidencePerspective,
    showArtifacts,
    selectedNodeId,
    onSelectNode,
    onSelectFile,
    onClearSelection,
    search,
    mapSearchFocus,
    clearMapSearchFocus,
    backdropRef,
    chromeInsetsRef,
    viewportChromeRef,
    syncChromeInsetCssVars,
    setHoverPreview,
    flowRef,
    clearPreviewTimer,
    schedulePreview,
    lockPreviewForNodeDrag,
    unlockPreviewAfterNodeDrag,
    nudgePreviewDwell,
    previewDragLockRef,
    moveHoverPreview,
    galaxyPointerRef,
    hoverPreviewRef,
    canDrillIntoNode,
    drillIntoNode,
    drillOut,
    isLayerFocusActive,
    clearLayerFocus,
  } = useFunctionMap()
  const reducedMotion = useReducedMotion3d()
  const isLayerFocusActiveRef = useRef(isLayerFocusActive)
  isLayerFocusActiveRef.current = isLayerFocusActive
  const bouncingNodeIds = useWorkbenchStore((s) => s.bouncingNodeIds)
  const flashKey = useWorkbenchStore((s) => s.flashKey)
  const executionOverlay = useWorkbenchStore((s) => s.executionOverlay)
  const liveGraphFocusTaskId = useWorkbenchStore((s) => s.liveGraphFocusTaskId)
  const durableGraph = useWorkbenchStore((s) => s.graph)
  const liveFocusNodeIds = useMemo(
    () =>
      liveGraphFocusTaskId
        ? focusNodeIdSet(executionOverlay, liveGraphFocusTaskId)
        : null,
    [executionOverlay, liveGraphFocusTaskId],
  )
  const mapContent = useWorkbenchStore((s) => s.mapContent)
  const selectedArtifactId = useWorkbenchStore((s) => s.selectedArtifactId)
  const mapArtifactCreateFlow = useWorkbenchStore((s) => s.mapArtifactCreateFlow)
  const mapArtifactRenameFlow = useWorkbenchStore((s) => s.mapArtifactRenameFlow)
  const mapWorkGroupCreateFlow = useWorkbenchStore((s) => s.mapWorkGroupCreateFlow)
  const beginMapArtifactCreate = useWorkbenchStore((s) => s.beginMapArtifactCreate)
  const cancelMapArtifactCreate = useWorkbenchStore((s) => s.cancelMapArtifactCreate)
  const beginMapWorkGroupCreate = useWorkbenchStore((s) => s.beginMapWorkGroupCreate)
  const cancelMapWorkGroupCreate = useWorkbenchStore((s) => s.cancelMapWorkGroupCreate)
  const confirmMapWorkGroupCreate = useWorkbenchStore((s) => s.confirmMapWorkGroupCreate)
  const beginMapArtifactRename = useWorkbenchStore((s) => s.beginMapArtifactRename)
  const cancelMapArtifactRename = useWorkbenchStore((s) => s.cancelMapArtifactRename)
  const createMapArtifact = useWorkbenchStore((s) => s.createMapArtifact)
  const createMapImageArtifact = useWorkbenchStore((s) => s.createMapImageArtifact)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const updateMapArtifact = useWorkbenchStore((s) => s.updateMapArtifact)
  const selectArtifact = useWorkbenchStore((s) => s.selectArtifact)
  const beginMapArtifactStackAdd = useWorkbenchStore((s) => s.beginMapArtifactStackAdd)
  const detachArtifactFromStack = useWorkbenchStore((s) => s.detachArtifactFromStack)
  const attachArtifactToStack = useWorkbenchStore((s) => s.attachArtifactToStack)
  const applyMapWorkGroupMutation = useWorkbenchStore((s) => s.applyMapWorkGroupMutation)
  const updateMapWorkGroup = useWorkbenchStore((s) => s.updateMapWorkGroup)
  const reorderStackMembers = useWorkbenchStore((s) => s.reorderStackMembers)
  const locale = useWorkbenchStore((s) => s.locale)
  const teamSnapshot = useWorkbenchStore((s) => s.teamSnapshot)
  const resolvedTheme = useWorkbenchStore((s) => s.resolvedTheme)
  const openNodeAgentChat = useWorkbenchStore((s) => s.openNodeAgentChat)
  const openGlobalAgentChat = useWorkbenchStore((s) => s.openGlobalAgentChat)
  const openFileAgentChat = useWorkbenchStore((s) => s.openFileAgentChat)
  const { ts, messages } = useI18n()
  const [contextMenu, setContextMenu] = useState<FunctionMapContextMenuState | null>(null)
  const [headerContextMenu, setHeaderContextMenu] =
    useState<MapArtifactHeaderContextMenuState | null>(null)
  const [selectedWorkGroupId, setSelectedWorkGroupId] = useState<string | null>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuideLine[]>([])
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const activeSnapRef = useRef<{ nodeId: string; result: SnapResult } | null>(null)
  const nodeIdIndex = useMemo(
    () => createFunctionMapNodeIdIndex(mapContent?.artifacts ?? [], mapContent?.workGroups ?? []),
    [mapContent?.artifacts, mapContent?.workGroups],
  )
  const nodeIdIndexRef = useRef(nodeIdIndex)
  nodeIdIndexRef.current = nodeIdIndex
  const isMapArtifactCanvasNodeId = useCallback(
    (id: string) => nodeIdIndexRef.current.artifactCanvasNodeIds.has(id),
    [],
  )
  const isMapWorkGroupNodeId = useCallback(
    (id: string) => nodeIdIndexRef.current.workGroupNodeIds.has(id),
    [],
  )

  const searchLower = search.trim().toLowerCase()

  const architectureScope = useMemo(
    () =>
      architectureScopeId ? { parentId: architectureScopeId } : {},
    [architectureScopeId],
  )

  const c4DiagramBase = useMemo(() => {
    if (architecture?.notation !== 'c4') return null
    return buildDiagram({
      level: architectureLevel,
      nodes: graphNodes,
      edges: graphEdges,
      architecture,
      scope: architectureScope,
      views: architectureViews,
      ...(activeViewKey ? { viewKey: activeViewKey } : {}),
      fileIndex,
      fileRelations,
    })
  }, [
    architecture,
    architectureViews,
    architectureLevel,
    architectureScope,
    activeViewKey,
    graphNodes,
    graphEdges,
    fileIndex,
    fileRelations,
  ])
  const [c4Diagram, setC4Diagram] = useState<C4Diagram | null>(c4DiagramBase)
  // Layout must not fit the pre-ELK grid. The first camera is the laid-out
  // diagram only; fitting both is the double zoom jump seen on mount.
  const c4LayoutGenerationRef = useRef(0)
  const c4LaidOutGenerationRef = useRef(-1)
  const c4DiagramBaseRef = useRef(c4DiagramBase)
  c4DiagramBaseRef.current = c4DiagramBase
  useEffect(() => {
    if (!c4DiagramBase) {
      c4LaidOutGenerationRef.current = c4LayoutGenerationRef.current
      setC4Diagram(null)
      return
    }
    const generation = ++c4LayoutGenerationRef.current
    let cancelled = false
    void applyElkLayoutToDiagram(c4DiagramBase).then((laidOut) => {
      if (cancelled) return
      c4LaidOutGenerationRef.current = generation
      setC4Diagram(laidOut)
    })
    return () => {
      cancelled = true
    }
  }, [c4DiagramBase])
  const c4DiagramRef = useRef(c4Diagram)
  c4DiagramRef.current = c4Diagram

  const c4NodeById = useMemo(() => {
    if (!c4Diagram) return null
    return new Map(c4Diagram.nodes.map((node) => [node.id, node]))
  }, [c4Diagram])
  const c4NodeByIdRef = useRef(c4NodeById)
  c4NodeByIdRef.current = c4NodeById

  const boundaryMembership = useMemo(() => {
    if (!c4Diagram) return {} as Record<string, string[]>
    return snapshotBoundaryMembers(c4Diagram.boundaries, c4Diagram.nodes)
  }, [c4Diagram])
  const boundaryMembershipRef = useRef(boundaryMembership)
  boundaryMembershipRef.current = boundaryMembership

  const fullLayerGraph = useMemo(
    () =>
      projectArchitectureView(
        graphNodes,
        graphEdges,
        architectureLevel,
        architectureScope,
        fileIndex,
        fileRelations,
        {
          views: architectureViews,
          ...(activeViewKey ? { viewKey: activeViewKey } : {}),
        },
      ),
    [
      graphNodes,
      graphEdges,
      architectureLevel,
      architectureScope,
      architectureViews,
      activeViewKey,
      fileIndex,
      fileRelations,
    ],
  )

  const layerFocusNodeId = useMemo(() => {
    if (!isLayerFocusActive) return null
    const scope = architectureScopeForSelection(
      graphNodes,
      architectureLevel,
      selectedNodeId,
      fileIndex,
    )
    if (
      scope.focusNodeId &&
      scope.parentId === (architectureScopeId ?? undefined)
    ) {
      return scope.focusNodeId
    }
    return scope.focusNodeId ?? null
  }, [
    isLayerFocusActive,
    architectureLevel,
    graphNodes,
    selectedNodeId,
    architectureScopeId,
    fileIndex,
  ])

  const isLayeredArchitectureMap = useMemo(
    () =>
      fullLayerGraph.nodes.length > 0 &&
      fullLayerGraph.nodes.every((node) => node.layer),
    [fullLayerGraph.nodes],
  )

  const matchingIds = useMemo(() => {
    if (!searchLower) return null
    const ids = new Set<string>()
    const untitledLabel = ''

    for (const node of nodes) {
      const layerLabel = node.layer
        ? architecture?.layers.find((layer) => layer.id === node.layer)?.label
        : undefined
      const searchableText = [
        node.name,
        node.nameEn,
        node.description,
        node.summary,
        node.responsibility,
        node.technology,
        layerLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (searchableText.includes(searchLower)) {
        ids.add(node.id)
      }
    }

    for (const edge of edges) {
      if (
        [edge.label, edge.technology, edge.evidence]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchLower)
      ) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
    }

    for (const group of showArtifacts ? (mapContent?.workGroups ?? []) : []) {
      const groupMatches = group.title.toLowerCase().includes(searchLower)
      if (groupMatches) {
        ids.add(group.id)
        for (const memberNodeId of group.memberNodeIds) {
          ids.add(memberNodeId)
        }
      }
    }

    for (const artifact of showArtifacts ? (mapContent?.artifacts ?? []) : []) {
      const title = getMapArtifactDisplayTitle(artifact, untitledLabel).toLowerCase()
      if (title.includes(searchLower)) {
        ids.add(getStackNodeId(artifact))
        if (artifact.workGroupId) {
          ids.add(artifact.workGroupId)
        }
      }
    }

    return ids.size > 0 ? ids : new Set<string>()
  }, [nodes, edges, architecture, mapContent, searchLower, showArtifacts])

  const layoutRef = useRef<LayoutSnapshot | null>(null)
  /** Node ids visually elevated for the active drag (WG frame + members, or one free node). */
  const elevatedDragIdsRef = useRef<Set<string>>(new Set())
  const [layoutVersion, setLayoutVersion] = useState(0)
  const layoutVersionRef = useRef(layoutVersion)
  layoutVersionRef.current = layoutVersion
  const [layoutReady, setLayoutReady] = useState(false)
  const [flowHostReady, setFlowHostReady] = useState(false)
  const c4LivePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const c4DirtyNodeIdsRef = useRef<Set<string>>(new Set())
  const c4RouteRafRef = useRef<number | null>(null)
  const c4DragActiveRef = useRef(false)
  const c4PreviousRoutesRef = useRef<Map<string, OrthogonalRouteResult> | null>(null)
  const c4RoutingModelRef = useRef<{ nodes: RouteRect[]; edges: RoutedEdgeSpec[] } | null>(null)
  const pendingClickRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPaneClickRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [c4LiveFrame, setC4LiveFrame] = useState<{
    positions: Record<string, { x: number; y: number }>
    routes: Map<string, OrthogonalRouteResult>
  } | null>(null)
  const hasLaidOutRef = useRef(false)
  const layoutRafRef = useRef<number | null>(null)
  const layoutGraphKeyOnSnapshotRef = useRef<string | null>(null)
  const lastFlowSizeRef = useRef<{ width: number; height: number } | null>(null)
  /** Skip persisting programmatic setViewport/fitView as user pan/zoom. */
  const suppressViewportPersistRef = useRef(false)
  const layerFocusTransitionRef = useRef<ActiveLayerFocusTransition | null>(null)
  const layerFocusTransitionRafRef = useRef<number | null>(null)
  const lastFullLayerPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const fullLayerBandsRef = useRef<ArchitectureLayerBandLayout[]>([])
  const [layerFocusTransitionSample, setLayerFocusTransitionSample] =
    useState<LayerFocusTransitionSample | null>(null)
  const prevLayerFocusActiveRef = useRef(isLayerFocusActive)
  const prevLayerFocusNodeIdRef = useRef<string | null>(layerFocusNodeId)
  const isLayerFocusAnimating = layerFocusTransitionSample !== null

  const useC4Visuals = Boolean(
    !isLayerFocusAnimating && c4Diagram && c4Diagram.nodes.length > 0,
  )

  const collapsedMemberIds = useMemo(() => {
    const hidden = new Set<string>()
    if (!c4Diagram) return hidden
    for (const boundary of c4Diagram.boundaries) {
      if (!collapsedBoundaryIds.has(boundary.id)) continue
      for (const memberId of boundaryMembership[boundary.id] ?? []) {
        hidden.add(memberId)
      }
    }
    return hidden
  }, [c4Diagram, collapsedBoundaryIds, boundaryMembership])

  const displayFeatureNodes = useMemo(() => {
    if (isLayerFocusAnimating) return fullLayerGraph.nodes
    if (!useC4Visuals || !c4Diagram) return nodes
    const byId = new Map<string, FunctionalNode>()
    for (const node of graphNodes) byId.set(node.id, node)
    for (const node of nodes) byId.set(node.id, node)
    return c4Diagram.nodes
      .map((c4Node) => byId.get(c4Node.sourceNodeId) ?? byId.get(c4Node.id))
      .filter((node): node is FunctionalNode => Boolean(node))
      .filter((node) => !collapsedMemberIds.has(node.id))
      .map((node) =>
        confidencePerspective && node.confidence < 0.6
          ? { ...node, tags: Array.from(new Set([...node.tags, 'perspective-dim'])) }
          : node,
      )
  }, [
    isLayerFocusAnimating,
    fullLayerGraph.nodes,
    useC4Visuals,
    c4Diagram,
    nodes,
    graphNodes,
    collapsedMemberIds,
    confidencePerspective,
  ])

  const displayEdges = useMemo((): FunctionalEdge[] => {
    if (isLayerFocusAnimating) return fullLayerGraph.edges
    if (!useC4Visuals || !c4Diagram) return edges
    const memberToBoundary = new Map<string, string>()
    for (const [boundaryId, memberIds] of Object.entries(boundaryMembership)) {
      if (!collapsedBoundaryIds.has(boundaryId)) continue
      for (const memberId of memberIds) memberToBoundary.set(memberId, boundaryId)
    }
    return c4Diagram.edges.map((edge) => {
      const source = memberToBoundary.get(edge.source) ?? edge.source
      const target = memberToBoundary.get(edge.target) ?? edge.target
      return {
        id: edge.id,
        source,
        target,
        relation: edge.relation as FunctionalEdge['relation'],
        label: edge.label,
        purpose: edge.purpose,
        technology: edge.technology,
        confidence: edge.confidence ?? 1,
        evidence: undefined,
      }
    }).filter((edge) => edge.source !== edge.target)
  }, [
    isLayerFocusAnimating,
    fullLayerGraph.edges,
    useC4Visuals,
    c4Diagram,
    edges,
    boundaryMembership,
    collapsedBoundaryIds,
  ])

  const viewportPersistenceGuardRef = useRef<ReturnType<
    typeof createViewportPersistenceGuard
  > | null>(null)
  if (viewportPersistenceGuardRef.current === null) {
    viewportPersistenceGuardRef.current = createViewportPersistenceGuard()
  }
  const [fitOptions, setFitOptions] = useState<FitViewOptions>(DEFAULT_FIT_OPTIONS)
  const [defaultViewport, setDefaultViewport] = useState<Viewport>(
    () => peekMapViewportSession() ?? { x: 0, y: 0, zoom: 1 },
  )

  const nodeIds = useMemo(() => displayFeatureNodes.map((n) => n.id), [displayFeatureNodes])

  const handleArtifactHeaderContextMenu = useCallback(
    (event: ReactMouseEvent, artifact: MapArtifact) => {
      selectArtifact(artifact.id)
      setContextMenu(null)
      setHeaderContextMenu({
        x: event.clientX,
        y: event.clientY,
        artifactId: artifact.id,
        artifactType: artifact.type,
        ...(event.currentTarget instanceof HTMLElement
          ? { restoreFocusTo: event.currentTarget }
          : {}),
      })
    },
    [selectArtifact],
  )

  const handleStackTabDetach = useCallback(
    (artifactId: string, screenPoint: { x: number; y: number }) => {
      const position = screenToFlowPosition(screenPoint)
      void detachArtifactFromStack(artifactId, position)
    },
    [detachArtifactFromStack, screenToFlowPosition],
  )

  const handleStackTabMerge = useCallback(
    (artifactId: string, targetNodeId: string) => {
      void attachArtifactToStack(artifactId, targetNodeId)
    },
    [attachArtifactToStack],
  )

  const handleStackTabReorder = useCallback(
    (stackId: string, orderedIds: string[]) => {
      void reorderStackMembers(stackId, orderedIds)
    },
    [reorderStackMembers],
  )

  const handleWorkGroupTitleChange = useCallback(
    (workGroupId: string, title: string) => {
      void updateMapWorkGroup(workGroupId, { title })
    },
    [updateMapWorkGroup],
  )

  const workGroupFlowNodes: Node[] = useMemo(() => {
    if (!showArtifacts) return []
    const artifacts = mapContent?.artifacts ?? []
    const workGroups = mapContent?.workGroups ?? []
    const nodes: Node[] = []
    for (const group of workGroups) {
      const memberBounds = collectCanvasUnitBounds(artifacts, group.memberNodeIds)
      const frame = computeWorkGroupFrameBounds(memberBounds)
      if (!frame) {
        continue
      }
      const groupMatches =
        matchingIds !== null &&
        (matchingIds.has(group.id) ||
          group.memberNodeIds.some((memberNodeId) => matchingIds.has(memberNodeId)))
      nodes.push({
        id: group.id,
        type: 'map_workgroup',
        position: { x: frame.x, y: frame.y },
        draggable: true,
        selectable: true,
        // Title bar + contentPad (padding/seams): drag moves the whole WorkGroup.
        dragHandle: '.workGroupDragHandle',
        zIndex: Z_WORKGROUP,
        width: frame.width,
        height: frame.height,
        style: {
          width: frame.width,
          height: frame.height,
          pointerEvents: 'none',
        },
        data: {
          workGroupId: group.id,
          title: group.title,
          isSelected: selectedWorkGroupId === group.id,
          dimmed: matchingIds !== null && !groupMatches,
          onTitleChange: (title: string) => handleWorkGroupTitleChange(group.id, title),
        },
      })
    }
    return nodes
  }, [mapContent, matchingIds, selectedWorkGroupId, handleWorkGroupTitleChange, showArtifacts])

  const positionsById = useMemo(() => {
    if (layerFocusTransitionSample) {
      return layerFocusTransitionSample.positionsById
    }
    return layoutRef.current?.positionsById ?? defaultPositionsById(nodeIds)
  }, [layerFocusTransitionSample, nodeIds, layoutVersion])

  const layerBandFlowNodes: Node[] = useMemo(() => {
    const layoutBands = layoutRef.current?.layerBands ?? []
    let sourceBands: ArchitectureLayerBandLayout[]
    let nodeOpacityById: Record<string, number> | undefined
    let opacityByBandId: Record<string, number> | undefined

    if (layerFocusTransitionSample) {
      sourceBands = layerFocusTransitionSample.layerBands
      nodeOpacityById = layerFocusTransitionSample.nodeOpacityById
      opacityByBandId = Object.fromEntries(
        layerFocusTransitionSample.layerBands.map((band) => [band.id, band.opacity]),
      )
    } else {
      sourceBands =
        isLayerFocusActive || layoutBands.length > 0
          ? layoutBands
          : fullLayerBandsRef.current
    }

    const bands = resolveRenderableLayerBands({
      sourceBands,
      nodes: displayFeatureNodes,
      positionsById,
      configuredLayers: architecture?.layers,
      opacityByBandId,
      nodeOpacityById,
    })

    return bands.map((band) => ({
      id: `architecture_layer_${band.id}`,
      type: 'architectureLayer',
      position: band.position,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -2,
      width: band.width,
      height: band.height,
      style: {
        width: band.width,
        height: band.height,
        pointerEvents: 'none',
        opacity: band.opacity,
      },
      data: {
        label: band.label,
        description: band.description,
        opacity: band.opacity,
      },
    }))
  }, [
    layoutVersion,
    layerFocusTransitionSample,
    isLayerFocusActive,
    displayFeatureNodes,
    positionsById,
    architecture?.layers,
  ])

  const [flowNodes, setFlowNodes, onNodesChangeInternal] = useNodesState<Node>([])
  const flowNodesRef = useRef(flowNodes)
  flowNodesRef.current = flowNodes
  const draggedIdsRef = useRef<Set<string>>(new Set())
  const resizedIdsRef = useRef<Set<string>>(new Set())
  const resizingIdsRef = useRef<Set<string>>(new Set())
  const activeDragIdsRef = useRef<Set<string>>(new Set())
  /** Expected flow positions after local drag-end persist; used to unlock external store moves. */
  const pendingDragEndPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const workGroupResizeSessionRef = useRef<{
    memberNodeId: string
    workGroupId: string
    snapshot: BoundsRect[]
    prevBounds: BoundsRect
  } | null>(null)

  const handleGeometryResizeStart = useCallback((memberNodeId: string) => {
    resizingIdsRef.current.add(memberNodeId)
    const artifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
    const workGroups = useWorkbenchStore.getState().mapContent?.workGroups ?? []
    const group = workGroups.find((item) => item.memberNodeIds.includes(memberNodeId))
    const prevBounds = getMemberNodeBounds(artifacts, memberNodeId)
    if (!group || !prevBounds) {
      workGroupResizeSessionRef.current = null
      return
    }
    workGroupResizeSessionRef.current = {
      memberNodeId,
      workGroupId: group.id,
      snapshot: collectCanvasUnitBounds(artifacts, group.memberNodeIds),
      prevBounds,
    }
  }, [])

  const handleGeometryResize = useCallback(
    (memberNodeId: string, params: MapArtifactResizeEndParams) => {
      const session = workGroupResizeSessionRef.current
      if (!session || session.memberNodeId !== memberNodeId) {
        return
      }

      const nextBounds: BoundsRect = {
        id: memberNodeId,
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
      }
      const positions = propagateWorkGroupMemberResize(
        session.snapshot,
        memberNodeId,
        session.prevBounds,
        nextBounds,
      )

      const previewBounds = session.snapshot.map((rect) => {
        if (rect.id === memberNodeId) {
          return nextBounds
        }
        const position = positions.get(rect.id)
        return position ? { ...rect, x: position.x, y: position.y } : rect
      })
      const frame = computeWorkGroupFrameBounds(previewBounds)

      setFlowNodes((current) =>
        current.map((node) => {
          if (node.id === memberNodeId) {
            return {
              ...node,
              position: { x: params.x, y: params.y },
              width: params.width,
              height: params.height,
              style: {
                ...node.style,
                width: params.width,
                height: params.height,
              },
            }
          }
          if (node.id === session.workGroupId && frame) {
            return applyWorkGroupFrameToFlowNode(node, frame)
          }
          const position = positions.get(node.id)
          if (!position) {
            return node
          }
          return {
            ...node,
            position,
          }
        }),
      )
    },
    [setFlowNodes],
  )

  const handleGeometryResizeEnd = useCallback(
    async (memberNodeId: string, params: MapArtifactResizeEndParams) => {
      const session = workGroupResizeSessionRef.current
      workGroupResizeSessionRef.current = null
      resizingIdsRef.current.delete(memberNodeId)

      const artifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
      const isGrouped = artifacts.some(
        (artifact) =>
          getWorkGroupMemberNodeId(artifact) === memberNodeId && !!artifact.workGroupId,
      )

      if (!isGrouped) {
        const artifactId = resolveGeometryArtifactId(memberNodeId, artifacts)
        if (artifactId) {
          await updateMapArtifact(artifactId, {
            size: { width: params.width, height: params.height },
            position: { x: params.x, y: params.y },
          })
        }
        return
      }

      const ok = await applyMapWorkGroupMutation({
        type: 'resize_member',
        memberNodeId,
        size: { width: params.width, height: params.height },
        position: { x: params.x, y: params.y },
      })

      if (ok) {
        // Persist-time frame sync from store so the dashed rect hugs members even if
        // derivedNodes hasn't re-run yet (tight shrink / grow past prior bounds).
        const nextArtifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
        const workGroups = useWorkbenchStore.getState().mapContent?.workGroups ?? []
        const group = workGroups.find((item) => item.memberNodeIds.includes(memberNodeId))
        if (group) {
          const frame = computeWorkGroupFrameBounds(
            collectCanvasUnitBounds(nextArtifacts, group.memberNodeIds),
          )
          if (frame) {
            setFlowNodes((current) =>
              current.map((node) =>
                node.id === group.id ? applyWorkGroupFrameToFlowNode(node, frame) : node,
              ),
            )
          }
        }
        return
      }

      if (!session) {
        return
      }

      const frame = computeWorkGroupFrameBounds(session.snapshot)
      setFlowNodes((current) =>
        current.map((node) => {
          if (node.id === session.workGroupId && frame) {
            return applyWorkGroupFrameToFlowNode(node, frame)
          }
          const snapshot = session.snapshot.find((rect) => rect.id === node.id)
          if (!snapshot) {
            return node
          }
          return {
            ...node,
            position: { x: snapshot.x, y: snapshot.y },
            width: snapshot.width,
            height: snapshot.height,
            style: {
              ...node.style,
              width: snapshot.width,
              height: snapshot.height,
            },
          }
        }),
      )
    },
    [applyMapWorkGroupMutation, setFlowNodes, updateMapArtifact],
  )

  const artifactFlowNodes: Node[] = useMemo(() => {
    if (!showArtifacts) return []
    const artifacts = mapContent?.artifacts ?? []
    return groupArtifactsForCanvas(artifacts).map((group) => {
      const node = buildStackFlowNode(group, {
        selectedNodeId,
        selectedArtifactId,
        scopeLabelFor: (item) => resolveArtifactScopeLabel(item, nodes, ts),
        onHeaderContextMenu: handleArtifactHeaderContextMenu,
        onStackDetach: handleStackTabDetach,
        onStackMerge: handleStackTabMerge,
        onStackReorder: handleStackTabReorder,
        onGeometryResizeStart: handleGeometryResizeStart,
        onGeometryResize: handleGeometryResize,
        onGeometryResizeEnd: handleGeometryResizeEnd,
      })
      const workGroupId = group.active.workGroupId
      const memberMatches =
        matchingIds !== null &&
        (matchingIds.has(group.nodeId) || (workGroupId ? matchingIds.has(workGroupId) : false))
      return {
        ...node,
        zIndex: Z_ARTIFACT,
        data: {
          ...node.data,
          dimmed:
            matchingIds !== null
              ? !memberMatches && !!selectedNodeId && !(node.data as { linked?: boolean }).linked
              : (node.data as { dimmed?: boolean }).dimmed,
        },
      }
    })
  }, [
    mapContent,
    nodes,
    selectedNodeId,
    selectedArtifactId,
    locale,
    matchingIds,
    // Intentionally omit `ts` — useI18n returns a new function every render and
    // would rebuild every artifact node's `data`, flooding sync (~1k+/s) and
    // flickering map terminals. `locale` already covers message identity.
    handleArtifactHeaderContextMenu,
    handleStackTabDetach,
    handleStackTabMerge,
    handleStackTabReorder,
    handleGeometryResizeStart,
    handleGeometryResize,
    handleGeometryResizeEnd,
    showArtifacts,
  ])

  const layerLabelById = useMemo(
    () => new Map((architecture?.layers ?? []).map((layer) => [layer.id, layer.label])),
    [architecture],
  )

  const c4BoundaryFlowNodes: Node[] = useMemo(() => {
    if (!useC4Visuals || !c4Diagram) return []
    return c4Diagram.boundaries.map((boundary) => {
      const memberIds = boundaryMembership[boundary.id] ?? []
      const collapsed = collapsedBoundaryIds.has(boundary.id)
      const livePositions = c4LiveFrame?.positions
      const members = collapsed
        ? []
        : memberIds.flatMap((id) => {
            const node = c4NodeById?.get(id)
            if (!node) return []
            const position = livePositions?.[id] ?? positionsById[id] ?? node.position
            return [
              {
                x: position.x,
                y: position.y,
                width: node.width,
                height: node.height,
              },
            ]
          })
      const fitted = collapsed
        ? {
            position: boundary.position,
            width: Math.max(180, boundary.width * 0.45),
            height: Math.max(72, boundary.height * 0.35),
          }
        : fitBoundaryToMembers(boundary, members)
      return {
        id: boundary.id,
        type: 'c4Boundary',
        position: fitted.position,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: Z_C4_BOUNDARY,
        width: fitted.width,
        height: fitted.height,
        initialWidth: fitted.width,
        initialHeight: fitted.height,
        // Keep measured in sync — RF otherwise caches a collapsed header height
        // and the dashed rectangle never grows to the fitted box.
        measured: { width: fitted.width, height: fitted.height },
        style: {
          width: fitted.width,
          height: fitted.height,
          pointerEvents: 'none' as const,
        },
        data: {
          label: boundary.label,
          description: boundary.description,
          collapsed,
          onToggleCollapsed: () => toggleBoundaryCollapsed(boundary.id),
        },
      }
    })
  }, [
    useC4Visuals,
    c4Diagram,
    boundaryMembership,
    c4NodeById,
    positionsById,
    c4LiveFrame,
    collapsedBoundaryIds,
    toggleBoundaryCollapsed,
  ])

  useEffect(() => {
    if (layoutResetToken === 0) return
    const projectKey = useWorkbenchStore.getState().project?.projectId
    if (!projectKey || architecture?.notation !== 'c4') return
    clearC4LayoutOverlayForView(
      projectKey,
      architectureLevel,
      architectureScopeId,
      activeViewKey,
    )
  }, [
    layoutResetToken,
    architecture?.notation,
    architectureLevel,
    architectureScopeId,
    activeViewKey,
  ])

  const derivedNodes: Node[] = useMemo(
    () => [
      ...(useC4Visuals ? [] : layerBandFlowNodes),
      ...c4BoundaryFlowNodes,
      ...workGroupFlowNodes,
      ...displayFeatureNodes.map((n) => {
        const focusOpacity = layerFocusTransitionSample
          ? (layerFocusTransitionSample.nodeOpacityById[n.id] ?? 0)
          : 1
        const searchDimmed = matchingIds !== null && !matchingIds.has(n.id)
        const focusDimmed =
          liveFocusNodeIds !== null && liveFocusNodeIds.size > 0 && !liveFocusNodeIds.has(n.id)
        const nodeDimmed = searchDimmed || focusDimmed
        const c4Node = c4NodeById?.get(n.id)
        const width = c4Node?.width ?? NODE_WIDTH
        const height = c4Node?.height ?? NODE_HEIGHT
        const openGraphLabel =
          n.level === 'context'
            ? messages.map.node.openSystemMap
            : n.level === 'container'
              ? messages.map.node.openModuleMap
              : messages.map.node.openGraph

        if (useC4Visuals && c4Node) {
          return {
            id: n.id,
            type: 'c4Shape',
            position: positionsById[n.id] ?? c4Node.position,
            draggable: focusOpacity >= 0.01 && !searchDimmed,
            zIndex: Z_FEATURE,
            initialWidth: width,
            initialHeight: height,
            style: {
              width,
              height,
              ...(focusOpacity < 0.01
                ? { pointerEvents: 'none' as const, visibility: 'hidden' as const }
                : {}),
            },
            data: {
              shape: c4Node.shape,
              label: c4Node.label || n.name,
              description: c4Node.description ?? nodeCardBlurb(n),
              technology: c4Node.technology ?? n.technology,
              stereotype: c4Node.stereotype,
              members: c4Node.members,
              selected: n.id === selectedNodeId,
              dimmed: nodeDimmed,
              liveSummary: summarizeNodeLiveActivity(executionOverlay, n.id),
              canOpenGraph: canDrillIntoNode(n.id),
              onOpenGraph: () => drillIntoNode(n.id),
              openGraphLabel,
            },
          }
        }

        return {
        id: n.id,
        type: 'feature',
        position: positionsById[n.id] ?? { x: 0, y: 0 },
        // Architecture layout owns feature positions; keep features non-draggable.
        draggable: false,
        // Idle stack: WG < feature < artifact. Drag temporarily lifts above this.
        zIndex: Z_FEATURE,
        // RF requires width/height/measured — style size alone still yields visibility:hidden.
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          ...(focusOpacity < 0.01
            ? { pointerEvents: 'none' as const, visibility: 'hidden' as const }
            : {}),
        },
        data: {
          label: n.name,
          nameEn: locale === 'en' ? n.nameEn : undefined,
          status: n.status,
          nodeType: n.type,
          elementType: n.elementType,
          elementTypeLabel:
            messages.map.elementTypes[
              (n.elementType ?? 'fallback') as keyof typeof messages.map.elementTypes
            ],
          layerLabel: n.layer ? layerLabelById.get(n.layer) : undefined,
          responsibility: nodeCardBlurb(n),
          purposeFirst: isPurposeFirstArchitectureLevel(n.level),
          responsibilityLabel:
            n.elementType === 'code_element'
              ? messages.map.node.filePurpose
              : messages.map.node.responsibility,
          technology: n.technology,
          technologyLabel: messages.map.node.technology,
          evidenceLabel: messages.map.node.evidence.replace('{count}', String(n.linkedFiles.length)),
          suggestedLabel: messages.map.node.suggested,
          responsibilityMissing: messages.map.node.responsibilityMissing,
          technologyMissing: messages.map.node.technologyMissing,
          openGraphLabel,
          canOpenGraph: canDrillIntoNode(n.id),
          onOpenGraph: () => drillIntoNode(n.id),
          fileCount: n.linkedFiles.length,
          ownerInitials: (() => {
            const collab = teamSnapshot?.collab.find((entry) => entry.nodeId === n.id)
            const owner = teamSnapshot?.roster.find((person) => person.id === collab?.ownerPersonId)
            return owner?.displayName?.slice(0, 1)
          })(),
          collabStatus: teamSnapshot?.collab.find((entry) => entry.nodeId === n.id)?.collabStatus,
          collabStatusLabel: (() => {
            const status = teamSnapshot?.collab.find((entry) => entry.nodeId === n.id)?.collabStatus
            if (!status || status === 'unclaimed') return undefined
            return messages.team.collabShort[status as keyof typeof messages.team.collabShort]
          })(),
          isSelected: n.id === selectedNodeId,
          isBouncing: bouncingNodeIds.includes(n.id),
          dimmed: nodeDimmed,
          focusOpacity,
          flash: n.id === selectedNodeId ? flashKey : 0,
          liveSummary: summarizeNodeLiveActivity(executionOverlay, n.id),
        },
      }}),
      ...artifactFlowNodes,
    ],
    [
      workGroupFlowNodes,
      layerBandFlowNodes,
      c4BoundaryFlowNodes,
      useC4Visuals,
      c4NodeById,
      displayFeatureNodes,
      positionsById,
      selectedNodeId,
      bouncingNodeIds,
      matchingIds,
      liveFocusNodeIds,
      flashKey,
      executionOverlay,
      layoutVersion,
      layerFocusTransitionSample,
      artifactFlowNodes,
      layerLabelById,
      locale,
      messages,
      canDrillIntoNode,
      drillIntoNode,
      teamSnapshot,
    ],
  )

  const getSnapTargetBounds = useCallback((excludeNodeId?: string): BoundsRect[] => {
    return flowNodesRef.current
      .filter((node) => isMapArtifactCanvasNodeId(node.id) && node.id !== excludeNodeId)
      .map(boundsFromFlowNode)
      .filter((bounds): bounds is BoundsRect => bounds !== null)
  }, [])

  const contactGapBetweenArtifacts = useCallback((draggedId: string, targetId: string) => {
    const artifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
    const draggedArtifact = artifacts.find(
      (artifact) => getWorkGroupMemberNodeId(artifact) === draggedId || artifact.id === draggedId,
    )
    const targetArtifact = artifacts.find(
      (artifact) => getWorkGroupMemberNodeId(artifact) === targetId || artifact.id === targetId,
    )
    const draggedGroupId = draggedArtifact?.workGroupId
    const targetGroupId = targetArtifact?.workGroupId
    if (draggedGroupId && targetGroupId && draggedGroupId === targetGroupId) {
      return WORK_GROUP_MEMBER_GAP
    }
    return 0
  }, [])

  const resolveCommittedSnap = useCallback(
    (
      nodeId: string,
      position: { x: number; y: number },
      sticky: SnapResult | null,
    ): SnapResult | null => {
      const flowNode = flowNodesRef.current.find((node) => node.id === nodeId)
      const draggedBounds = flowNode ? boundsFromFlowNode({ ...flowNode, position }) : null
      if (!draggedBounds) {
        return sticky
      }

      const targets = getSnapTargetBounds(nodeId)
      const thresholds = snapThresholdsForZoom(getViewport().zoom)
      const snapOptions = { contactGapBetween: contactGapBetweenArtifacts }
      const snap =
        sticky ??
        resolveArtifactSnap(draggedBounds, targets, thresholds, snapOptions) ??
        resolveArtifactSnap(
          draggedBounds,
          targets,
          expandSnapThresholds(thresholds),
          snapOptions,
        )

      if (!snap) {
        return null
      }

      const target = targets.find((bounds) => bounds.id === snap.targetId)
      if (!target) {
        return snap
      }

      return commitArtifactSnap(snap, draggedBounds, target)
    },
    [contactGapBetweenArtifacts, getSnapTargetBounds, getViewport],
  )

  const handleArtifactDragEnd = useCallback(
    async (
      nodeId: string,
      position: { x: number; y: number },
      dragStartPosition: ArtifactDragPosition | undefined,
    ) => {
      const finishArtifactDrag = () => {
        setSnapGuides([])
        activeSnapRef.current = null
        elevatedDragIdsRef.current.clear()
        clearDragElevation(setFlowNodes)
      }

      const mapState = useWorkbenchStore.getState().mapContent
      const artifacts = mapState?.artifacts ?? []
      const artifactId = resolveGeometryArtifactId(nodeId, artifacts)
      if (!artifactId) {
        finishArtifactDrag()
        return
      }

      const pointer = lastPointerClientRef.current
      if (pointer && shouldPreferTabMerge(pointer.x, pointer.y)) {
        const dropTarget = resolveArtifactDropTarget(pointer.x, pointer.y)
        if (dropTarget && dropTarget.nodeId !== nodeId) {
          const draggedArtifact = artifacts.find((item) => item.id === artifactId)
          if (draggedArtifact && draggedArtifact.type === dropTarget.type) {
            await attachArtifactToStack(artifactId, dropTarget.nodeId)
            finishArtifactDrag()
            return
          }
        }
      }

      const flowNode = flowNodesRef.current.find((node) => node.id === nodeId)
      const storeBounds = getMemberNodeBounds(artifacts, nodeId)
      const draggedBounds =
        (flowNode ? boundsFromFlowNode({ ...flowNode, position }) : null) ?? storeBounds
      if (!draggedBounds) {
        finishArtifactDrag()
        return
      }

      const thresholds = snapThresholdsForZoom(getViewport().zoom)
      const activeSticky =
        activeSnapRef.current?.nodeId === nodeId ? activeSnapRef.current.result : null
      const snap = resolveCommittedSnap(nodeId, position, activeSticky)
      const finalPosition = snap?.snappedPosition ?? position

      const draggedArtifact = artifacts.find((item) => item.id === artifactId)
      const workGroupId = draggedArtifact?.workGroupId
      const workGroup = workGroupId
        ? mapState?.workGroups.find((group) => group.id === workGroupId)
        : undefined

      const resolveAwayFromForeignWorkGroups = (
        pos: { x: number; y: number },
        excludeWorkGroupIds: Array<string | null | undefined> = [workGroupId],
      ) => {
        const frames = collectWorkGroupFrameBounds(
          artifacts,
          mapState?.workGroups ?? [],
          excludeWorkGroupIds,
        )
        const moving: BoundsRect = {
          ...draggedBounds,
          x: pos.x,
          y: pos.y,
        }
        const sep = separateFromObstacles(moving, frames)
        return { x: pos.x + sep.x, y: pos.y + sep.y }
      }

      if (snap && isAdjacentSnapKind(snap.snapKind)) {
        const targetArtifact = artifacts.find(
          (item) => getWorkGroupMemberNodeId(item) === snap.targetId,
        )
        // Exclude own group and the group being joined so snap adjacency is kept.
        const joinedPosition = resolveAwayFromForeignWorkGroups(finalPosition, [
          workGroupId,
          targetArtifact?.workGroupId,
        ])
        const ok = await applyArtifactDragMutationWithRollback(
          () =>
            applyMapWorkGroupMutation({
              type: 'snap_join',
              draggedMemberNodeId: nodeId,
              targetMemberNodeId: snap.targetId,
              position: joinedPosition,
            }),
          artifactId,
          dragStartPosition,
          updateMapArtifact,
        )
        if (ok && (
          joinedPosition.x !== finalPosition.x ||
          joinedPosition.y !== finalPosition.y
        )) {
          pendingDragEndPositionsRef.current.set(nodeId, { ...joinedPosition })
          setFlowNodes((current) =>
            current.map((node) =>
              node.id === nodeId ? { ...node, position: joinedPosition } : node,
            ),
          )
        }
        finishArtifactDrag()
        return
      }

      if (workGroup) {
        const otherBounds = collectCanvasUnitBounds(
          artifacts,
          workGroup.memberNodeIds.filter((memberNodeId) => memberNodeId !== nodeId),
        )
        const detached = isDetachedFromGroup(
          { ...draggedBounds, x: finalPosition.x, y: finalPosition.y },
          otherBounds,
          thresholds,
        )
        if (detached) {
          // Detaching: no longer own the old group frame — repel from every WG.
          const freePosition = resolveAwayFromForeignWorkGroups(finalPosition, [])
          const ok = await applyArtifactDragMutationWithRollback(
            () =>
              applyMapWorkGroupMutation({
                type: 'detach',
                memberNodeId: nodeId,
                position: freePosition,
              }),
            artifactId,
            dragStartPosition,
            updateMapArtifact,
          )
          if (ok && (
            freePosition.x !== finalPosition.x ||
            freePosition.y !== finalPosition.y
          )) {
            pendingDragEndPositionsRef.current.set(nodeId, { ...freePosition })
            setFlowNodes((current) =>
              current.map((node) =>
                node.id === nodeId ? { ...node, position: freePosition } : node,
              ),
            )
          }
          finishArtifactDrag()
          return
        }
      }

      const clearedPosition = resolveAwayFromForeignWorkGroups(finalPosition)
      await updateMapArtifact(artifactId, { position: clearedPosition })
      if (clearedPosition.x !== finalPosition.x || clearedPosition.y !== finalPosition.y) {
        pendingDragEndPositionsRef.current.set(nodeId, { ...clearedPosition })
        setFlowNodes((current) =>
          current.map((node) =>
            node.id === nodeId ? { ...node, position: clearedPosition } : node,
          ),
        )
      }
      finishArtifactDrag()
    },
    [
      applyMapWorkGroupMutation,
      attachArtifactToStack,
      getViewport,
      resolveCommittedSnap,
      setFlowNodes,
      updateMapArtifact,
    ],
  )

  const handleWorkGroupDragEnd = useCallback(
    async (workGroupId: string, position: { x: number; y: number }) => {
      const start = dragStartPositionsRef.current.get(workGroupId)
      if (!start) {
        elevatedDragIdsRef.current.clear()
        clearDragElevation(setFlowNodes)
        return
      }
      let delta = {
        x: position.x - start.x,
        y: position.y - start.y,
      }

      const mapState = useWorkbenchStore.getState().mapContent
      const artifacts = mapState?.artifacts ?? []
      const workGroups = mapState?.workGroups ?? []
      const group = workGroups.find((item) => item.id === workGroupId)
      if (group) {
        const memberBounds = collectCanvasUnitBounds(artifacts, group.memberNodeIds).map(
          (bounds) => translateBounds(bounds, delta),
        )
        const frame = computeWorkGroupFrameBounds(memberBounds)
        if (frame) {
          const memberIdSet = new Set(group.memberNodeIds)
          const nodeObstacles = collectForeignNodeObstaclesForWorkGroup(
            flowNodesRef.current,
            memberIdSet,
          )
          const otherFrames = collectWorkGroupFrameBounds(artifacts, workGroups, [workGroupId])
          const sep = separateFromObstacles({ ...frame, id: workGroupId }, [
            ...nodeObstacles,
            ...otherFrames,
          ])
          if (sep.x !== 0 || sep.y !== 0) {
            delta = { x: delta.x + sep.x, y: delta.y + sep.y }
            const resolvedFramePos = {
              x: start.x + delta.x,
              y: start.y + delta.y,
            }
            pendingDragEndPositionsRef.current.set(workGroupId, resolvedFramePos)
            setFlowNodes((current) =>
              current.map((node) => {
                if (node.id === workGroupId) {
                  return { ...node, position: resolvedFramePos }
                }
                if (!memberIdSet.has(node.id)) {
                  return node
                }
                const memberStart = dragStartPositionsRef.current.get(node.id)
                if (!memberStart) {
                  return node
                }
                return {
                  ...node,
                  position: {
                    x: memberStart.x + delta.x,
                    y: memberStart.y + delta.y,
                  },
                }
              }),
            )
          }
        }
      }

      elevatedDragIdsRef.current.clear()
      clearDragElevation(setFlowNodes)

      if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
        return
      }
      await applyMapWorkGroupMutation({
        type: 'move_group',
        workGroupId,
        delta,
      })
    },
    [applyMapWorkGroupMutation, setFlowNodes],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextChanges: NodeChange[] = []

      for (const change of changes) {
        if (change.type === 'dimensions') {
          if (change.resizing) {
            resizingIdsRef.current.add(change.id)
          } else {
            resizingIdsRef.current.delete(change.id)
            if (isMapArtifactCanvasNodeId(change.id)) {
              resizedIdsRef.current.add(change.id)
            }
          }
          nextChanges.push(change)
          continue
        }

        if (change.type !== 'position' || !change.position) {
          nextChanges.push(change)
          continue
        }

        if (change.dragging === true) {
          activeDragIdsRef.current.add(change.id)
          if (!previewDragLockRef.current) lockPreviewForNodeDrag()
          if (!dragStartPositionsRef.current.has(change.id)) {
            dragStartPositionsRef.current.set(change.id, { ...change.position })
          }

          if (isMapWorkGroupNodeId(change.id)) {
            const workGroups = useWorkbenchStore.getState().mapContent?.workGroups ?? []
            const group = workGroups.find((item) => item.id === change.id)
            if (group) {
              const artifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
              for (const memberNodeId of group.memberNodeIds) {
                const bounds = getMemberNodeBounds(artifacts, memberNodeId)
                if (bounds) {
                  dragStartPositionsRef.current.set(memberNodeId, {
                    x: bounds.x,
                    y: bounds.y,
                  })
                }
              }
            }
          }

          if (isMapArtifactCanvasNodeId(change.id)) {
            nextChanges.push(change)
            continue
          }

          nextChanges.push(change)
          continue
        }

        if (change.dragging === false) {
          activeDragIdsRef.current.delete(change.id)
          draggedIdsRef.current.add(change.id)
          if (previewDragLockRef.current) {
            unlockPreviewAfterNodeDrag()
            const flowNode = flowNodesRef.current.find((node) => node.id === change.id)
            const pointer = lastPointerClientRef.current
            const sourceNode = graphNodes.find((node) => node.id === change.id)
            if (
              flowNode &&
              isArchitectureFlowNodeType(flowNode.type) &&
              sourceNode &&
              pointer
            ) {
              schedulePreview(sourceNode, pointer.x, pointer.y)
            }
          }

          if (isMapWorkGroupNodeId(change.id)) {
            const memberNodeIds =
              useWorkbenchStore
                .getState()
                .mapContent?.workGroups.find((group) => group.id === change.id)
                ?.memberNodeIds ?? []
            void handleWorkGroupDragEnd(change.id, change.position)
              .catch((error) => {
                console.error('[function-map] failed to persist WorkGroup drag', error)
              })
              .finally(() => {
                clearWorkGroupDragStartPositions(
                  dragStartPositionsRef.current,
                  change.id,
                  memberNodeIds,
                )
              })
            // The async handler has synchronously captured the group start by
            // this point. Remove it now so a duplicate drag-end cannot reapply.
            dragStartPositionsRef.current.delete(change.id)
            pendingDragEndPositionsRef.current.set(change.id, { ...change.position })
            nextChanges.push(change)
            continue
          }

          if (isMapArtifactCanvasNodeId(change.id) && !resizingIdsRef.current.has(change.id)) {
            const finalPosition =
              activeSnapRef.current?.nodeId === change.id
                ? activeSnapRef.current.result.snappedPosition
                : change.position
            pendingDragEndPositionsRef.current.set(change.id, { ...finalPosition })
            const dragStartPosition = consumeArtifactDragStartPosition(
              dragStartPositionsRef.current,
              change.id,
            )
            void handleArtifactDragEnd(change.id, finalPosition, dragStartPosition)
            nextChanges.push({
              ...change,
              position: finalPosition,
            })
            continue
          }

          // Feature node: repel from WorkGroup frames, then persist into layout snapshot.
          if (change.type === 'position' && change.position) {
            const mapState = useWorkbenchStore.getState().mapContent
            const frames = collectWorkGroupFrameBounds(
              mapState?.artifacts ?? [],
              mapState?.workGroups ?? [],
            )
            const c4Size = c4NodeByIdRef.current?.get(change.id)
            const moving: BoundsRect = {
              id: change.id,
              x: change.position.x,
              y: change.position.y,
              width: c4Size?.width ?? NODE_WIDTH,
              height: c4Size?.height ?? NODE_HEIGHT,
            }
            const sep = separateFromObstacles(moving, frames)
            const resolved = {
              x: change.position.x + sep.x,
              y: change.position.y + sep.y,
            }
            if (layoutRef.current) {
              layoutRef.current = {
                ...layoutRef.current,
                positionsById: {
                  ...layoutRef.current.positionsById,
                  [change.id]: resolved,
                },
              }
            }
            const projectKey = useWorkbenchStore.getState().project?.projectId
            if (projectKey && architecture?.notation === 'c4') {
              upsertC4LayoutPositions(
                projectKey,
                architectureLevel,
                architectureScopeId,
                { [change.id]: resolved },
                activeViewKey,
              )
            }
            pendingDragEndPositionsRef.current.set(change.id, resolved)
            draggedIdsRef.current.delete(change.id)
            elevatedDragIdsRef.current.clear()
            clearDragElevation(setFlowNodes)
            dragStartPositionsRef.current.delete(change.id)
            if (c4DragActiveRef.current || c4Size) {
              c4DragActiveRef.current = false
              if (c4RouteRafRef.current != null) {
                cancelAnimationFrame(c4RouteRafRef.current)
                c4RouteRafRef.current = null
              }
              c4LivePositionsRef.current = {}
              c4DirtyNodeIdsRef.current.clear()
              setC4LiveFrame(null)
              setLayoutVersion((version) => version + 1)
            }
            nextChanges.push({
              ...change,
              position: resolved,
            })
            continue
          }
        }

        nextChanges.push(change)
      }

      onNodesChangeInternal(nextChanges)
    },
    [
      architecture,
      architectureLevel,
      architectureScopeId,
      handleArtifactDragEnd,
      handleWorkGroupDragEnd,
      onNodesChangeInternal,
      setFlowNodes,
      lockPreviewForNodeDrag,
      unlockPreviewAfterNodeDrag,
      schedulePreview,
      graphNodes,
    ],
  )

  const applyArtifactSnapDuringDrag = useCallback(
    (node: Node) => {
      const draggedBounds = boundsFromFlowNode(node)
      if (!draggedBounds) {
        setSnapGuides([])
        activeSnapRef.current = null
        return
      }

      const thresholds = snapThresholdsForZoom(getViewport().zoom)
      const sticky =
        activeSnapRef.current?.nodeId === node.id ? activeSnapRef.current.result : null
      const snap = resolveArtifactSnapWithSticky(
        draggedBounds,
        getSnapTargetBounds(node.id),
        thresholds,
        sticky,
        { contactGapBetween: contactGapBetweenArtifacts },
      )

      if (!snap) {
        setSnapGuides([])
        activeSnapRef.current = null
        return
      }

      activeSnapRef.current = { nodeId: node.id, result: snap }
      setSnapGuides(snap.guideLines)

      const target = getSnapTargetBounds(node.id).find((bounds) => bounds.id === snap.targetId)
      const committed = target ? commitArtifactSnap(snap, draggedBounds, target) : snap
      activeSnapRef.current = { nodeId: node.id, result: committed }
      setSnapGuides(committed.guideLines)

      const dx = Math.abs(node.position.x - committed.snappedPosition.x)
      const dy = Math.abs(node.position.y - committed.snappedPosition.y)
      if (dx > 0.01 || dy > 0.01) {
        setFlowNodes((current) =>
          current.map((candidate) =>
            candidate.id === node.id
              ? { ...candidate, position: committed.snappedPosition }
              : candidate,
          ),
        )
      }
    },
    [contactGapBetweenArtifacts, getSnapTargetBounds, getViewport, setFlowNodes],
  )

  const fitLiveBoundaries = useCallback(
    (positionOverrides: Record<string, { x: number; y: number }>) => {
      const membership = boundaryMembershipRef.current
      const sizes = c4NodeByIdRef.current
      setFlowNodes((current) => {
        let changed = false
        const next = current.map((node) => {
          if (node.type !== 'c4Boundary') return node
          const memberIds = membership[node.id] ?? []
          const members: Array<{ x: number; y: number; width: number; height: number }> = []
          for (const id of memberIds) {
            const sized = sizes?.get(id)
            const flow = current.find((candidate) => candidate.id === id)
            const override = positionOverrides[id]
            const x = override?.x ?? flow?.position.x
            const y = override?.y ?? flow?.position.y
            if (x == null || y == null) continue
            members.push({
              x,
              y,
              width:
                sized?.width ??
                (typeof flow?.width === 'number' ? flow.width : NODE_WIDTH),
              height:
                sized?.height ??
                (typeof flow?.height === 'number' ? flow.height : NODE_HEIGHT),
            })
          }
          const width =
            typeof node.style?.width === 'number'
              ? node.style.width
              : typeof node.width === 'number'
                ? node.width
                : 0
          const height =
            typeof node.style?.height === 'number'
              ? node.style.height
              : typeof node.height === 'number'
                ? node.height
                : 0
          const fitted = fitBoundaryToMembers(
            { position: node.position, width, height },
            members,
          )
          if (
            fitted.position.x === node.position.x &&
            fitted.position.y === node.position.y &&
            fitted.width === width &&
            fitted.height === height
          ) {
            return node
          }
          changed = true
          return {
            ...node,
            position: fitted.position,
            width: fitted.width,
            height: fitted.height,
            initialWidth: fitted.width,
            initialHeight: fitted.height,
            measured: { width: fitted.width, height: fitted.height },
            style: {
              ...node.style,
              width: fitted.width,
              height: fitted.height,
              pointerEvents: 'none' as const,
            },
          }
        })
        return changed ? next : current
      })
    },
    [setFlowNodes],
  )

  const scheduleC4LiveRoute = useCallback(() => {
    if (c4RouteRafRef.current != null) return
    const run = () => {
      c4RouteRafRef.current = null
      if (!c4DragActiveRef.current) return
      const model = c4RoutingModelRef.current
      if (!model) return
      const dirtyNodeIds = c4DirtyNodeIdsRef.current
      c4DirtyNodeIdsRef.current = new Set()
      const positions = c4LivePositionsRef.current
      const nodes = model.nodes.map((node) => {
        const live = positions[node.id]
        return live ? { ...node, x: live.x, y: live.y } : node
      })
      const started = performance.now()
      const routes = liveRouteFrame({
        nodes,
        edges: model.edges,
        previous: c4PreviousRoutesRef.current,
        dirtyNodeIds,
        mode: 'incremental',
        clearance: 36,
      })
      const slow = performance.now() - started > 16
      const followUp = () => {
        if (c4RouteRafRef.current != null) return
        c4RouteRafRef.current = requestAnimationFrame(run)
      }
      if (!c4DragActiveRef.current) return
      if (slow && c4DirtyNodeIdsRef.current.size > 0) {
        followUp()
        return
      }
      c4PreviousRoutesRef.current = routes
      setC4LiveFrame({
        positions: { ...positions },
        routes,
      })
      if (c4DirtyNodeIdsRef.current.size > 0) followUp()
    }
    c4RouteRafRef.current = requestAnimationFrame(run)
  }, [])

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_event, node) => {
      lockPreviewForNodeDrag()
      if (node.type === 'c4Shape') {
        c4DragActiveRef.current = true
        if (pendingPaneClickRef.current) {
          clearTimeout(pendingPaneClickRef.current)
          pendingPaneClickRef.current = null
        }
      }
      const elevateIds = new Set<string>([node.id])
      if (isMapWorkGroupNodeId(node.id)) {
        const workGroups = useWorkbenchStore.getState().mapContent?.workGroups ?? []
        const group = workGroups.find((item) => item.id === node.id)
        if (group) {
          for (const memberNodeId of group.memberNodeIds) {
            elevateIds.add(memberNodeId)
          }
        }
      }
      elevatedDragIdsRef.current = elevateIds
      setFlowNodes((current) =>
        current.map((candidate) => {
          if (!elevateIds.has(candidate.id)) {
            return candidate
          }
          // Members stay slightly above their own frame while the group is lifted.
          const lift =
            isMapWorkGroupNodeId(node.id) && isMapArtifactCanvasNodeId(candidate.id)
              ? Z_DRAG_LIFT + 1
              : Z_DRAG_LIFT
          return candidate.zIndex === lift ? candidate : { ...candidate, zIndex: lift }
        }),
      )
    },
    [lockPreviewForNodeDrag, setFlowNodes],
  )

  const onNodeDrag: OnNodeDrag = useCallback(
    (event, node) => {
      if ('clientX' in event) {
        lastPointerClientRef.current = { x: event.clientX, y: event.clientY }
      }

      if (isMapArtifactCanvasNodeId(node.id)) {
        applyArtifactSnapDuringDrag(node)
        return
      }

      if (node.type === 'c4Shape') {
        c4LivePositionsRef.current = {
          ...c4LivePositionsRef.current,
          [node.id]: { x: node.position.x, y: node.position.y },
        }
        c4DirtyNodeIdsRef.current.add(node.id)
        fitLiveBoundaries(c4LivePositionsRef.current)
        scheduleC4LiveRoute()
        return
      }

      if (!isMapWorkGroupNodeId(node.id)) {
        return
      }
      const start = dragStartPositionsRef.current.get(node.id)
      if (!start) {
        return
      }
      const workGroups = useWorkbenchStore.getState().mapContent?.workGroups ?? []
      const group = workGroups.find((item) => item.id === node.id)
      if (!group) {
        return
      }
      const delta = {
        x: node.position.x - start.x,
        y: node.position.y - start.y,
      }
      setFlowNodes((current) =>
        current.map((candidate) => {
          if (!group.memberNodeIds.includes(candidate.id)) {
            return candidate
          }
          const memberStart = dragStartPositionsRef.current.get(candidate.id)
          if (!memberStart) {
            return candidate
          }
          return {
            ...candidate,
            position: {
              x: memberStart.x + delta.x,
              y: memberStart.y + delta.y,
            },
            zIndex: Z_DRAG_LIFT + 1,
          }
        }),
      )
    },
    [applyArtifactSnapDuringDrag, fitLiveBoundaries, scheduleC4LiveRoute, setFlowNodes],
  )

  const trackPointerMove = useCallback((event: ReactMouseEvent) => {
    lastPointerClientRef.current = { x: event.clientX, y: event.clientY }
    galaxyPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
    nudgePreviewDwell(event.clientX, event.clientY)
    if (hoverPreviewRef.current && !previewDragLockRef.current) {
      moveHoverPreview(event.clientX, event.clientY)
    }
  }, [galaxyPointerRef, hoverPreviewRef, moveHoverPreview, nudgePreviewDwell, previewDragLockRef])

  useEffect(() => {
    if (
      activeDragIdsRef.current.size > 0 ||
      resizingIdsRef.current.size > 0 ||
      flowNodesRef.current.some((node) => node.dragging)
    ) {
      return
    }

    const mapContent = useWorkbenchStore.getState().mapContent
    for (const id of [...draggedIdsRef.current]) {
      if (isMapWorkGroupNodeId(id)) {
        draggedIdsRef.current.delete(id)
        pendingDragEndPositionsRef.current.delete(id)
        continue
      }
      if (!isMapArtifactCanvasNodeId(id)) continue
      const artifacts = mapContent?.artifacts ?? []
      const artifactId = resolveGeometryArtifactId(id, artifacts)
      const artifact = artifactId
        ? artifacts.find((item) => item.id === artifactId)
        : undefined
      const existing = flowNodesRef.current.find((node) => node.id === id)
      if (!artifact || !existing) continue

      const storePosition = artifact.position
      const pending = pendingDragEndPositionsRef.current.get(id)
      if (positionsApproxEqual(storePosition, existing.position)) {
        // Local drag-end persist caught up — release lock.
        draggedIdsRef.current.delete(id)
        pendingDragEndPositionsRef.current.delete(id)
        continue
      }

      if (
        pending &&
        positionsApproxEqual(existing.position, pending) &&
        !positionsApproxEqual(storePosition, pending)
      ) {
        // Still waiting for our drag-end write; keep freezing flow to pending.
        continue
      }

      // Store moved to a position that is neither the frozen flow nor our pending
      // drag-end (e.g. merge_or_create_group rearrange). Release so sync can apply it.
      draggedIdsRef.current.delete(id)
      pendingDragEndPositionsRef.current.delete(id)
    }

    for (const id of [...resizedIdsRef.current]) {
      if (!isMapArtifactCanvasNodeId(id)) continue
      const artifacts = mapContent?.artifacts ?? []
      const artifactId = resolveGeometryArtifactId(id, artifacts)
      const artifact = artifactId
        ? artifacts.find((item) => item.id === artifactId)
        : undefined
      const existing = flowNodesRef.current.find((node) => node.id === id)
      if (!artifact || !existing) continue

      const width = typeof existing.style?.width === 'number' ? existing.style.width : artifact.size.width
      const height = typeof existing.style?.height === 'number' ? existing.style.height : artifact.size.height
      if (
        Math.abs(artifact.size.width - width) < 0.5 &&
        Math.abs(artifact.size.height - height) < 0.5 &&
        positionsApproxEqual(artifact.position, existing.position)
      ) {
        resizedIdsRef.current.delete(id)
      }
    }

    setFlowNodes((current) => {
      const existingById = new Map(current.map((n) => [n.id, n]))
      let changed = current.length !== derivedNodes.length
      const next = derivedNodes.map((n) => {
        const existing = existingById.get(n.id)
        if (
          existing &&
          (draggedIdsRef.current.has(n.id) || resizedIdsRef.current.has(n.id)) &&
          !isMapWorkGroupNodeId(n.id)
        ) {
          return existing
        }
        // Live boundary geometry is owned by fitLiveBoundaries while a C4 node
        // is dragged — don't let a stale derived frame overwrite it.
        if (existing && n.type === 'c4Boundary' && c4DragActiveRef.current) {
          const merged = mergeDerivedFlowNode(n, existing)
          return {
            ...merged,
            position: existing.position,
            width: existing.width,
            height: existing.height,
            initialWidth: existing.initialWidth,
            initialHeight: existing.initialHeight,
            measured: existing.measured,
            style: existing.style,
            zIndex: existing.zIndex ?? n.zIndex,
          }
        }
        // Keep drag-time elevation (and live WG-member follow positions) stable.
        if (existing && elevatedDragIdsRef.current.has(n.id)) {
          const merged = mergeDerivedFlowNode(n, existing)
          return {
            ...merged,
            position: existing.position,
            zIndex: existing.zIndex,
          }
        }
        if (!existing) {
          changed = true
          return n
        }
        const dataChanged = existing.data !== n.data
        const dataVisuallyChanged =
          dataChanged && flowNodeDataVisualKey(existing) !== flowNodeDataVisualKey(n)
        if (
          existing.position.x !== n.position.x ||
          existing.position.y !== n.position.y ||
          dataVisuallyChanged ||
          existing.type !== n.type ||
          existing.zIndex !== n.zIndex ||
          existing.dragHandle !== n.dragHandle ||
          existing.style?.width !== n.style?.width ||
          existing.style?.height !== n.style?.height ||
          existing.style?.opacity !== n.style?.opacity ||
          existing.style?.pointerEvents !== n.style?.pointerEvents ||
          existing.style?.visibility !== n.style?.visibility ||
          existing.draggable !== n.draggable
        ) {
          changed = true
          return mergeDerivedFlowNode(n, existing)
        }
        return existing
      })
      if (!changed) {
        for (let i = 0; i < current.length; i++) {
          if (current[i] !== next[i]) {
            changed = true
            break
          }
        }
      }
      return changed ? next : current
    })
  }, [derivedNodes, setFlowNodes])

  // After WorkGroup create/merge dialog closes, drop leftover drag locks so
  // rearranged positions from the mutation are applied to flow nodes.
  const prevWorkGroupCreateFlowRef = useRef(mapWorkGroupCreateFlow)
  useEffect(() => {
    const wasOpen = prevWorkGroupCreateFlowRef.current !== null
    prevWorkGroupCreateFlowRef.current = mapWorkGroupCreateFlow
    if (!wasOpen || mapWorkGroupCreateFlow !== null) {
      return
    }
    draggedIdsRef.current.clear()
    pendingDragEndPositionsRef.current.clear()
    setFlowNodes((current) => {
      const byId = new Map(derivedNodes.map((node) => [node.id, node]))
      let changed = false
      const next = current.map((node) => {
        const derived = byId.get(node.id)
        if (!derived) {
          return node
        }
        if (
          node.position.x !== derived.position.x ||
          node.position.y !== derived.position.y ||
          node.data !== derived.data ||
          node.zIndex !== derived.zIndex ||
          node.style?.width !== derived.style?.width ||
          node.style?.height !== derived.style?.height
        ) {
          changed = true
          return mergeDerivedFlowNode(derived, node)
        }
        return node
      })
      return changed ? next : current
    })
  }, [mapWorkGroupCreateFlow, derivedNodes, setFlowNodes])

  const flowHostRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      flowRef.current = el
      backdropRef.current = el
      if (el) {
        syncChromeInsetCssVars()
      }
      setFlowHostReady((prev) => {
        const next = !!el
        return prev === next ? prev : next
      })
    },
    [flowRef, backdropRef, syncChromeInsetCssVars],
  )

  const flowEdges: Edge[] = useMemo(() => {
    const isLayeredArchitecture =
      !useC4Visuals &&
      displayFeatureNodes.length > 0 &&
      displayFeatureNodes.every((node) => node.layer)
    const resolveEdgeOpacity = (edgeId: string, sourceId: string, targetId: string) => {
      const focusOpacity = layerFocusTransitionSample
        ? (layerFocusTransitionSample.edgeOpacityById[edgeId] ?? 0)
        : 1
      const searchOpacity =
        matchingIds && (!matchingIds.has(sourceId) || !matchingIds.has(targetId)) ? 0.2 : 1
      const liveFocusOpacity =
        liveFocusNodeIds && liveFocusNodeIds.size > 0
          ? liveFocusNodeIds.has(sourceId) && liveFocusNodeIds.has(targetId)
            ? 1
            : 0.18
          : 1
      return focusOpacity * searchOpacity * liveFocusOpacity
    }

    const liveExecEdges = deriveExecutionEdges(executionOverlay, {
      focusTaskId: liveGraphFocusTaskId,
      currentTaskOnly: !liveGraphFocusTaskId,
      resolveImpactDependents: durableGraph
        ? (nodeId) =>
            impactStructureGraph(durableGraph, nodeId, { depth: 1 }).dependents.map(
              (item) => item.id,
            )
        : undefined,
    })
    const visibleNodeIds = new Set(displayFeatureNodes.map((node) => node.id))
    const liveExecFlowEdges: Edge[] = liveExecEdges
      .filter(
        (edge) =>
          visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
      )
      .map((edge) => toLiveExecutionFlowEdge(edge, resolveEdgeOpacity))
    const livePositions = c4LiveFrame?.positions
    const c4Obstacles = useC4Visuals
      ? displayFeatureNodes.map((node) => {
          const c4 = c4NodeById?.get(node.id)
          const pos =
            livePositions?.[node.id] ?? positionsById[node.id] ?? c4?.position ?? { x: 0, y: 0 }
          return {
            id: node.id,
            x: pos.x,
            y: pos.y,
            width: c4?.width ?? NODE_WIDTH,
            height: c4?.height ?? NODE_HEIGHT,
            shape: c4?.shape,
          }
        })
      : undefined
    const c4ObstacleById = c4Obstacles
      ? new Map(c4Obstacles.map((rect) => [rect.id, rect]))
      : null
    const c4EdgeSpecs: RoutedEdgeSpec[] | null =
      useC4Visuals && c4ObstacleById
        ? displayEdges.map((e) => {
            const source = c4ObstacleById.get(e.source)
            const target = c4ObstacleById.get(e.target)
            const relationI18n =
              messages.map.relations[e.relation as keyof typeof messages.map.relations]
            const denseC4 = displayEdges.length > 8
            const compactLabel = formatC4EdgeLabel(
              e.label,
              e.technology,
              e.relation,
              relationI18n,
              denseC4 ? 'tech' : 'full',
            )
            const fit =
              compactLabel && source && target
                ? fitEdgeLabel(compactLabel, source, target)
                : null
            return {
              id: e.id,
              source: e.source,
              target: e.target,
              labelText: compactLabel || undefined,
              labelBox: fit
                ? { width: fit.boxWidth, height: fit.boxHeight }
                : { width: 96, height: 22 },
            }
          })
        : null
    if (c4Obstacles && c4EdgeSpecs) {
      c4RoutingModelRef.current = { nodes: c4Obstacles, edges: c4EdgeSpecs }
    } else {
      c4RoutingModelRef.current = null
    }
    const c4Routes = c4LiveFrame?.routes
      ? c4LiveFrame.routes
      : c4Obstacles && c4EdgeSpecs
        ? routeAllOrthogonalEdges({
            nodes: c4Obstacles,
            edges: c4EdgeSpecs,
            clearance: 36,
          })
        : null
    if (!c4LiveFrame && c4Routes) {
      c4PreviousRoutesRef.current = c4Routes
    }
    const graphEdges = displayEdges.map((e, edgeIndex) => {
      const color = EDGE_COLORS[e.relation]
      const relationI18n =
        messages.map.relations[e.relation as keyof typeof messages.map.relations]
      const denseC4 = useC4Visuals && displayEdges.length > 8
      const compactLabel = formatC4EdgeLabel(
        e.label,
        e.technology,
        e.relation,
        relationI18n,
        denseC4 ? 'tech' : 'full',
      )
      const parallel = useC4Visuals
        ? parallelEdgeIndex(displayEdges, e.id, e.source, e.target)
        : { parallelIndex: 0, parallelCount: 1 }
      const precomputed = c4Routes?.get(e.id)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: (useC4Visuals ? 'c4Orthogonal' : 'floatingStraight') as
          | 'c4Orthogonal'
          | 'floatingStraight',
        animated: false,
        data: {
          evidence: e.evidence,
          purpose: e.purpose,
          detailVisibility:
            useC4Visuals
              ? denseC4
                ? 'hover'
                : 'always'
              : isLayeredArchitecture || displayEdges.length > 6
                ? 'hover'
                : 'always',
          technology: e.technology,
          relationship: e.label,
          ...(useC4Visuals
            ? {
                parallelIndex: parallel.parallelIndex,
                parallelCount: parallel.parallelCount,
                edgeIndex,
                obstacles: c4Obstacles,
                ...(precomputed
                  ? {
                      sourceSide: precomputed.sourceSide,
                      targetSide: precomputed.targetSide,
                      sourceAlong: precomputed.sourceAlong,
                      targetAlong: precomputed.targetAlong,
                      precomputedRoute: {
                        points: precomputed.points,
                        label: precomputed.label,
                        path: precomputed.path,
                        labelRect: precomputed.labelRect,
                        sourceSide: precomputed.sourceSide,
                        targetSide: precomputed.targetSide,
                        sourceAlong: precomputed.sourceAlong,
                        targetAlong: precomputed.targetAlong,
                      },
                    }
                  : {}),
              }
            : {}),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color,
        },
        style: {
          stroke: color,
          strokeWidth: 1.8,
          strokeDasharray: e.relation === 'depends_on' || e.confidence < 0.8 ? '6 4' : undefined,
          opacity: resolveEdgeOpacity(e.id, e.source, e.target),
        },
        label: isLayeredArchitecture ? undefined : compactLabel || undefined,
        labelStyle: { fill: 'var(--color-text-primary)', fontSize: 11, fontWeight: 650 },
        labelBgStyle: {
          fill: 'var(--color-bg-elevated)',
          fillOpacity: 0.96,
          stroke: color,
          strokeOpacity: 0.25,
        },
        labelBgPadding: isLayeredArchitecture ? undefined : ([7, 4] as [number, number]),
        labelBgBorderRadius: isLayeredArchitecture ? undefined : 7,
        zIndex: isLayeredArchitecture ? 0 : undefined,
        selectable: false,
        focusable: false,
        interactionWidth: 20,
      }
    })

    if (!showArtifacts) {
      return [...graphEdges, ...liveExecFlowEdges]
    }

    const featureNodeIds = new Set(displayFeatureNodes.map((n) => n.id))
    const resolveArtifactLinkOpacity = (sourceId: string) => {
      const focusOpacity = layerFocusTransitionSample
        ? (layerFocusTransitionSample.nodeOpacityById[sourceId] ?? 0)
        : 1
      const searchOpacity = matchingIds !== null && !matchingIds.has(sourceId) ? 0.2 : 1
      return focusOpacity * searchOpacity
    }
    const workGroups = mapContent?.workGroups ?? []
    const groupedMemberIds = new Set<string>()
    const artifactLinkEdges: Edge[] = []

    for (const group of workGroups) {
      const nodeIdsForGroup = new Map<string, string>()
      for (const memberNodeId of group.memberNodeIds) {
        groupedMemberIds.add(memberNodeId)
        const memberArtifacts = mapContent?.artifacts.filter(
          (artifact) => getWorkGroupMemberNodeId(artifact) === memberNodeId,
        ) ?? []
        for (const artifact of memberArtifacts) {
          if (
            artifact.scope !== 'node' ||
            !artifact.nodeId ||
            !featureNodeIds.has(artifact.nodeId)
          ) {
            continue
          }
          nodeIdsForGroup.set(artifact.nodeId, group.id)
        }
      }
      for (const [sourceId] of nodeIdsForGroup) {
        const edgeId = `artifact_link_${group.id}_${sourceId}`
        artifactLinkEdges.push({
          id: edgeId,
          source: sourceId,
          target: group.id,
          type: 'floatingStraight' as const,
          animated: true,
          selectable: false,
          style: {
            stroke: ARTIFACT_LINK_EDGE_COLOR,
            strokeWidth: 2,
            strokeDasharray: '6 4',
            opacity: resolveArtifactLinkOpacity(sourceId),
          },
        })
      }
    }

    const artifactLinkTargets = new Map<string, MapArtifact>()
    for (const artifact of mapContent?.artifacts ?? []) {
      if (
        artifact.scope !== 'node' ||
        !artifact.nodeId ||
        !featureNodeIds.has(artifact.nodeId)
      ) {
        continue
      }
      const targetId = getStackNodeId(artifact)
      if (groupedMemberIds.has(targetId)) {
        continue
      }
      if (!artifactLinkTargets.has(targetId)) {
        artifactLinkTargets.set(targetId, artifact)
      }
    }
    for (const [targetId] of artifactLinkTargets.entries()) {
      const artifact = artifactLinkTargets.get(targetId)!
      const sourceId = artifact.nodeId!
      const edgeId = `artifact_link_${targetId}`
      artifactLinkEdges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: 'floatingStraight' as const,
        animated: true,
        selectable: false,
        style: {
          stroke: ARTIFACT_LINK_EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: '6 4',
          opacity: resolveArtifactLinkOpacity(sourceId),
        },
      })
    }

    return [...graphEdges, ...artifactLinkEdges, ...liveExecFlowEdges]
  }, [
    displayEdges,
    displayFeatureNodes,
    mapContent,
    matchingIds,
    messages,
    showArtifacts,
    layerFocusTransitionSample,
    useC4Visuals,
    c4NodeById,
    positionsById,
    c4LiveFrame,
    executionOverlay,
    liveGraphFocusTaskId,
    liveFocusNodeIds,
    durableGraph,
  ])

  useEffect(() => {
    return () => {
      if (pendingClickRef.current) clearTimeout(pendingClickRef.current)
      if (pendingPaneClickRef.current) clearTimeout(pendingPaneClickRef.current)
      if (c4RouteRafRef.current != null) cancelAnimationFrame(c4RouteRafRef.current)
    }
  }, [])

  const computeFitOptions = useCallback((): FitViewOptions => {
    if (!bleed) return DEFAULT_FIT_OPTIONS
    const flow = flowRef.current
    if (!flow) return DEFAULT_FIT_OPTIONS
    const safe = measureSafeRect(flow, !!bleed, viewportChromeRef.current, chromeInsetsRef.current)
    if (!safe) return DEFAULT_FIT_OPTIONS

    return {
      padding: {
        top: `${Math.round(safe.sy + GRID_MARGIN)}px`,
        left: `${Math.round(safe.sx + GRID_MARGIN)}px`,
        right: `${Math.round(flow.getBoundingClientRect().width - safe.sx - safe.sw + GRID_MARGIN)}px`,
        bottom: `${Math.round(flow.getBoundingClientRect().height - safe.sy - safe.sh + GRID_MARGIN)}px`,
      },
      maxZoom: FIT_MAX_ZOOM,
    }
  }, [bleed, flowRef, viewportChromeRef, chromeInsetsRef])

  const nodesRef = useRef(displayFeatureNodes)
  nodesRef.current = displayFeatureNodes
  const edgesRef = useRef(displayEdges)
  edgesRef.current = displayEdges

  const c4LayoutSignature = useMemo(() => {
    if (!c4Diagram) return ''
    return c4Diagram.nodes
      .map(
        (node) =>
          `${node.id}:${Math.round(node.position.x)},${Math.round(node.position.y)}`,
      )
      .join(';')
  }, [c4Diagram])

  const graphLayoutKey = useMemo(
    () =>
      [
        architectureLevel,
        architectureScopeId ?? '',
        useC4Visuals ? 'c4' : 'legacy',
        displayFeatureNodes.map((n) => n.id).join('\0'),
        displayEdges.map((e) => `${e.source}>${e.target}`).join('\0'),
        c4LayoutSignature,
      ].join('|'),
    [
      architectureLevel,
      architectureScopeId,
      useC4Visuals,
      displayFeatureNodes,
      displayEdges,
      c4LayoutSignature,
    ],
  )
  const graphLayoutKeyRef = useRef(graphLayoutKey)
  graphLayoutKeyRef.current = graphLayoutKey

  useEffect(() => {
    if (nodes.length === 0) clearMapViewportSession()
  }, [nodes.length])

  const applyCamera = useCallback(
    (viewport: Viewport, duration: number) => {
      // Programmatic camera updates can emit onMoveEnd; only the latest move
      // token may lift suppression when rapid camera applications overlap.
      viewportPersistenceGuardRef.current?.suppressFor(Math.max(duration, 0) + 80)
      setDefaultViewport(viewport)
      setViewport(viewport, { duration })
    },
    [setViewport],
  )

  const isBleedChromeReady = useCallback(() => {
    if (!bleed) return true
    const chromeEl = viewportChromeRef.current
    if (!chromeEl) return false
    const rect = chromeEl.getBoundingClientRect()
    return rect.width >= 1 && rect.height >= 1
  }, [bleed, viewportChromeRef])

  useEffect(() => () => {
    viewportPersistenceGuardRef.current?.clear()
  }, [])

  const applyLayout = useCallback(
    (animate: boolean) => {
      if (layerFocusTransitionRef.current) {
        return
      }
      const flow = flowRef.current
      const currentNodes = nodesRef.current
      if (!flow) {
        // HMR/remount can briefly detach the host before the ref callback reattaches.
        if (hasLaidOutRef.current) setLayoutReady(true)
        return
      }
      if (currentNodes.length === 0) return
      if (bleed && !isBleedChromeReady()) return
      if (
        c4DiagramBaseRef.current &&
        c4LaidOutGenerationRef.current !== c4LayoutGenerationRef.current
      ) {
        // Pre-ELK grid is still the displayed diagram. Fitting it, then fitting
        // the laid-out result, is the double camera jump.
        return
      }

      const isUserManipulatingCanvas =
        resizingIdsRef.current.size > 0 ||
        flowNodesRef.current.some((node) => node.dragging)
      if (isUserManipulatingCanvas) return

      const flowRect = flow.getBoundingClientRect()
      if (flowRect.width < 1 || flowRect.height < 1) {
        return
      }

      const chromeInsets = chromeInsetsRef.current
      let safe = measureSafeRect(flow, !!bleed, viewportChromeRef.current, chromeInsets)
      if (safe?.provisional) {
        // Full-canvas fallback is replaced as soon as the chrome sentinel measures.
        // Committing it moves the camera (same zoom, large pan) a frame later.
        return
      }
      if (!safe && bleed) {
        // Chrome sentinel may not be ready on the first paint — use non-bleed bounds.
        safe = measureSafeRect(flow, false, null, chromeInsets)
      }

      const flowWidth = flowRect.width
      const flowHeight = flowRect.height
      const lastFlow = lastFlowSizeRef.current
      const flowSizeChanged =
        !lastFlow ||
        Math.abs(flowWidth - lastFlow.width) > 1 ||
        Math.abs(flowHeight - lastFlow.height) > 1

      const layoutKey = graphLayoutKeyRef.current
      const restoredViewport = getUserMapViewport(layoutKey)
      const previous = layoutRef.current

      if (!safe) {
        const fitViewport = { x: 0, y: 0, zoom: 1 }
        const positionsById = defaultPositionsById(currentNodes.map((n) => n.id))
        const preservedBands =
          previous?.layerBands?.length
            ? previous.layerBands
            : fullLayerBandsRef.current.length > 0
              ? fullLayerBandsRef.current
              : []
        const sanitizedPreservedBands = sanitizeLayoutBands(
          preservedBands,
          currentNodes,
          positionsById,
          architecture?.layers,
        )
        layoutRef.current = {
          area: DEFAULT_GRID_AREA,
          positionsById,
          layerBands: sanitizedPreservedBands,
          viewport: fitViewport,
        }
        layoutGraphKeyOnSnapshotRef.current = layoutKey
        setFitOptions(DEFAULT_FIT_OPTIONS)
        setLayoutReady(true)
        setLayoutVersion((v) => v + 1)
        if (!restoredViewport) syncAutoMapViewport(layoutKey, fitViewport)
        applyCamera(restoredViewport ?? fitViewport, 0)
        lastFlowSizeRef.current = { width: flowWidth, height: flowHeight }
        hasLaidOutRef.current = true
        return
      }

      if (
        bleed &&
        previous &&
        hasLaidOutRef.current &&
        layoutGraphKeyOnSnapshotRef.current === layoutKey &&
        !flowSizeChanged
      ) {
        // Bleed canvas is full-viewport fixed; sidebars squeeze via margin overlay.
        // Keep camera fixed — only move chrome controls with the visible safe rect.
        setFitOptions(computeFitOptions())
        hasLaidOutRef.current = true
        return
      }

      const activeC4 = c4DiagramRef.current
      const snapshot =
        activeC4 && activeC4.nodes.length > 0
          ? (() => {
              const c4Layout = layoutFromC4Diagram(activeC4, safe)
              const projectKey = useWorkbenchStore.getState().project?.projectId
              const overlay = projectKey
                ? loadC4LayoutOverlay(projectKey)
                : { version: 2 as const, positions: {}, collapsedBoundaries: {} }
              const positionsById = applyOverlayToPositions(
                overlay,
                architectureLevel,
                architectureScopeId,
                c4Layout.positionsById,
                activeViewKey,
              )
              if (projectKey) {
                pruneC4LayoutOverlayForView(
                  projectKey,
                  architectureLevel,
                  architectureScopeId,
                  Object.keys(positionsById),
                  activeViewKey,
                )
              }
              return {
                area: c4Layout.area,
                positionsById,
                layerBands: [] as ArchitectureLayerBandLayout[],
                viewport: c4Layout.viewport,
              }
            })()
          : buildLayout(
              currentNodes,
              edgesRef.current.map((e) => ({ source: e.source, target: e.target })),
              architecture?.layers ?? [],
              safe,
            )
      const sanitizedSnapshot: LayoutSnapshot = {
        ...snapshot,
        layerBands:
          activeC4 && activeC4.nodes.length > 0
            ? []
            : sanitizeLayoutBands(
                snapshot.layerBands,
                currentNodes,
                snapshot.positionsById,
                architecture?.layers,
              ),
      }
      const snapshotsEqual = previous
        ? layoutSnapshotsEqual(previous, sanitizedSnapshot)
        : false
      if (previous && snapshotsEqual) {
        // Packing unchanged; on remount previous is null so we still restore camera.
        hasLaidOutRef.current = true
        return
      }
      // Store the fit snapshot for equality, but prefer the user's last camera
      // when returning from another center tab (canvas remount).
      layoutRef.current = sanitizedSnapshot
      layoutGraphKeyOnSnapshotRef.current = layoutKey
      const fullNodeIds = new Set(fullLayerGraph.nodes.map((node) => node.id))
      const currentIds = new Set(currentNodes.map((node) => node.id))
      if (
        fullNodeIds.size === currentIds.size &&
        [...fullNodeIds].every((id) => currentIds.has(id))
      ) {
        fullLayerBandsRef.current = sanitizedSnapshot.layerBands
      }
      lastFlowSizeRef.current = { width: flowWidth, height: flowHeight }
      setFitOptions(computeFitOptions())
      setLayoutReady(true)
      setLayoutVersion((v) => v + 1)
      if (!restoredViewport) syncAutoMapViewport(layoutKey, sanitizedSnapshot.viewport)
      applyCamera(
        restoredViewport ?? sanitizedSnapshot.viewport,
        restoredViewport ? 0 : animate ? 300 : 0,
      )
      hasLaidOutRef.current = true
    },
    [bleed, flowRef, viewportChromeRef, chromeInsetsRef, applyCamera, computeFitOptions, architecture, isBleedChromeReady],
  )

  const cancelLayerFocusTransitionRaf = useCallback(() => {
    if (layerFocusTransitionRafRef.current !== null) {
      cancelAnimationFrame(layerFocusTransitionRafRef.current)
      layerFocusTransitionRafRef.current = null
    }
  }, [])

  const scheduleApplyLayout = useCallback(
    (animate: boolean) => {
      if (layerFocusTransitionRef.current) {
        return
      }
      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current)
      }
      layoutRafRef.current = requestAnimationFrame(() => {
        layoutRafRef.current = null
        applyLayout(hasLaidOutRef.current ? false : animate)
      })
    },
    [applyLayout],
  )

  const completeLayerFocusTransition = useCallback(
    (transition: ActiveLayerFocusTransition) => {
      cancelLayerFocusTransitionRaf()
      if (transition.direction === 'enter') {
        lastFullLayerPositionsRef.current = {
          ...transition.layoutFromFull.positionsById,
        }
      } else {
        fullLayerBandsRef.current = transition.layoutToFull.layerBands
      }
      layoutRef.current = transition.layoutToFull
      layoutGraphKeyOnSnapshotRef.current = graphLayoutKeyRef.current
      setLayoutVersion((v) => v + 1)
      layerFocusTransitionRef.current = null
      setLayerFocusTransitionSample(null)
      window.setTimeout(() => {
        suppressViewportPersistRef.current = false
      }, 80)
    },
    [cancelLayerFocusTransitionRaf],
  )

  const runLayerFocusTransitionFrame = useCallback(() => {
    const transition = layerFocusTransitionRef.current
    if (!transition) return
    const sample = sampleLayerFocusTransition(transition, performance.now())
    setLayerFocusTransitionSample(sample)
    suppressViewportPersistRef.current = true
    setViewport(sample.viewport, { duration: 0 })
    const motionDone = sample.progress >= 1
    const fadeDone = sample.fadeProgress >= 1
    if (motionDone && fadeDone) {
      if (!transition.pendingComplete) {
        transition.pendingComplete = true
        layerFocusTransitionRafRef.current = requestAnimationFrame(() => {
          completeLayerFocusTransition(transition)
        })
        return
      }
    }
    layerFocusTransitionRafRef.current = requestAnimationFrame(runLayerFocusTransitionFrame)
  }, [completeLayerFocusTransition, setViewport])

  const measureSafeForLayout = useCallback(() => {
    const flow = flowRef.current
    if (!flow) return null
    const flowRect = flow.getBoundingClientRect()
    if (flowRect.width < 1 || flowRect.height < 1) return null
    const chromeInsets = chromeInsetsRef.current
    let safe = measureSafeRect(flow, !!bleed, viewportChromeRef.current, chromeInsets)
    if (!safe && bleed) {
      safe = measureSafeRect(flow, false, null, chromeInsets)
    }
    return safe
  }, [bleed, flowRef, viewportChromeRef, chromeInsetsRef])

  const buildLayoutForGraph = useCallback(
    (layoutNodes: FunctionalNode[], layoutEdges: typeof edges) => {
      const safe = measureSafeForLayout()
      if (!safe) return null
      return buildLayout(
        layoutNodes,
        layoutEdges.map((edge) => ({ source: edge.source, target: edge.target })),
        architecture?.layers ?? [],
        safe,
      )
    },
    [measureSafeForLayout, architecture],
  )

  const startLayerFocusTransition = useCallback(
    (direction: 'enter' | 'exit', focusNodeId: string | null) => {
      if (!isLayeredArchitectureMap) return
      cancelLayerFocusTransitionRaf()

      const fullNodes = fullLayerGraph.nodes
      const fullEdges = fullLayerGraph.edges
      if (fullNodes.length === 0) return

      let layoutFromFull: LayoutSnapshot
      if (direction === 'exit' && layoutRef.current) {
        const focusLayout = layoutRef.current
        const mergedPositions: Record<string, { x: number; y: number }> = {
          ...lastFullLayerPositionsRef.current,
        }
        for (const [id, pos] of Object.entries(focusLayout.positionsById)) {
          mergedPositions[id] = pos
        }
        layoutFromFull = {
          ...focusLayout,
          positionsById: mergedPositions,
        }
      } else if (layerFocusTransitionSample && layerFocusTransitionRef.current) {
        layoutFromFull = sampleToLayoutSnapshot(
          layerFocusTransitionSample,
          layerFocusTransitionRef.current.layoutFromFull.area,
        )
      } else if (layoutRef.current) {
        layoutFromFull = layoutRef.current
      } else {
        const built = buildLayoutForGraph(fullNodes, fullEdges)
        if (!built) return
        layoutFromFull = built
      }

      const linkedIds =
        focusNodeId && direction === 'enter'
          ? computeOneHopLinkedIds(fullNodes, fullEdges, focusNodeId)
          : focusNodeId && direction === 'exit'
            ? computeOneHopLinkedIds(fullNodes, fullEdges, focusNodeId)
            : new Set(fullNodes.map((node) => node.id))

      const linkedLayerIds = new Set(
        fullNodes
          .filter((node) => linkedIds.has(node.id) && node.layer)
          .map((node) => node.layer as string),
      )

      let layoutToFull: LayoutSnapshot | null
      if (direction === 'enter' && focusNodeId) {
        const linkedNodes = fullNodes.filter((node) => linkedIds.has(node.id))
        const linkedEdges = fullEdges.filter(
          (edge) => edge.source === focusNodeId || edge.target === focusNodeId,
        )
        layoutToFull = buildLayoutForGraph(linkedNodes, linkedEdges)
      } else {
        layoutToFull = buildLayoutForGraph(fullNodes, fullEdges)
      }
      if (!layoutToFull) return

      if (direction === 'enter') {
        lastFullLayerPositionsRef.current = {
          ...layoutFromFull.positionsById,
        }
        fullLayerBandsRef.current = layoutFromFull.layerBands
      }

      if (reducedMotion) {
        layoutRef.current = layoutToFull
        layoutGraphKeyOnSnapshotRef.current = graphLayoutKeyRef.current
        setLayoutVersion((v) => v + 1)
        applyCamera(layoutToFull.viewport, 0)
        hasLaidOutRef.current = true
        return
      }

      const transition: ActiveLayerFocusTransition = {
        direction,
        focusNodeId: focusNodeId ?? '',
        linkedIds,
        linkedLayerIds,
        allNodeIds: new Set(fullNodes.map((node) => node.id)),
        layoutFrom: layoutSnapshotToLayerFocus(layoutFromFull),
        layoutTo: layoutSnapshotToLayerFocus(layoutToFull),
        layoutFromFull,
        layoutToFull,
        edges: fullEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        })),
        startedAt: performance.now(),
        durationMs: LAYER_FOCUS_TRANSITION_MS,
      }

      layerFocusTransitionRef.current = transition
      const initialSample = sampleLayerFocusTransition(transition, transition.startedAt)
      setLayerFocusTransitionSample(initialSample)
      suppressViewportPersistRef.current = true
      setViewport(initialSample.viewport, { duration: 0 })
      layerFocusTransitionRafRef.current = requestAnimationFrame(runLayerFocusTransitionFrame)
    },
    [
      isLayeredArchitectureMap,
      cancelLayerFocusTransitionRaf,
      fullLayerGraph,
      layerFocusTransitionSample,
      buildLayoutForGraph,
      reducedMotion,
      applyCamera,
      setViewport,
      runLayerFocusTransitionFrame,
    ],
  )

  useLayoutEffect(() => {
    const c4OwnsCanvas = Boolean(c4Diagram && c4Diagram.nodes.length > 0)
    if (!flowHostReady || !isLayeredArchitectureMap || c4OwnsCanvas) {
      prevLayerFocusActiveRef.current = isLayerFocusActive
      prevLayerFocusNodeIdRef.current = layerFocusNodeId
      return
    }

    const wasActive = prevLayerFocusActiveRef.current
    const wasFocusNodeId = prevLayerFocusNodeIdRef.current

    if (!wasActive && isLayerFocusActive && layerFocusNodeId) {
      startLayerFocusTransition('enter', layerFocusNodeId)
    } else if (wasActive && !isLayerFocusActive) {
      startLayerFocusTransition('exit', wasFocusNodeId)
    } else if (
      wasActive &&
      isLayerFocusActive &&
      layerFocusNodeId &&
      layerFocusNodeId !== wasFocusNodeId
    ) {
      startLayerFocusTransition('enter', layerFocusNodeId)
    }

    prevLayerFocusActiveRef.current = isLayerFocusActive
    prevLayerFocusNodeIdRef.current = layerFocusNodeId
  }, [
    flowHostReady,
    isLayeredArchitectureMap,
    c4Diagram,
    isLayerFocusActive,
    layerFocusNodeId,
    startLayerFocusTransition,
  ])

  useEffect(() => {
    return () => {
      cancelLayerFocusTransitionRaf()
    }
  }, [cancelLayerFocusTransitionRaf])

  // Synchronous measure + layout before first paint, and on every resize /
  // chrome change. First application is instant (no zoom animation).
  useLayoutEffect(() => {
    if (!flowHostReady) return
    const flow = flowRef.current
    if (!flow || nodes.length === 0) return

    const run = () => scheduleApplyLayout(false)

    if (!hasLaidOutRef.current) {
      applyLayout(false)
    } else if (
      layoutGraphKeyOnSnapshotRef.current !== graphLayoutKey &&
      !layerFocusTransitionRef.current
    ) {
      applyLayout(false)
    }

    const observer = new ResizeObserver(run)
    observer.observe(flow)
    const chromeEl = viewportChromeRef.current
    if (chromeEl) observer.observe(chromeEl)
    window.addEventListener('resize', run)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', run)
      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current)
        layoutRafRef.current = null
      }
    }
  }, [applyLayout, scheduleApplyLayout, flowRef, viewportChromeRef, graphLayoutKey, nodes.length, bleed, flowHostReady])

  // Fallback: reveal the canvas even if the first layout pass is skipped mid-drag.
  // Wait until ELK has published; revealing the pre-ELK grid is the zoom flash.
  useEffect(() => {
    if (layoutReady) return
    if (
      c4DiagramBaseRef.current &&
      c4LaidOutGenerationRef.current !== c4LayoutGenerationRef.current
    ) {
      return
    }
    const timer = window.setTimeout(() => {
      setLayoutReady(true)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [layoutReady, c4Diagram])

  useEffect(() => {
    const guard = viewportPersistenceGuardRef.current
    if (guard) fitSingleMatchingNode(matchingIds, fitView, guard, FIT_MAX_ZOOM)
  }, [matchingIds, fitView])

  useEffect(() => {
    if (!mapSearchFocus) return
    if (mapSearchFocus.workGroupId) {
      setSelectedWorkGroupId(mapSearchFocus.workGroupId)
    }
    const focus = mapSearchFocus
    let cancelled = false
    let raf = 0
    let frames = 0
    let quietFrames = 0
    let lastLayout = layoutVersionRef.current
    const tick = () => {
      if (cancelled) return
      frames += 1
      const layoutNow = layoutVersionRef.current
      if (layoutNow !== lastLayout) {
        lastLayout = layoutNow
        quietFrames = 0
      } else {
        quietFrames += 1
      }
      const present = getNodes().some((node) => node.id === focus.canvasNodeId)
      if (present && quietFrames >= 8) {
        viewportPersistenceGuardRef.current?.suppressFor(400)
        void fitView({
          nodes: [{ id: focus.canvasNodeId }],
          padding: 0.5,
          duration: 280,
          maxZoom: FIT_MAX_ZOOM,
        })
        clearMapSearchFocus()
        return
      }
      if (frames >= 180) {
        clearMapSearchFocus()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [mapSearchFocus, clearMapSearchFocus, fitView, getNodes])

  const handleMoveEnd = useCallback((_event: unknown, viewport: Viewport) => {
    if (viewportPersistenceGuardRef.current?.isSuppressed()) return
    rememberUserMapViewport(graphLayoutKeyRef.current, viewport)
  }, [])

  const resolveViewportCenterScreenPoint = useCallback(() => {
    const flow = flowRef.current
    if (!flow) return null
    const rect = flow.getBoundingClientRect()
    const safe = measureSafeRect(flow, !!bleed, viewportChromeRef.current, chromeInsetsRef.current)
    return {
      x: safe ? safe.sx + safe.sw / 2 + rect.left : rect.left + rect.width / 2,
      y: safe ? safe.sy + safe.sh / 2 + rect.top : rect.top + rect.height / 2,
    }
  }, [bleed, chromeInsetsRef, viewportChromeRef, flowRef])

  const resolveFlowPosition = useCallback(
    (placement: MapArtifactPlacement) => {
      if (placement.mode === 'stack') {
        const artifacts = useWorkbenchStore.getState().mapContent?.artifacts ?? []
        const anchor = artifacts.find((artifact) => artifact.stackId === placement.stackId)
        return anchor?.position ?? null
      }
      if (placement.mode === 'viewportCenter') {
        const center = resolveViewportCenterScreenPoint()
        if (!center) return null
        return screenToFlowPosition(center)
      }
      return screenToFlowPosition({ x: placement.x, y: placement.y })
    },
    [resolveViewportCenterScreenPoint, screenToFlowPosition],
  )

  useEffect(
    () => () => {
      cancelMapArtifactCreate()
      cancelMapArtifactRename()
    },
    [cancelMapArtifactCreate, cancelMapArtifactRename],
  )

  useEffect(() => {
    if (!mapArtifactCreateFlow || mapArtifactCreateFlow.type !== 'image') return

    let cancelled = false

    void (async () => {
      const picked = await pickMapImageFile()
      if (cancelled) return

      if (!picked.ok) {
        if (picked.reason !== 'cancelled') {
          const messageKey =
            picked.reason === 'too_large'
              ? 'mapArtifacts.imageTooLarge'
              : picked.reason === 'invalid_type'
                ? 'mapArtifacts.imageInvalidType'
                : 'mapArtifacts.imagePickFailed'
          pushToast({ type: 'error', message: ts(messageKey) })
        }
        cancelMapArtifactCreate()
        return
      }

      const position = resolveFlowPosition(mapArtifactCreateFlow.placement)
      if (!position) {
        cancelMapArtifactCreate()
        return
      }

      const size = computeMapImageCardSize(picked.file.width, picked.file.height)
      await createMapImageArtifact(position, size, picked.file, {
        anchorNodeId:
          mapArtifactCreateFlow.placement.mode !== 'stack'
            ? mapArtifactCreateFlow.placement.anchorNodeId
            : undefined,
        stackId: mapArtifactCreateFlow.targetStackId,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [
    mapArtifactCreateFlow,
    resolveFlowPosition,
    createMapImageArtifact,
    cancelMapArtifactCreate,
    pushToast,
    ts,
  ])

  const handleTitleDialogConfirm = useCallback(
    (title: string | undefined) => {
      if (!mapArtifactCreateFlow) return
      const position = resolveFlowPosition(mapArtifactCreateFlow.placement)
      if (!position) {
        cancelMapArtifactCreate()
        return
      }
      void createMapArtifact(mapArtifactCreateFlow.type, position, {
        title,
        anchorNodeId:
          mapArtifactCreateFlow.placement.mode !== 'stack'
            ? mapArtifactCreateFlow.placement.anchorNodeId
            : undefined,
        stackId: mapArtifactCreateFlow.targetStackId,
      })
    },
    [mapArtifactCreateFlow, resolveFlowPosition, createMapArtifact, cancelMapArtifactCreate],
  )

  const handleRenameDialogConfirm = useCallback(
    (title: string | undefined) => {
      if (!mapArtifactRenameFlow || !mapContent) return
      const artifact = mapContent.artifacts.find(
        (item) => item.id === mapArtifactRenameFlow.artifactId,
      )
      if (!artifact) {
        cancelMapArtifactRename()
        return
      }
      void updateMapArtifact(
        mapArtifactRenameFlow.artifactId,
        buildMapArtifactTitlePatch(artifact, title),
      )
      cancelMapArtifactRename()
    },
    [mapArtifactRenameFlow, mapContent, updateMapArtifact, cancelMapArtifactRename],
  )

  const handleHeaderMenuRename = useCallback(() => {
    if (!headerContextMenu || !mapContent) return
    const artifact = mapContent.artifacts.find(
      (item) => item.id === headerContextMenu.artifactId,
    )
    if (!artifact) return
    beginMapArtifactRename(
      headerContextMenu.artifactId,
      headerContextMenu.artifactType,
      getMapArtifactStoredTitle(artifact) ?? '',
    )
  }, [headerContextMenu, mapContent, beginMapArtifactRename])

  const handleHeaderMenuAddStacked = useCallback(() => {
    if (!headerContextMenu) return
    void beginMapArtifactStackAdd(headerContextMenu.artifactId)
  }, [headerContextMenu, beginMapArtifactStackAdd])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'map_workgroup') {
        if (pendingClickRef.current) clearTimeout(pendingClickRef.current)
        setSelectedWorkGroupId(node.id)
        selectArtifact(null)
        return
      }
      if (!isArchitectureFlowNodeType(node.type)) {
        if (pendingClickRef.current) clearTimeout(pendingClickRef.current)
        const artifactId =
          typeof node.data?.artifactId === 'string' ? node.data.artifactId : node.id
        setSelectedWorkGroupId(null)
        selectArtifact(artifactId)
        return
      }
      // Single-click selects (opens detail drawer). Double-click opens Code / Diff
      // for code-file nodes — do not jump to the editor on first click.
      if (pendingClickRef.current) clearTimeout(pendingClickRef.current)
      pendingClickRef.current = setTimeout(() => {
        pendingClickRef.current = null
        void onSelectNode(node.id)
      }, 280)
    },
    [onSelectNode, selectArtifact],
  )

  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (previewDragLockRef.current) return
      if (!isArchitectureFlowNodeType(node.type)) return
      const sourceNode =
        displayFeatureNodes.find((n) => n.id === node.id) ??
        fullLayerGraph.nodes.find((n) => n.id === node.id) ??
        graphNodes.find((n) => n.id === node.id)
      if (!sourceNode) return
      schedulePreview(sourceNode, event.clientX, event.clientY)
    },
    [displayFeatureNodes, fullLayerGraph.nodes, graphNodes, previewDragLockRef, schedulePreview],
  )

  const handleNodeMouseLeave = useCallback(() => {
    clearPreviewTimer()
    setHoverPreview(null)
  }, [clearPreviewTimer, setHoverPreview])

  const cancelPendingPaneClick = useCallback(() => {
    if (pendingPaneClickRef.current) {
      clearTimeout(pendingPaneClickRef.current)
      pendingPaneClickRef.current = null
    }
  }, [])

  const navigateUpFromBlank = useCallback(() => {
    cancelPendingPaneClick()
    const action = resolveMapBlankDoubleClickAction({
      isLayerFocusActive: isLayerFocusActiveRef.current,
      hasArchitectureScope: Boolean(architectureScopeId),
    })
    if (action === 'none') return false

    blurActiveNoteEditor()
    handleNodeMouseLeave()
    selectArtifact(null)
    setSelectedWorkGroupId(null)
    setContextMenu(null)
    setHeaderContextMenu(null)

    if (action === 'clear-layer-focus') {
      clearLayerFocus()
      return true
    }
    drillOut()
    return true
  }, [
    architectureScopeId,
    cancelPendingPaneClick,
    clearLayerFocus,
    drillOut,
    handleNodeMouseLeave,
    selectArtifact,
  ])

  useEffect(() => {
    const host = flowRef.current
    if (!host) return
    const onNativeDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const onPane = Boolean(target?.closest('.react-flow__pane'))
      const onNode = Boolean(target?.closest('.react-flow__node'))
      if (!onPane || onNode) return
      navigateUpFromBlank()
    }
    host.addEventListener('dblclick', onNativeDblClick)
    return () => host.removeEventListener('dblclick', onNativeDblClick)
  }, [flowRef, flowHostReady, navigateUpFromBlank])

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return
      if (event.detail >= 2) {
        navigateUpFromBlank()
        return
      }
      cancelPendingPaneClick()
      pendingPaneClickRef.current = setTimeout(() => {
        pendingPaneClickRef.current = null
        blurActiveNoteEditor()
        handleNodeMouseLeave()
        selectArtifact(null)
        setSelectedWorkGroupId(null)
        openGlobalAgentChat()
        setContextMenu(null)
        setHeaderContextMenu(null)
      }, 280)
    },
    [
      cancelPendingPaneClick,
      navigateUpFromBlank,
      handleNodeMouseLeave,
      selectArtifact,
      openGlobalAgentChat,
    ],
  )

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault()
    setHeaderContextMenu(null)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      ...(event.currentTarget instanceof HTMLElement
        ? { restoreFocusTo: event.currentTarget }
        : {}),
    })
  }, [])

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent, node: Node) => {
      if (!isArchitectureFlowNodeType(node.type)) return
      event.preventDefault()
      setHeaderContextMenu(null)
      const featureNode =
        nodes.find((candidate) => candidate.id === node.id) ??
        graphNodes.find((candidate) => candidate.id === node.id)
      const codeTarget = resolveCodeNodeTarget(featureNode)
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        anchorNodeId: node.id,
        ...(event.currentTarget instanceof HTMLElement
          ? { restoreFocusTo: event.currentTarget }
          : {}),
        anchorNodeName: featureNode?.name,
        anchorNodeLevel: featureNode?.level,
        anchorFilePath: codeTarget?.filePath,
        anchorParentNodeId: codeTarget?.parentNodeId,
      })
    },
    [nodes, graphNodes],
  )

  const handleContextMenuSelect = useCallback(
    (type: MapArtifactType) => {
      if (!contextMenu) return
      beginMapArtifactCreate(type, {
        mode: 'screenPoint',
        x: contextMenu.x,
        y: contextMenu.y,
        anchorNodeId: contextMenu.anchorNodeId,
      })
    },
    [contextMenu, beginMapArtifactCreate],
  )

  const handleContextMenuOpenFile = useCallback(
    (filePath: string, parentNodeId: string) => {
      if (!onSelectFile) return
      void openCodeNodeFile({ filePath, parentNodeId }, onSelectFile)
    },
    [onSelectFile],
  )

  const handleCreateWorkGroup = useCallback(() => {
    if (!contextMenu) return
    const origin = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    beginMapWorkGroupCreate({
      source: 'contextMenu',
      origin,
    })
  }, [contextMenu, beginMapWorkGroupCreate, screenToFlowPosition])

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!isArchitectureFlowNodeType(node.type)) return
      if (pendingClickRef.current) {
        clearTimeout(pendingClickRef.current)
        pendingClickRef.current = null
      }
      const sourceNode =
        nodes.find((candidate) => candidate.id === node.id) ??
        graphNodes.find((candidate) => candidate.id === node.id)
      const codeTarget = resolveCodeNodeTarget(sourceNode)
      const action = resolveMapNodeDoubleClickAction({
        isCodeFileNode: Boolean(codeTarget),
        canDrill: canDrillIntoNode(node.id),
      })
      if (action === 'open-code-file' && codeTarget) {
        if (onSelectFile) {
          void openCodeNodeInEditor(codeTarget, {
            selectFile: onSelectFile,
          })
        } else {
          void onSelectNode(codeTarget.parentNodeId)
        }
        setHoverPreview(null)
        return
      }
      if (action === 'drill-in') {
        drillIntoNode(node.id)
        setHoverPreview(null)
        return
      }
      void openNodeAgentChat(node.id)
      setHoverPreview(null)
    },
    [
      canDrillIntoNode,
      drillIntoNode,
      graphNodes,
      nodes,
      onSelectFile,
      onSelectNode,
      openNodeAgentChat,
      setHoverPreview,
    ],
  )

  return (
    <div
      className={`${styles.flow} ${bleed ? styles.flowBleed : ''} ${layoutReady ? styles.flowLayoutReady : styles.flowLayoutPending}`}
      ref={flowHostRefCallback}
      onMouseMove={trackPointerMove}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        zoomOnDoubleClick={false}
        onNodeContextMenu={handleNodeContextMenu}
        onMoveEnd={handleMoveEnd}
        defaultViewport={defaultViewport}
        // WorkGroup frames share space with members; never auto-bump selected
        // nodes (+1000) or they paint over every card/window inside the frame.
        elevateNodesOnSelect={false}
        edgesFocusable={false}
        zIndexMode="manual"
        colorMode={resolvedTheme}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Controls showInteractive={false} fitViewOptions={fitOptions} />
        <MiniMap
          className={styles.miniMap}
          nodeColor={(node) => {
            const status = (node.data as { status?: string }).status
            return STATUS_COLORS[status ?? ''] ?? 'var(--color-text-muted)'
          }}
          nodeStrokeColor={(node) => (node.id === selectedNodeId ? 'var(--color-accent)' : 'transparent')}
          nodeStrokeWidth={3}
          nodeBorderRadius={3}
          maskColor="var(--minimap-mask)"
          maskStrokeColor="var(--color-accent)"
          maskStrokeWidth={1.5}
          bgColor="transparent"
          pannable
          zoomable
        />
        <MapSnapGuides guides={snapGuides} />
      </ReactFlow>
      <FunctionMapContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpenNodeAgentChat={(nodeId) => {
          void openNodeAgentChat(nodeId)
        }}
        onOpenFile={handleContextMenuOpenFile}
        onOpenFileAgent={(filePath, parentNodeId) => {
          void openFileAgentChat(filePath, parentNodeId)
        }}
        onSelect={handleContextMenuSelect}
        onCreateWorkGroup={handleCreateWorkGroup}
      />
      <MapArtifactHeaderContextMenu
        menu={headerContextMenu}
        onClose={() => setHeaderContextMenu(null)}
        onRename={handleHeaderMenuRename}
        onAddStacked={handleHeaderMenuAddStacked}
      />
      {mapWorkGroupCreateFlow && (
        <MapWorkGroupCreateDialog
          onCancel={cancelMapWorkGroupCreate}
          onConfirm={(items) => {
            void confirmMapWorkGroupCreate(items)
          }}
        />
      )}
      {mapArtifactCreateFlow && mapArtifactCreateFlow.type !== 'image' && (
        <MapArtifactTitleDialog
          mode="create"
          artifactType={mapArtifactCreateFlow.type}
          onConfirm={handleTitleDialogConfirm}
          onCancel={cancelMapArtifactCreate}
        />
      )}
      {mapArtifactRenameFlow && (
        <MapArtifactTitleDialog
          mode="rename"
          artifactType={mapArtifactRenameFlow.artifactType}
          initialTitle={mapArtifactRenameFlow.initialTitle}
          onConfirm={handleRenameDialogConfirm}
          onCancel={cancelMapArtifactRename}
        />
      )}
      {useC4Visuals && selectedNodeId ? (
        <C4NodeDetailDrawer
          node={
            nodes.find((candidate) => candidate.id === selectedNodeId) ??
            graphNodes.find((candidate) => candidate.id === selectedNodeId) ??
            null
          }
          layerNodes={nodes}
          layerEdges={edges}
          fileIndex={fileIndex}
          fileRelations={fileRelations}
          durableGraph={durableGraph}
          onClose={onClearSelection}
        />
      ) : null}
    </div>
  )
}

export default function FunctionMapCanvas({ bleed }: Props) {
  return <FunctionMapCanvasInner bleed={bleed} />
}
