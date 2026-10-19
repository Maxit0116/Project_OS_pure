import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ArchitectureLevel,
  ArchitectureView,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  MapContentDocument,
  ProjectArchitecture,
} from '@contracts/index'
import {
  architectureScopeForSelection,
  availableArchitectureLevels,
  componentHasCodeGraph,
  defaultArchitectureScopeId,
  findArchitectureView,
  projectArchitectureView,
  synthesizeDefaultArchitectureViews,
  viewsForLevel,
} from './architectureView'
import { useReducedMotion3d } from './hooks/useReducedMotion3d'
import type { MapSearchFocusRequest, MapSearchHit } from './mapSearch'
import { useWorkbenchStore } from '../../state/workbenchStore'

type MapViewMode = 'flat'
type GalaxyEdgeLabelVisibility = 'hover'
type GalaxyPointerClient = { clientX: number; clientY: number }
type MapGestureBridge = { dispose?: () => void }
interface MapGalaxySettings {
  edgeLabels?: { visibility?: GalaxyEdgeLabelVisibility }
}
type MapFlowLayout = { trunk?: unknown[] } | null

const FAN_ANIMATION_MS = 0
const GALAXY_ORBIT_SPEED_DEFAULT = 1
const GALAXY_ORBIT_SPEED_MAX = 1
const GALAXY_ORBIT_SPEED_MIN = 1
const PREVIEW_HEIGHT = 72

function resolveMapViewMode(..._ignored: unknown[]): MapViewMode {
  return 'flat'
}

function useFanExpandState() {
  const empty = new Set<string>()
  return {
    expandedClusterIds: empty as ReadonlySet<string>,
    fanInteractionClusterIds: empty as ReadonlySet<string>,
    expandCluster: (_clusterId: string) => undefined,
    collapseCluster: (_clusterId: string) => undefined,
    collapseAllClusters: () => undefined,
    isClusterExpanded: (_clusterId: string) => false,
    markFanInteraction: (_clusterId: string) => undefined,
    clearAllTimers: () => undefined,
  }
}

function useFrozenPlanetOrbits() {
  const empty = new Map<string, number>() as ReadonlyMap<string, number>
  return {
    frozenPlanetOrbitTimes: empty,
    planetOrbitTimeOffsets: empty,
    syncPlanetOrbitClock: (_liveOrbitTime: number) => undefined,
    freezePlanetOrbit: (_nodeId: string, _orbitTime: number) => undefined,
    freezeFanClusterOrbit: (_clusterId: string, _planetIds: string[], _orbitTime: number) => undefined,
    touchFrozenPlanetOrbit: (_nodeId: string) => undefined,
    clearAllFrozenPlanetOrbits: () => undefined,
    isPlanetOrbitFrozen: (_nodeId: string) => false,
  }
}

import {
  GALAXY_PREVIEW_FOLLOW_MS,
  PREVIEW_DWELL_MS,
  previewDwellMoved,
  type GalaxyPreviewFollowAnchor,
  type MapClusterPreview,
  type MapHoverPreview,
  resolvePreviewPosition,
  resolvePreviewViewportBounds,
} from './mapHoverPreview'

export type { MapClusterPreview, MapHoverPreview, GalaxyPreviewFollowAnchor } from './mapHoverPreview'
export { GALAXY_PREVIEW_FOLLOW_MS } from './mapHoverPreview'

export interface ChromeInsets {
  left: number
  right: number
  top: number
  bottom: number
}

function insetsNearlyEqual(a: ChromeInsets, b: ChromeInsets, epsilon = 0.5): boolean {
  return (
    Math.abs(a.left - b.left) < epsilon &&
    Math.abs(a.right - b.right) < epsilon &&
    Math.abs(a.top - b.top) < epsilon &&
    Math.abs(a.bottom - b.bottom) < epsilon
  )
}

/** Coarser threshold for React state during panel slide animations. */
const INSET_STATE_EPSILON = 12

export interface SetChromeInsetsOptions {
  /** Commit to React state even when the delta is below INSET_STATE_EPSILON. */
  force?: boolean
}

function applyChromeInsetCssVars(
  insets: ChromeInsets,
  surfaces: Array<HTMLElement | null | undefined>,
): void {
  for (const surface of surfaces) {
    if (!surface) continue
    surface.style.setProperty('--map-inset-left', `${insets.left}px`)
    surface.style.setProperty('--map-inset-right', `${insets.right}px`)
    surface.style.setProperty('--map-inset-top', `${insets.top}px`)
    surface.style.setProperty('--map-inset-bottom', `${insets.bottom}px`)
  }
}

export type HorizonPhase =
  | 'off'
  | 'entering-horizontal'
  | 'entering-phase1'
  | 'entering-phase2'
  | 'settled'
  | 'exiting-phase2'
  | 'exiting-phase1'

export interface PreHorizonPresentationSnapshot {
  cinemaMode: boolean
  galaxyHorizontalOrbits: boolean
}

