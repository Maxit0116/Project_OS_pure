import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  ChevronDown,
  Eraser,
  LayoutTemplate,
  ListTree,
  MessageCircle,
  Pencil,
  Send,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import type {
  AnnotationStroke,
  LocationKey,
  PinComposerHub,
  PinComposerHubSubagentLink,
  ScreenRect,
  SpatialPin,
  SpatialPinDeviceKind,
  SpatialPinMode,
  SpatialPinProjectCandidate,
} from '@contracts/spatial-pin'
import {
  createArrowStroke,
  createDraftSpatialPin,
  emptyAnnotationDoc,
  emptyPinComposerHub,
  isWebSurface,
} from '@contracts/spatial-pin'
import {
  ensureHub,
  ResearchToggle,
  SpatialComposeHub,
  type ComposeHubDataSource,
} from '../components/SpatialComposeHub'
import type { RepoDesignSystemSnapshot } from '@contracts/repo-design-system'
import {
  MAX_STENCILS_PER_REGION,
  type StencilGenerationScope,
} from '@contracts/ui-stencil'
import StencilLibrary from '../components/SpatialCaptures/stencils/StencilLibrary'
import StencilComposeExtras from '../components/SpatialCaptures/stencils/StencilComposeExtras'
import StencilLiveStub from '../components/SpatialCaptures/stencils/StencilLiveStub'
import StencilPreviewVisual from '../components/SpatialCaptures/stencils/StencilPreviewVisual'
import {
  buildPlacementAtStagePoint,
  combinedBriefForArrow,
  DEFAULT_STENCIL_SCOPE,
  placementsForArrow,
  stageRectForPlacement,
  stencilDefinition,
  stencilTitle,
} from '../components/SpatialCaptures/stencils/placeStencil'
import {
  formatStencilString,
  STENCIL_UI_STRINGS_EN,
} from '../components/SpatialCaptures/stencils/stencilStrings'
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
} from '../components/SpatialCaptures/stencils/regionDrag'
import stencilPlacementStyles from '../components/SpatialCaptures/SpatialCaptureOverlay.module.css'
import ComposeArrowPath from './ComposeArrowPath'
import { routeComposeArrowCurve } from './composeArrowCurve'
import {
  applyRunEventToCompactFlow,
} from './coarseFlow'
import type { CoarseFlowLabel, CompactFlowStep } from './coarseFlow'
import ComposeFlowDrawer from './ComposeFlowDrawer'
import {
  colorForArrowIndex,
  hitTestAnchor,
  nearestAnchorToRelative,
  renumberArrows,
} from './arrowGeometry'
import {
  cardPinnedToTip,
  composeAttachScreenPoint,
  estimateComposePanelHeight,
  layoutComposeForArrow,
  type ComposeLayoutResult,
} from './composeLayout'
import { resolveArrowEdgeConnection } from './composeConnection'
import {
  resolveComposePanelSize,
  useComposePanelMetrics,
} from './useComposePanelMetrics'
import {
  focusIdsForClick,
  isCompleteCaptureRegion,
  isOutsideAllRegions,
  isRegionFocused,
  type OverlayArrow,
  type OverlayRegion,
  type RegionTool,
} from './overlayRegions'
import {
  clampRelativeInRect,
  clientToRelative,
  listRegionAnchors,
  pointInRect,
  relativePointForAnchor,
  relativeToClient,
  toEdgeAnchor,
} from './regionAnchors'
import { buildCaptureSessionFromOverlay } from './captureSessionSerialize'

type OpenMenu = 'mode' | null

