import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  ChevronDown,
  Eraser,
  ListTree,
  MessageCircle,
  Pencil,
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
  type AnnotationStroke,
  type ScreenRect,
  type SpatialPin,
  type SpatialPinMode,
} from '@contracts/spatial-pin'
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
import {
  resolveComposePanelSize,
  useComposePanelMetrics,
} from '../../overlay/useComposePanelMetrics'
import { cropBackdropRegionPngBase64 } from '../../overlay/cropBackdrop'
import {
  focusIdsForClick,
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
} from '../../overlay/regionAnchors'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
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
      kind: 'compose-drag'
      regionId: string
      arrowId: string
      grabOffset: { x: number; y: number }
      panelWidth: number
      panelHeight: number
    }

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

  const [regions, setRegions] = useState<OverlayRegion[]>(() =>
    session.regions.map(captureRegionToOverlay),
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
  const [status, setStatus] = useState(
    'Frozen capture · drag to select · Esc to exit',
  )
  const [fitScale, setFitScale] = useState(1)
  const { metrics: panelMetrics, bindPanel } = useComposePanelMetrics()

  const viewportHostRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const regionsRef = useRef(regions)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const viewport = session.viewport

  useEffect(() => {
    regionsRef.current = regions
  }, [regions])

  useEffect(() => {
    setRegions(session.regions.map(captureRegionToOverlay))
    const firstRegion = session.regions[0]
    setFocusedRegionIds(firstRegion ? [firstRegion.id] : [])
    setActiveArrowId(
      firstRegion?.arrows[firstRegion.arrows.length - 1]?.id ?? null,
    )
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
      last = clamped
      setFitScale(clamped)
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (openMenu) {
          setOpenMenu(null)
          return
        }
        onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, openMenu])

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

  function schedulePersist(nextRegions: OverlayRegion[]) {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      const next = buildCaptureSessionFromOverlay({
        id: session.id,
        projectId: session.projectId,
        location: session.location,
        viewport: session.viewport,
        regions: nextRegions,
        ...(session.backdropAssetPath
          ? { backdropAssetPath: session.backdropAssetPath }
          : {}),
        createdAt: session.createdAt,
        title: session.title,
      })
      void upsertActiveSession(next)
    }, 400)
  }

  useEffect(() => {
    schedulePersist(regions)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [regions])

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
      setStatus('Region ready · drag from a corner or edge midpoint')
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
      },
      annotations: {
        version: '0.1.0',
        strokes: [...region.drawStrokes, arrowStroke],
      },
      title: arrow.prompt.trim().slice(0, 60) || `Arrow #${arrow.index}`,
    }
    await client.upsertSpatialPin(project.projectId, updated)
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
      return {
        card: cardPinnedToTip(
          tip,
          arrow.composeAttach,
          panelWidth,
          panelHeight,
        ),
        attach: arrow.composeAttach,
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
      flowComplete: r.arrows.some((a) => a.id !== arrowId),
      showAnchors: true,
    }))
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
    try {
      await upsertArrowPin(region, { ...arrow, prompt: trimmed })
      const pin = await client.getSpatialPin(project.projectId, arrow.pinId)
      if (pin) {
        await client.upsertSpatialPin(project.projectId, {
          ...pin,
          composer: { ...pin.composer, prompt: trimmed, mode: region.mode },
        })
      }
      const result = await client.submitSpatialPin(
        project.projectId,
        arrow.pinId,
      )
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
    } catch {
      updateRegion(regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === arrowId ? { ...a, status: 'error' } : a,
        ),
      }))
      setStatus('Submit failed')
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    if (pointer.kind !== 'idle') return
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
      setRegions((prev) =>
        prev.map((region) => {
          if (!containing.includes(region.id)) {
            return { ...region, showAnchors: false }
          }
          return { ...region, showAnchors: true, tool: 'arrow' }
        }),
      )
      setStatus('Drag from a corner or edge midpoint to place an arrow')
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
    if (pointer.kind === 'compose-drag') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      const arrow = region?.arrows.find((a) => a.id === pointer.arrowId)
      if (!region || !arrow?.composeAttach) return
      const card = {
        x: pt.x - pointer.grabOffset.x,
        y: pt.y - pointer.grabOffset.y,
        width: pointer.panelWidth,
        height: pointer.panelHeight,
      }
      const tip = composeAttachScreenPoint(card, arrow.composeAttach)
      const nextTail = clientToRelative(region.captureRect, tip.x, tip.y)
      updateRegion(pointer.regionId, (r) => ({
        ...r,
        arrows: r.arrows.map((a) =>
          a.id === pointer.arrowId ? { ...a, tail: nextTail } : a,
        ),
      }))
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
      }
      setRegions((prev) => [...prev, region])
      setFocusedRegionIds([regionId])
      setActiveArrowId(null)
      setStatus('Drag from a corner or edge midpoint · tail may leave the box')
      void captureFrozenRegion(regionId, rect)
      return
    }
    if (pointer.kind === 'arrow') {
      const region = regionsRef.current.find((r) => r.id === pointer.regionId)
      setPointer({ kind: 'idle' })
      if (!region) return
      const tail = clientToRelative(region.captureRect, pt.x, pt.y)
      const finalAnchor =
        pointer.lockedAnchor ?? nearestAnchorToRelative(tail)
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
    }
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
          const head = relativePointForAnchor(pointer.lockedAnchor)
          return {
            head: relativeToClient(region.captureRect, head),
            tail: relativeToClient(region.captureRect, pointer.liveTail),
            color: colorForArrowIndex(region.arrows.length + 1),
            index: region.arrows.length + 1,
          }
        })()
      : null

  const scaledW = viewport.width * fitScale
  const scaledH = viewport.height * fitScale

  return (
    <div className={styles.canvasShell}>
      <div className={styles.banner}>{status}</div>
      <div ref={viewportHostRef} className={styles.stageViewport}>
        <div
          className={styles.stageScaler}
          style={{ width: scaledW, height: scaledH }}
        >
          <div
            ref={stageRef}
            className={`overlay-root overlay-root-embedded${
              pointer.kind === 'compose-drag' ? ' overlay-root-dragging' : ''
            }`}
            style={{
              width: viewport.width,
              height: viewport.height,
              transform: `scale(${fitScale})`,
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

            <svg className="overlay-arrows-layer" aria-hidden>
              {regions.map((region) =>
                region.arrows.map((arrow) => {
                  const head = relativeToClient(region.captureRect, arrow.head)
                  const layout = layoutArrowCompose(region, arrow)
                  const focused = isRegionFocused(focusedRegionIds, region.id)
                  return (
                    <g
                      key={arrow.id}
                      className={focused ? undefined : 'overlay-arrow-dimmed'}
                    >
                      <ArrowPath
                        head={head}
                        tail={layout.attachScreen}
                        color={arrow.color}
                        index={arrow.index}
                      />
                    </g>
                  )
                }),
              )}
              {liveArrow ? (
                <ArrowPath
                  head={liveArrow.head}
                  tail={liveArrow.tail}
                  color={liveArrow.color}
                  index={liveArrow.index}
                  preview
                />
              ) : null}
            </svg>

            {regions.map((region) =>
              region.arrows.map((arrow) => {
                const head = relativeToClient(region.captureRect, arrow.head)
                const layout = layoutArrowCompose(region, arrow)
                const midX = (head.x + layout.attachScreen.x) / 2
                const midY = (head.y + layout.attachScreen.y) / 2
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
              return (
                <div
                  key={`compose-${arrow.id}`}
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

function ArrowPath({
  head,
  tail,
  color,
  index,
  preview,
}: {
  head: { x: number; y: number }
  tail: { x: number; y: number }
  color: string
  index: number
  preview?: boolean
}) {
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x)
  const size = 10
  const ax = head.x - size * Math.cos(angle - Math.PI / 6)
  const ay = head.y - size * Math.sin(angle - Math.PI / 6)
  const bx = head.x - size * Math.cos(angle + Math.PI / 6)
  const by = head.y - size * Math.sin(angle + Math.PI / 6)
  const midX = (head.x + tail.x) / 2
  const midY = (head.y + tail.y) / 2
  return (
    <g opacity={preview ? 0.85 : 1}>
      <line
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
      />
      <polygon
        points={`${head.x},${head.y} ${ax},${ay} ${bx},${by}`}
        fill={color}
      />
      <circle cx={tail.x} cy={tail.y} r={3.5} fill={color} />
      <g transform={`translate(${midX + 6}, ${midY - 6})`}>
        <circle r={8} fill={color} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize="10"
          fontWeight="700"
        >
          {index}
        </text>
      </g>
    </g>
  )
}