export interface FunctionMapContextValue {
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  graphNodes: FunctionalNode[]
  graphEdges: FunctionalEdge[]
  fileIndex: FileEntry[]
  fileRelations: FileRelation[]
  architecture?: ProjectArchitecture
  architectureViews: ArchitectureView[]
  architectureLevel: ArchitectureLevel
  architectureLevels: ArchitectureLevel[]
  setArchitectureLevel: (level: ArchitectureLevel) => void
  activeViewKey: string | null
  setActiveViewKey: (key: string | null) => void
  architectureViewsForLevel: ArchitectureView[]
  architectureScopeId: string | null
  focusedCodeNodeId: string | null
  focusCodeNode: (nodeId: string) => void
  clearCodeNodeFocus: () => void
  isLayerFocusActive: boolean
  clearLayerFocus: () => void
  architectureBreadcrumbs: FunctionalNode[]
  activeViewTitle: string | null
  canDrillIntoNode: (nodeId: string) => boolean
  isComponentFileDrillTarget: (nodeId: string) => boolean
  drillIntoNode: (nodeId: string) => boolean
  drillOut: () => void
  collapsedBoundaryIds: ReadonlySet<string>
  toggleBoundaryCollapsed: (boundaryId: string) => void
  resetC4Layout: () => void
  layoutResetToken: number
  /** Soft perspective overlay: dim low-confidence nodes when enabled. */
  confidencePerspective: boolean
  setConfidencePerspective: (enabled: boolean) => void
  /** Hide heuristic-sourced nodes when true. */
  hideHeuristicNodes: boolean
  setHideHeuristicNodes: (hide: boolean) => void
  showArtifacts: boolean
  setShowArtifacts: (show: boolean) => void
  selectedNodeId: string | null
  selectedFilePath?: string | null
  onSelectNode: (nodeId: string) => void | Promise<void>
  onSelectFile?: (filePath: string, preferredNodeId?: string) => void | Promise<void>
  onClearSelection: () => void
  search: string
  setSearch: (value: string) => void
  mapSearchFocus: MapSearchFocusRequest | null
  jumpToMapSearchHit: (hit: MapSearchHit) => void
  clearMapSearchFocus: () => void
  backdropRef: React.MutableRefObject<HTMLDivElement | null>
  viewportChromeRef: React.MutableRefObject<HTMLDivElement | null>
  mapSurfaceRef: React.MutableRefObject<HTMLDivElement | null>
  chromeInsets: ChromeInsets
  chromeInsetsRef: React.MutableRefObject<ChromeInsets>
  setChromeInsets: (insets: ChromeInsets, options?: SetChromeInsetsOptions) => void
  syncChromeInsetCssVars: () => void
  hoverPreview: MapHoverPreview | null
  setHoverPreview: (value: MapHoverPreview | null) => void
  previewFollowRef: React.MutableRefObject<GalaxyPreviewFollowAnchor | null>
  flowRef: React.MutableRefObject<HTMLDivElement | null>
  clearPreviewTimer: () => void
  schedulePreview: (node: FunctionalNode, clientX: number, clientY: number) => void
  scheduleClusterPreview: (
    cluster: MapClusterPreview,
    clusterId: string,
    clientX: number,
    clientY: number,
  ) => void
  moveHoverPreview: (clientX: number, clientY: number) => void
  positionHoverPreviewAtClient: (clientX: number, clientY: number) => void
  reportPreviewMetrics: (metrics: { width: number; height: number }) => void
  dismissGalaxyHoverPreview: (anchor?: Pick<GalaxyPreviewFollowAnchor, 'nodeId' | 'clusterId'>) => void
  cancelPendingGalaxyPreview: () => void
  /** True while a node drag is in progress. Preview must not open. */
  previewDragLockRef: React.MutableRefObject<boolean>
  lockPreviewForNodeDrag: () => void
  unlockPreviewAfterNodeDrag: () => void
  /** Restarts the hover dwell when the pointer travels while still waiting. */
  nudgePreviewDwell: (clientX: number, clientY: number) => void
  updateGalaxyPointer: (clientX: number, clientY: number) => void
  galaxyPointerRef: React.MutableRefObject<GalaxyPointerClient | null>
  hoverPreviewRef: React.MutableRefObject<MapHoverPreview | null>
  pendingPreviewRef: React.MutableRefObject<PendingGalaxyPreview | null>
  previewHoverSessionRef: React.MutableRefObject<number>

  mapViewMode: MapViewMode
  requestedMapViewMode: MapViewMode
  setMapViewMode: (mode: MapViewMode) => void
  galaxySettings: MapGalaxySettings | null
  projectName: string
  mapContent: MapContentDocument | null
  flowLayout: MapFlowLayout | null
  branchUsingFallbackLayout: boolean
  expandedPipeIds: ReadonlySet<string>
  togglePipeExpanded: (hostNodeId: string) => void
  expandedClusterIds: ReadonlySet<string>
  expandCluster: (clusterId: string) => void
  collapseCluster: (clusterId: string) => void
  collapseAllClusters: () => void
  isClusterExpanded: (clusterId: string) => boolean
  orbitEnabled: boolean
  galaxyOrbitSpeed: number
  setGalaxyOrbitSpeed: (speed: number) => void
  galaxyEdgeLabelVisibility: GalaxyEdgeLabelVisibility
  setGalaxyEdgeLabelVisibility: (visibility: GalaxyEdgeLabelVisibility) => void
  cinemaMode: boolean
  enterCinemaMode: () => void
  markGalaxyInteraction: () => void
  galaxyOrbitPaused: boolean
  toggleGalaxyOrbitPaused: () => void
  galaxyHorizontalOrbits: boolean
  toggleGalaxyHorizontalOrbits: () => void
  galaxyHorizonMode: boolean
  horizonPhase: HorizonPhase
  toggleGalaxyHorizonMode: () => void
  setHorizonPhase: (phase: HorizonPhase) => void
  consumePreHorizonPresentationSnapshot: () => PreHorizonPresentationSnapshot | null
  peekPreHorizonPresentationSnapshot: () => PreHorizonPresentationSnapshot | null
  restoreGalaxyPresentationSnapshot: (snapshot: PreHorizonPresentationSnapshot) => void
  fanInteractionClusterIds: ReadonlySet<string>
  markFanInteraction: (clusterId: string) => void

  frozenPlanetOrbitTimes: ReadonlyMap<string, number>
  planetOrbitTimeOffsets: ReadonlyMap<string, number>
  syncPlanetOrbitClock: (liveOrbitTime: number) => void
  freezePlanetOrbit: (nodeId: string, orbitTime: number) => void
  freezeFanClusterOrbit: (clusterId: string, planetIds: string[], orbitTime: number) => void
  touchFrozenPlanetOrbit: (nodeId: string) => void
  isPlanetOrbitFrozen: (nodeId: string) => boolean

  gestureEnabled: boolean
  setGestureEnabled: (enabled: boolean) => void
  twoHandZoomEnabled: boolean
  setTwoHandZoomEnabled: (enabled: boolean) => void
  mapGestureBridge: MapGestureBridge | null
  registerMapGestureBridge: (bridge: MapGestureBridge | null) => void
  mapGestureInputBlocked: boolean
  setMapGestureInputBlocked: (blocked: boolean) => void
}

const FunctionMapContext = createContext<FunctionMapContextValue | null>(null)

const NODE_PREVIEW_DELAY_MS = PREVIEW_DWELL_MS
export const PREVIEW_WIDTH = 240
export const PREVIEW_MIN_HEIGHT = 72

export interface PendingGalaxyPreview {
  session: number
  nodeId?: string
  clusterId?: string
}