type PointerMode =
  | { kind: 'idle' }
  | { kind: 'selecting'; origin: { x: number; y: number } }
  | {
      kind: 'arrow'
      regionId: string
      /** Locked head when dragging from an anchor; null = nearest-to-tail mode. */
      lockedAnchor: OverlayArrow['anchor'] | null
      liveTail: { x: number; y: number }
    }
  | {
      kind: 'draw'
      regionId: string
      strokeId: string
    }
  | {
      kind: 'compose-drag'
      regionId: string
      arrowId: string
      /** Pointer offset from card top-left at drag start. */
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

interface BridgeLocation {
  surface?: LocationKey['surface']
  url?: string
  routePath?: string
  selector?: string
  axName?: string
  textHint?: string
  bounds?: ScreenRect
  projectId?: string
  workspacePath?: string
}

interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export function OverlayApp() {
  const [displayBounds, setDisplayBounds] = useState<DisplayBounds | null>(null)
  const [regions, setRegions] = useState<OverlayRegion[]>([])
  const [focusedRegionIds, setFocusedRegionIds] = useState<string[]>([])
  /** Arrow whose big compose card is open (shown only after an arrow is committed). */
  const [activeArrowId, setActiveArrowId] = useState<string | null>(null)
  const [draftRect, setDraftRect] = useState<ScreenRect | null>(null)
  const [pointer, setPointer] = useState<PointerMode>({ kind: 'idle' })
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
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
  const [projectId, setProjectId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SpatialPinProjectCandidate[]>([])
  const [location, setLocation] = useState<LocationKey | null>(null)
  const [webEnhanceAvailable, setWebEnhanceAvailable] = useState(false)
  const [status, setStatus] = useState('Drag to select a region on any screen')
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [flow, setFlow] = useState<CoarseFlowLabel | null>(null)
  const [flowSteps, setFlowSteps] = useState<CompactFlowStep[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [visiblePins, setVisiblePins] = useState<
    Array<{ pin: SpatialPin; rect?: ScreenRect; confidence: string }>
  >([])

  const rootRef = useRef<HTMLDivElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const { metrics: panelMetrics, bindPanel } = useComposePanelMetrics()
  const projectIdRef = useRef<string | null>(null)
  const locationRef = useRef<LocationKey | null>(null)
  const regionsRef = useRef(regions)
  /** Invalidate in-flight library→canvas pointer listeners (Esc / close). */
  const placeDragSessionRef = useRef(0)
  const snapshotByRegionRef = useRef<Map<string, string>>(new Map())
  /** In-memory session id for this overlay open; written to disk only on Esc solidify. */
  const captureSessionIdRef = useRef<string | null>(null)
  const captureSessionCreatedAtRef = useRef<string | null>(null)
  const backdropAssetPathRef = useRef<string | undefined>(undefined)
  const displayBoundsRef = useRef<DisplayBounds | null>(null)
  const solidifyingRef = useRef(false)
  const solidifyThenHideRef = useRef<() => Promise<void>>(async () => {})
  /** Bumped on each beginCapture so we can signal main after the reset commit paints. */
  const [captureEpoch, setCaptureEpoch] = useState(0)
  const captureEpochRef = useRef(0)

  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

  useEffect(() => {
    if (!libraryRevealed || !projectId || !window.projectOS) return
    let cancelled = false
    void window.projectOS
      .invoke('getRepoDesignSystem', projectId)
      .then((snapshot) => {
        if (!cancelled) {
          setRepoDesignSystem(snapshot as RepoDesignSystemSnapshot)
        }
      })
      .catch(() => {
        if (!cancelled) setRepoDesignSystem(null)
      })
    return () => {
      cancelled = true
    }
  }, [libraryRevealed, projectId])

  useEffect(() => {
    locationRef.current = location
  }, [location])
  useEffect(() => {
    regionsRef.current = regions
  }, [regions])
  const focusedRegionIdsRef = useRef(focusedRegionIds)
  useEffect(() => {
    focusedRegionIdsRef.current = focusedRegionIds
  }, [focusedRegionIds])
  useEffect(() => {
    displayBoundsRef.current = displayBounds
  }, [displayBounds])

  useEffect(() => {
    const bridge = window.projectOS
    if (!bridge?.spatialPin) return

    const beginDisp = bridge.spatialPin.onBeginCapture((payload) => {
      setDisplayBounds(payload.displayBounds)
      displayBoundsRef.current = payload.displayBounds
      setRegions([])
      setFocusedRegionIds([])
      setActiveArrowId(null)
      setDraftRect(null)
      setPointer({ kind: 'idle' })
      setFlow(null)
      setFlowSteps([])
      setActiveRunId(null)
      setOpenMenu(null)
      snapshotByRegionRef.current.clear()
      captureSessionIdRef.current = randomId('capture')
      captureSessionCreatedAtRef.current = new Date().toISOString()
      backdropAssetPathRef.current = undefined
      solidifyingRef.current = false
      setSavePromptOpen(false)
      setStatus('Drag any on-screen region · Esc to cancel')
      void refreshContext()
      // Defer ready until useLayoutEffect sees this epoch (post-commit).
      setCaptureEpoch((n) => n + 1)
    })
    const locDisp = bridge.spatialPin.onLocation((payload) => {
      const loc = payload as BridgeLocation
      if (
        loc.url?.startsWith('http') ||
        loc.surface === 'chrome' ||
        loc.surface === 'projectos-browser'
      ) {
        void refreshContext()
        void resolvePins(loc)
      }
    })
    const hideDisp = bridge.spatialPin.onRequestHide?.(() => {
      void solidifyThenHideRef.current()
    })
    void refreshContext()
    // Re-request beginCapture in case main emitted before this listener attached.
    bridge.spatialPin.notifyOverlayMounted?.()
    return () => {
      beginDisp.dispose()
      locDisp.dispose()
      hideDisp?.dispose()
    }
  }, [])

  // After beginCapture state is committed and painted (useEffect runs post-paint),
  // tell main it is safe to raise opacity (avoids stale-session flash).
  useEffect(() => {
    if (captureEpoch === 0) return
    if (captureEpoch === captureEpochRef.current) return
    captureEpochRef.current = captureEpoch
    // One extra frame so the browser has composited the cleared DOM.
    const id = requestAnimationFrame(() => {
      window.projectOS?.spatialPin.notifyOverlayReady?.()
    })
    return () => cancelAnimationFrame(id)
  }, [captureEpoch])

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
    setStatus('Drag to select a region on any screen')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
        void solidifyThenHideRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openMenu, placeDrag, libraryOpen, libraryRevealed, activeArrowId])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: PointerEvent) => {
      const panel = activeArrowId
        ? rootRef.current?.querySelector(
            `[data-compose-arrow="${CSS.escape(activeArrowId)}"]`,
          )
        : null
      if (panel?.contains(event.target as Node)) return
      setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [openMenu, activeArrowId])

  useEffect(() => {
    if (!activeRunId || !window.projectOS) return
    const disposable = window.projectOS.onRunEvent((runId, event) => {
      if (runId !== activeRunId) return
      setFlowSteps((prev) => {
        const applied = applyRunEventToCompactFlow(prev, event)
        if (applied.phase) {
          queueMicrotask(() => setFlow(applied.phase))
        }
        return applied.steps
      })
      if (
        event &&
        typeof event === 'object' &&
        'type' in event &&
        (event.type === 'run_completed' || event.type === 'step_failed')
      ) {
        setStatus(event.type === 'run_completed' ? 'Done' : 'Error')
      }
    })
    void window.projectOS.streamSubscribe(activeRunId)
    return () => {
      disposable.dispose()
      void window.projectOS?.streamUnsubscribe(activeRunId)
    }
  }, [activeRunId])

  async function refreshContext(): Promise<string | null> {
    const ctx = await window.projectOS?.spatialPin.getContext()
    if (!ctx) return null
    const pid = ctx.projectId ?? null
    if (pid) {
      setProjectId(pid)
      projectIdRef.current = pid
    }
    setCandidates((ctx.candidates ?? []) as SpatialPinProjectCandidate[])
    if (ctx.location && typeof ctx.location === 'object') {
      const loc = ctx.location as LocationKey
      setLocation(loc)
      locationRef.current = loc
    }
    setWebEnhanceAvailable(Boolean(ctx.webEnhanceAvailable))
    return pid
  }

  async function onSelectProject(nextProjectId: string) {
    const session = await window.projectOS?.spatialPin.setPreferredProject(
      nextProjectId,
    )
    if (!session) return
    setProjectId(session.projectId)
    projectIdRef.current = session.projectId
    setCandidates((session.candidates ?? []) as SpatialPinProjectCandidate[])
    if (session.location && typeof session.location === 'object') {
      const loc = session.location as LocationKey
      setLocation(loc)
      locationRef.current = loc
    }
    setWebEnhanceAvailable(Boolean(session.webEnhanceAvailable))
  }

  useEffect(() => {
    if (!projectId || !window.projectOS) return
    const paths = new Set<string>()
    for (const region of regions) {
      if (region.snapshotAssetPath) paths.add(region.snapshotAssetPath)
    }
    for (const hub of Object.values(hubByArrow)) {
      for (const ref of hub.references) {
        if (ref.kind === 'image') paths.add(ref.assetPath)
      }
    }
    let cancelled = false
    for (const path of paths) {
      if (assetUrls[path]) continue
      void window.projectOS
        .invoke('readProjectAssetBase64', projectId, path)
        .then((result) => {
          const payload = result as { base64: string; mimeType: string } | null
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
  }, [projectId, regions, hubByArrow, assetUrls])

  const hubDataSource = useMemo((): ComposeHubDataSource => {
    return {
      listSkills: async () => {
        if (!projectId || !window.projectOS) return []
        const result = (await window.projectOS.invoke(
          'listSkills',
          projectId,
        )) as { skills: Array<{ id: string; name: string; description: string }> }
        return (result.skills ?? []).map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
        }))
      },
      listDirectories: async (relativePath) => {
        if (!projectId || !window.projectOS) return []
        const entries = (await window.projectOS.invoke(
          'listWorkspaceDirectory',
          projectId,
          relativePath,
        )) as Array<{ name: string; path: string; kind: string }>
        return entries
          .filter((entry) => entry.kind === 'directory')
          .map((entry) => ({ name: entry.name, path: entry.path }))
      },
      listMentionFiles: async (query) => {
        if (!projectId || !window.projectOS) return []
        const result = (await window.projectOS.invoke(
          'getComposerMentions',
          projectId,
          query,
        )) as { files: string[] }
        return result.files ?? []
      },
      getGitStatus: async () => {
        if (!projectId || !window.projectOS) {
          return { branch: null, dirty: false }
        }
        return (await window.projectOS.invoke(
          'getWorkspaceGitStatus',
          projectId,
        )) as { branch: string | null; dirty: boolean }
      },
      listRepoCandidates: async () =>
        candidates.map((item) => ({
          projectId: item.projectId,
          displayName: item.displayName,
        })),
      onSelectRepo: async (nextProjectId) => {
        await onSelectProject(nextProjectId)
      },
      resolveAssetUrl: (assetPath) => assetUrls[assetPath],
    }
  }, [projectId, candidates, assetUrls])

  async function resolvePins(hint: BridgeLocation) {
    const pid = projectIdRef.current ?? (await refreshContext())
    if (!pid || !hint.url || !window.projectOS) return
    const resolved = (await window.projectOS.invoke(
      'resolveSpatialPins',
      pid,
      {
        url: hint.url,
        routePath: hint.routePath,
        selector: hint.selector,
        textHint: hint.textHint,
        axName: hint.axName,
        surface: hint.surface,
        viewportRect: hint.bounds,
        workspacePath: hint.workspacePath ?? locationRef.current?.workspacePath,
      },
    )) as Array<{
      pin: SpatialPin
      confidence: string
      rect?: ScreenRect
    }>
    setVisiblePins(
      resolved.map((item) => ({
        pin: item.pin,
        confidence: item.confidence,
        rect: item.rect ?? item.pin.resolve?.lastRect ?? item.pin.captureRect,
      })),
    )
  }

  function toLocalRect(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): ScreenRect {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    return {
      x,
      y,
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
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

  async function ensureBackdrop(pid: string): Promise<string | undefined> {
    if (backdropAssetPathRef.current) return backdropAssetPathRef.current
    if (!window.projectOS || !captureSessionIdRef.current) return undefined
    const bounds = displayBoundsRef.current
    if (!bounds || bounds.width < 1 || bounds.height < 1) return undefined
    try {
      const full = await window.projectOS.spatialPin.captureSelection({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      })
      if (!full.pngBase64) return undefined
      const saved = (await window.projectOS.invoke(
        'saveSpatialCaptureBackdrop',
        pid,
        captureSessionIdRef.current,
        full.pngBase64,
      )) as { backdropAssetPath: string }
      backdropAssetPathRef.current = saved.backdropAssetPath
      return saved.backdropAssetPath
    } catch {
      return undefined
    }
  }

  async function captureRegion(regionId: string, rect: ScreenRect) {
    const pid = (await refreshContext()) ?? projectIdRef.current
    if (!pid || !window.projectOS) {
      setStatus('Open a Project OS workspace first')
      return
    }

    // Full-desktop backdrop once per overlay session (for IDE frozen replay).
    void ensureBackdrop(pid)

    let loc = locationRef.current
    let captureError: string | undefined
    const capture = await window.projectOS.spatialPin.captureSelection(rect)
    if (capture.error) captureError = capture.error
    if (capture.host && (capture.host.appName || capture.host.deviceKind)) {
      await refreshContext()
      loc = locationRef.current
      if (loc) {
        const hostPatch: Partial<LocationKey> = {
          ...(capture.host.appName ? { appName: capture.host.appName } : {}),
          ...(capture.host.bundleId ? { bundleId: capture.host.bundleId } : {}),
          ...(capture.host.windowTitle
            ? { windowTitle: capture.host.windowTitle }
            : {}),
          ...(capture.host.deviceKind
            ? { deviceKind: capture.host.deviceKind as SpatialPinDeviceKind }
            : {}),
          ...(capture.host.inferredPath
            ? { inferredPath: capture.host.inferredPath }
            : {}),
          ...(capture.host.textHint ? { textHint: capture.host.textHint } : {}),
        }
        loc = { ...loc, ...hostPatch }
        setLocation(loc)
        locationRef.current = loc
      }
    }
    if (!loc) {
      setStatus('Resolving workspace context…')
      return
    }

    // Persist a placeholder pin so snapshot can be saved under a pin id.
    const snapshotPinId = randomId('pin')
    const draft = createDraftSpatialPin({
      id: snapshotPinId,
      projectId: pid,
      location: loc,
      captureRect: rect,
    })
    draft.annotations = emptyAnnotationDoc()
    draft.composer = { mode: 'change', prompt: '' }
    await window.projectOS.invoke('upsertSpatialPin', pid, draft)

    let snapshotAssetPath: string | undefined
    if (capture.pngBase64) {
      try {
        const saved = (await window.projectOS.invoke(
          'saveSpatialPinSnapshot',
          pid,
          snapshotPinId,
          capture.pngBase64,
        )) as { snapshotAssetPath: string }
        snapshotAssetPath = saved.snapshotAssetPath
        snapshotByRegionRef.current.set(regionId, snapshotAssetPath)
        updateRegion(regionId, { snapshotAssetPath })
      } catch {
        captureError = captureError ?? 'Failed to save snapshot'
      }
    }

    const hostChip = formatHostChip(loc)
    const anchorLabel = isWebSurface(loc.surface)
      ? `Web · ${shortUrl(loc.url)}`
      : loc.workspacePath
        ? `Workspace · ${shortPath(loc.workspacePath)}`
        : 'Screen capture'
    setStatus(
      captureError
        ? `${captureError} · ${anchorLabel}${hostChip ? ` · ${hostChip}` : ''}`
        : `Region ready · ${anchorLabel}${hostChip ? ` · ${hostChip}` : ''} · drag arrow from region`,
    )
  }

  async function upsertArrowPin(
    region: OverlayRegion,
    arrow: OverlayArrow,
  ): Promise<void> {
    const pid = projectIdRef.current ?? (await refreshContext())
    const loc = locationRef.current
    if (!pid || !loc || !window.projectOS) return

    const existing = (await window.projectOS.invoke(
      'getSpatialPin',
      pid,
      arrow.pinId,
    )) as SpatialPin | null

    const arrowStroke = createArrowStroke({
      id: arrow.id,
      index: arrow.index,
      color: arrow.color,
      anchor: arrow.anchor,
      head: arrow.head,
      tail: arrow.tail,
    })
    const strokes: AnnotationStroke[] = [
      ...region.drawStrokes,
      arrowStroke,
    ]
    const snapshotAssetPath =
      region.snapshotAssetPath ??
      snapshotByRegionRef.current.get(region.id) ??
      existing?.composer.snapshotAssetPath

    const base =
      existing ??
      createDraftSpatialPin({
        id: arrow.pinId,
        projectId: pid,
        location: loc,
        captureRect: region.captureRect,
      })

    const stencilBrief =
      stencilBriefByArrow[arrow.id]?.trim() ||
      combinedBriefForArrow(region, arrow.id)
    const generationScope =
      stencilScopeByArrow[arrow.id] ?? DEFAULT_STENCIL_SCOPE
    const hub = enrichHubForArrow(arrow.id, region, {
      projectLabel:
        candidates.find((item) => item.projectId === pid)?.displayName ?? pid,
    })

    const updated: SpatialPin = {
      ...base,
      updatedAt: new Date().toISOString(),
      captureRect: region.captureRect,
      composer: {
        mode: region.mode,
        prompt: arrow.prompt,
        ...(snapshotAssetPath ? { snapshotAssetPath } : {}),
        ...(stencilBrief ? { stencilBrief, generationScope } : {}),
        hub,
      },
      annotations: {
        version: '0.1.0',
        strokes,
      },
      title: arrow.prompt.trim().slice(0, 60) || `Arrow #${arrow.index}`,
    }
    await window.projectOS.invoke('upsertSpatialPin', pid, updated)
  }

  function enrichHubForArrow(
    arrowId: string,
    region: OverlayRegion,
    opts: { projectLabel: string },
  ): PinComposerHub {
    const base = ensureHub(hubByArrow[arrowId] ?? emptyPinComposerHub())
    const snapshotAssetPath =
      region.snapshotAssetPath ?? snapshotByRegionRef.current.get(region.id)
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
    return {
      ...base,
      repo: base.repo ?? { label: opts.projectLabel, branch: 'main' },
      references,
    }
  }

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
        width: window.innerWidth,
        height: window.innerHeight,
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
      viewport: { width: window.innerWidth, height: window.innerHeight },
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
      void captureRegion(nextRegion.id, fullRect)
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

  function beginPlacementDrag(
    event: React.PointerEvent,
    region: OverlayRegion,
    placementId: string,
  ) {
    const placement = (region.stencils ?? []).find((item) => item.id === placementId)
    if (!placement) return
    event.preventDefault()
    event.stopPropagation()
    setFocusedRegionIds([region.id])
    if (placement.arrowId) setActiveArrowId(placement.arrowId)
    setPointer({
      kind: 'placement-drag',
      regionId: region.id,
      placementId,
      ...(placement.arrowId ? { arrowId: placement.arrowId } : {}),
      startX: event.clientX,
      startY: event.clientY,
      originRect: placement.rect,
      originCaptureRect: region.captureRect,
    })
    rootRef.current?.setPointerCapture?.(event.pointerId)
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
    rootRef.current?.setPointerCapture?.(event.pointerId)
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
    rootRef.current?.setPointerCapture?.(event.pointerId)
    setStatus('Drag corner to resize stencil')
  }

  function beginPlaceDrag(
    stencilId: string,
    clientX: number,
    clientY: number,
  ) {
    const sessionId = ++placeDragSessionRef.current
    setPlaceDrag({ stencilId, clientX, clientY, active: false })
    setStatus(
      formatStencilString(STENCIL_UI_STRINGS_EN.armed, {
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
      if (active) {
        placeStencil(stencilId, { x: event.clientX, y: event.clientY })
        return
      }
      const focused = regionsRef.current.find((r) =>
        focusedRegionIdsRef.current.includes(r.id),
      )
      const target = focused
        ? {
            x: focused.captureRect.x + focused.captureRect.width / 2,
            y: focused.captureRect.y + focused.captureRect.height / 2,
          }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      placeStencil(stencilId, target)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function solidifyCaptureSession(): Promise<void> {
    const regions = regionsRef.current
    if (regions.length === 0) return
    const pid = projectIdRef.current ?? (await refreshContext())
    const loc = locationRef.current
    const sessionId = captureSessionIdRef.current
    const bounds = displayBoundsRef.current
    if (!pid || !loc || !sessionId || !bounds || !window.projectOS) return

    const backdrop =
      backdropAssetPathRef.current ?? (await ensureBackdrop(pid))

    for (const region of regions) {
      const snapshotAssetPath =
        region.snapshotAssetPath ??
        snapshotByRegionRef.current.get(region.id)
      for (const arrow of region.arrows) {
        try {
          await upsertArrowPin(
            { ...region, ...(snapshotAssetPath ? { snapshotAssetPath } : {}) },
            arrow,
          )
        } catch {
          /* best-effort flush */
        }
      }
    }

    const session = buildCaptureSessionFromOverlay({
      id: sessionId,
      projectId: pid,
      location: loc,
      viewport: { width: bounds.width, height: bounds.height },
      regions,
      ...(backdrop ? { backdropAssetPath: backdrop } : {}),
      ...(captureSessionCreatedAtRef.current
        ? { createdAt: captureSessionCreatedAtRef.current }
        : {}),
    })
    await window.projectOS.invoke('upsertSpatialCaptureSession', pid, session)
    window.projectOS.spatialPin.notifySessionSolidified?.(sessionId)
  }

  async function hideOverlayOnly(): Promise<void> {
    if (solidifyingRef.current) return
    solidifyingRef.current = true
    try {
      await window.projectOS?.spatialPin.hideOverlay()
    } finally {
      solidifyingRef.current = false
      setSavePromptOpen(false)
    }
  }

  async function solidifyThenHide(): Promise<void> {
    if (solidifyingRef.current) return
    solidifyingRef.current = true
    setSavePromptOpen(false)
    try {
      await solidifyCaptureSession()
    } catch {
      /* still dismiss — never block Esc on flush failure */
    }
    try {
      await window.projectOS?.spatialPin.hideOverlay()
    } finally {
      solidifyingRef.current = false
    }
  }

  /** Esc / Exit: drop bare regions; ask before saving a finished capture. */
  async function requestExit(): Promise<void> {
    if (solidifyingRef.current) return
    if (savePromptOpen) {
      await hideOverlayOnly()
      return
    }
    const complete = regionsRef.current.filter(isCompleteCaptureRegion)
    if (complete.length === 0) {
      await hideOverlayOnly()
      return
    }
    setSavePromptOpen(true)
  }
  solidifyThenHideRef.current = requestExit

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
    // Pick compose attach once; tip stays at the user-drawn position.
    const layout = layoutComposeForArrow({
      region: region.captureRect,
      headScreen,
      preferredTailScreen: tip,
      panelWidth: 360,
      panelHeight: estimateComposePanelHeight(false),
      viewport: { width: window.innerWidth, height: window.innerHeight },
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
    setFocusedRegionIds([regionId])
    setActiveArrowId(arrow.id)
    setStatus(`Arrow #${index} · enter prompt, then Send`)
    requestAnimationFrame(() => {
      promptRef.current?.focus()
    })
    const nextRegion = {
      ...region,
      arrows: [...region.arrows, arrow],
      flowComplete: true,
      snapshotAssetPath:
        region.snapshotAssetPath ?? snapshotByRegionRef.current.get(regionId),
    }
    void upsertArrowPin(nextRegion, arrow)
  }

  function onPointerDown(event: React.PointerEvent) {
    if (pointer.kind !== 'idle') return
    if (placeDrag?.active) return
    const { clientX, clientY } = event

    // Hit-test visible anchors (first arrow after select, or add-arrow after click).
    const anchorCandidates =
      focusedRegionIds.length > 0
        ? regions.filter((r) => focusedRegionIds.includes(r.id))
        : regions
    for (const region of anchorCandidates) {
      if (!region.showAnchors || region.tool === 'draw') continue
      const hit = hitTestAnchor(region.captureRect, clientX, clientY, 12)
      if (hit) {
        const tail = clientToRelative(region.captureRect, clientX, clientY)
        setFocusedRegionIds([region.id])
        setActiveArrowId(null)
        setPointer({
          kind: 'arrow',
          regionId: region.id,
          lockedAnchor: hit.anchor,
          liveTail: tail,
        })
        return
      }
    }

    // Draw inside a focused region in draw tool.
    for (const regionId of focusedRegionIds) {
      const region = regions.find((r) => r.id === regionId)
      if (!region || region.tool !== 'draw' || !region.flowComplete) continue
      if (!pointInRect(region.captureRect, clientX, clientY)) continue
      const rel = clampRelativeInRect(
        clientToRelative(region.captureRect, clientX, clientY),
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
      return
    }

    const containing = focusIdsForClick(regions, clientX, clientY)
    if (containing.length > 0) {
      const primaryId = containing[0]!
      const primary = regions.find((r) => r.id === primaryId)
      setFocusedRegionIds(containing)
      setActiveArrowId((current) => {
        if (current) {
          const stillVisible = regions.some(
            (r) =>
              containing.includes(r.id) && r.arrows.some((a) => a.id === current),
          )
          if (stillVisible) return current
        }
        const first = regions.find((r) => containing.includes(r.id))
        return first?.arrows[first.arrows.length - 1]?.id ?? null
      })
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
          startX: clientX,
          startY: clientY,
          originRect: primary.captureRect,
          moved: false,
        })
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

    // Blank area: cancel Draw if active, otherwise maybe start a new region.
    if (isOutsideAllRegions(regions, clientX, clientY)) {
      const drawingIds = regions.filter((r) => r.tool === 'draw').map((r) => r.id)
      if (drawingIds.length > 0) {
        setRegions((prev) =>
          prev.map((region) =>
            region.tool === 'draw' ? { ...region, tool: 'arrow' } : region,
          ),
        )
        setStatus('Draw cancelled')
        return
      }
    }

    // Start a new region only when outside all existing regions.
    if (!isOutsideAllRegions(regions, clientX, clientY) && regions.length > 0) {
      return
    }
    // Require prior full flow before a second region (first region always ok).
    if (regions.length > 0 && !regions.some((r) => r.flowComplete)) {
      setStatus('Finish the first arrow on the current region before adding another')
      return
    }

    setPointer({
      kind: 'selecting',
      origin: { x: clientX, y: clientY },
    })
    setDraftRect({ x: clientX, y: clientY, width: 0, height: 0 })
  }

  function onPointerMove(event: React.PointerEvent) {
    if (pointer.kind === 'selecting') {
      setDraftRect(
        toLocalRect(pointer.origin, { x: event.clientX, y: event.clientY }),
      )
      return
    }
    if (pointer.kind === 'arrow') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      if (!region) return
      const liveTail = clientToRelative(
        region.captureRect,
        event.clientX,
        event.clientY,
      )
      setPointer({ ...pointer, liveTail })
      return
    }
    if (pointer.kind === 'compose-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = region?.arrows.find((a) => a.id === pointer.arrowId)
      if (!region || !arrow) return
      const card = {
        x: event.clientX - pointer.grabOffset.x,
        y: event.clientY - pointer.grabOffset.y,
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
    if (pointer.kind === 'draw') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      if (!region) return
      if (!pointInRect(region.captureRect, event.clientX, event.clientY)) return
      const rel = clampRelativeInRect(
        clientToRelative(region.captureRect, event.clientX, event.clientY),
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
    if (pointer.kind === 'region-drag') {
      const dx = event.clientX - pointer.startX
      const dy = event.clientY - pointer.startY
      const dist = Math.hypot(dx, dy)
      if (!pointer.moved && dist < REGION_DRAG_THRESHOLD_PX) return
      const nextRect = movedCaptureRect(
        pointer.originRect,
        dx,
        dy,
        { width: window.innerWidth, height: window.innerHeight },
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
      const dx = event.clientX - pointer.startX
      const dy = event.clientY - pointer.startY
      const { nextCapture, nextLocal } = movedPlacementWithRegionFollow(
        pointer.originRect,
        dx,
        dy,
        pointer.originCaptureRect,
        { width: window.innerWidth, height: window.innerHeight },
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
        event.clientX,
        event.clientY,
        undefined,
        { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      )
      updateRegion(pointer.regionId, (r) => ({
        ...r,
        captureRect: nextRect,
        stencils: (r.stencils ?? []).map((item) => {
          const next = clampLocalRectInRegion(item.rect, nextRect)
          return next.x === item.rect.x &&
            next.y === item.rect.y &&
            next.width === item.rect.width &&
            next.height === item.rect.height
            ? item
            : { ...item, rect: next }
        }),
      }))
      return
    }
    if (pointer.kind === 'placement-resize') {
      const { nextCapture, nextLocal } = resizedPlacementFree(
        pointer.originLocal,
        pointer.originCaptureRect,
        pointer.handle,
        event.clientX,
        event.clientY,
        { width: window.innerWidth, height: window.innerHeight },
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
    if (pointer.kind === 'selecting') {
      const rect = toLocalRect(pointer.origin, {
        x: event.clientX,
        y: event.clientY,
      })
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
      void captureRegion(regionId, rect)
      return
    }

    if (pointer.kind === 'arrow') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      setPointer({ kind: 'idle' })
      if (!region) return
      const tail = clientToRelative(
        region.captureRect,
        event.clientX,
        event.clientY,
      )
      const finalAnchor = toEdgeAnchor(
        pointer.lockedAnchor ?? nearestAnchorToRelative(tail),
      )
      const finalHead = relativePointForAnchor(finalAnchor)
      const dx = (tail.x - finalHead.x) * region.captureRect.width
      const dy = (tail.y - finalHead.y) * region.captureRect.height
      // Ignore tiny accidental arrows.
      if (Math.hypot(dx, dy) < 12) return
      commitArrow(region.id, finalAnchor, finalHead, tail)
      return
    }

    if (pointer.kind === 'compose-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = region?.arrows.find((a) => a.id === pointer.arrowId)
      setPointer({ kind: 'idle' })
      if (region && arrow) {
        void upsertArrowPin(
          {
            ...region,
            snapshotAssetPath:
              region.snapshotAssetPath ??
              snapshotByRegionRef.current.get(region.id),
          },
          arrow,
        )
      }
      return
    }

    if (pointer.kind === 'draw') {
      setPointer({ kind: 'idle' })
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
      void captureRegion(region.id, region.captureRect)
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
      if (region && arrow) {
        void upsertArrowPin(
          {
            ...region,
            snapshotAssetPath:
              region.snapshotAssetPath ??
              snapshotByRegionRef.current.get(region.id),
          },
          arrow,
        )
      }
      if (region && regionMoved) {
        void captureRegion(region.id, region.captureRect)
      }
      setStatus('Drag to select a region on any screen')
      return
    }

    if (pointer.kind === 'region-resize') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      setPointer({ kind: 'idle' })
      if (region) {
        void captureRegion(region.id, region.captureRect)
        setStatus('Region resized · snapshot updated')
      } else {
        setStatus('Drag to select a region on any screen')
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
      if (region && arrow) {
        void upsertArrowPin(
          {
            ...region,
            snapshotAssetPath:
              region.snapshotAssetPath ??
              snapshotByRegionRef.current.get(region.id),
          },
          arrow,
        )
      }
      if (region && regionExpanded) {
        void captureRegion(region.id, region.captureRect)
      }
      setStatus('Drag to select a region on any screen')
    }
  }

  async function onSubmitArrow(regionId: string, arrowId: string) {
    const region = regionsRef.current.find((r) => r.id === regionId)
    const arrow = region?.arrows.find((a) => a.id === arrowId)
    if (!region || !arrow || !window.projectOS) return
    const trimmed = arrow.prompt.trim()
    if (!trimmed) {
      setStatus('Prompt is required for this arrow')
      return
    }
    const pid = projectIdRef.current ?? (await refreshContext())
    if (!pid) {
      setStatus('Open a Project OS workspace first')
      return
    }

    updateRegion(regionId, (r) => ({
      ...r,
      arrows: r.arrows.map((a) =>
        a.id === arrowId ? { ...a, status: 'submitting' } : a,
      ),
    }))
    setFlow('thinking')
    setFlowSteps([
      {
        id: 'submit',
        label:
          region.mode === 'ask'
            ? 'Asking…'
            : region.mode === 'plan'
              ? 'Planning…'
              : region.mode === 'debug'
                ? 'Starting debug…'
                : 'Starting agent…',
        status: 'running',
      },
    ])
    setStatus(`Submitting arrow #${arrow.index}…`)

    try {
      const withSnapshot = {
        ...region,
        snapshotAssetPath:
          region.snapshotAssetPath ??
          snapshotByRegionRef.current.get(regionId),
      }
      await upsertArrowPin(withSnapshot, { ...arrow, prompt: trimmed })
      const pin = (await window.projectOS.invoke(
        'getSpatialPin',
        pid,
        arrow.pinId,
      )) as SpatialPin | null
      const stencilBrief =
        stencilBriefByArrow[arrow.id]?.trim() ||
        combinedBriefForArrow(region, arrow.id)
      const generationScope =
        stencilScopeByArrow[arrow.id] ?? DEFAULT_STENCIL_SCOPE
      const hub = enrichHubForArrow(arrow.id, region, {
        projectLabel:
          candidates.find((item) => item.projectId === pid)?.displayName ??
          pid,
      })
      if (pin) {
        await window.projectOS.invoke('upsertSpatialPin', pid, {
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
      const result = (await window.projectOS.invoke(
        'submitSpatialPin',
        pid,
        arrow.pinId,
      )) as {
        runId?: string
        chatSessionId: string
        planId?: string
        debugSessionId?: string
        pin?: SpatialPin
      }
      if (result.pin?.links?.composeSubagents) {
        setSubagentLinksByArrow((prev) => ({
          ...prev,
          [arrow.id]: result.pin!.links!.composeSubagents!,
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

      if (result.runId) {
        setActiveRunId(result.runId)
        setFlow('thinking')
        setStatus('Agent running…')
      } else if (result.planId) {
        setFlowSteps([
          { id: 'plan', label: 'Plan ready for review', status: 'complete' },
        ])
        setFlow('done')
        setStatus(`Plan · ${result.planId.slice(0, 8)}`)
      } else if (result.debugSessionId) {
        setFlowSteps([
          { id: 'debug', label: 'Debug session started', status: 'complete' },
        ])
        setFlow('done')
        setStatus(`Debug · ${result.debugSessionId.slice(0, 8)}`)
      } else {
        setFlowSteps([
          { id: 'ask', label: 'Answer ready', status: 'complete' },
        ])
        setFlow('done')
        setStatus(`Submitted · session ${result.chatSessionId.slice(0, 8)}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submit failed'
      setStatus(message)
      setFlow('error')
      setFlowSteps([{ id: 'error', label: message.slice(0, 80), status: 'error' }])
      updateRegion(regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === arrowId ? { ...a, status: 'error' } : a,
        ),
      }))
    }
  }

  function deleteArrow(regionId: string, arrowId: string) {
    updateRegion(regionId, (r) => {
      const remaining = renumberArrows(r.arrows.filter((a) => a.id !== arrowId))
      return {
        ...r,
        arrows: remaining,
        stencils: (r.stencils ?? []).filter((item) => item.arrowId !== arrowId),
        flowComplete: remaining.length > 0,
        showAnchors: remaining.length === 0,
      }
    })
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
    setActiveArrowId((current) => {
      if (current !== arrowId) return current
      const region = regionsRef.current.find((r) => r.id === regionId)
      const remaining = region?.arrows.filter((a) => a.id !== arrowId) ?? []
      return remaining[remaining.length - 1]?.id ?? null
    })
  }

  function setRegionTool(regionId: string, tool: RegionTool) {
    updateRegion(regionId, { tool, showAnchors: tool === 'arrow' })
  }

  function clearDraw(regionId: string) {
    updateRegion(regionId, { drawStrokes: [] })
    setStatus('Cleared drawings')
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
    setDraftRect(null)
    setStatus('Region deleted · drag to select another')
  }

  const liveArrow = useMemo(() => {
    if (pointer.kind !== 'arrow') return null
    const region = regions.find((r) => r.id === pointer.regionId)
    if (!region) return null
    const anchor = toEdgeAnchor(
      pointer.lockedAnchor ?? nearestAnchorToRelative(pointer.liveTail),
    )
    const headRel = relativePointForAnchor(anchor)
    return {
      region,
      anchor,
      head: relativeToClient(region.captureRect, headRel),
      tail: relativeToClient(region.captureRect, pointer.liveTail),
      color: colorForArrowIndex(region.arrows.length + 1),
      index: region.arrows.length + 1,
    }
  }, [pointer, regions])

  const hostChip = location ? formatHostChip(location) : null
  const showFlowRail = flow != null || flowSteps.length > 0
  const arrowComposes = useMemo(
    () =>
      regions.flatMap((region) =>
        region.arrows.map((arrow) => ({ region, arrow })),
      ),
    [regions],
  )
  const hasAnyCompose = arrowComposes.length > 0

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
      viewport: { width: window.innerWidth, height: window.innerHeight },
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
    setPointer({
      kind: 'compose-drag',
      regionId: region.id,
      arrowId: arrow.id,
      grabOffset: {
        x: event.clientX - layout.card.x,
        y: event.clientY - layout.card.y,
      },
      panelWidth: layout.card.width,
      panelHeight: layout.card.height,
    })
    rootRef.current?.setPointerCapture?.(event.pointerId)
  }

  return (
    <div
      ref={rootRef}
      className={`overlay-root${pointer.kind === 'compose-drag' ? ' overlay-root-dragging' : ''}`}
      onPointerDown={(event) => {
        if (savePromptOpen) return
        onPointerDown(event)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="overlay-dim" />

      <button
        type="button"
        className="overlay-dismiss"
        aria-label="Exit Spatial Pin"
        title="Exit (Esc)"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void requestExit()}
      >
        <X size={14} strokeWidth={2.25} aria-hidden />
        <span>Exit</span>
      </button>

      <button
        type="button"
        className={`overlay-stencil-toggle${
          libraryRevealed || placeDrag ? ' overlay-stencil-toggle-active' : ''
        }`}
        aria-label={STENCIL_UI_STRINGS_EN.open}
        aria-pressed={libraryOpen}
        title={STENCIL_UI_STRINGS_EN.edgeHint}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (libraryOpen) {
            exitStencilChrome()
            return
          }
          setLibraryOpen(true)
        }}
      >
        <LayoutTemplate size={14} strokeWidth={2} aria-hidden />
        <span>{STENCIL_UI_STRINGS_EN.open}</span>
      </button>

      <StencilLibrary
        open={libraryOpen}
        collapseToken={libraryCollapseToken}
        draggingStencilId={placeDrag?.stencilId ?? null}
        repoDesignSystem={repoDesignSystem}
        strings={STENCIL_UI_STRINGS_EN}
        onRevealChange={setLibraryRevealed}
        onClose={() => {
          exitStencilChrome()
        }}
        onPlaceDragStart={beginPlaceDrag}
      />

      {placeDrag?.active ? (
        <div
          className={stencilPlacementStyles.stencilDragGhost}
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
          <span className={stencilPlacementStyles.stencilDragGhostLabel}>
            {STENCIL_UI_STRINGS_EN.dragHint}
          </span>
        </div>
      ) : null}

      {savePromptOpen ? (
        <div
          className="overlay-save-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="overlay-save-prompt-title"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="overlay-save-prompt-card">
            <h2 id="overlay-save-prompt-title">Save to Spatial Captures?</h2>
            <p>
              Finished regions (selection, arrow, and compose card) can be kept.
              A selection by itself is discarded.
            </p>
            <div className="overlay-save-prompt-actions">
              <button
                type="button"
                className="overlay-save-prompt-btn"
                onClick={() => void hideOverlayOnly()}
              >
                Don&apos;t save
              </button>
              <button
                type="button"
                className="overlay-save-prompt-btn overlay-save-prompt-btn-primary"
                onClick={() => void solidifyThenHide()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {regions.length === 0 && !draftRect ? (
        <div className="overlay-hint">
          {displayBounds
            ? 'Drag to select any on-screen region · Esc or Exit to cancel'
            : 'Spatial Pin · screen capture'}
        </div>
      ) : null}

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

      {regions.map((region) => {
        const focused = isRegionFocused(focusedRegionIds, region.id)
        return (
          <RegionView
            key={region.id}
            region={region}
            focused={focused}
            onClearDraw={() => clearDraw(region.id)}
            onDelete={() => deleteRegion(region.id)}
            onSetTool={(tool) => setRegionTool(region.id, tool)}
          />
        )
      })}

      {regions.map((region) =>
        (region.stencils ?? []).map((placement) => {
          const box = stageRectForPlacement(region, placement)
          const focused = isRegionFocused(focusedRegionIds, region.id)
          const active =
            focused ||
            (placement.arrowId != null && placement.arrowId === activeArrowId)
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
                  const p = resizeHandleScreenPoint(region.captureRect, handle)
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
                      beginPlacementResize(event, region, placement.id, handle)
                    }
                  />
                )
              })
            })}
          </div>
        )
      })}

      {/* Committed arrows — edge midpoints only; curve avoids card/region/stub */}
      <svg className="overlay-arrows-layer" aria-hidden>
        {regions.map((region) =>
          region.arrows.map((arrow) => {
            const layout = layoutArrowCompose(region, arrow)
            const conn = resolveArrowEdgeConnection(region, arrow, layout.card)
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
            headAnchor={liveArrow.anchor}
            preview
          />
        ) : null}
      </svg>

      {/* Click arrow index badge to focus that arrow's big compose */}
      {regions.map((region) =>
        region.arrows.map((arrow) => {
          const layout = layoutArrowCompose(region, arrow)
          const conn = resolveArrowEdgeConnection(region, arrow, layout.card)
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
              className={`overlay-arrow-hit${focused ? '' : ' overlay-arrow-hit-dimmed'}`}
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

      {/* One big compose per arrow — dim when region unfocused, never unmount */}
      {arrowComposes.map(({ region, arrow }) => {
        const focused = isRegionFocused(focusedRegionIds, region.id)
        const isActive = arrow.id === activeArrowId
        const layout = layoutArrowCompose(region, arrow)
        const modeVisual =
          MODES.find((item) => item.id === region.mode) ?? MODES[1]!
        const ModeIcon = modeVisual.icon
        const hub = enrichHubForArrow(arrow.id, region, {
          projectLabel:
            candidates.find((item) => item.projectId === projectId)
              ?.displayName ??
            projectId ??
            'project',
        })
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
          >
          <div
            ref={bindPanel(arrow.id)}
            className={`overlay-panel overlay-panel-chrome${focused ? '' : ' overlay-panel-dimmed'}`}
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
            {showFlowRail && isActive ? (
              <ComposeFlowDrawer steps={flowSteps} phase={flow} />
            ) : null}
            <div
              className="overlay-panel-header overlay-panel-drag-handle"
              title="Drag to move card and arrow tip"
              onPointerDown={(event) => {
                // Don't start drag from interactive controls in the header.
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
              {candidates.length > 0 && isActive ? (
                <select
                  className="overlay-project-select"
                  value={projectId ?? ''}
                  aria-label="Project"
                  onChange={(event) => {
                    void onSelectProject(event.target.value)
                  }}
                >
                  {candidates.map((item) => (
                    <option key={item.projectId} value={item.projectId}>
                      {item.displayName}
                      {item.source === 'terminal-cwd' ? ' · terminal' : ''}
                    </option>
                  ))}
                </select>
              ) : null}
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
                          a.id === arrow.id ? { ...a, prompt: value } : a,
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
                      strings={STENCIL_UI_STRINGS_EN}
                      brief={
                        stencilBriefByArrow[arrow.id] ??
                        combinedBriefForArrow(region, arrow.id) ??
                        ''
                      }
                      scope={
                        stencilScopeByArrow[arrow.id] ?? DEFAULT_STENCIL_SCOPE
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
                            current === 'mode' && isActive ? null : 'mode',
                          )
                        }}
                      >
                        <ModeIcon size={13} strokeWidth={2} aria-hidden />
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
                                className={`overlay-menu-item ${item.toneClass}${active ? ' overlay-menu-item-active' : ''}`}
                                onClick={() => {
                                  updateRegion(region.id, { mode: item.id })
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
                    />
                  </div>
                  <button
                    type="button"
                    className="overlay-send"
                    disabled={
                      arrow.status === 'submitting' || !arrow.prompt.trim()
                    }
                    aria-label={
                      arrow.status === 'submitting' ? 'Sending' : 'Submit'
                    }
                    title="Submit (⌘↵)"
                    onClick={() => void onSubmitArrow(region.id, arrow.id)}
                  >
                    <Send size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            {isActive ? (
              <>
                <div className="overlay-meta">
                  {hostChip ? (
                    <span className="overlay-meta-chip">{hostChip}</span>
                  ) : null}
                  {webEnhanceAvailable ? (
                    <span className="overlay-meta-chip">Chrome enhance</span>
                  ) : null}
                  <span className="overlay-meta-chip">
                    {regions.length} region{regions.length === 1 ? '' : 's'}
                  </span>
                </div>
                {status ? (
                  <div className="overlay-meta-status">{status}</div>
                ) : null}
              </>
            ) : null}
          </div>
          </SpatialComposeHub>
        )
      })}

      {/* Status hint when waiting for first arrow (no compose yet) */}
      {!hasAnyCompose && regions.length > 0 && status ? (
        <div className="overlay-hint overlay-hint-status">{status}</div>
      ) : null}

      {visiblePins.map((item) => {
        const rect = item.rect
        if (!rect) return null
        return (
          <div
            key={item.pin.id}
            className="pin-chip"
            style={{ left: rect.x + rect.width + 8, top: rect.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="title">
              {item.pin.title || item.pin.composer.prompt.slice(0, 40) || 'Pin'}
            </div>
            <div className="meta">
              {item.pin.composer.mode} ·{' '}
              <span className={`confidence-${item.confidence}`}>
                {item.confidence}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RegionView({
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

  const toolStackHeight = 26 * 3 + 4 * 2
  const btnLeft = region.captureRect.x + region.captureRect.width + 6
  const btnTop =
    region.captureRect.y + region.captureRect.height - toolStackHeight

  if (region.hideSelectionChrome) {
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
        className={`overlay-selection overlay-selection-compose${focused ? '' : ' overlay-selection-dimmed'}`}
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
            className={`overlay-region-tool-btn${region.tool === 'draw' ? ' overlay-region-tool-btn-active' : ''}`}
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

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function formatHostChip(location: LocationKey): string | null {
  const parts: string[] = []
  if (location.appName) parts.push(location.appName)
  if (location.deviceKind === 'ios-simulator') parts.push('iOS Simulator')
  else if (location.deviceKind === 'android-emulator')
    parts.push('Android Emulator')
  else if (location.deviceKind === 'ide' && !location.appName) parts.push('IDE')
  if (location.inferredPath) parts.push(location.inferredPath)
  return parts.length > 0 ? parts.join(' · ') : null
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`.slice(0, 42)
  } catch {
    return url.slice(0, 42)
  }
}

function shortPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts.slice(-2).join('/') || path.slice(0, 42)
}
