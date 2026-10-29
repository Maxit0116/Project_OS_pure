import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  ChevronDown,
  Eraser,
  LayoutTemplate,
  ListTree,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Send,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import type { SpatialCaptureSession } from '@contracts/spatial-capture-session'
import {
  createArrowStroke,
  createDraftSpatialPin,
  emptyAnnotationDoc,
  emptyPinComposerHub,
  type AnnotationStroke,
  type PinComposerHub,
  type PinComposerHubSubagentLink,
  type ScreenRect,
  type SpatialPin,
  type SpatialPinMode,
} from '@contracts/spatial-pin'
import {
  ensureHub,
  ResearchToggle,
  SpatialComposeHub,
  COMPOSE_HUB_STRINGS_EN,
  type ComposeHubDataSource,
  type ComposeHubStrings,
} from '../SpatialComposeHub'
import type { RepoDesignSystemSnapshot } from '@contracts/repo-design-system'
import {
  MAX_STENCILS_PER_REGION,
  type StencilGenerationScope,
} from '@contracts/ui-stencil'
import {
  colorForArrowIndex,
  hitTestAnchor,
  nearestAnchorToRelative,
} from '../../overlay/arrowGeometry'
import {
  buildCaptureSessionFromOverlay,
  captureRegionToOverlay,
} from '../../overlay/captureSessionSerialize'
import {
  cardPinnedToTip,
  composeAttachScreenPoint,
  estimateComposePanelHeight,
  layoutComposeForArrow,
  type ComposeLayoutResult,
} from '../../overlay/composeLayout'
import { resolveArrowEdgeConnection } from '../../overlay/composeConnection'
import {
  resolveComposePanelSize,
  useComposePanelMetrics,
} from '../../overlay/useComposePanelMetrics'
import ComposeFlowDrawer from '../../overlay/ComposeFlowDrawer'
import { cropBackdropRegionPngBase64 } from '../../overlay/cropBackdrop'
import {
  focusIdsForClick,
  isCompleteCaptureRegion,
  isOutsideAllRegions,
  isRegionFocused,
  type OverlayArrow,
  type OverlayRegion,
  type RegionTool,
} from '../../overlay/overlayRegions'
import {
  clampRelativeInRect,
  clientToRelative,
  listRegionAnchors,
  pointInRect,
  relativePointForAnchor,
  relativeToClient,
  toEdgeAnchor,
} from '../../overlay/regionAnchors'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { syncComposeSubagentsToPool } from '../AgentFlow/AgentPool/syncComposeSubagents'
import {
  CAPTURE_ZOOM_MAX,
  CAPTURE_ZOOM_MIN,
  captureContentSize,
  captureViewOverflows,
  clampCapturePan,
  clampZoom,
  panForZoomAtPoint,
} from './captureViewportCamera'
import { useCaptureComposeFlows } from './useCaptureComposeFlows'
import StencilLibrary from './stencils/StencilLibrary'
import StencilComposeExtras from './stencils/StencilComposeExtras'
import StencilLiveStub from './stencils/StencilLiveStub'
import StencilPreviewVisual from './stencils/StencilPreviewVisual'
import {
  buildPlacementAtStagePoint,
  combinedBriefForArrow,
  DEFAULT_STENCIL_SCOPE,
  placementsForArrow,
  stageRectForPlacement,
  stencilDefinition,
  stencilTitle,
} from './stencils/placeStencil'
import {
  formatStencilString,
  type StencilUiStrings,
} from './stencils/stencilStrings'
import {
  clampLocalRectInRegion,
  movedCaptureRect,
  movedPlacementWithRegionFollow,
  REGION_DRAG_THRESHOLD_PX,
  resizedPlacementFree,
  resizedRectFromHandle,
  RESIZE_HANDLES,
  resizeHandleScreenPoint,
  STENCIL_DRAG_THRESHOLD_PX,
  type ResizeHandle,
} from './stencils/regionDrag'
import ComposeArrowPath from '../../overlay/ComposeArrowPath'
import { routeComposeArrowCurve } from '../../overlay/composeArrowCurve'
import '../../overlay/overlay.css'
import styles from './SpatialCaptureOverlay.module.css'

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

const MODES: Array<{
  id: SpatialPinMode
  label: string
  icon: LucideIcon
  toneClass: string
}> = [
  { id: 'ask', label: 'Ask', icon: MessageCircle, toneClass: 'overlay-mode-ask' },
  { id: 'change', label: 'Agent', icon: SquarePen, toneClass: 'overlay-mode-change' },
  { id: 'plan', label: 'Plan', icon: ListTree, toneClass: 'overlay-mode-plan' },
  { id: 'debug', label: 'Debug', icon: Bug, toneClass: 'overlay-mode-debug' },
]

type PointerMode =
  | { kind: 'idle' }
  | { kind: 'selecting'; origin: { x: number; y: number } }
  | {
      kind: 'arrow'
      regionId: string
      lockedAnchor: OverlayArrow['anchor'] | null
      liveTail: { x: number; y: number }
    }
  | { kind: 'draw'; regionId: string; strokeId: string }
  | {
      kind: 'pan'
      originX: number
      originY: number
      panX: number
      panY: number
    }
  | {
      kind: 'compose-drag'
      regionId: string
      arrowId: string
      grabOffset: { x: number; y: number }
      panelWidth: number
      panelHeight: number
    }
  | {
      kind: 'region-drag'
      regionId: string
      startX: number
      startY: number
      originRect: ScreenRect
      moved: boolean
    }
  | {
      kind: 'placement-drag'
      regionId: string
      placementId: string
      arrowId?: string
      startX: number
      startY: number
      originRect: ScreenRect
      originCaptureRect: ScreenRect
    }
  | {
      kind: 'region-resize'
      regionId: string
      handle: ResizeHandle
      originRect: ScreenRect
    }
  | {
      kind: 'placement-resize'
      regionId: string
      placementId: string
      arrowId?: string
      handle: ResizeHandle
      originLocal: ScreenRect
      originCaptureRect: ScreenRect
    }

const IDLE_HINT = 'Frozen capture · scroll to zoom · drag to select · Esc to exit'
const ZOOMED_HINT =
  'Frozen capture · drag empty space to pan · Shift-drag to select · Esc to exit'

function toLocalRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
): ScreenRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export default function SpatialCaptureCanvas({
  session,
  backdropUrl,
  onExit,
}: {
  session: SpatialCaptureSession
  backdropUrl: string | null
  onExit: () => void
}) {
  const project = useWorkbenchStore((s) => s.project)
  const client = useWorkbenchStore((s) => s.client)
  const upsertActiveSession = useSpatialCaptureStore((s) => s.upsertActiveSession)
  const { ts } = useI18n()

  const [regions, setRegions] = useState<OverlayRegion[]>(() =>
    session.regions.map(captureRegionToOverlay).filter(isCompleteCaptureRegion),
  )
  const [focusedRegionIds, setFocusedRegionIds] = useState<string[]>(() =>
    session.regions[0] ? [session.regions[0].id] : [],
  )
  const [activeArrowId, setActiveArrowId] = useState<string | null>(() => {
    const first = session.regions[0]?.arrows[session.regions[0].arrows.length - 1]
    return first?.id ?? null
  })
  const [draftRect, setDraftRect] = useState<ScreenRect | null>(null)
  const [pointer, setPointer] = useState<PointerMode>({ kind: 'idle' })
  const [openMenu, setOpenMenu] = useState<'mode' | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryRevealed, setLibraryRevealed] = useState(false)
  const [libraryCollapseToken, setLibraryCollapseToken] = useState(0)
  const [placeDrag, setPlaceDrag] = useState<{
    stencilId: string
    clientX: number
    clientY: number
    active: boolean
  } | null>(null)
  const [repoDesignSystem, setRepoDesignSystem] =
    useState<RepoDesignSystemSnapshot | null>(null)
  const [stencilBriefByArrow, setStencilBriefByArrow] = useState<
    Record<string, string>
  >({})
  const [stencilScopeByArrow, setStencilScopeByArrow] = useState<
    Record<string, StencilGenerationScope>
  >({})
  const [hubByArrow, setHubByArrow] = useState<Record<string, PinComposerHub>>(
    {},
  )
  const [subagentLinksByArrow, setSubagentLinksByArrow] = useState<
    Record<string, PinComposerHubSubagentLink[]>
  >({})
  const [researchLinesByArrow, setResearchLinesByArrow] = useState<
    Record<string, string[]>
  >({})
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState(IDLE_HINT)

  useEffect(() => {
    syncComposeSubagentsToPool(hubByArrow, subagentLinksByArrow)
  }, [hubByArrow, subagentLinksByArrow])

  const composeHubStrings: ComposeHubStrings = useMemo(
    () => ({
      ...COMPOSE_HUB_STRINGS_EN,
      expand: ts('spatialCaptures.composeHub.expand'),
      collapse: ts('spatialCaptures.composeHub.collapse'),
      repo: ts('spatialCaptures.composeHub.repo'),
      repoEmpty: ts('spatialCaptures.composeHub.repoEmpty'),
      repoDirty: ts('spatialCaptures.composeHub.repoDirty'),
      repoClean: ts('spatialCaptures.composeHub.repoClean'),
      repoLocate: ts('spatialCaptures.composeHub.repoLocate'),
      repoLocateSearch: ts('spatialCaptures.composeHub.repoLocateSearch'),
      repoLocateRoot: ts('spatialCaptures.composeHub.repoLocateRoot'),
      repoLocateLoading: ts('spatialCaptures.composeHub.repoLocateLoading'),
      repoLocateEmpty: ts('spatialCaptures.composeHub.repoLocateEmpty'),
      repoLocateError: ts('spatialCaptures.composeHub.repoLocateError'),
      repoCurrent: ts('spatialCaptures.composeHub.repoCurrent'),
      repoOpenGithub: ts('spatialCaptures.composeHub.repoOpenGithub'),
      repoOpenGraph: ts('spatialCaptures.composeHub.repoOpenGraph'),
      repoFetch: ts('spatialCaptures.composeHub.repoFetch'),
      referencesTabRepoHint: ts(
        'spatialCaptures.composeHub.referencesTabRepoHint',
      ),
      folders: ts('spatialCaptures.composeHub.folders'),
      foldersEmpty: ts('spatialCaptures.composeHub.foldersEmpty'),
      foldersAdd: ts('spatialCaptures.composeHub.foldersAdd'),
      scope: ts('spatialCaptures.composeHub.scope'),
      scopeEmpty: ts('spatialCaptures.composeHub.scopeEmpty'),
      scopeAdd: ts('spatialCaptures.composeHub.scopeAdd'),
      scopeModeFolders: ts('spatialCaptures.composeHub.scopeModeFolders'),
      scopeModeMap: ts('spatialCaptures.composeHub.scopeModeMap'),
      scopeMapTitle: ts('spatialCaptures.composeHub.scopeMapTitle'),
      scopeMapEmpty: ts('spatialCaptures.composeHub.scopeMapEmpty'),
      scopeMapLoading: ts('spatialCaptures.composeHub.scopeMapLoading'),
      scopeMapWeak: ts('spatialCaptures.composeHub.scopeMapWeak'),
      scopeMapDrill: ts('spatialCaptures.composeHub.scopeMapDrill'),
      scopeMapDone: ts('spatialCaptures.composeHub.scopeMapDone'),
      scopeMapHint: ts('spatialCaptures.composeHub.scopeMapHint'),
      scopeMapSelected: ts('spatialCaptures.composeHub.scopeMapSelected'),
      scopeMapLevelContext: ts(
        'spatialCaptures.composeHub.scopeMapLevelContext',
      ),
      scopeMapLevelContainer: ts(
        'spatialCaptures.composeHub.scopeMapLevelContainer',
      ),
      scopeMapLevelComponent: ts(
        'spatialCaptures.composeHub.scopeMapLevelComponent',
      ),
      scopeMapLevelCode: ts('spatialCaptures.composeHub.scopeMapLevelCode'),
      mcp: ts('spatialCaptures.composeHub.mcp'),
      mcpEmpty: ts('spatialCaptures.composeHub.mcpEmpty'),
      mcpOpenSettings: ts('spatialCaptures.composeHub.mcpOpenSettings'),
      mcpEnabled: ts('spatialCaptures.composeHub.mcpEnabled'),
      mcpDisabled: ts('spatialCaptures.composeHub.mcpDisabled'),
      mcpPolicyHint: ts('spatialCaptures.composeHub.mcpPolicyHint'),
      skills: ts('spatialCaptures.composeHub.skills'),
      skillsEmpty: ts('spatialCaptures.composeHub.skillsEmpty'),
      skillsAdd: ts('spatialCaptures.composeHub.skillsAdd'),
      references: ts('spatialCaptures.composeHub.references'),
      referencesEmpty: ts('spatialCaptures.composeHub.referencesEmpty'),
      referencesAdd: ts('spatialCaptures.composeHub.referencesAdd'),
      referencesAddUrl: ts('spatialCaptures.composeHub.referencesAddUrl'),
      referencesAddUrlPlaceholder: ts(
        'spatialCaptures.composeHub.referencesAddUrlPlaceholder',
      ),
      referencesAddFile: ts('spatialCaptures.composeHub.referencesAddFile'),
      referencesAddFiles: ts('spatialCaptures.composeHub.referencesAddFiles'),
      referencesAddPanel: ts('spatialCaptures.composeHub.referencesAddPanel'),
      referencesClosePanel: ts(
        'spatialCaptures.composeHub.referencesClosePanel',
      ),
      referencesPicking: ts('spatialCaptures.composeHub.referencesPicking'),
      referencesTabFiles: ts('spatialCaptures.composeHub.referencesTabFiles'),
      referencesTabMedia: ts('spatialCaptures.composeHub.referencesTabMedia'),
      referencesTabLinks: ts('spatialCaptures.composeHub.referencesTabLinks'),
      referencesTabRepo: ts('spatialCaptures.composeHub.referencesTabRepo'),
      referencesTypeAll: ts('spatialCaptures.composeHub.referencesTypeAll'),
      referencesFolderAll: ts('spatialCaptures.composeHub.referencesFolderAll'),
      referencesFolderUnfiled: ts(
        'spatialCaptures.composeHub.referencesFolderUnfiled',
      ),
      referencesFolderNew: ts('spatialCaptures.composeHub.referencesFolderNew'),
      referencesFolderPlaceholder: ts(
        'spatialCaptures.composeHub.referencesFolderPlaceholder',
      ),
      referencesFolderEmpty: ts(
        'spatialCaptures.composeHub.referencesFolderEmpty',
      ),
      referencesLibraryEmpty: ts(
        'spatialCaptures.composeHub.referencesLibraryEmpty',
      ),
      referencesGithub: ts('spatialCaptures.composeHub.referencesGithub'),
      referencesUrl: ts('spatialCaptures.composeHub.referencesUrl'),
      referencesVideo: ts('spatialCaptures.composeHub.referencesVideo'),
      referencesAudio: ts('spatialCaptures.composeHub.referencesAudio'),
      referencesImage: ts('spatialCaptures.composeHub.referencesImage'),
      referencesFile: ts('spatialCaptures.composeHub.referencesFile'),
      research: ts('spatialCaptures.composeHub.research'),
      researchEmpty: ts('spatialCaptures.composeHub.researchEmpty'),
      researchToggle: ts('spatialCaptures.composeHub.researchToggle'),
      subagent: ts('spatialCaptures.composeHub.subagent'),
      subagentAdd: ts('spatialCaptures.composeHub.subagentAdd'),
      subagentName: ts('spatialCaptures.composeHub.subagentName'),
      subagentBrief: ts('spatialCaptures.composeHub.subagentBrief'),
      subagentEnabled: ts('spatialCaptures.composeHub.subagentEnabled'),
      subagentRemove: ts('spatialCaptures.composeHub.subagentRemove'),
      statusReady: ts('spatialCaptures.composeHub.statusReady'),
      statusQueued: ts('spatialCaptures.composeHub.statusQueued'),
      statusRunning: ts('spatialCaptures.composeHub.statusRunning'),
      statusDone: ts('spatialCaptures.composeHub.statusDone'),
      statusError: ts('spatialCaptures.composeHub.statusError'),
    }),
    [ts],
  )

  const stencilStrings: StencilUiStrings = useMemo(
    () => ({
      library: ts('spatialCaptures.stencilLibrary'),
      libraryHint: ts('spatialCaptures.stencilLibraryHint'),
      edgeHint: ts('spatialCaptures.stencilEdgeHint'),
      close: ts('spatialCaptures.stencilClose'),
      search: ts('spatialCaptures.stencilSearch'),
      empty: ts('spatialCaptures.stencilEmpty'),
      armed: ts('spatialCaptures.stencilArmed'),
      disarm: ts('spatialCaptures.stencilDisarm'),
      open: ts('spatialCaptures.stencilOpen'),
      placeHint: ts('spatialCaptures.stencilPlaceHint'),
      dragHint: ts('spatialCaptures.stencilDragHint'),
      brief: ts('spatialCaptures.stencilBrief'),
      briefPlaceholder: ts('spatialCaptures.stencilBriefPlaceholder'),
      scope: ts('spatialCaptures.stencilScope'),
      scopeUiOnly: ts('spatialCaptures.stencilScopeUiOnly'),
      scopeUiApi: ts('spatialCaptures.stencilScopeUiApi'),
      scopeFull: ts('spatialCaptures.stencilScopeFull'),
      categoryBase: ts('spatialCaptures.stencilCategory.base'),
      categoryMotion: ts('spatialCaptures.stencilCategory.motion'),
      categoryVisual: ts('spatialCaptures.stencilCategory.visual'),
      categoryPreset: ts('spatialCaptures.stencilCategory.preset'),
      motionModifier: ts('spatialCaptures.stencilMotionModifier'),
      motionNone: ts('spatialCaptures.stencilMotionNone'),
      motionArmed: ts('spatialCaptures.stencilMotionArmed'),
      licenseNote: ts('spatialCaptures.stencilLicense'),
    }),
    [ts],
  )

  useEffect(() => {
    if (!libraryRevealed || !client || !project) return
    let cancelled = false
    void client
      .getRepoDesignSystem(project.projectId)
      .then((snapshot) => {
        if (!cancelled) setRepoDesignSystem(snapshot)
      })
      .catch(() => {
        if (!cancelled) setRepoDesignSystem(null)
      })
    return () => {
      cancelled = true
    }
  }, [libraryRevealed, client, project])
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const { metrics: panelMetrics, bindPanel } = useComposePanelMetrics()
  const flowArrows = useMemo(
    () =>
      regions.flatMap((region) =>
        region.arrows.map((arrow) => ({
          id: arrow.id,
          ...(arrow.runId ? { runId: arrow.runId } : {}),
        })),
      ),
    [regions],
  )
  const { flows, seedFlow } = useCaptureComposeFlows(
    flowArrows,
    client,
    Boolean(project),
  )

  const viewport = session.viewport

  const viewportHostRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const regionsRef = useRef(regions)
  const focusedRegionIdsRef = useRef(focusedRegionIds)
  /** Invalidate in-flight library→canvas pointer listeners (Esc / close). */
  const placeDragSessionRef = useRef(0)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const fitScaleRef = useRef(1)
  const viewportRef = useRef(viewport)
  zoomRef.current = zoom
  panRef.current = pan
  fitScaleRef.current = fitScale
  viewportRef.current = viewport

  useEffect(() => {
    regionsRef.current = regions
  }, [regions])

  useEffect(() => {
    focusedRegionIdsRef.current = focusedRegionIds
  }, [focusedRegionIds])

  useEffect(() => {
    setRegions(
      session.regions.map(captureRegionToOverlay).filter(isCompleteCaptureRegion),
    )
    const firstRegion = session.regions[0]
    setFocusedRegionIds(firstRegion ? [firstRegion.id] : [])
    setActiveArrowId(
      firstRegion?.arrows[firstRegion.arrows.length - 1]?.id ?? null,
    )
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setStatus(IDLE_HINT)
  }, [session.id])

  // Fit entire overlay viewport into the IDE card. Coalesce ResizeObserver
  // callbacks so sticky-squeeze CSS transitions don't re-render every frame.
  useLayoutEffect(() => {
    const host = viewportHostRef.current
    if (!host) return
    let raf = 0
    let last = -1
    const commit = () => {
      raf = 0
      const { width, height } = host.getBoundingClientRect()
      if (width < 1 || height < 1) return
      const next = Math.min(
        width / Math.max(1, viewport.width),
        height / Math.max(1, viewport.height),
      )
      const clamped = Number.isFinite(next) && next > 0 ? next : 1
      if (Math.abs(clamped - last) < 0.004) return
      const previous = last
      last = clamped
      setFitScale(clamped)
      if (previous > 0) {
        const ratio = clamped / previous
        const box = host.getBoundingClientRect()
        const nextPan = clampCapturePan(
          { x: panRef.current.x * ratio, y: panRef.current.y * ratio },
          { width: box.width, height: box.height },
          captureContentSize(viewport, clamped, zoomRef.current),
        )
        panRef.current = nextPan
        setPan(nextPan)
      }
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(commit)
    }
    commit()
    const ro = new ResizeObserver(schedule)
    ro.observe(host)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [viewport.width, viewport.height])

  useEffect(() => {
    setStatus((current) => {
      if (current !== IDLE_HINT && current !== ZOOMED_HINT) return current
      return zoom > 1.001 ? ZOOMED_HINT : IDLE_HINT
    })
  }, [zoom])

  function hostSize(): { width: number; height: number } | null {
    const host = viewportHostRef.current
    if (!host) return null
    const box = host.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return null
    return { width: box.width, height: box.height }
  }

  function viewCanPan(): boolean {
    const host = hostSize()
    if (!host) return false
    return captureViewOverflows(
      host,
      captureContentSize(viewportRef.current, fitScaleRef.current, zoomRef.current),
    )
  }

  function commitZoom(nextZoom: number, hostX: number, hostY: number) {
    const clamped = clampZoom(nextZoom)
    const host = hostSize()
    const nextPan = host
      ? panForZoomAtPoint({
          pan: panRef.current,
          zoom: zoomRef.current,
          nextZoom: clamped,
          hostX,
          hostY,
          host,
          viewport: viewportRef.current,
          fitScale: fitScaleRef.current,
        })
      : panRef.current
    zoomRef.current = clamped
    panRef.current = nextPan
    setZoom(clamped)
    setPan(nextPan)
  }

  function zoomBy(factor: number) {
    const host = hostSize()
    commitZoom(
      zoomRef.current * factor,
      host ? host.width / 2 : 0,
      host ? host.height / 2 : 0,
    )
  }

  function resetZoom() {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const commitZoomRef = useRef(commitZoom)
  commitZoomRef.current = commitZoom

  useEffect(() => {
    const host = viewportHostRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('textarea, .overlay-flow-steps, .overlay-panel')
      ) {
        return
      }
      event.preventDefault()
      const box = host.getBoundingClientRect()
      const raw = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const factor = Math.min(1.18, Math.max(1 / 1.18, Math.exp(-raw * 0.0016)))
      commitZoomRef.current(
        zoomRef.current * factor,
        event.clientX - box.left,
        event.clientY - box.top,
      )
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [viewport])

  function cancelPlaceDrag() {
    placeDragSessionRef.current += 1
    setPlaceDrag(null)
  }

  function collapseLibrary() {
    setLibraryOpen(false)
    setLibraryCollapseToken((token) => token + 1)
  }

  function exitStencilChrome() {
    collapseLibrary()
    cancelPlaceDrag()
    setRegions((prev) =>
      prev.map((region) =>
        region.tool === 'stencil' ? { ...region, tool: 'arrow' } : region,
      ),
    )
    setStatus(IDLE_HINT)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Scope Map floater owns Escape while open (compose card must stay).
      if (document.querySelector('[data-scope-map-picker="true"]')) return
      if (openMenu) {
        setOpenMenu(null)
        return
      }
      if (placeDrag || libraryRevealed || libraryOpen) {
        exitStencilChrome()
        return
      }
      if (activeArrowId) {
        setActiveArrowId(null)
        return
      }
      onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, openMenu, placeDrag, libraryOpen, libraryRevealed, activeArrowId])

  function stagePoint(event: {
    clientX: number
    clientY: number
  }): { x: number; y: number } {
    const el = stageRef.current
    if (!el) return { x: event.clientX, y: event.clientY }
    const box = el.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / Math.max(1, box.width)) * viewport.width,
      y: ((event.clientY - box.top) / Math.max(1, box.height)) * viewport.height,
    }
  }

  function updateRegion(
    regionId: string,
    patch: Partial<OverlayRegion> | ((r: OverlayRegion) => OverlayRegion),
  ) {
    setRegions((prev) =>
      prev.map((region) => {
        if (region.id !== regionId) return region
        return typeof patch === 'function' ? patch(region) : { ...region, ...patch }
      }),
    )
  }

  const sessionRef = useRef(session)
  sessionRef.current = session

  function persistRegions(nextRegions: OverlayRegion[]) {
    const current = sessionRef.current
    const next = buildCaptureSessionFromOverlay({
      id: current.id,
      projectId: current.projectId,
      location: current.location,
      viewport: current.viewport,
      regions: nextRegions,
      ...(current.backdropAssetPath
        ? { backdropAssetPath: current.backdropAssetPath }
        : {}),
      createdAt: current.createdAt,
      title: current.title,
    })
    void upsertActiveSession(next)
  }

  function schedulePersist(nextRegions: OverlayRegion[]) {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persistRegions(nextRegions)
    }, 400)
  }

  useEffect(() => {
    schedulePersist(regions)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [regions])

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
      persistRegions(regionsRef.current)
    }
  }, [])

  async function captureFrozenRegion(
    regionId: string,
    rect: ScreenRect,
  ): Promise<void> {
    if (!client || !project || !backdropUrl) return
    try {
      const pngBase64 = await cropBackdropRegionPngBase64(
        backdropUrl,
        rect,
        viewport,
      )
      const pinId = randomId('pin')
      const draft = createDraftSpatialPin({
        id: pinId,
        projectId: project.projectId,
        location: session.location,
        captureRect: rect,
      })
      draft.annotations = emptyAnnotationDoc()
      draft.composer = { mode: 'change', prompt: '' }
      await client.upsertSpatialPin(project.projectId, draft)
      const saved = await client.saveSpatialPinSnapshot(
        project.projectId,
        pinId,
        pngBase64,
      )
      updateRegion(regionId, { snapshotAssetPath: saved.snapshotAssetPath })
      setStatus('Region ready · drag from an edge midpoint')
    } catch {
      setStatus('Failed to crop region from frozen backdrop')
    }
  }

  async function upsertArrowPin(
    region: OverlayRegion,
    arrow: OverlayArrow,
  ): Promise<void> {
    if (!client || !project) return
    const existing = await client.getSpatialPin(project.projectId, arrow.pinId)
    const arrowStroke = createArrowStroke({
      id: arrow.id,
      index: arrow.index,
      color: arrow.color,
      anchor: arrow.anchor,
      head: arrow.head,
      tail: arrow.tail,
    })
    const base =
      existing ??
      createDraftSpatialPin({
        id: arrow.pinId,
        projectId: project.projectId,
        location: session.location,
        captureRect: region.captureRect,
      })
    const stencilBrief =
      stencilBriefByArrow[arrow.id]?.trim() ||
      combinedBriefForArrow(region, arrow.id)
    const generationScope =
      stencilScopeByArrow[arrow.id] ?? DEFAULT_STENCIL_SCOPE
    const hub = enrichHubForArrow(arrow.id, region)
    const updated: SpatialPin = {
      ...base,
      updatedAt: new Date().toISOString(),
      captureRect: region.captureRect,
      composer: {
        mode: region.mode,
        prompt: arrow.prompt,
        ...(region.snapshotAssetPath
          ? { snapshotAssetPath: region.snapshotAssetPath }
          : {}),
        ...(stencilBrief ? { stencilBrief, generationScope } : {}),
        hub,
      },
      annotations: {
        version: '0.1.0',
        strokes: [...region.drawStrokes, arrowStroke],
      },
      title: arrow.prompt.trim().slice(0, 60) || `Arrow #${arrow.index}`,
    }
    await client.upsertSpatialPin(project.projectId, updated)
  }

  function enrichHubForArrow(
    arrowId: string,
    region: OverlayRegion,
  ): PinComposerHub {
    const base = ensureHub(hubByArrow[arrowId] ?? emptyPinComposerHub())
    const snapshotAssetPath = region.snapshotAssetPath
    const references =
      base.references.length > 0
        ? base.references
        : snapshotAssetPath
          ? [
              {
                kind: 'image' as const,
                id: `ref_${arrowId}_snap`,
                assetPath: snapshotAssetPath,
                label: 'Region snapshot',
              },
            ]
          : []
    const inferred = session.location?.inferredPath?.trim()
    const folders =
      base.folders.length > 0
        ? base.folders
        : inferred
          ? [inferred]
          : []
    return {
      ...base,
      repo:
        base.repo ??
        (project
          ? { label: project.displayName || project.projectId, branch: 'main' }
          : undefined),
      references,
      folders,
    }
  }

  useEffect(() => {
    if (!client || !project) return
    const paths = new Set<string>()
    for (const region of regions) {
      if (region.snapshotAssetPath) paths.add(region.snapshotAssetPath)
    }
    for (const hub of Object.values(hubByArrow)) {
      for (const ref of hub.references) {
        if (
          (ref.kind === 'image' ||
            ref.kind === 'video' ||
            ref.kind === 'audio') &&
          ref.assetPath
        ) {
          paths.add(ref.assetPath)
        }
      }
    }
    let cancelled = false
    for (const path of paths) {
      if (assetUrls[path]) continue
      void client
        .readProjectAssetBase64(project.projectId, path)
        .then((payload) => {
          if (cancelled || !payload?.base64) return
          setAssetUrls((prev) =>
            prev[path]
              ? prev
              : {
                  ...prev,
                  [path]: `data:${payload.mimeType};base64,${payload.base64}`,
                },
          )
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [client, project, regions, hubByArrow, assetUrls])

  const hubDataSource = useMemo((): ComposeHubDataSource => {
    return {
      listSkills: async () => {
        if (!client || !project) return []
        const result = await client.listSkills(project.projectId)
        return result.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
        }))
      },
      listDirectories: async (relativePath) => {
        if (!client || !project) return []
        const entries = await client.listWorkspaceDirectory(
          project.projectId,
          relativePath,
        )
        return entries
          .filter((entry) => entry.kind === 'directory')
          .map((entry) => ({ name: entry.name, path: entry.path }))
      },
      listMentionFiles: async (query) => {
        if (!client || !project) return []
        const result = await client.getComposerMentions(
          project.projectId,
          query,
        )
        return result.files
      },
      pickReferenceFiles: async (options) => {
        if (!window.projectOS?.shell?.pickReferenceFiles) return []
        return window.projectOS.shell.pickReferenceFiles(options)
      },
      listMcpServers: async () => {
        if (!client || !project) return []
        const servers = (await client.listMcpServers(project.projectId)) ?? []
        return servers.map((server) => ({
          id: server.id,
          name: server.name,
          enabled: server.enabled,
          transport: server.transport,
          toolCount: server.toolAllowlist?.length,
        }))
      },
      setMcpServerEnabled: async (serverId, enabled) => {
        if (!client || !project) return null
        const servers = await client.listMcpServers(project.projectId)
        const current = servers.find((server) => server.id === serverId)
        if (!current) return null
        const nextConfig = { ...current, enabled }
        await client.saveMcpServer(project.projectId, { config: nextConfig })
        return {
          id: nextConfig.id,
          name: nextConfig.name,
          enabled: nextConfig.enabled,
          transport: nextConfig.transport,
          toolCount: nextConfig.toolAllowlist?.length,
        }
      },
      openMcpSettings: () => {
        useWorkbenchStore.getState().setSettingsOpen(true)
      },
      getGitStatus: async () => {
        if (!client || !project) return { branch: null, dirty: false }
        return client.getWorkspaceGitStatus(project.projectId)
      },
      listGitBranches: async () => {
        if (!client || !project) {
          return { defaultBranch: null, currentBranch: null, branches: [] }
        }
        return client.listWorkspaceGitBranches(project.projectId)
      },
      fetchGit: async () => {
        if (!client || !project) {
          return { ok: false, message: 'No project' }
        }
        return client.fetchWorkspaceGit(project.projectId)
      },
      openGithubGraph: () => {
        useChatSessionStore.getState().setGithubGraphOpen(true)
      },
      openExternalUrl: (url) => {
        void window.projectOS?.shell.openExternal(url)
      },
      getProjectGraph: async () => {
        if (!client || !project) return null
        const graph = await client.getProjectGraph(project.projectId)
        return {
          nodes: graph.nodes,
          edges: graph.edges,
        }
      },
      listRepoCandidates: async () =>
        project
          ? [
              {
                projectId: project.projectId,
                displayName: project.displayName || project.projectId,
              },
            ]
          : [],
      resolveAssetUrl: (assetPath) => assetUrls[assetPath],
    }
  }, [client, project, assetUrls])

  function ensureBriefState(arrowId: string, region: OverlayRegion) {
    setStencilBriefByArrow((prev) => {
      if (prev[arrowId] !== undefined) return prev
      const brief = combinedBriefForArrow(region, arrowId)
      if (!brief) return prev
      return { ...prev, [arrowId]: brief }
    })
    setStencilScopeByArrow((prev) =>
      prev[arrowId] ? prev : { ...prev, [arrowId]: DEFAULT_STENCIL_SCOPE },
    )
  }

  function placeStencil(
    stencilId: string,
    stagePoint: { x: number; y: number },
  ) {
    // Prefer a user-drawn region under the pointer; otherwise reuse / create a
    // full-screenshot backdrop (chrome hidden) so the stencil is not wrapped
    // in a visible snug selection frame.
    const containing = regionsRef.current.filter(
      (region) =>
        !region.hideSelectionChrome &&
        pointInRect(region.captureRect, stagePoint.x, stagePoint.y),
    )
    let baseRegion: OverlayRegion | undefined = containing[0]
    let createdFullFrame = false
    let fullRect: ScreenRect | null = null

    if (!baseRegion) {
      baseRegion = regionsRef.current.find((region) => region.hideSelectionChrome)
    }

    if (!baseRegion) {
      const regionId = randomId('region')
      fullRect = {
        x: 0,
        y: 0,
        width: session.viewport.width,
        height: session.viewport.height,
      }
      baseRegion = {
        id: regionId,
        captureRect: fullRect,
        mode: 'change',
        regionPrompt: '',
        arrows: [],
        drawStrokes: [],
        flowComplete: false,
        showAnchors: false,
        tool: 'arrow',
        stencils: [],
        hideSelectionChrome: true,
      }
      createdFullFrame = true
    }

    if ((baseRegion.stencils?.length ?? 0) >= MAX_STENCILS_PER_REGION) {
      setStatus(`At most ${MAX_STENCILS_PER_REGION} stencils per region`)
      return
    }

    const arrowId = randomId('arrow')
    const pinId = randomId('pin')
    const index = baseRegion.arrows.length + 1
    const placement = buildPlacementAtStagePoint({
      id: randomId('place'),
      stencilId,
      stagePoint,
      region: baseRegion,
      arrowId,
    })
    const localCenter = {
      x:
        (placement.rect.x + placement.rect.width / 2) /
        Math.max(1, baseRegion.captureRect.width),
      y:
        (placement.rect.y + placement.rect.height / 2) /
        Math.max(1, baseRegion.captureRect.height),
    }
    const head = {
      x: Math.min(0.98, Math.max(0.02, localCenter.x)),
      y: Math.min(0.98, Math.max(0.02, localCenter.y)),
    }
    const tail = { x: head.x + 0.35, y: head.y }
    const layout = layoutComposeForArrow({
      region: baseRegion.captureRect,
      headScreen: relativeToClient(baseRegion.captureRect, head),
      preferredTailScreen: relativeToClient(baseRegion.captureRect, tail),
      panelWidth: 360,
      panelHeight: estimateComposePanelHeight(false),
      viewport: {
        width: session.viewport.width,
        height: session.viewport.height,
      },
    })
    const draftArrow: OverlayArrow = {
      id: arrowId,
      index,
      color: colorForArrowIndex(index),
      anchor: nearestAnchorToRelative(head),
      head,
      tail,
      composeAttach: layout.attach,
      prompt: '',
      pinId,
      status: 'draft',
    }
    const regionForConn: OverlayRegion = {
      ...baseRegion,
      arrows: [...baseRegion.arrows, draftArrow],
      stencils: [...(baseRegion.stencils ?? []), placement],
      flowComplete: true,
      showAnchors: false,
      tool: 'arrow',
    }
    const conn = resolveArrowEdgeConnection(
      regionForConn,
      draftArrow,
      layout.card,
    )
    const tip = composeAttachScreenPoint(layout.card, conn.cardAnchor)
    const arrow: OverlayArrow = {
      ...draftArrow,
      composeAttach: conn.cardAnchor,
      anchor: conn.targetAnchor,
      head: clientToRelative(
        baseRegion.captureRect,
        conn.headScreen.x,
        conn.headScreen.y,
      ),
      tail: clientToRelative(baseRegion.captureRect, tip.x, tip.y),
    }
    const nextRegion: OverlayRegion = {
      ...regionForConn,
      arrows: [...baseRegion.arrows, arrow],
    }

    setRegions((prev) => {
      if (createdFullFrame) return [...prev, nextRegion]
      return prev.map((region) =>
        region.id === nextRegion.id ? nextRegion : region,
      )
    })
    regionsRef.current = createdFullFrame
      ? [...regionsRef.current, nextRegion]
      : regionsRef.current.map((region) =>
          region.id === nextRegion.id ? nextRegion : region,
        )

    if (createdFullFrame && fullRect) {
      void captureFrozenRegion(nextRegion.id, fullRect)
    }

    ensureBriefState(arrowId, nextRegion)
    setActiveArrowId(arrowId)
    setFocusedRegionIds([nextRegion.id])
    collapseLibrary()
    cancelPlaceDrag()
    setStatus(`${stencilTitle(stencilId)} placed · enter intent, then Send`)
    requestAnimationFrame(() => promptRef.current?.focus())
    void upsertArrowPin(nextRegion, arrow)
  }

  function beginPlaceDrag(
    stencilId: string,
    clientX: number,
    clientY: number,
  ) {
    const sessionId = ++placeDragSessionRef.current
    setPlaceDrag({ stencilId, clientX, clientY, active: false })
    setStatus(
      formatStencilString(stencilStrings.armed, {
        name: stencilTitle(stencilId),
      }),
    )

    let becameActive = false
    const onMove = (event: PointerEvent) => {
      if (sessionId !== placeDragSessionRef.current) return
      const dist = Math.hypot(event.clientX - clientX, event.clientY - clientY)
      const active = dist >= STENCIL_DRAG_THRESHOLD_PX
      if (active && !becameActive) {
        becameActive = true
        collapseLibrary()
      }
      setPlaceDrag({
        stencilId,
        clientX: event.clientX,
        clientY: event.clientY,
        active: becameActive,
      })
    }

    const onUp = (event: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (sessionId !== placeDragSessionRef.current) return
      const dist = Math.hypot(event.clientX - clientX, event.clientY - clientY)
      const active = becameActive || dist >= STENCIL_DRAG_THRESHOLD_PX
      const stage = stageRef.current
      if (!stage) {
        cancelPlaceDrag()
        setStatus(IDLE_HINT)
        return
      }
      const box = stage.getBoundingClientRect()
      const overStage =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      const pt = {
        x: ((event.clientX - box.left) / Math.max(1, box.width)) * viewport.width,
        y: ((event.clientY - box.top) / Math.max(1, box.height)) * viewport.height,
      }
      if (active && overStage) {
        placeStencil(stencilId, pt)
        return
      }
      if (!active) {
        const focused = regionsRef.current.find((r) =>
          focusedRegionIdsRef.current.includes(r.id),
        )
        const target = focused
          ? {
              x: focused.captureRect.x + focused.captureRect.width / 2,
              y: focused.captureRect.y + focused.captureRect.height / 2,
            }
          : {
              x: session.viewport.width / 2,
              y: session.viewport.height / 2,
            }
        placeStencil(stencilId, target)
        return
      }
      cancelPlaceDrag()
      setStatus(IDLE_HINT)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function layoutArrowCompose(
    region: OverlayRegion,
    arrow: OverlayArrow,
  ): ComposeLayoutResult {
    const { width: panelWidth, height: panelHeight } = resolveComposePanelSize(
      panelMetrics,
      arrow.id,
      360,
      estimateComposePanelHeight(false),
    )
    const tip = relativeToClient(region.captureRect, arrow.tail)
    if (arrow.composeAttach) {
      const attach = toEdgeAnchor(arrow.composeAttach)
      return {
        card: cardPinnedToTip(tip, attach, panelWidth, panelHeight),
        attach,
        attachScreen: tip,
      }
    }
    return layoutComposeForArrow({
      region: region.captureRect,
      headScreen: relativeToClient(region.captureRect, arrow.head),
      preferredTailScreen: tip,
      panelWidth,
      panelHeight,
      viewport,
    })
  }

  function commitArrow(
    regionId: string,
    anchor: OverlayArrow['anchor'],
    head: { x: number; y: number },
    tail: { x: number; y: number },
  ) {
    const region = regionsRef.current.find((r) => r.id === regionId)
    if (!region) return
    const index = region.arrows.length + 1
    const tip = relativeToClient(region.captureRect, tail)
    const headScreen = relativeToClient(region.captureRect, head)
    const layout = layoutComposeForArrow({
      region: region.captureRect,
      headScreen,
      preferredTailScreen: tip,
      panelWidth: 360,
      panelHeight: estimateComposePanelHeight(false),
      viewport,
    })
    const arrow: OverlayArrow = {
      id: randomId('arrow'),
      index,
      color: colorForArrowIndex(index),
      anchor,
      head,
      tail,
      composeAttach: layout.attach,
      prompt: '',
      pinId: randomId('pin'),
      status: 'draft',
    }
    updateRegion(regionId, (r) => ({
      ...r,
      arrows: [...r.arrows, arrow],
      flowComplete: true,
      showAnchors: false,
      tool: 'arrow',
    }))
    setActiveArrowId(arrow.id)
    setFocusedRegionIds([regionId])
    setStatus(`Arrow #${index} · enter prompt, then Send`)
    requestAnimationFrame(() => promptRef.current?.focus())
    void upsertArrowPin(
      { ...region, arrows: [...region.arrows, arrow], flowComplete: true },
      arrow,
    )
  }

  function deleteArrow(regionId: string, arrowId: string) {
    updateRegion(regionId, (r) => ({
      ...r,
      arrows: r.arrows.filter((a) => a.id !== arrowId),
      stencils: (r.stencils ?? []).filter((item) => item.arrowId !== arrowId),
      flowComplete: r.arrows.some((a) => a.id !== arrowId),
      showAnchors: true,
    }))
    setStencilBriefByArrow((prev) => {
      if (!(arrowId in prev)) return prev
      const next = { ...prev }
      delete next[arrowId]
      return next
    })
    setStencilScopeByArrow((prev) => {
      if (!(arrowId in prev)) return prev
      const next = { ...prev }
      delete next[arrowId]
      return next
    })
    if (activeArrowId === arrowId) setActiveArrowId(null)
  }

  function clearDraw(regionId: string) {
    updateRegion(regionId, { drawStrokes: [] })
  }

  function deleteRegion(regionId: string) {
    const removed = regionsRef.current.find((r) => r.id === regionId)
    setRegions((prev) => prev.filter((r) => r.id !== regionId))
    setFocusedRegionIds((prev) => prev.filter((id) => id !== regionId))
    if (removed?.arrows.some((a) => a.id === activeArrowId)) {
      setActiveArrowId(null)
    }
    if (pointer.kind !== 'idle' && 'regionId' in pointer && pointer.regionId === regionId) {
      setPointer({ kind: 'idle' })
    }
    setStatus('Region deleted')
  }

  function setRegionTool(regionId: string, tool: RegionTool) {
    updateRegion(regionId, { tool })
  }

  async function onSubmitArrow(regionId: string, arrowId: string) {
    const region = regionsRef.current.find((r) => r.id === regionId)
    const arrow = region?.arrows.find((a) => a.id === arrowId)
    if (!region || !arrow || !client || !project) return
    const trimmed = arrow.prompt.trim()
    if (!trimmed) {
      setStatus('Prompt is required')
      return
    }
    updateRegion(regionId, (r) => ({
      ...r,
      arrows: r.arrows.map((a) =>
        a.id === arrowId ? { ...a, status: 'submitting', prompt: trimmed } : a,
      ),
    }))
    seedFlow(arrowId, {
      steps: [{ id: 'submit', label: 'Starting agent…', status: 'running' }],
      phase: 'thinking',
      live: false,
    })
    try {
      await upsertArrowPin(region, { ...arrow, prompt: trimmed })
      const pin = await client.getSpatialPin(project.projectId, arrow.pinId)
      const stencilBrief =
        stencilBriefByArrow[arrow.id]?.trim() ||
        combinedBriefForArrow(region, arrow.id)
      const generationScope =
        stencilScopeByArrow[arrow.id] ?? DEFAULT_STENCIL_SCOPE
      const hub = enrichHubForArrow(arrow.id, region)
      if (pin) {
        await client.upsertSpatialPin(project.projectId, {
          ...pin,
          composer: {
            ...pin.composer,
            prompt: trimmed,
            mode: region.mode,
            ...(stencilBrief ? { stencilBrief, generationScope } : {}),
            hub,
          },
        })
      }
      const result = await client.submitSpatialPin(
        project.projectId,
        arrow.pinId,
      )
      if (result.pin?.links?.composeSubagents) {
        setSubagentLinksByArrow((prev) => ({
          ...prev,
          [arrow.id]: result.pin.links!.composeSubagents!,
        }))
      }
      updateRegion(regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === arrowId
            ? {
                ...a,
                prompt: trimmed,
                status: 'submitted',
                runId: result.runId,
              }
            : a,
        ),
      }))
      setStatus(result.runId ? 'Agent running…' : 'Submitted')
      if (!result.runId) {
        seedFlow(arrowId, {
          steps: [
            {
              id: 'done',
              label: result.planId
                ? 'Plan ready'
                : result.debugSessionId
                  ? 'Debug started'
                  : 'Answer ready',
              status: 'complete',
            },
          ],
          phase: 'done',
          live: false,
        })
      }
    } catch {
      updateRegion(regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === arrowId ? { ...a, status: 'error' } : a,
        ),
      }))
      setStatus('Submit failed')
      seedFlow(arrowId, {
        steps: [{ id: 'error', label: 'Submit failed', status: 'error' }],
        phase: 'error',
        live: false,
      })
    }
  }

  function beginPan(event: React.PointerEvent) {
    setPointer({
      kind: 'pan',
      originX: event.clientX,
      originY: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    })
    viewportHostRef.current?.setPointerCapture?.(event.pointerId)
  }

  function onViewportPointerDown(event: React.PointerEvent) {
    if (event.button !== 0 || event.shiftKey) return
    if (event.target !== event.currentTarget) return
    if (!viewCanPan()) return
    beginPan(event)
  }

  function beginPlacementDrag(
    event: React.PointerEvent,
    region: OverlayRegion,
    placementId: string,
  ) {
    const placement = (region.stencils ?? []).find((item) => item.id === placementId)
    if (!placement) return
    event.preventDefault()
    event.stopPropagation()
    const pt = stagePoint(event)
    setFocusedRegionIds([region.id])
    if (placement.arrowId) setActiveArrowId(placement.arrowId)
    setPointer({
      kind: 'placement-drag',
      regionId: region.id,
      placementId,
      ...(placement.arrowId ? { arrowId: placement.arrowId } : {}),
      startX: pt.x,
      startY: pt.y,
      originRect: placement.rect,
      originCaptureRect: region.captureRect,
    })
    stageRef.current?.setPointerCapture?.(event.pointerId)
    setStatus('Drag stencil · release to drop')
  }

  function beginRegionResize(
    event: React.PointerEvent,
    region: OverlayRegion,
    handle: ResizeHandle,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setFocusedRegionIds([region.id])
    setPointer({
      kind: 'region-resize',
      regionId: region.id,
      handle,
      originRect: region.captureRect,
    })
    stageRef.current?.setPointerCapture?.(event.pointerId)
    setStatus('Drag corner to resize region')
  }

  function beginPlacementResize(
    event: React.PointerEvent,
    region: OverlayRegion,
    placementId: string,
    handle: ResizeHandle,
  ) {
    const placement = (region.stencils ?? []).find((item) => item.id === placementId)
    if (!placement) return
    event.preventDefault()
    event.stopPropagation()
    setFocusedRegionIds([region.id])
    if (placement.arrowId) setActiveArrowId(placement.arrowId)
    setPointer({
      kind: 'placement-resize',
      regionId: region.id,
      placementId,
      ...(placement.arrowId ? { arrowId: placement.arrowId } : {}),
      handle,
      originLocal: placement.rect,
      originCaptureRect: region.captureRect,
    })
    stageRef.current?.setPointerCapture?.(event.pointerId)
    setStatus('Drag corner to resize stencil')
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    if (pointer.kind !== 'idle') return
    // Only block the stage while an active library→canvas drag is in flight.
    if (placeDrag?.active) return
    const pt = stagePoint(event)

    const anchorCandidates =
      focusedRegionIds.length > 0
        ? regionsRef.current.filter((r) => focusedRegionIds.includes(r.id))
        : regionsRef.current
    for (const region of anchorCandidates) {
      if (!region.showAnchors || region.tool === 'draw') continue
      const hit = hitTestAnchor(region.captureRect, pt.x, pt.y, 12)
      if (hit) {
        setFocusedRegionIds([region.id])
        setActiveArrowId(null)
        setPointer({
          kind: 'arrow',
          regionId: region.id,
          lockedAnchor: hit.anchor,
          liveTail: clientToRelative(region.captureRect, pt.x, pt.y),
        })
        stageRef.current?.setPointerCapture?.(event.pointerId)
        return
      }
    }

    for (const regionId of focusedRegionIds) {
      const region = regionsRef.current.find((r) => r.id === regionId)
      if (!region || region.tool !== 'draw' || !region.flowComplete) continue
      if (!pointInRect(region.captureRect, pt.x, pt.y)) continue
      const rel = clampRelativeInRect(
        clientToRelative(region.captureRect, pt.x, pt.y),
      )
      const strokeId = randomId('stroke')
      const stroke: AnnotationStroke = {
        id: strokeId,
        kind: 'pen',
        color: '#4c7dff',
        width: 2,
        points: [rel],
      }
      updateRegion(region.id, (r) => ({
        ...r,
        drawStrokes: [...r.drawStrokes, stroke],
      }))
      setPointer({ kind: 'draw', regionId: region.id, strokeId })
      stageRef.current?.setPointerCapture?.(event.pointerId)
      return
    }

    const containing = focusIdsForClick(regionsRef.current, pt.x, pt.y)
    if (containing.length > 0) {
      const primaryId = containing[0]!
      const primary = regionsRef.current.find((r) => r.id === primaryId)
      setFocusedRegionIds(containing)
      setActiveArrowId((current) => {
        if (current) {
          const stillVisible = regionsRef.current.some(
            (r) =>
              containing.includes(r.id) &&
              r.arrows.some((a) => a.id === current),
          )
          if (stillVisible) return current
        }
        const first = regionsRef.current.find((r) => containing.includes(r.id))
        return first?.arrows[first.arrows.length - 1]?.id ?? null
      })
      // Drag region when not in draw tool (clear/delete are buttons, not modes).
      if (primary && primary.tool !== 'draw') {
        setRegions((prev) =>
          prev.map((region) => {
            if (!containing.includes(region.id)) {
              return { ...region, showAnchors: false }
            }
            return {
              ...region,
              showAnchors: false,
              tool: region.tool === 'draw' ? 'arrow' : region.tool,
            }
          }),
        )
        setPointer({
          kind: 'region-drag',
          regionId: primary.id,
          startX: pt.x,
          startY: pt.y,
          originRect: primary.captureRect,
          moved: false,
        })
        stageRef.current?.setPointerCapture?.(event.pointerId)
        setStatus('Drag to move region · release to drop')
        return
      }
      setRegions((prev) =>
        prev.map((region) => {
          if (!containing.includes(region.id)) {
            return { ...region, showAnchors: false }
          }
          return { ...region, showAnchors: true, tool: 'arrow' }
        }),
      )
      setStatus('Drag from an edge midpoint to place an arrow')
      return
    }

    if (isOutsideAllRegions(regionsRef.current, pt.x, pt.y)) {
      const drawing = regionsRef.current.some(
        (r) => focusedRegionIds.includes(r.id) && r.tool === 'draw',
      )
      if (drawing) {
        setRegions((prev) =>
          prev.map((r) =>
            focusedRegionIds.includes(r.id) ? { ...r, tool: 'arrow' } : r,
          ),
        )
        setStatus('Draw cancelled')
        return
      }
      if (!event.shiftKey && viewCanPan()) {
        beginPan(event)
        return
      }
      setFocusedRegionIds([])
      setActiveArrowId(null)
      setPointer({ kind: 'selecting', origin: pt })
      setDraftRect({ x: pt.x, y: pt.y, width: 0, height: 0 })
      stageRef.current?.setPointerCapture?.(event.pointerId)
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const pt = stagePoint(event)
    if (pointer.kind === 'selecting') {
      setDraftRect(toLocalRect(pointer.origin, pt))
      return
    }
    if (pointer.kind === 'arrow') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      if (!region) return
      setPointer({
        ...pointer,
        liveTail: clientToRelative(region.captureRect, pt.x, pt.y),
      })
      return
    }
    if (pointer.kind === 'draw') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      if (!region) return
      if (!pointInRect(region.captureRect, pt.x, pt.y)) return
      const rel = clampRelativeInRect(
        clientToRelative(region.captureRect, pt.x, pt.y),
      )
      updateRegion(pointer.regionId, (r) => ({
        ...r,
        drawStrokes: r.drawStrokes.map((stroke) =>
          stroke.id === pointer.strokeId && stroke.kind === 'pen'
            ? { ...stroke, points: [...stroke.points, rel] }
            : stroke,
        ),
      }))
      return
    }
    if (pointer.kind === 'pan') {
      const host = hostSize()
      const next = {
        x: pointer.panX + (event.clientX - pointer.originX),
        y: pointer.panY + (event.clientY - pointer.originY),
      }
      const clamped = host
        ? clampCapturePan(
            next,
            host,
            captureContentSize(viewportRef.current, fitScaleRef.current, zoomRef.current),
          )
        : next
      panRef.current = clamped
      setPan(clamped)
      return
    }
    if (pointer.kind === 'compose-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = region?.arrows.find((a) => a.id === pointer.arrowId)
      if (!region || !arrow) return
      const card = {
        x: pt.x - pointer.grabOffset.x,
        y: pt.y - pointer.grabOffset.y,
        width: pointer.panelWidth,
        height: pointer.panelHeight,
      }
      // Auto-pick facing edge midpoints as the card moves.
      const conn = resolveArrowEdgeConnection(region, arrow, card)
      const nextTail = clientToRelative(
        region.captureRect,
        conn.attachScreen.x,
        conn.attachScreen.y,
      )
      const nextHead = clientToRelative(
        region.captureRect,
        conn.headScreen.x,
        conn.headScreen.y,
      )
      updateRegion(pointer.regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === pointer.arrowId
            ? {
                ...a,
                tail: nextTail,
                head: nextHead,
                composeAttach: conn.cardAnchor,
                anchor: conn.targetAnchor,
              }
            : a,
        ),
      }))
      return
    }
    if (pointer.kind === 'region-drag') {
      const dx = pt.x - pointer.startX
      const dy = pt.y - pointer.startY
      const dist = Math.hypot(dx, dy)
      if (!pointer.moved && dist < REGION_DRAG_THRESHOLD_PX) return
      const nextRect = movedCaptureRect(
        pointer.originRect,
        dx,
        dy,
        session.viewport,
      )
      updateRegion(pointer.regionId, { captureRect: nextRect })
      if (!pointer.moved) {
        setPointer({ ...pointer, moved: true })
      }
      return
    }
    if (pointer.kind === 'placement-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      if (!region) return
      const dx = pt.x - pointer.startX
      const dy = pt.y - pointer.startY
      const { nextCapture, nextLocal } = movedPlacementWithRegionFollow(
        pointer.originRect,
        dx,
        dy,
        pointer.originCaptureRect,
        session.viewport,
      )
      updateRegion(pointer.regionId, (r) => {
        const stencils = (r.stencils ?? []).map((item) =>
          item.id === pointer.placementId ? { ...item, rect: nextLocal } : item,
        )
        let arrows = r.arrows
        if (pointer.arrowId) {
          const head = {
            x: Math.min(
              0.98,
              Math.max(
                0.02,
                (nextLocal.x + nextLocal.width / 2) /
                  Math.max(1, nextCapture.width),
              ),
            ),
            y: Math.min(
              0.98,
              Math.max(
                0.02,
                (nextLocal.y + nextLocal.height / 2) /
                  Math.max(1, nextCapture.height),
              ),
            ),
          }
          arrows = r.arrows.map((arrow) =>
            arrow.id === pointer.arrowId
              ? {
                  ...arrow,
                  head,
                  anchor: nearestAnchorToRelative(head),
                }
              : arrow,
          )
        }
        return { ...r, captureRect: nextCapture, stencils, arrows }
      })
      return
    }
    if (pointer.kind === 'region-resize') {
      const nextRect = resizedRectFromHandle(
        pointer.originRect,
        pointer.handle,
        pt.x,
        pt.y,
        undefined,
        { x: 0, y: 0, width: session.viewport.width, height: session.viewport.height },
      )
      updateRegion(pointer.regionId, (r) => ({
        ...r,
        captureRect: nextRect,
        stencils: clampStencilsToRegion(r.stencils ?? [], nextRect),
      }))
      return
    }
    if (pointer.kind === 'placement-resize') {
      const { nextCapture, nextLocal } = resizedPlacementFree(
        pointer.originLocal,
        pointer.originCaptureRect,
        pointer.handle,
        pt.x,
        pt.y,
        session.viewport,
      )
      updateRegion(pointer.regionId, (r) => {
        const stencils = (r.stencils ?? []).map((item) =>
          item.id === pointer.placementId
            ? { ...item, rect: nextLocal }
            : {
                ...item,
                rect: clampLocalRectInRegion(item.rect, nextCapture),
              },
        )
        let arrows = r.arrows
        if (pointer.arrowId) {
          const head = {
            x: Math.min(
              0.98,
              Math.max(
                0.02,
                (nextLocal.x + nextLocal.width / 2) /
                  Math.max(1, nextCapture.width),
              ),
            ),
            y: Math.min(
              0.98,
              Math.max(
                0.02,
                (nextLocal.y + nextLocal.height / 2) /
                  Math.max(1, nextCapture.height),
              ),
            ),
          }
          arrows = r.arrows.map((arrow) =>
            arrow.id === pointer.arrowId
              ? {
                  ...arrow,
                  head,
                  anchor: nearestAnchorToRelative(head),
                }
              : arrow,
          )
        }
        return { ...r, captureRect: nextCapture, stencils, arrows }
      })
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const pt = stagePoint(event)
    if (pointer.kind === 'selecting') {
      const rect = toLocalRect(pointer.origin, pt)
      setPointer({ kind: 'idle' })
      setDraftRect(null)
      if (rect.width < 8 || rect.height < 8) return
      const regionId = randomId('region')
      const region: OverlayRegion = {
        id: regionId,
        captureRect: rect,
        mode: 'change',
        regionPrompt: '',
        arrows: [],
        drawStrokes: [],
        flowComplete: false,
        showAnchors: true,
        tool: 'arrow',
        stencils: [],
      }
      setRegions((prev) => [...prev, region])
      setFocusedRegionIds([regionId])
      setActiveArrowId(null)
      setStatus('Drag from an edge midpoint · tail may leave the box')
      void captureFrozenRegion(regionId, rect)
      return
    }
    if (pointer.kind === 'arrow') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      setPointer({ kind: 'idle' })
      if (!region) return
      const tail = clientToRelative(region.captureRect, pt.x, pt.y)
      const finalAnchor = toEdgeAnchor(
        pointer.lockedAnchor ?? nearestAnchorToRelative(tail),
      )
      const finalHead = relativePointForAnchor(finalAnchor)
      const dx = (tail.x - finalHead.x) * region.captureRect.width
      const dy = (tail.y - finalHead.y) * region.captureRect.height
      if (Math.hypot(dx, dy) < 12) return
      commitArrow(region.id, finalAnchor, finalHead, tail)
      return
    }
    if (pointer.kind === 'compose-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = region?.arrows.find((a) => a.id === pointer.arrowId)
      setPointer({ kind: 'idle' })
      if (region && arrow) void upsertArrowPin(region, arrow)
      return
    }
    if (pointer.kind === 'draw') {
      setPointer({ kind: 'idle' })
      return
    }
    if (pointer.kind === 'pan') {
      const moved =
        Math.hypot(event.clientX - pointer.originX, event.clientY - pointer.originY) > 4
      setPointer({ kind: 'idle' })
      if (!moved) {
        setFocusedRegionIds([])
        setActiveArrowId(null)
      }
      return
    }
    if (pointer.kind === 'region-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const moved = pointer.moved
      setPointer({ kind: 'idle' })
      if (!region) return
      if (!moved) {
        setRegions((prev) =>
          prev.map((item) =>
            item.id === region.id
              ? { ...item, showAnchors: true, tool: 'arrow' }
              : item,
          ),
        )
        setStatus('Drag from an edge midpoint to place an arrow')
        return
      }
      void captureFrozenRegion(region.id, region.captureRect)
      setStatus('Region moved · snapshot updated')
      return
    }
    if (pointer.kind === 'placement-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = pointer.arrowId
        ? region?.arrows.find((a) => a.id === pointer.arrowId)
        : undefined
      const regionMoved =
        !!region &&
        (region.captureRect.x !== pointer.originCaptureRect.x ||
          region.captureRect.y !== pointer.originCaptureRect.y)
      setPointer({ kind: 'idle' })
      if (region && arrow) void upsertArrowPin(region, arrow)
      if (region && regionMoved) {
        void captureFrozenRegion(region.id, region.captureRect)
      }
      setStatus(IDLE_HINT)
      return
    }
    if (pointer.kind === 'region-resize') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      setPointer({ kind: 'idle' })
      if (region) {
        void captureFrozenRegion(region.id, region.captureRect)
        setStatus('Region resized · snapshot updated')
      } else {
        setStatus(IDLE_HINT)
      }
      return
    }
    if (pointer.kind === 'placement-resize') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = pointer.arrowId
        ? region?.arrows.find((a) => a.id === pointer.arrowId)
        : undefined
      const regionExpanded =
        !!region &&
        (region.captureRect.x !== pointer.originCaptureRect.x ||
          region.captureRect.y !== pointer.originCaptureRect.y ||
          region.captureRect.width !== pointer.originCaptureRect.width ||
          region.captureRect.height !== pointer.originCaptureRect.height)
      setPointer({ kind: 'idle' })
      if (region && arrow) void upsertArrowPin(region, arrow)
      if (region && regionExpanded) {
        void captureFrozenRegion(region.id, region.captureRect)
      }
      setStatus(IDLE_HINT)
    }
  }

  function clampStencilsToRegion(
    stencils: NonNullable<OverlayRegion['stencils']>,
    regionRect: ScreenRect,
  ): NonNullable<OverlayRegion['stencils']> {
    return stencils.map((item) => {
      const next = clampLocalRectInRegion(item.rect, regionRect)
      return next.x === item.rect.x &&
        next.y === item.rect.y &&
        next.width === item.rect.width &&
        next.height === item.rect.height
        ? item
        : { ...item, rect: next }
    })
  }

  function beginComposeDrag(
    event: React.PointerEvent,
    region: OverlayRegion,
    arrow: OverlayArrow,
  ) {
    const layout = layoutArrowCompose(region, arrow)
    event.preventDefault()
    event.stopPropagation()
    setFocusedRegionIds([region.id])
    setActiveArrowId(arrow.id)
    const pt = stagePoint(event)
    setPointer({
      kind: 'compose-drag',
      regionId: region.id,
      arrowId: arrow.id,
      grabOffset: {
        x: pt.x - layout.card.x,
        y: pt.y - layout.card.y,
      },
      panelWidth: layout.card.width,
      panelHeight: layout.card.height,
    })
    stageRef.current?.setPointerCapture?.(event.pointerId)
  }

  const arrowComposes = useMemo(() => {
    const items: Array<{ region: OverlayRegion; arrow: OverlayArrow }> = []
    for (const region of regions) {
      for (const arrow of region.arrows) {
        items.push({ region, arrow })
      }
    }
    return items
  }, [regions])

  const liveArrow =
    pointer.kind === 'arrow'
      ? (() => {
          const region = regions.find((r) => r.id === pointer.regionId)
          if (!region || !pointer.lockedAnchor) return null
          const headAnchor = toEdgeAnchor(pointer.lockedAnchor)
          const head = relativePointForAnchor(headAnchor)
          return {
            head: relativeToClient(region.captureRect, head),
            tail: relativeToClient(region.captureRect, pointer.liveTail),
            color: colorForArrowIndex(region.arrows.length + 1),
            index: region.arrows.length + 1,
            headAnchor,
          }
        })()
      : null

  const stageScale = fitScale * zoom
  const scaledW = viewport.width * stageScale
  const scaledH = viewport.height * stageScale
  const panning = pointer.kind === 'pan'
  const pannable = zoom > 1.001
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className={styles.canvasShell}>
      <div className={styles.bannerRow}>
        <div className={styles.banner}>{status}</div>
        <div
          className={styles.zoomControls}
          role="group"
          aria-label={ts('spatialCaptures.zoomLevel')}
        >
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label={ts('spatialCaptures.zoomOut')}
            disabled={zoom <= CAPTURE_ZOOM_MIN + 0.001}
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus size={14} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.zoomLabel}
            aria-label={ts('spatialCaptures.zoomReset')}
            title={ts('spatialCaptures.zoomReset')}
            onClick={resetZoom}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label={ts('spatialCaptures.zoomIn')}
            disabled={zoom >= CAPTURE_ZOOM_MAX - 0.001}
            onClick={() => zoomBy(1.25)}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.zoomBtn}${libraryRevealed || placeDrag ? ` ${styles.zoomBtnActive}` : ''}`}
            aria-label={ts('spatialCaptures.stencilOpen')}
            aria-pressed={libraryOpen}
            title={ts('spatialCaptures.stencilEdgeHint')}
            onClick={() => {
              if (libraryOpen) {
                exitStencilChrome()
                return
              }
              setLibraryOpen(true)
            }}
          >
            <LayoutTemplate size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <StencilLibrary
        open={libraryOpen}
        collapseToken={libraryCollapseToken}
        draggingStencilId={placeDrag?.stencilId ?? null}
        repoDesignSystem={repoDesignSystem}
        strings={stencilStrings}
        onRevealChange={setLibraryRevealed}
        onClose={() => {
          exitStencilChrome()
        }}
        onPlaceDragStart={beginPlaceDrag}
      />

      {placeDrag?.active ? (
        <div
          className={styles.stencilDragGhost}
          style={{ left: placeDrag.clientX, top: placeDrag.clientY }}
          aria-hidden
        >
          <StencilPreviewVisual
            stencilId={placeDrag.stencilId}
            category={
              stencilDefinition(placeDrag.stencilId)?.category ?? 'base'
            }
            title={stencilTitle(placeDrag.stencilId)}
          />
          <span className={styles.stencilDragGhostLabel}>
            {stencilStrings.dragHint}
          </span>
        </div>
      ) : null}

      <div
        ref={viewportHostRef}
        className={styles.stageViewport}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={styles.stageScaler}
          style={{
            width: scaledW,
            height: scaledH,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            ref={stageRef}
            className={`overlay-root overlay-root-embedded${
              pointer.kind === 'compose-drag' ? ' overlay-root-dragging' : ''
            }${pannable ? ` ${styles.stagePannable}` : ''}${
              panning ? ` ${styles.stagePanning}` : ''
            }`}
            style={{
              width: viewport.width,
              height: viewport.height,
              transform: `scale(${stageScale})`,
              transformOrigin: 'top left',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {backdropUrl ? (
              <img
                src={backdropUrl}
                alt=""
                draggable={false}
                className={styles.backdrop}
                style={{ width: viewport.width, height: viewport.height }}
              />
            ) : (
              <div className="overlay-dim" />
            )}

            <button
              type="button"
              className="overlay-dismiss"
              aria-label="Exit Spatial Capture"
              title="Exit (Esc)"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onExit()}
            >
              <X size={14} strokeWidth={2.25} aria-hidden />
              <span>Exit</span>
            </button>

            {draftRect ? (
              <div
                className="overlay-selection"
                style={{
                  left: draftRect.x,
                  top: draftRect.y,
                  width: draftRect.width,
                  height: draftRect.height,
                }}
              />
            ) : null}

            {regions.map((region) => (
              <FrozenRegionView
                key={region.id}
                region={region}
                focused={isRegionFocused(focusedRegionIds, region.id)}
                onClearDraw={() => clearDraw(region.id)}
                onDelete={() => deleteRegion(region.id)}
                onSetTool={(tool) => setRegionTool(region.id, tool)}
              />
            ))}

            {regions.map((region) =>
              (region.stencils ?? []).map((placement) => {
                const box = stageRectForPlacement(region, placement)
                const focused = isRegionFocused(focusedRegionIds, region.id)
                const active =
                  focused ||
                  (placement.arrowId != null &&
                    placement.arrowId === activeArrowId)
                return (
                  <StencilLiveStub
                    key={placement.id}
                    stencilId={placement.stencilId}
                    dimmed={!active}
                    style={{
                      left: box.x,
                      top: box.y,
                      width: box.width,
                      height: box.height,
                    }}
                    onMovePointerDown={(event) =>
                      beginPlacementDrag(event, region, placement.id)
                    }
                  />
                )
              }),
            )}

            {regions.map((region) => {
              const focused = isRegionFocused(focusedRegionIds, region.id)
              if (region.tool === 'draw') return null
              const stencilHandles = (region.stencils ?? []).filter(
                (placement) =>
                  focused ||
                  (placement.arrowId != null &&
                    placement.arrowId === activeArrowId) ||
                  (pointer.kind === 'placement-resize' &&
                    pointer.placementId === placement.id),
              )
              if (
                stencilHandles.length === 0 &&
                !(focused && !region.hideSelectionChrome)
              ) {
                return null
              }
              return (
                <div key={`resize-${region.id}`}>
                  {focused && !region.hideSelectionChrome
                    ? RESIZE_HANDLES.map((handle) => {
                        const p = resizeHandleScreenPoint(
                          region.captureRect,
                          handle,
                        )
                        return (
                          <button
                            key={handle}
                            type="button"
                            className="overlay-resize-handle"
                            data-handle={handle}
                            style={{ left: p.x, top: p.y }}
                            aria-label={`Resize region ${handle}`}
                            onPointerDown={(event) =>
                              beginRegionResize(event, region, handle)
                            }
                          />
                        )
                      })
                    : null}
                  {stencilHandles.map((placement) => {
                    const box = stageRectForPlacement(region, placement)
                    return RESIZE_HANDLES.map((handle) => {
                      const p = resizeHandleScreenPoint(box, handle)
                      return (
                        <button
                          key={`${placement.id}-${handle}`}
                          type="button"
                          className="overlay-resize-handle"
                          data-handle={handle}
                          style={{ left: p.x, top: p.y }}
                          aria-label={`Resize stencil ${handle}`}
                          onPointerDown={(event) =>
                            beginPlacementResize(
                              event,
                              region,
                              placement.id,
                              handle,
                            )
                          }
                        />
                      )
                    })
                  })}
                </div>
              )
            })}

            <svg className="overlay-arrows-layer" aria-hidden>
              {regions.map((region) =>
                region.arrows.map((arrow) => {
                  const layout = layoutArrowCompose(region, arrow)
                  const conn = resolveArrowEdgeConnection(
                    region,
                    arrow,
                    layout.card,
                  )
                  const focused = isRegionFocused(focusedRegionIds, region.id)
                  return (
                    <g
                      key={arrow.id}
                      className={focused ? undefined : 'overlay-arrow-dimmed'}
                    >
                      <ComposeArrowPath
                        head={conn.headScreen}
                        tail={conn.attachScreen}
                        color={arrow.color}
                        index={arrow.index}
                        headAnchor={conn.targetAnchor}
                        tailAnchor={conn.cardAnchor}
                        obstacles={conn.obstacles}
                      />
                    </g>
                  )
                }),
              )}
              {liveArrow ? (
                <ComposeArrowPath
                  head={liveArrow.head}
                  tail={liveArrow.tail}
                  color={liveArrow.color}
                  index={liveArrow.index}
                  headAnchor={liveArrow.headAnchor}
                  preview
                />
              ) : null}
            </svg>

            {regions.map((region) =>
              region.arrows.map((arrow) => {
                const layout = layoutArrowCompose(region, arrow)
                const conn = resolveArrowEdgeConnection(
                  region,
                  arrow,
                  layout.card,
                )
                const { mid } = routeComposeArrowCurve({
                  from: conn.attachScreen,
                  to: conn.headScreen,
                  fromAnchor: conn.cardAnchor,
                  toAnchor: conn.targetAnchor,
                  obstacles: conn.obstacles,
                })
                const midX = mid.x
                const midY = mid.y
                const focused = isRegionFocused(focusedRegionIds, region.id)
                return (
                  <button
                    key={`hit-${arrow.id}`}
                    type="button"
                    className={`overlay-arrow-hit${
                      focused ? '' : ' overlay-arrow-hit-dimmed'
                    }`}
                    style={{ left: midX, top: midY }}
                    aria-label={`Edit arrow ${arrow.index}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setFocusedRegionIds([region.id])
                      setActiveArrowId(arrow.id)
                      updateRegion(region.id, { showAnchors: false })
                      requestAnimationFrame(() => promptRef.current?.focus())
                    }}
                  />
                )
              }),
            )}

            {arrowComposes.map(({ region, arrow }) => {
              const focused = isRegionFocused(focusedRegionIds, region.id)
              const isActive = arrow.id === activeArrowId
              const layout = layoutArrowCompose(region, arrow)
              const modeVisual =
                MODES.find((item) => item.id === region.mode) ?? MODES[1]!
              const ModeIcon = modeVisual.icon
              const hub = enrichHubForArrow(arrow.id, region)
              return (
                <SpatialComposeHub
                  key={`compose-${arrow.id}`}
                  card={layout.card}
                  expanded={Boolean(isActive && focused)}
                  hub={hub}
                  onHubChange={(next) =>
                    setHubByArrow((prev) => ({ ...prev, [arrow.id]: next }))
                  }
                  subagentLinks={subagentLinksByArrow[arrow.id]}
                  promptText={arrow.prompt}
                  researchLines={researchLinesByArrow[arrow.id] ?? []}
                  onResearchLinesChange={(lines) =>
                    setResearchLinesByArrow((prev) => ({
                      ...prev,
                      [arrow.id]: lines,
                    }))
                  }
                  dataSource={hubDataSource}
                  resolveAssetUrl={(path) => assetUrls[path]}
                  strings={composeHubStrings}
                >
                <div
                  ref={bindPanel(arrow.id)}
                  className={`overlay-panel overlay-panel-chrome${
                    focused ? '' : ' overlay-panel-dimmed'
                  }`}
                  style={{
                    left: layout.card.x,
                    top: layout.card.y,
                    width: layout.card.width,
                  }}
                  data-attach={layout.attach}
                  data-compose-arrow={arrow.id}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setFocusedRegionIds([region.id])
                    setActiveArrowId(arrow.id)
                  }}
                >
                  {flows[arrow.id] ? (
                    <ComposeFlowDrawer
                      steps={flows[arrow.id]!.steps}
                      phase={flows[arrow.id]!.phase}
                    />
                  ) : null}
                  <div
                    className="overlay-panel-header overlay-panel-drag-handle"
                    title="Drag to move card and arrow tip"
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement
                      if (
                        target.closest('button') ||
                        target.closest('select') ||
                        target.closest('textarea')
                      ) {
                        return
                      }
                      beginComposeDrag(event, region, arrow)
                    }}
                  >
                    <span
                      className="overlay-arrow-badge"
                      style={{ background: arrow.color }}
                      aria-hidden
                    >
                      {arrow.index}
                    </span>
                    <span className="overlay-panel-title">Arrow prompt</span>
                    <button
                      type="button"
                      className="overlay-icon-btn"
                      aria-label="Remove arrow"
                      title="Remove arrow"
                      onClick={() => deleteArrow(region.id, arrow.id)}
                    >
                      <X size={14} strokeWidth={2} aria-hidden />
                    </button>
                  </div>

                  <div className="overlay-compose-row">
                    <div className="overlay-composer">
                      <div className="overlay-composer-body">
                        <textarea
                          ref={isActive ? promptRef : undefined}
                          className="overlay-prompt"
                          rows={2}
                          value={arrow.prompt}
                          placeholder={
                            region.mode === 'ask'
                              ? 'Ask about this callout…'
                              : region.mode === 'plan'
                                ? 'Describe the plan for this callout…'
                                : region.mode === 'debug'
                                  ? 'Describe the bug for this callout…'
                                  : 'Describe what to change…'
                          }
                          onChange={(event) => {
                            const value = event.target.value
                            updateRegion(region.id, (r) => ({
                              ...r,
                              arrows: r.arrows.map((a) =>
                                a.id === arrow.id
                                  ? { ...a, prompt: value }
                                  : a,
                              ),
                            }))
                          }}
                          onFocus={() => {
                            setFocusedRegionIds([region.id])
                            setActiveArrowId(arrow.id)
                          }}
                          onKeyDown={(event) => {
                            if (
                              (event.metaKey || event.ctrlKey) &&
                              event.key === 'Enter'
                            ) {
                              event.preventDefault()
                              void onSubmitArrow(region.id, arrow.id)
                            }
                          }}
                        />
                        {placementsForArrow(region, arrow.id).length > 0 ? (
                          <StencilComposeExtras
                            region={region}
                            arrowId={arrow.id}
                            strings={stencilStrings}
                            brief={
                              stencilBriefByArrow[arrow.id] ??
                              combinedBriefForArrow(region, arrow.id) ??
                              ''
                            }
                            scope={
                              stencilScopeByArrow[arrow.id] ??
                              DEFAULT_STENCIL_SCOPE
                            }
                            onBriefChange={(value) => {
                              setStencilBriefByArrow((prev) => ({
                                ...prev,
                                [arrow.id]: value,
                              }))
                              updateRegion(region.id, (r) => ({
                                ...r,
                                stencils: (r.stencils ?? []).map((item) =>
                                  item.arrowId === arrow.id
                                    ? { ...item, briefOverride: value }
                                    : item,
                                ),
                              }))
                            }}
                            onScopeChange={(value) => {
                              setStencilScopeByArrow((prev) => ({
                                ...prev,
                                [arrow.id]: value,
                              }))
                            }}
                            onPlacementsChange={(stencils) => {
                              updateRegion(region.id, { stencils })
                            }}
                            onFocus={() => {
                              setFocusedRegionIds([region.id])
                              setActiveArrowId(arrow.id)
                              ensureBriefState(arrow.id, region)
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="overlay-composer-footer">
                        <div className="overlay-toolbar-left">
                          <div className="overlay-menu-wrap">
                            <button
                              type="button"
                              className={`overlay-chip overlay-chip-mode ${modeVisual.toneClass}`}
                              aria-expanded={openMenu === 'mode' && isActive}
                              aria-haspopup="listbox"
                              onClick={() => {
                                setActiveArrowId(arrow.id)
                                setFocusedRegionIds([region.id])
                                setOpenMenu((current) =>
                                  current === 'mode' && isActive
                                    ? null
                                    : 'mode',
                                )
                              }}
                            >
                              <ModeIcon
                                size={13}
                                strokeWidth={2}
                                aria-hidden
                              />
                              <span className="overlay-chip-label">
                                {modeVisual.label}
                              </span>
                              <ChevronDown
                                size={12}
                                strokeWidth={2}
                                className="overlay-chip-caret"
                                aria-hidden
                              />
                            </button>
                            {openMenu === 'mode' && isActive ? (
                              <div
                                className="overlay-dropdown overlay-dropdown-up"
                                role="listbox"
                              >
                                {MODES.map((item) => {
                                  const Icon = item.icon
                                  const active = item.id === region.mode
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      role="option"
                                      aria-selected={active}
                                      className={`overlay-menu-item ${item.toneClass}${
                                        active
                                          ? ' overlay-menu-item-active'
                                          : ''
                                      }`}
                                      onClick={() => {
                                        updateRegion(region.id, {
                                          mode: item.id,
                                        })
                                        setOpenMenu(null)
                                      }}
                                    >
                                      <Icon
                                        size={14}
                                        strokeWidth={2}
                                        className="overlay-menu-item-icon"
                                        aria-hidden
                                      />
                                      {item.label}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                          <ResearchToggle
                            enabled={hub.researchEnabled}
                            onChange={(next) =>
                              setHubByArrow((prev) => ({
                                ...prev,
                                [arrow.id]: {
                                  ...ensureHub(prev[arrow.id]),
                                  researchEnabled: next,
                                },
                              }))
                            }
                            strings={composeHubStrings}
                          />
                        </div>
                        <button
                          type="button"
                          className="overlay-send"
                          disabled={
                            arrow.status === 'submitting' ||
                            !arrow.prompt.trim()
                          }
                          aria-label={
                            arrow.status === 'submitting'
                              ? 'Sending'
                              : 'Submit'
                          }
                          title="Submit (⌘↵)"
                          onClick={() =>
                            void onSubmitArrow(region.id, arrow.id)
                          }
                        >
                          <Send size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </SpatialComposeHub>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function FrozenRegionView({
  region,
  focused,
  onClearDraw,
  onDelete,
  onSetTool,
}: {
  region: OverlayRegion
  focused: boolean
  onClearDraw: () => void
  onDelete: () => void
  onSetTool: (tool: RegionTool) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = Math.max(1, Math.floor(region.captureRect.width))
    canvas.height = Math.max(1, Math.floor(region.captureRect.height))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of region.drawStrokes) {
      if (stroke.kind !== 'pen') continue
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * canvas.width
        const y = point.y * canvas.height
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }, [region.drawStrokes, region.captureRect])

  // Vertical stack at the region's bottom-right corner (just outside).
  const toolStackHeight = 26 * 3 + 4 * 2
  const btnLeft = region.captureRect.x + region.captureRect.width + 6
  const btnTop =
    region.captureRect.y + region.captureRect.height - toolStackHeight

  if (region.hideSelectionChrome) {
    // Full-screenshot stencil backdrop: no selection frame / anchors / tools.
    return (
      <div
        className="overlay-selection-chrome-hidden"
        style={{
          position: 'absolute',
          left: region.captureRect.x,
          top: region.captureRect.y,
          width: region.captureRect.width,
          height: region.captureRect.height,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <canvas
          ref={canvasRef}
          className="overlay-canvas"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    )
  }

  return (
    <>
      <div
        className={`overlay-selection overlay-selection-compose${
          focused ? '' : ' overlay-selection-dimmed'
        }`}
        style={{
          left: region.captureRect.x,
          top: region.captureRect.y,
          width: region.captureRect.width,
          height: region.captureRect.height,
        }}
      >
        <canvas
          ref={canvasRef}
          className="overlay-canvas"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {region.showAnchors && focused
        ? listRegionAnchors(region.captureRect).map((item) => (
            <span
              key={item.anchor}
              className="overlay-anchor-dot"
              style={{ left: item.screen.x, top: item.screen.y }}
              aria-hidden
            />
          ))
        : null}

      {region.flowComplete && focused ? (
        <div
          className="overlay-region-tools"
          style={{ left: btnLeft, top: btnTop }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`overlay-region-tool-btn${
              region.tool === 'draw' ? ' overlay-region-tool-btn-active' : ''
            }`}
            title="Draw"
            aria-label="Draw"
            onClick={() => onSetTool(region.tool === 'draw' ? 'arrow' : 'draw')}
          >
            <Pencil size={12} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="overlay-region-tool-btn"
            title="Clear drawings"
            aria-label="Clear drawings"
            onClick={onClearDraw}
          >
            <Eraser size={12} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="overlay-region-tool-btn overlay-region-tool-btn-danger"
            title="Delete region"
            aria-label="Delete region"
            onClick={onDelete}
          >
            <Trash2 size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  )
}