export function functionMapNodeMembershipKey(nodes: readonly Pick<FunctionalNode, 'id'>[]): string {
  return nodes
    .map((node) => node.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join('\u0000')
}

interface PreviewAnchorRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function resolveFunctionMapPreviewPosition(
  clientX: number,
  clientY: number,
  anchorRect: PreviewAnchorRect,
  fixed: boolean,
): { x: number; y: number; fixed?: true } {
  if (fixed) {
    const rawX = clientX + 18
    const rawY = clientY + 14
    return {
      x: Math.max(anchorRect.left + 12, Math.min(rawX, anchorRect.right - PREVIEW_WIDTH - 12)),
      y: Math.max(anchorRect.top + 12, Math.min(rawY, anchorRect.bottom - PREVIEW_HEIGHT - 12)),
      fixed: true,
    }
  }
  const rawX = clientX - anchorRect.left + 18
  const rawY = clientY - anchorRect.top + 14
  return {
    x: Math.max(12, Math.min(rawX, anchorRect.width - PREVIEW_WIDTH - 12)),
    y: Math.max(12, Math.min(rawY, anchorRect.height - PREVIEW_HEIGHT - 12)),
  }
}

function defaultScopeIdForLevel(
  nodes: FunctionalNode[],
  level: ArchitectureLevel,
  fileIndex: ReadonlyArray<Pick<FileEntry, 'nodeIds'>> = [],
): string | null {
  return defaultArchitectureScopeId(nodes, level, fileIndex)
}

function buildArchitectureBreadcrumbs(
  nodes: FunctionalNode[],
  scopeId: string | null,
): FunctionalNode[] {
  if (!scopeId) return []

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const trail: FunctionalNode[] = []
  const visited = new Set<string>()
  let current = nodesById.get(scopeId)

  while (current && !visited.has(current.id)) {
    trail.unshift(current)
    visited.add(current.id)
    current = current.parentId ? nodesById.get(current.parentId) : undefined
  }

  return trail
}

interface ProviderProps {
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  fileIndex?: FileEntry[]
  fileRelations?: FileRelation[]
  architecture?: ProjectArchitecture
  architectureViews?: ArchitectureView[]
  projectName?: string
  galaxySettings?: MapGalaxySettings | null
  mapContent?: MapContentDocument | null
  flowLayout?: MapFlowLayout | null
  selectedNodeId: string | null
  selectedFilePath?: string | null
  onSelectNode: (nodeId: string) => void | Promise<void>
  onSelectFile?: (filePath: string, preferredNodeId?: string) => void | Promise<void>
  onClearSelection: () => void
  children: ReactNode
}

export function FunctionMapProvider({
  nodes,
  edges,
  fileIndex = [],
  fileRelations = [],
  architecture,
  architectureViews: architectureViewsProp,
  projectName = 'Project',
  galaxySettings = null,
  mapContent = null,
  flowLayout = null,
  selectedNodeId,
  selectedFilePath,
  onSelectNode,
  onSelectFile,
  onClearSelection,
  children,
}: ProviderProps) {
  const [search, setSearch] = useState('')
  const mapSearchFocusTokenRef = useRef(0)
  const [mapSearchFocus, setMapSearchFocus] = useState<MapSearchFocusRequest | null>(null)
  const architectureLevels = useMemo(
    () => availableArchitectureLevels(nodes, fileIndex),
    [nodes, fileIndex],
  )
  const preferredLevel =
    architecture && architectureLevels.includes(architecture.defaultLevel)
      ? architecture.defaultLevel
      : (architectureLevels.at(-1) ?? 'component')
  const selectedFileOwnerId =
    selectedFilePath && selectedNodeId
      ? nodes.find(
          (node) =>
            node.id === selectedNodeId &&
            node.level === 'component' &&
            node.linkedFiles.some((file) => file.path === selectedFilePath) ||
            fileIndex.some(
              (file) => file.path === selectedFilePath && file.nodeIds.includes(node.id),
            ),
        )?.id ?? null
      : null
  const initialLevel: ArchitectureLevel = selectedFileOwnerId ? 'code' : preferredLevel
  const [architectureLevel, setArchitectureLevelState] =
    useState<ArchitectureLevel>(initialLevel)
  const [architectureScopeId, setArchitectureScopeId] = useState<string | null>(() =>
    selectedFileOwnerId ?? defaultScopeIdForLevel(nodes, initialLevel, fileIndex),
  )
  const architectureViews = useMemo(
    () =>
      architectureViewsProp?.length
        ? architectureViewsProp
        : synthesizeDefaultArchitectureViews(nodes, { sourceKind: 'heuristic', fileIndex }),
    [architectureViewsProp, nodes, fileIndex],
  )
  const [activeViewKey, setActiveViewKeyState] = useState<string | null>(null)
  const [collapsedBoundaryIds, setCollapsedBoundaryIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [layoutResetToken, setLayoutResetToken] = useState(0)
  const [confidencePerspective, setConfidencePerspective] = useState(false)
  const [hideHeuristicNodes, setHideHeuristicNodes] = useState(false)
  const [focusedCodeNodeId, setFocusedCodeNodeId] = useState<string | null>(null)
  const [layerFocusSuppressed, setLayerFocusSuppressed] = useState(false)
  const nodeMembershipKey = useMemo(() => functionMapNodeMembershipKey(nodes), [nodes])
  const nodeIdSet = useMemo(
    () => new Set(nodeMembershipKey ? nodeMembershipKey.split('\u0000') : []),
    [nodeMembershipKey],
  )
  const [showArtifacts, setShowArtifacts] = useState(false)
  const [requestedMapViewMode, setRequestedMapViewMode] = useState<MapViewMode>('flat')
  const {
    expandedClusterIds,
    fanInteractionClusterIds,
    expandCluster,
    collapseCluster,
    collapseAllClusters,
    isClusterExpanded,
    markFanInteraction,
    clearAllTimers: clearFanTimers,
  } = useFanExpandState()
  const {
    frozenPlanetOrbitTimes,
    planetOrbitTimeOffsets,
    syncPlanetOrbitClock,
    freezePlanetOrbit,
    freezeFanClusterOrbit,
    touchFrozenPlanetOrbit,
    clearAllFrozenPlanetOrbits,
    isPlanetOrbitFrozen,
  } = useFrozenPlanetOrbits()
  const [cinemaMode, setCinemaMode] = useState(false)
  const [galaxyOrbitPaused, setGalaxyOrbitPaused] = useState(false)
  const [galaxyHorizontalOrbits, setGalaxyHorizontalOrbits] = useState(false)
  const [galaxyHorizonMode, setGalaxyHorizonMode] = useState(false)
  const [horizonPhase, setHorizonPhase] = useState<HorizonPhase>('off')
  const [gestureEnabled, setGestureEnabledState] = useState(false)
  const [twoHandZoomEnabled, setTwoHandZoomEnabled] = useState(false)
  const [mapGestureBridge, setMapGestureBridge] = useState<MapGestureBridge | null>(null)
  const [mapGestureInputBlocked, setMapGestureInputBlocked] = useState(false)
  const [galaxyOrbitSpeed, setGalaxyOrbitSpeedState] = useState(GALAXY_ORBIT_SPEED_DEFAULT)
  const [galaxyEdgeLabelVisibility, setGalaxyEdgeLabelVisibilityState] =
    useState<GalaxyEdgeLabelVisibility>(
      () => galaxySettings?.edgeLabels?.visibility ?? 'hover',
    )
  const [expandedPipeIds, setExpandedPipeIds] = useState<ReadonlySet<string>>(() => new Set())
  const branchUsingFallbackLayout = !flowLayout?.trunk?.length
  const [webglAvailable] = useState(() =>
    typeof window !== 'undefined' ? Boolean(window.WebGLRenderingContext) : true,
  )
  const reducedMotion = useReducedMotion3d()
  const [hoverPreview, setHoverPreview] = useState<MapHoverPreview | null>(null)
  const clearMapSearchFocus = useCallback(() => {
    setMapSearchFocus(null)
  }, [])
  const jumpToMapSearchHit = useCallback(
    (hit: MapSearchHit) => {
      if (hit.kind === 'feature') {
        if (hit.level) {
          setArchitectureLevelState(hit.level)
          setArchitectureScopeId(hit.parentId ?? null)
        }
        setFocusedCodeNodeId(null)
        setLayerFocusSuppressed(true)
        setHoverPreview(null)
        if (nodes.some((node) => node.id === hit.id)) {
          void onSelectNode(hit.id)
        }
      } else {
        setShowArtifacts(true)
        if (hit.kind === 'card' && hit.artifactId) {
          useWorkbenchStore.getState().selectArtifact(hit.artifactId)
        }
      }
      mapSearchFocusTokenRef.current += 1
      setMapSearchFocus({
        token: mapSearchFocusTokenRef.current,
        canvasNodeId: hit.canvasNodeId,
        ...(hit.workGroupId ? { workGroupId: hit.workGroupId } : {}),
      })
    },
    [nodes, onSelectNode],
  )
  const previewTimerRef = useRef<number | null>(null)
  const previewFollowRef = useRef<GalaxyPreviewFollowAnchor | null>(null)
  const previewMetricsRef = useRef({ width: PREVIEW_WIDTH, height: PREVIEW_MIN_HEIGHT })
  const previewDragLockRef = useRef(false)
  const previewDwellAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const previewDwellTargetRef = useRef<
    | { kind: 'node'; node: FunctionalNode }
    | { kind: 'cluster'; cluster: MapClusterPreview; clusterId: string }
    | null
  >(null)
  const hoverPreviewRef = useRef<MapHoverPreview | null>(null)
  const galaxyPointerRef = useRef<GalaxyPointerClient | null>(null)
  const pendingPreviewRef = useRef<PendingGalaxyPreview | null>(null)
  const previewHoverSessionRef = useRef(0)
  const cinemaModeRef = useRef(false)
  const preHorizonPresentationSnapshotRef = useRef<PreHorizonPresentationSnapshot | null>(null)
  const pendingHorizonEnterRef = useRef<number | null>(null)
  const orbitEnabledRef = useRef(false)
  const flowRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const viewportChromeRef = useRef<HTMLDivElement | null>(null)
  const mapSurfaceRef = useRef<HTMLDivElement | null>(null)
  const chromeInsetsRef = useRef<ChromeInsets>({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  })
  const [chromeInsets, setChromeInsetsState] = useState<ChromeInsets>({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  })

  useEffect(() => {
    if (!architectureLevels.includes(architectureLevel)) {
      setArchitectureLevelState(preferredLevel)
      setArchitectureScopeId(defaultScopeIdForLevel(nodes, preferredLevel, fileIndex))
    }
  }, [architectureLevel, architectureLevels, fileIndex, nodes, preferredLevel])

  useEffect(() => {
    setFocusedCodeNodeId(null)
  }, [architectureLevel, architectureScopeId])

  useEffect(() => {
    setFocusedCodeNodeId((current) =>
      current && !nodeIdSet.has(current) ? null : current,
    )
    setHoverPreview((current) =>
      current?.kind === 'node' && !nodeIdSet.has(current.node.id) ? null : current,
    )
  }, [nodeIdSet])

  const focusCodeNode = useCallback((nodeId: string) => {
    setLayerFocusSuppressed(false)
    setFocusedCodeNodeId(nodeId)
  }, [])

  const clearCodeNodeFocus = useCallback(() => {
    setFocusedCodeNodeId(null)
  }, [])

  const clearLayerFocus = useCallback(() => {
    setLayerFocusSuppressed(true)
    setFocusedCodeNodeId(null)
    setHoverPreview(null)
  }, [])

  const selectNode = useCallback(
    async (nodeId: string) => {
      setLayerFocusSuppressed(false)
      await onSelectNode(nodeId)
    },
    [onSelectNode],
  )

  const architectureViewsForLevel = useMemo(
    () => viewsForLevel(architectureViews, architectureLevel),
    [architectureViews, architectureLevel],
  )

  const setActiveViewKey = useCallback(
    (key: string | null) => {
      setActiveViewKeyState(key)
      const view = findArchitectureView(architectureViews, key ?? undefined)
      if (!view) return
      setArchitectureLevelState(view.level)
      setArchitectureScopeId(view.parentId ?? null)
      setLayerFocusSuppressed(false)
      setFocusedCodeNodeId(null)
      setHoverPreview(null)
      collapseAllClusters()
      clearAllFrozenPlanetOrbits()
    },
    [architectureViews, collapseAllClusters, clearAllFrozenPlanetOrbits],
  )

  const setArchitectureLevel = useCallback(
    (level: ArchitectureLevel) => {
      setArchitectureLevelState(level)
      const scopeId = defaultScopeIdForLevel(nodes, level, fileIndex)
      setArchitectureScopeId(scopeId)
      const matching = viewsForLevel(architectureViews, level)
      const preferred =
        matching.find((view) => (view.parentId ?? null) === scopeId) ?? matching[0]
      setActiveViewKeyState(preferred?.key ?? null)
      setLayerFocusSuppressed(false)
      setFocusedCodeNodeId(null)
      setHoverPreview(null)
      collapseAllClusters()
      setCinemaMode(false)
      setGalaxyOrbitPaused(false)
      setExpandedPipeIds(new Set())
      clearAllFrozenPlanetOrbits()
    },
    [nodes, fileIndex, architectureViews, collapseAllClusters, clearAllFrozenPlanetOrbits],
  )

  const toggleBoundaryCollapsed = useCallback((boundaryId: string) => {
    setCollapsedBoundaryIds((current) => {
      const next = new Set(current)
      if (next.has(boundaryId)) next.delete(boundaryId)
      else next.add(boundaryId)
      return next
    })
  }, [])

  const resetC4Layout = useCallback(() => {
    setCollapsedBoundaryIds(new Set())
    setLayoutResetToken((token) => token + 1)
  }, [])

  const togglePipeExpanded = useCallback((hostNodeId: string) => {
    setExpandedPipeIds((current) => {
      const next = new Set(current)
      if (next.has(hostNodeId)) {
        next.delete(hostNodeId)
      } else {
        next.add(hostNodeId)
      }
      return next
    })
  }, [])

  const setMapViewMode = useCallback((mode: MapViewMode) => {
    setRequestedMapViewMode(mode)
    setMapGestureBridge(null)
    setMapGestureInputBlocked(false)
  }, [])

  const markGalaxyInteraction = useCallback(() => {
    setCinemaMode(false)
  }, [])

  const clearPendingHorizonEnter = useCallback(() => {
    if (pendingHorizonEnterRef.current !== null) {
      window.clearTimeout(pendingHorizonEnterRef.current)
      pendingHorizonEnterRef.current = null
    }
  }, [])

  const enterCinemaMode = useCallback(() => {
    if (!reducedMotion) {
      clearPendingHorizonEnter()
      setGalaxyHorizonMode(false)
      setHorizonPhase('off')
      setGalaxyHorizontalOrbits(true)
      setCinemaMode(true)
      setGalaxyOrbitPaused(false)
    }
  }, [reducedMotion, clearPendingHorizonEnter])

  const toggleGalaxyOrbitPaused = useCallback(() => {
    setGalaxyOrbitPaused((paused) => !paused)
  }, [])

  const toggleGalaxyHorizontalOrbits = useCallback(() => {
    setGalaxyHorizontalOrbits((enabled) => !enabled)
    if (!galaxyHorizontalOrbits) {
      clearPendingHorizonEnter()
      setGalaxyHorizonMode(false)
      setHorizonPhase('off')
    }
  }, [galaxyHorizontalOrbits, clearPendingHorizonEnter])

  const beginHorizonMode = useCallback(() => {
    preHorizonPresentationSnapshotRef.current = {
      cinemaMode: cinemaModeRef.current,
      galaxyHorizontalOrbits,
    }
    setCinemaMode(false)
    setGalaxyHorizontalOrbits(false)
    setGalaxyHorizonMode(true)
  }, [galaxyHorizontalOrbits])

  const toggleGalaxyHorizonMode = useCallback(() => {
    if (galaxyHorizonMode) {
      clearPendingHorizonEnter()
      setGalaxyHorizonMode(false)
      return
    }

    if (pendingHorizonEnterRef.current !== null) {
      clearPendingHorizonEnter()
      return
    }

    const startEnter = () => {
      pendingHorizonEnterRef.current = null
      beginHorizonMode()
    }

    if (expandedClusterIds.size > 0) {
      collapseAllClusters()
      const delayMs = reducedMotion ? 0 : FAN_ANIMATION_MS
      pendingHorizonEnterRef.current = window.setTimeout(startEnter, delayMs)
      return
    }

    startEnter()
  }, [
    galaxyHorizonMode,
    expandedClusterIds,
    collapseAllClusters,
    clearPendingHorizonEnter,
    beginHorizonMode,
    reducedMotion,
  ])

  const consumePreHorizonPresentationSnapshot = useCallback(() => {
    const snapshot = preHorizonPresentationSnapshotRef.current
    preHorizonPresentationSnapshotRef.current = null
    return snapshot
  }, [])

  const peekPreHorizonPresentationSnapshot = useCallback(
    () => preHorizonPresentationSnapshotRef.current,
    [],
  )

  const restoreGalaxyPresentationSnapshot = useCallback(
    (snapshot: PreHorizonPresentationSnapshot) => {
      setGalaxyHorizontalOrbits(snapshot.galaxyHorizontalOrbits)
      setCinemaMode(snapshot.cinemaMode)
      if (snapshot.cinemaMode) {
        setGalaxyOrbitPaused(false)
      }
    },
    [],
  )

  const setGestureEnabled = useCallback((enabled: boolean) => {
    setGestureEnabledState(enabled)
  }, [])

  const registerMapGestureBridge = useCallback((bridge: MapGestureBridge | null) => {
    setMapGestureBridge(bridge)
  }, [])

  const setMapGestureInputBlockedState = useCallback((blocked: boolean) => {
    setMapGestureInputBlocked(blocked)
  }, [])

  const setGalaxyOrbitSpeed = useCallback((speed: number) => {
    setGalaxyOrbitSpeedState(
      Math.min(GALAXY_ORBIT_SPEED_MAX, Math.max(GALAXY_ORBIT_SPEED_MIN, speed)),
    )
  }, [])

  const setGalaxyEdgeLabelVisibility = useCallback((visibility: GalaxyEdgeLabelVisibility) => {
    setGalaxyEdgeLabelVisibilityState(visibility)
  }, [])

  const mapViewMode = resolveMapViewMode(
    requestedMapViewMode,
    architectureLevel,
    webglAvailable,
  )
  const orbitEnabled = false && !reducedMotion && !galaxyOrbitPaused

  useEffect(() => {
    setLayerFocusSuppressed(false)
    setFocusedCodeNodeId(null)
  }, [architectureLevel, architectureScopeId, nodes])

  useEffect(() => {
    clearPendingHorizonEnter()
    setGalaxyHorizontalOrbits(false)
    setGalaxyHorizonMode(false)
    setHorizonPhase('off')
  }, [architectureLevel, architectureScopeId, mapViewMode, clearPendingHorizonEnter])

  useEffect(() => () => clearPendingHorizonEnter(), [clearPendingHorizonEnter])

  useEffect(() => {
    hoverPreviewRef.current = hoverPreview
  }, [hoverPreview])

  useEffect(() => {
    cinemaModeRef.current = cinemaMode
  }, [cinemaMode])

  useEffect(() => {
    orbitEnabledRef.current = orbitEnabled
  }, [orbitEnabled])

  const updateGalaxyPointer = useCallback((clientX: number, clientY: number) => {
    galaxyPointerRef.current = { clientX, clientY }
  }, [])

  const invalidatePreviewHoverSession = useCallback(() => {
    previewHoverSessionRef.current += 1
    pendingPreviewRef.current = null
  }, [])

  const resolvePreviewBounds = useCallback(() => {
    const chromeRect = viewportChromeRef.current?.getBoundingClientRect()
    const flowRect = flowRef.current?.getBoundingClientRect()
    return resolvePreviewViewportBounds({ chromeRect, chromeInsets, flowRect })
  }, [chromeInsets])

  const positionHoverPreviewAtClient = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = resolvePreviewBounds()
      const { width, height } = previewMetricsRef.current
      const { x, y } = resolvePreviewPosition(clientX, clientY, bounds, width, height)
      setHoverPreview((prev) => {
        if (!prev) return prev
        if (prev.x === x && prev.y === y && prev.fixed) return prev
        return { ...prev, x, y, fixed: true }
      })
    },
    [resolvePreviewBounds],
  )

  const reportPreviewMetrics = useCallback(
    (metrics: { width: number; height: number }) => {
      const prev = previewMetricsRef.current
      if (prev.width === metrics.width && prev.height === metrics.height) return
      previewMetricsRef.current = metrics
      const pointer = galaxyPointerRef.current
      if (pointer && hoverPreviewRef.current) {
        positionHoverPreviewAtClient(pointer.clientX, pointer.clientY)
      }
    },
    [positionHoverPreviewAtClient],
  )

  const canDrillIntoNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return false
      if (componentHasCodeGraph(node, fileIndex)) return true
      if (
        node.children?.some((childId) =>
          nodes.some((candidate) => candidate.id === childId && candidate.level),
        )
      ) {
        return true
      }
      // parentId reverse link (C4 graphs may omit children[] until L2 assemble)
      return nodes.some(
        (candidate) => candidate.parentId === nodeId && Boolean(candidate.level),
      )
    },
    [nodes, fileIndex],
  )

  const isComponentFileDrillTarget = useCallback(
    (nodeId: string) => {
      if (architectureLevel !== 'component') return false
      const node = nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return false
      return componentHasCodeGraph(node, fileIndex)
    },
    [architectureLevel, fileIndex, nodes],
  )

  const drillIntoNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return false

      // Prefer a named child view whose parentId is this node (LikeC4-style).
      const childView = architectureViews.find((view) => view.parentId === nodeId)
      if (childView) {
        setActiveViewKeyState(childView.key)
        setArchitectureLevelState(childView.level)
        setArchitectureScopeId(childView.parentId ?? nodeId)
        setLayerFocusSuppressed(false)
        setFocusedCodeNodeId(null)
        setHoverPreview(null)
        collapseAllClusters()
        clearAllFrozenPlanetOrbits()
        setGalaxyHorizonMode(false)
        setHorizonPhase('off')
        return true
      }

      if (componentHasCodeGraph(node, fileIndex)) {
        setArchitectureScopeId(node.id)
        setArchitectureLevelState('code')
        setActiveViewKeyState(
          architectureViews.find(
            (view) => view.level === 'code' && view.parentId === node.id,
          )?.key ?? null,
        )
        setLayerFocusSuppressed(false)
        setFocusedCodeNodeId(null)
        setHoverPreview(null)
        collapseAllClusters()
        clearAllFrozenPlanetOrbits()
        setGalaxyHorizonMode(false)
        setHorizonPhase('off')
        return true
      }

      const childFromList = node.children
        ?.map((childId) => nodes.find((candidate) => candidate.id === childId))
        .find((candidate): candidate is FunctionalNode => Boolean(candidate?.level))
      const childFromParentId = nodes.find(
        (candidate) => candidate.parentId === nodeId && Boolean(candidate.level),
      )
      const child = childFromList ?? childFromParentId
      if (!child?.level) return false

      setArchitectureScopeId(node.id)
      setArchitectureLevelState(child.level)
      setActiveViewKeyState(
        architectureViews.find(
          (view) => view.level === child.level && view.parentId === node.id,
        )?.key ?? null,
      )
      setLayerFocusSuppressed(false)
      setFocusedCodeNodeId(null)
      setHoverPreview(null)
      collapseAllClusters()
      clearAllFrozenPlanetOrbits()
      setGalaxyHorizonMode(false)
      setHorizonPhase('off')
      return true
    },
    [nodes, fileIndex, architectureViews, collapseAllClusters, clearAllFrozenPlanetOrbits],
  )

  const drillOut = useCallback(() => {
    if (!architectureScopeId) return
    const owner = nodes.find((candidate) => candidate.id === architectureScopeId)
    if (!owner?.level) return

    setArchitectureLevelState(owner.level)
    setArchitectureScopeId(owner.parentId ?? null)
    setActiveViewKeyState(
      architectureViews.find(
        (view) =>
          view.level === owner.level &&
          (view.parentId ?? null) === (owner.parentId ?? null),
      )?.key ?? null,
    )
    setLayerFocusSuppressed(false)
    setFocusedCodeNodeId(null)
    setHoverPreview(null)
    collapseAllClusters()
    clearAllFrozenPlanetOrbits()
  }, [
    architectureScopeId,
    architectureViews,
    nodes,
    collapseAllClusters,
    clearAllFrozenPlanetOrbits,
  ])

  const architectureBreadcrumbs = useMemo(
    () => buildArchitectureBreadcrumbs(nodes, architectureScopeId),
    [architectureScopeId, nodes],
  )

  const activeViewTitle = useMemo(() => {
    const view = findArchitectureView(architectureViews, activeViewKey ?? undefined)
    return view?.title ?? null
  }, [architectureViews, activeViewKey])

  const selectedArchitectureScope = useMemo(
    () => architectureScopeForSelection(nodes, architectureLevel, selectedNodeId, fileIndex),
    [nodes, architectureLevel, selectedNodeId, fileIndex],
  )
  // Code layer keeps the full component file graph on selection / open-file.
  // One-hop focus is architecture-level only (not driven by code-file clicks).
  const selectedFocusCandidate =
    architectureLevel !== 'code' &&
    selectedArchitectureScope.focusNodeId &&
    selectedArchitectureScope.parentId === (architectureScopeId ?? undefined)
      ? selectedArchitectureScope.focusNodeId
      : undefined
  const isLayerFocusActive =
    !layerFocusSuppressed && Boolean(selectedFocusCandidate)
  const selectedFocusInScope = isLayerFocusActive ? selectedFocusCandidate : undefined

  const projectedGraph = useMemo(() => {
    const projected = projectArchitectureView(
      nodes,
      edges,
      architectureLevel,
      {
        ...(architectureScopeId ? { parentId: architectureScopeId } : {}),
        ...(architectureLevel !== 'code' && selectedFocusInScope
          ? { focusNodeId: selectedFocusInScope }
          : {}),
      },
      fileIndex,
      fileRelations,
      {
        views: architectureViews,
        ...(activeViewKey ? { viewKey: activeViewKey } : {}),
      },
    )
    let nextNodes = projected.nodes
    if (hideHeuristicNodes) {
      nextNodes = nextNodes.filter((node) => node.sourceKind !== 'heuristic')
    }
    if (confidencePerspective) {
      nextNodes = nextNodes.map((node) =>
        node.confidence < 0.6
          ? { ...node, tags: Array.from(new Set([...node.tags, 'perspective-dim'])) }
          : node,
      )
    }
    const visibleIds = new Set(nextNodes.map((node) => node.id))
    return {
      nodes: nextNodes,
      edges: projected.edges.filter(
        (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
      ),
    }
  }, [
    nodes,
    edges,
    fileIndex,
    fileRelations,
    architectureLevel,
    architectureScopeId,
    architectureViews,
    activeViewKey,
    selectedFocusInScope,
    hideHeuristicNodes,
    confidencePerspective,
  ])

  const centerTab = useWorkbenchStore((s) => s.centerTab)
  useEffect(() => {
    // Provider stays mounted across bleed tab switches; drop stale code focus.
    setFocusedCodeNodeId(null)
  }, [centerTab])

  const setChromeInsets = useCallback((next: ChromeInsets, options?: SetChromeInsetsOptions) => {
    chromeInsetsRef.current = next
    applyChromeInsetCssVars(next, [flowRef.current, mapSurfaceRef.current])

    setChromeInsetsState((prev) => {
      if (!options?.force && insetsNearlyEqual(prev, next, INSET_STATE_EPSILON)) return prev
      return insetsNearlyEqual(prev, next) ? prev : next
    })
  }, [])

  const syncChromeInsetCssVars = useCallback(() => {
    applyChromeInsetCssVars(chromeInsetsRef.current, [flowRef.current, mapSurfaceRef.current])
  }, [])

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    previewDwellAnchorRef.current = null
    previewDwellTargetRef.current = null
  }, [])

  useEffect(() => () => clearPreviewTimer(), [clearPreviewTimer])
  useEffect(() => () => clearFanTimers(), [clearFanTimers])

  const clearSelection = useCallback(() => {
    setLayerFocusSuppressed(false)
    setFocusedCodeNodeId(null)
    onClearSelection()
  }, [onClearSelection])

  const schedulePreview = useCallback(
    (node: FunctionalNode, clientX: number, clientY: number) => {
      if (previewDragLockRef.current) return
      clearPreviewTimer()
      previewFollowRef.current = null
      previewMetricsRef.current = { width: PREVIEW_WIDTH, height: PREVIEW_MIN_HEIGHT }
      galaxyPointerRef.current = { clientX, clientY }
      const session = previewHoverSessionRef.current + 1
      previewHoverSessionRef.current = session
      pendingPreviewRef.current = { session, nodeId: node.id }
      previewDwellAnchorRef.current = { x: clientX, y: clientY }
      previewDwellTargetRef.current = { kind: 'node', node }

      previewTimerRef.current = window.setTimeout(() => {
        if (previewHoverSessionRef.current !== session) return
        if (previewDragLockRef.current) return

        const pointer = galaxyPointerRef.current ?? { clientX, clientY }
        const { width, height } = previewMetricsRef.current
        const { x, y } = resolvePreviewPosition(
          pointer.clientX,
          pointer.clientY,
          resolvePreviewBounds(),
          width,
          height,
        )
        pendingPreviewRef.current = null
        setHoverPreview({
          kind: 'node',
          node,
          x,
          y,
          fixed: true,
          anchorNodeId: node.id,
        })
      }, NODE_PREVIEW_DELAY_MS)
    },
    [clearPreviewTimer, resolvePreviewBounds],
  )

  const scheduleClusterPreview = useCallback(
    (cluster: MapClusterPreview, clusterId: string, clientX: number, clientY: number) => {
      if (previewDragLockRef.current) return
      const bounds = resolvePreviewBounds()

      clearPreviewTimer()
      previewFollowRef.current = null
      previewMetricsRef.current = { width: PREVIEW_WIDTH, height: PREVIEW_MIN_HEIGHT }
      galaxyPointerRef.current = { clientX, clientY }
      const session = previewHoverSessionRef.current + 1
      previewHoverSessionRef.current = session
      pendingPreviewRef.current = { session, clusterId }
      previewDwellAnchorRef.current = { x: clientX, y: clientY }
      previewDwellTargetRef.current = { kind: 'cluster', cluster, clusterId }

      previewTimerRef.current = window.setTimeout(() => {
        if (previewHoverSessionRef.current !== session) return
        if (previewDragLockRef.current) return

        const pointer = galaxyPointerRef.current ?? { clientX, clientY }
        const { width, height } = previewMetricsRef.current
        const { x, y } = resolvePreviewPosition(
          pointer.clientX,
          pointer.clientY,
          bounds,
          width,
          height,
        )
        pendingPreviewRef.current = null
        setHoverPreview({
          kind: 'cluster',
          cluster,
          x,
          y,
          fixed: true,
          anchorClusterId: clusterId,
        })
      }, NODE_PREVIEW_DELAY_MS)
    },
    [clearPreviewTimer, resolvePreviewBounds],
  )

  const moveHoverPreview = useCallback(
    (clientX: number, clientY: number) => {
      positionHoverPreviewAtClient(clientX, clientY)
    },
    [positionHoverPreviewAtClient],
  )

  const lockPreviewForNodeDrag = useCallback(() => {
    previewDragLockRef.current = true
    previewDwellAnchorRef.current = null
    previewDwellTargetRef.current = null
    clearPreviewTimer()
    pendingPreviewRef.current = null
    invalidatePreviewHoverSession()
    setHoverPreview(null)
  }, [clearPreviewTimer, invalidatePreviewHoverSession])

  const unlockPreviewAfterNodeDrag = useCallback(() => {
    previewDragLockRef.current = false
  }, [])

  const nudgePreviewDwell = useCallback(
    (clientX: number, clientY: number) => {
      if (previewDragLockRef.current) return
      if (previewTimerRef.current === null) return
      const anchor = previewDwellAnchorRef.current
      const target = previewDwellTargetRef.current
      if (!anchor || !target) return
      if (!previewDwellMoved(anchor, { x: clientX, y: clientY })) return
      if (target.kind === 'node') {
        schedulePreview(target.node, clientX, clientY)
        return
      }
      scheduleClusterPreview(target.cluster, target.clusterId, clientX, clientY)
    },
    [scheduleClusterPreview, schedulePreview],
  )

  const dismissGalaxyHoverPreview = useCallback(
    (anchor?: Pick<GalaxyPreviewFollowAnchor, 'nodeId' | 'clusterId'>) => {
      clearPreviewTimer()
      pendingPreviewRef.current = null
      invalidatePreviewHoverSession()
      setHoverPreview((prev) => {
        if (!prev) {
          previewFollowRef.current = null
          return null
        }
        const resolvedAnchor = anchor ?? {
          nodeId: prev.kind === 'node' ? prev.anchorNodeId : undefined,
          clusterId: prev.kind === 'cluster' ? prev.anchorClusterId : undefined,
        }
        if (
          cinemaModeRef.current &&
          orbitEnabledRef.current &&
          (resolvedAnchor.nodeId || resolvedAnchor.clusterId)
        ) {
          previewFollowRef.current = {
            nodeId: resolvedAnchor.nodeId,
            clusterId: resolvedAnchor.clusterId,
            until: Date.now() + GALAXY_PREVIEW_FOLLOW_MS,
          }
          return prev
        }
        previewFollowRef.current = null
        return null
      })
    },
    [clearPreviewTimer, invalidatePreviewHoverSession],
  )

  const cancelPendingGalaxyPreview = useCallback(() => {
    if (previewTimerRef.current === null && pendingPreviewRef.current === null) return
    clearPreviewTimer()
    pendingPreviewRef.current = null
    invalidatePreviewHoverSession()
  }, [clearPreviewTimer, invalidatePreviewHoverSession])

  const value = useMemo(
    () => ({
      nodes: projectedGraph.nodes,
      edges: projectedGraph.edges,
      graphNodes: nodes,
      graphEdges: edges,
      fileIndex,
      fileRelations,
      architecture,
      architectureViews,
      architectureLevel,
      architectureLevels,
      setArchitectureLevel,
      activeViewKey,
      setActiveViewKey,
      architectureViewsForLevel,
      architectureScopeId,
      focusedCodeNodeId,
      focusCodeNode,
      clearCodeNodeFocus,
      isLayerFocusActive,
      clearLayerFocus,
      architectureBreadcrumbs,
      activeViewTitle,
      canDrillIntoNode,
      isComponentFileDrillTarget,
      drillIntoNode,
      drillOut,
      collapsedBoundaryIds,
      toggleBoundaryCollapsed,
      resetC4Layout,
      layoutResetToken,
      confidencePerspective,
      setConfidencePerspective,
      hideHeuristicNodes,
      setHideHeuristicNodes,
      showArtifacts,
      setShowArtifacts,
      selectedNodeId,
      onSelectNode: selectNode,
      onSelectFile,
      onClearSelection: clearSelection,
      search,
      setSearch,
      mapSearchFocus,
      jumpToMapSearchHit,
      clearMapSearchFocus,
      backdropRef,
      viewportChromeRef,
      mapSurfaceRef,
      chromeInsets,
      chromeInsetsRef,
      setChromeInsets,
      syncChromeInsetCssVars,
      hoverPreview,
      setHoverPreview,
      previewFollowRef,
      flowRef,
      clearPreviewTimer,
      schedulePreview,
      scheduleClusterPreview,
      moveHoverPreview,
      positionHoverPreviewAtClient,
      reportPreviewMetrics,
      dismissGalaxyHoverPreview,
      cancelPendingGalaxyPreview,
      previewDragLockRef,
      lockPreviewForNodeDrag,
      unlockPreviewAfterNodeDrag,
      nudgePreviewDwell,
      updateGalaxyPointer,
      galaxyPointerRef,
      hoverPreviewRef,
      pendingPreviewRef,
      previewHoverSessionRef,
      mapViewMode,
      requestedMapViewMode,
      setMapViewMode,
      galaxySettings,
      projectName,
      mapContent,
      flowLayout,
      branchUsingFallbackLayout,
      expandedPipeIds,
      togglePipeExpanded,
      expandedClusterIds,
      expandCluster,
      collapseCluster,
      collapseAllClusters,
      isClusterExpanded,
      orbitEnabled,
      galaxyOrbitSpeed,
      setGalaxyOrbitSpeed,
      galaxyEdgeLabelVisibility,
      setGalaxyEdgeLabelVisibility,
      cinemaMode,
      enterCinemaMode,
      markGalaxyInteraction,
      galaxyOrbitPaused,
      toggleGalaxyOrbitPaused,
      galaxyHorizontalOrbits,
      toggleGalaxyHorizontalOrbits,
      galaxyHorizonMode,
      horizonPhase,
      toggleGalaxyHorizonMode,
      setHorizonPhase,
      consumePreHorizonPresentationSnapshot,
      peekPreHorizonPresentationSnapshot,
      restoreGalaxyPresentationSnapshot,
      fanInteractionClusterIds,
      markFanInteraction,
      frozenPlanetOrbitTimes,
      planetOrbitTimeOffsets,
      syncPlanetOrbitClock,
      freezePlanetOrbit,
      freezeFanClusterOrbit,
      touchFrozenPlanetOrbit,
      isPlanetOrbitFrozen,
      gestureEnabled,
      setGestureEnabled,
      twoHandZoomEnabled,
      setTwoHandZoomEnabled,
      mapGestureBridge,
      registerMapGestureBridge,
      mapGestureInputBlocked,
      setMapGestureInputBlocked: setMapGestureInputBlockedState,
    }),
    [
      projectedGraph,
      nodes,
      edges,
      fileIndex,
      fileRelations,
      architecture,
      architectureViews,
      architectureLevel,
      architectureLevels,
      activeViewKey,
      setActiveViewKey,
      architectureViewsForLevel,
      architectureScopeId,
      focusedCodeNodeId,
      isLayerFocusActive,
      architectureBreadcrumbs,
      activeViewTitle,
      collapsedBoundaryIds,
      toggleBoundaryCollapsed,
      resetC4Layout,
      layoutResetToken,
      confidencePerspective,
      hideHeuristicNodes,
      showArtifacts,
      selectedNodeId,
      selectNode,
      onSelectFile,
      clearSelection,
      clearLayerFocus,
      layerFocusSuppressed,
      search,
      mapSearchFocus,
      jumpToMapSearchHit,
      clearMapSearchFocus,
      chromeInsets,
      hoverPreview,
      clearPreviewTimer,
      schedulePreview,
      scheduleClusterPreview,
      moveHoverPreview,
      positionHoverPreviewAtClient,
      reportPreviewMetrics,
      dismissGalaxyHoverPreview,
      cancelPendingGalaxyPreview,
      previewDragLockRef,
      lockPreviewForNodeDrag,
      unlockPreviewAfterNodeDrag,
      nudgePreviewDwell,
      updateGalaxyPointer,
      galaxyPointerRef,
      hoverPreviewRef,
      pendingPreviewRef,
      previewHoverSessionRef,
      setArchitectureLevel,
      canDrillIntoNode,
      isComponentFileDrillTarget,
      drillIntoNode,
      drillOut,
      focusCodeNode,
      clearCodeNodeFocus,
      mapViewMode,
      requestedMapViewMode,
      setMapViewMode,
      galaxySettings,
      projectName,
      mapContent,
      flowLayout,
      branchUsingFallbackLayout,
      expandedPipeIds,
      togglePipeExpanded,
      expandedClusterIds,
      expandCluster,
      collapseCluster,
      collapseAllClusters,
      isClusterExpanded,
      orbitEnabled,
      galaxyOrbitSpeed,
      setGalaxyOrbitSpeed,
      galaxyEdgeLabelVisibility,
      setGalaxyEdgeLabelVisibility,
      cinemaMode,
      enterCinemaMode,
      markGalaxyInteraction,
      galaxyOrbitPaused,
      toggleGalaxyOrbitPaused,
      galaxyHorizontalOrbits,
      toggleGalaxyHorizontalOrbits,
      galaxyHorizonMode,
      horizonPhase,
      toggleGalaxyHorizonMode,
      setHorizonPhase,
      consumePreHorizonPresentationSnapshot,
      peekPreHorizonPresentationSnapshot,
      restoreGalaxyPresentationSnapshot,
      fanInteractionClusterIds,
      markFanInteraction,
      frozenPlanetOrbitTimes,
      planetOrbitTimeOffsets,
      syncPlanetOrbitClock,
      freezePlanetOrbit,
      freezeFanClusterOrbit,
      touchFrozenPlanetOrbit,
      isPlanetOrbitFrozen,
      gestureEnabled,
      setGestureEnabled,
      twoHandZoomEnabled,
      setTwoHandZoomEnabled,
      mapGestureBridge,
      registerMapGestureBridge,
      mapGestureInputBlocked,
      setMapGestureInputBlockedState,
    ],
  )

  return <FunctionMapContext.Provider value={value}>{children}</FunctionMapContext.Provider>
}

export function useFunctionMap() {
  const ctx = useContext(FunctionMapContext)
  if (!ctx) {
    throw new Error('useFunctionMap must be used within FunctionMapProvider')
  }
  return ctx
}
