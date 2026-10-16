import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Bug,
  ChevronDown,
  Eraser,
  ListTree,
  MessageCircle,
  Pencil,
  Send,
  Square,
  SquarePen,
  X,
} from 'lucide-react'
import type {
  AnnotationStroke,
  LocationKey,
  ScreenRect,
  SpatialPin,
  SpatialPinDeviceKind,
  SpatialPinMode,
  SpatialPinProjectCandidate,
} from '@contracts/spatial-pin'
import {
  createDraftSpatialPin,
  emptyAnnotationDoc,
  isWebSurface,
} from '@contracts/spatial-pin'
import {
  applyRunEventToCompactFlow,
  currentCompactFlowLabel,
} from './coarseFlow'
import type { CoarseFlowLabel, CompactFlowStep } from './coarseFlow'
import AgentActivityIndicator from '../components/ui/AgentActivityIndicator'

type Phase = 'select' | 'compose' | 'pins'
type Tool = AnnotationStroke['kind']
type OpenMenu = 'mode' | 'tool' | null

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

const TOOLS: Array<{ id: Tool; label: string; icon: LucideIcon }> = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'rect', label: 'Rect', icon: Square },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
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
  const [phase, setPhase] = useState<Phase>('select')
  const [displayBounds, setDisplayBounds] = useState<DisplayBounds | null>(null)
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [selection, setSelection] = useState<ScreenRect | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [mode, setMode] = useState<SpatialPinMode>('change')
  const [prompt, setPrompt] = useState('')
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([])
  const [draftPinId, setDraftPinId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SpatialPinProjectCandidate[]>([])
  const [location, setLocation] = useState<LocationKey | null>(null)
  const [webEnhanceAvailable, setWebEnhanceAvailable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('Drag to select a region on any screen')
  const [flow, setFlow] = useState<CoarseFlowLabel | null>(null)
  const [flowSteps, setFlowSteps] = useState<CompactFlowStep[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [visiblePins, setVisiblePins] = useState<
    Array<{ pin: SpatialPin; rect?: ScreenRect; confidence: string }>
  >([])
  const drawingRef = useRef<AnnotationStroke | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const projectIdRef = useRef<string | null>(null)
  const locationRef = useRef<LocationKey | null>(null)
  const phaseRef = useRef(phase)
  const selectionRef = useRef(selection)

  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])
  useEffect(() => {
    locationRef.current = location
  }, [location])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    const bridge = window.projectOS
    if (!bridge?.spatialPin) return

    const beginDisp = bridge.spatialPin.onBeginCapture((payload) => {
      setDisplayBounds(payload.displayBounds)
      setPhase('select')
      setSelection(null)
      setStrokes([])
      setPrompt('')
      setMode('change')
      setFlow(null)
      setFlowSteps([])
      setActiveRunId(null)
      setDraftPinId(null)
      setOpenMenu(null)
      setStatus('Drag any on-screen region · Esc to cancel')
      void refreshContext()
    })
    const locDisp = bridge.spatialPin.onLocation((payload) => {
      const loc = payload as BridgeLocation
      // Web enhancer only — does not replace screen-first workflow.
      if (loc.url?.startsWith('http') || loc.surface === 'chrome' || loc.surface === 'projectos-browser') {
        void refreshContext()
        void resolvePins(loc)
      }
    })
    void refreshContext()
    return () => {
      beginDisp.dispose()
      locDisp.dispose()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (openMenu) {
          setOpenMenu(null)
          return
        }
        void window.projectOS?.spatialPin.hideOverlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openMenu])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [openMenu])

  useEffect(() => {
    if (!activeRunId || !window.projectOS) return
    const disposable = window.projectOS.onRunEvent((runId, event) => {
      if (runId !== activeRunId) return
      setFlowSteps((prev) => {
        const applied = applyRunEventToCompactFlow(prev, event)
        if (applied.phase) {
          // Defer sibling state update out of the steps updater.
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

  useEffect(() => {
    redrawCanvas()
  }, [strokes, selection, phase])

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
    if (draftPinId && selection) {
      void ensureDraft(selection)
    }
  }

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
    if (
      resolved.length > 0 &&
      phaseRef.current === 'select' &&
      !selectionRef.current
    ) {
      setPhase('pins')
    }
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

  function onPointerDown(event: React.PointerEvent) {
    if (phase === 'select') {
      setDragOrigin({ x: event.clientX, y: event.clientY })
      setSelection({
        x: event.clientX,
        y: event.clientY,
        width: 0,
        height: 0,
      })
      return
    }
    if (phase !== 'compose' || !selection) return
    const point = normalizePoint(event.clientX, event.clientY, selection)
    if (!point) return
    const stroke: AnnotationStroke = {
      id: randomId('stroke'),
      kind: tool,
      color: '#4c7dff',
      width: 2,
      points: [point],
    }
    drawingRef.current = stroke
    setStrokes((prev) => [...prev, stroke])
  }

  function onPointerMove(event: React.PointerEvent) {
    if (phase === 'select' && dragOrigin) {
      setSelection(
        toLocalRect(dragOrigin, { x: event.clientX, y: event.clientY }),
      )
      return
    }
    if (phase !== 'compose' || !selection || !drawingRef.current) return
    const point = normalizePoint(event.clientX, event.clientY, selection)
    if (!point) return
    drawingRef.current = {
      ...drawingRef.current,
      points: [...drawingRef.current.points, point],
    }
    setStrokes((prev) =>
      prev.map((stroke) =>
        stroke.id === drawingRef.current?.id ? drawingRef.current! : stroke,
      ),
    )
  }

  function onPointerUp(event: React.PointerEvent) {
    if (phase === 'select' && dragOrigin) {
      const rect = toLocalRect(dragOrigin, {
        x: event.clientX,
        y: event.clientY,
      })
      setDragOrigin(null)
      if (rect.width < 8 || rect.height < 8) {
        setSelection(null)
        return
      }
      setSelection(rect)
      setPhase('compose')
      setStatus('Annotate, choose mode, enter prompt')
      // Capture runs in the background — do not hide the overlay (flicker).
      void ensureDraft(rect)
      requestAnimationFrame(() => {
        promptRef.current?.focus()
        autosizePrompt()
      })
      return
    }
    drawingRef.current = null
  }

  function autosizePrompt() {
    const el = promptRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function ensureDraft(rect: ScreenRect) {
    const pid = (await refreshContext()) ?? projectIdRef.current
    if (!pid || !window.projectOS) {
      setStatus('Open a Project OS workspace first')
      return
    }

    let loc = locationRef.current
    let captureError: string | undefined
    const capture = await window.projectOS.spatialPin.captureSelection(rect)
    if (capture.error) captureError = capture.error
    if (capture.host && (capture.host.appName || capture.host.deviceKind)) {
      // Refresh context so main-side lastHostLocation is merged into location.
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
    const pinId = draftPinId ?? randomId('pin')
    const draft = createDraftSpatialPin({
      id: pinId,
      projectId: pid,
      location: loc,
      captureRect: rect,
    })
    draft.annotations = emptyAnnotationDoc()
    draft.composer = { mode, prompt }
    await window.projectOS.invoke('upsertSpatialPin', pid, draft)
    setDraftPinId(pinId)

    if (capture.pngBase64) {
      try {
        const saved = (await window.projectOS.invoke(
          'saveSpatialPinSnapshot',
          pid,
          pinId,
          capture.pngBase64,
        )) as { snapshotAssetPath: string }
        draft.composer.snapshotAssetPath = saved.snapshotAssetPath
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
        ? `${captureError} · Pinned to ${anchorLabel}${hostChip ? ` · ${hostChip}` : ''}`
        : `Pinned to ${anchorLabel}${hostChip ? ` · ${hostChip}` : ''}`,
    )
  }

  async function persistDraft(next?: {
    mode?: SpatialPinMode
    prompt?: string
    strokes?: AnnotationStroke[]
  }) {
    if (!projectId || !draftPinId || !window.projectOS || !selection) return
    const existing = (await window.projectOS.invoke(
      'getSpatialPin',
      projectId,
      draftPinId,
    )) as SpatialPin | null
    if (!existing) return
    const updated: SpatialPin = {
      ...existing,
      updatedAt: new Date().toISOString(),
      composer: {
        mode: next?.mode ?? mode,
        prompt: next?.prompt ?? prompt,
        snapshotAssetPath: existing.composer.snapshotAssetPath,
      },
      annotations: {
        version: '0.1.0',
        strokes: next?.strokes ?? strokes,
      },
      captureRect: selection,
    }
    await window.projectOS.invoke('upsertSpatialPin', projectId, updated)
  }

  async function onSubmit() {
    if (!projectId || !draftPinId || !window.projectOS) return
    const trimmed = prompt.trim()
    if (!trimmed) {
      setStatus('Prompt is required')
      return
    }
    setSubmitting(true)
    setFlow('thinking')
    setFlowSteps([
      {
        id: 'submit',
        label:
          mode === 'ask'
            ? 'Asking…'
            : mode === 'plan'
              ? 'Planning…'
              : mode === 'debug'
                ? 'Starting debug…'
                : 'Starting agent…',
        status: 'running',
      },
    ])
    setStatus('Submitting…')
    try {
      await persistDraft({ prompt: trimmed, mode, strokes })
      const result = (await window.projectOS.invoke(
        'submitSpatialPin',
        projectId,
        draftPinId,
      )) as {
        runId?: string
        chatSessionId: string
        planId?: string
        debugSessionId?: string
      }
      if (result.runId) {
        setActiveRunId(result.runId)
        setFlow('thinking')
        setFlowSteps((prev) =>
          prev.map((step) =>
            step.id === 'submit'
              ? { ...step, label: 'Agent running…', status: 'running' }
              : step,
          ),
        )
        setStatus('Agent running…')
      } else if (result.planId) {
        setFlowSteps([
          { id: 'plan', label: 'Plan ready for review', status: 'complete' },
        ])
        setFlow('done')
        setStatus(`Plan · ${result.planId.slice(0, 8)}`)
      } else if (result.debugSessionId) {
        setFlowSteps([
          {
            id: 'debug',
            label: 'Debug session started',
            status: 'complete',
          },
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
      setFlowSteps([
        { id: 'error', label: message.slice(0, 80), status: 'error' },
      ])
    } finally {
      setSubmitting(false)
    }
  }

  function redrawCanvas() {
    const canvas = canvasRef.current
    if (!canvas || !selection) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = Math.max(1, Math.floor(selection.width))
    canvas.height = Math.max(1, Math.floor(selection.height))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (stroke.kind === 'rect' && stroke.points.length >= 2) {
        const a = stroke.points[0]!
        const b = stroke.points[stroke.points.length - 1]!
        ctx.strokeRect(
          a.x * canvas.width,
          a.y * canvas.height,
          (b.x - a.x) * canvas.width,
          (b.y - a.y) * canvas.height,
        )
        continue
      }
      if (stroke.kind === 'arrow' && stroke.points.length >= 2) {
        const a = stroke.points[0]!
        const b = stroke.points[stroke.points.length - 1]!
        const x1 = a.x * canvas.width
        const y1 = a.y * canvas.height
        const x2 = b.x * canvas.width
        const y2 = b.y * canvas.height
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        const angle = Math.atan2(y2 - y1, x2 - x1)
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(
          x2 - 10 * Math.cos(angle - Math.PI / 6),
          y2 - 10 * Math.sin(angle - Math.PI / 6),
        )
        ctx.lineTo(
          x2 - 10 * Math.cos(angle + Math.PI / 6),
          y2 - 10 * Math.sin(angle + Math.PI / 6),
        )
        ctx.closePath()
        ctx.fillStyle = stroke.color
        ctx.fill()
        continue
      }
      ctx.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * canvas.width
        const y = point.y * canvas.height
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }

  const showFlowRail = flow != null || flowSteps.length > 0 || submitting
  const panelStyle = useMemo(() => {
    if (!selection) return undefined
    const panelWidth = showFlowRail ? 520 : 360
    const gap = 14
    const preferRight = selection.x + selection.width + gap + panelWidth <= window.innerWidth - 12
    const left = preferRight
      ? selection.x + selection.width + gap
      : Math.max(12, selection.x - panelWidth - gap)
    const top = Math.min(
      Math.max(12, selection.y),
      window.innerHeight - 360,
    )
    return { left, top, width: panelWidth }
  }, [selection, showFlowRail])

  const modeVisual = MODES.find((item) => item.id === mode) ?? MODES[1]!
  const ModeIcon = modeVisual.icon
  const toolVisual = TOOLS.find((item) => item.id === tool) ?? TOOLS[0]!
  const ToolIcon = toolVisual.icon
  const hostChip = location ? formatHostChip(location) : null
  const anchorChip = location
    ? isWebSurface(location.surface)
      ? `Web · ${shortUrl(location.url)}`
      : location.workspacePath
        ? shortPath(location.workspacePath)
        : 'Screen'
    : null

  return (
    <div
      className="overlay-root"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {(phase === 'select' || phase === 'compose') && (
        <div className="overlay-dim" />
      )}
      {phase === 'select' && (
        <div className="overlay-hint">
          {displayBounds
            ? 'Drag to select any on-screen region · Esc to cancel'
            : 'Spatial Pin · screen capture'}
        </div>
      )}
      {selection && (
        <div
          className={`overlay-selection${phase === 'compose' ? ' overlay-selection-compose' : ''}`}
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          {phase === 'compose' && (
            <canvas
              ref={canvasRef}
              className="overlay-canvas"
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      )}

      {phase === 'compose' && selection && panelStyle && (
        <div
          ref={panelRef}
          className="overlay-panel"
          style={panelStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="overlay-panel-header">
            <span className="overlay-panel-title">Spatial Pin</span>
            {candidates.length > 0 ? (
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
              aria-label="Cancel"
              title="Cancel"
              onClick={() => void window.projectOS?.spatialPin.hideOverlay()}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className={`overlay-compose-row${showFlowRail ? ' overlay-compose-row-split' : ''}`}>
            <div className="overlay-composer">
              <div className="overlay-composer-body">
                <textarea
                  ref={promptRef}
                  className="overlay-prompt"
                  rows={2}
                  value={prompt}
                  placeholder={
                    mode === 'ask'
                      ? 'Ask about this region…'
                      : mode === 'plan'
                        ? 'Describe the plan for this region…'
                        : mode === 'debug'
                          ? 'Describe the bug in this region…'
                          : 'Describe what to change…'
                  }
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    autosizePrompt()
                  }}
                  onBlur={() => void persistDraft()}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void onSubmit()
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
                      aria-expanded={openMenu === 'mode'}
                      aria-haspopup="listbox"
                      onClick={() =>
                        setOpenMenu((current) =>
                          current === 'mode' ? null : 'mode',
                        )
                      }
                    >
                      <ModeIcon size={13} strokeWidth={2} aria-hidden />
                      <span className="overlay-chip-label">{modeVisual.label}</span>
                      <ChevronDown
                        size={12}
                        strokeWidth={2}
                        className="overlay-chip-caret"
                        aria-hidden
                      />
                    </button>
                    {openMenu === 'mode' && (
                      <div className="overlay-dropdown overlay-dropdown-up" role="listbox">
                        {MODES.map((item) => {
                          const Icon = item.icon
                          const active = item.id === mode
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`overlay-menu-item ${item.toneClass}${active ? ' overlay-menu-item-active' : ''}`}
                              onClick={() => {
                                setMode(item.id)
                                setOpenMenu(null)
                                void persistDraft({ mode: item.id })
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
                    )}
                  </div>

                  <div className="overlay-menu-wrap">
                    <button
                      type="button"
                      className="overlay-chip"
                      aria-expanded={openMenu === 'tool'}
                      aria-haspopup="listbox"
                      title="Annotate"
                      onClick={() =>
                        setOpenMenu((current) =>
                          current === 'tool' ? null : 'tool',
                        )
                      }
                    >
                      <ToolIcon size={13} strokeWidth={2} aria-hidden />
                      <span className="overlay-chip-label">{toolVisual.label}</span>
                      <ChevronDown
                        size={12}
                        strokeWidth={2}
                        className="overlay-chip-caret"
                        aria-hidden
                      />
                    </button>
                    {openMenu === 'tool' && (
                      <div className="overlay-dropdown overlay-dropdown-up" role="listbox">
                        {TOOLS.map((item) => {
                          const Icon = item.icon
                          const active = item.id === tool
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`overlay-menu-item${active ? ' overlay-menu-item-active' : ''}`}
                              onClick={() => {
                                setTool(item.id)
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
                        <div className="overlay-menu-sep" />
                        <button
                          type="button"
                          className="overlay-menu-item overlay-menu-item-danger"
                          onClick={() => {
                            setStrokes([])
                            setOpenMenu(null)
                            void persistDraft({ strokes: [] })
                          }}
                        >
                          <Eraser
                            size={14}
                            strokeWidth={2}
                            className="overlay-menu-item-icon"
                            aria-hidden
                          />
                          Clear marks
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="overlay-send"
                  disabled={submitting || !prompt.trim()}
                  aria-label={submitting ? 'Sending' : 'Submit'}
                  title="Submit (⌘↵)"
                  onClick={() => void onSubmit()}
                >
                  <Send size={14} strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            </div>

            {showFlowRail ? (
              <aside className="overlay-flow-rail" aria-live="polite">
                <div className="overlay-flow-rail-header">Flow</div>
                <AgentActivityIndicator
                  state={
                    flow === 'reading'
                      ? 'searching'
                      : flow === 'writing'
                        ? 'shaping'
                        : flow === 'verifying' || flow === 'error'
                          ? 'solving'
                          : flow === 'done'
                            ? 'composing'
                            : submitting || flow === 'thinking'
                              ? 'working'
                              : 'composing'
                  }
                  label={currentCompactFlowLabel(flowSteps, flow)}
                />
                {flowSteps.length > 0 ? (
                  <ol className="overlay-flow-steps">
                    {flowSteps.slice(-6).map((step) => (
                      <li
                        key={step.id}
                        className={`overlay-flow-step overlay-flow-step-${step.status}`}
                      >
                        <span className="overlay-flow-step-dot" aria-hidden />
                        <span className="overlay-flow-step-label">{step.label}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </aside>
            ) : null}
          </div>

          <div className="overlay-meta">
            {hostChip ? <span className="overlay-meta-chip">{hostChip}</span> : null}
            {anchorChip ? <span className="overlay-meta-chip">{anchorChip}</span> : null}
            {location?.inferredPath && !hostChip?.includes(location.inferredPath) ? (
              <span className="overlay-meta-chip">{location.inferredPath}</span>
            ) : null}
            {webEnhanceAvailable ? (
              <span className="overlay-meta-chip">Chrome enhance</span>
            ) : null}
          </div>
          {status ? (
            <div className="overlay-meta-status">{status}</div>
          ) : null}
        </div>
      )}

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
            {item.pin.links?.runId &&
            activeRunId === item.pin.links.runId &&
            flow ? (
              <div className="overlay-status flow">Flow: {flow}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function formatHostChip(location: LocationKey): string | null {
  const parts: string[] = []
  if (location.appName) parts.push(location.appName)
  if (location.deviceKind === 'ios-simulator') parts.push('iOS Simulator')
  else if (location.deviceKind === 'android-emulator') parts.push('Android Emulator')
  else if (location.deviceKind === 'ide' && !location.appName) parts.push('IDE')
  if (location.inferredPath) parts.push(location.inferredPath)
  return parts.length > 0 ? parts.join(' · ') : null
}

function normalizePoint(
  clientX: number,
  clientY: number,
  selection: ScreenRect,
): { x: number; y: number } | null {
  if (selection.width <= 0 || selection.height <= 0) return null
  const x = (clientX - selection.x) / selection.width
  const y = (clientY - selection.y) / selection.height
  if (x < 0 || y < 0 || x > 1 || y > 1) return null
  return { x, y }
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
