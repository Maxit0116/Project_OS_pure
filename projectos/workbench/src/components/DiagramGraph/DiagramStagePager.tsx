import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useI18n } from '../../i18n'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import Button from '../ui/Button'
import {
  clampPagerOffset,
  isHorizontalGesture,
  pagerTrackTranslatePx,
  resolveDiagramNeighbors,
  shouldCommitPagerSwipe,
} from './diagramStageSwipe'
import styles from './DiagramStagePager.module.css'

interface Props {
  orderedDiagramIds: string[]
  onboarding?: ReactNode
}

type DragSession = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastT: number
  velocity: number
  axis: 'undecided' | 'horizontal' | 'vertical'
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function PageFrame({
  html,
  title,
  placeholder,
}: {
  html: string | null | undefined
  title: string
  placeholder: string
}) {
  if (html) {
    return (
      <iframe
        className={styles.iframe}
        title={title}
        sandbox="allow-scripts allow-same-origin"
        srcDoc={html}
        data-diagram-graph-frame=""
      />
    )
  }
  return (
    <div className={styles.placeholder} aria-hidden>
      {placeholder}
    </div>
  )
}

export default function DiagramStagePager({ orderedDiagramIds, onboarding }: Props) {
  const { ts } = useI18n()
  const currentArtifactId = useDiagramGraphStore((s) => s.currentArtifactId)
  const currentHtml = useDiagramGraphStore((s) => s.currentHtml)
  const previewCache = useDiagramGraphStore((s) => s.previewCache)
  const busy = useDiagramGraphStore((s) => s.busy)
  const ensuring = useDiagramGraphStore((s) => s.ensuring)
  const error = useDiagramGraphStore((s) => s.error)
  const onboardingOpen = useDiagramGraphStore((s) => s.onboardingOpen)
  const selectArtifact = useDiagramGraphStore((s) => s.selectArtifact)
  const warmupArtifact = useDiagramGraphStore((s) => s.warmupArtifact)

  const viewportRef = useRef<HTMLDivElement>(null)
  const currentPageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const offsetRef = useRef(0)
  const animatingRef = useRef(false)
  const wheelSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleOffsetRef = useRef<(velocityPxPerMs: number) => void>(() => {})

  const [viewportWidth, setViewportWidth] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [paging, setPaging] = useState(false)

  const neighbors = resolveDiagramNeighbors(orderedDiagramIds, currentArtifactId)
  const hasPrev = neighbors.prevId != null
  const hasNext = neighbors.nextId != null
  const canPage = Boolean(currentArtifactId && currentHtml && (hasPrev || hasNext) && !busy && !ensuring)

  const prevHtml = neighbors.prevId ? previewCache[neighbors.prevId]?.html ?? null : null
  const nextHtml = neighbors.nextId ? previewCache[neighbors.nextId]?.html ?? null : null

  useLayoutEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const measure = () => setViewportWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!canPage) return
    if (neighbors.prevId) void warmupArtifact(neighbors.prevId)
    if (neighbors.nextId) void warmupArtifact(neighbors.nextId)
  }, [canPage, neighbors.prevId, neighbors.nextId, warmupArtifact])

  useEffect(() => {
    offsetRef.current = 0
    setDragOffset(0)
    setAnimating(false)
    animatingRef.current = false
    setPaging(false)
    if (currentPageRef.current) currentPageRef.current.scrollTop = 0
  }, [currentArtifactId])

  useEffect(() => {
    return () => {
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
    }
  }, [])

  // Native non-passive wheel so trackpad horizontal swipes can call preventDefault.
  useEffect(() => {
    const node = viewportRef.current
    if (!node) return undefined
    const onWheelNative = (event: WheelEvent) => {
      if (!canPage || animatingRef.current) return
      if (!isHorizontalGesture(event.deltaX, event.deltaY, 1)) return
      const next = clampPagerOffset(offsetRef.current - event.deltaX, hasPrev, hasNext)
      if (next === offsetRef.current && offsetRef.current === 0) return
      event.preventDefault()
      setPaging(true)
      const clamped = clampPagerOffset(next, hasPrev, hasNext)
      offsetRef.current = clamped
      setDragOffset(clamped)
      if (wheelSettleTimer.current) clearTimeout(wheelSettleTimer.current)
      wheelSettleTimer.current = setTimeout(() => {
        settleOffsetRef.current(0)
      }, 90)
    }
    node.addEventListener('wheel', onWheelNative, { passive: false })
    return () => node.removeEventListener('wheel', onWheelNative)
  }, [canPage, hasPrev, hasNext])

  const setOffset = useCallback((next: number) => {
    const clamped = clampPagerOffset(next, hasPrev, hasNext)
    offsetRef.current = clamped
    setDragOffset(clamped)
  }, [hasPrev, hasNext])

  const finishCommit = useCallback(
    async (direction: -1 | 1) => {
      const targetId = direction < 0 ? neighbors.nextId : neighbors.prevId
      if (!targetId || !viewportWidth) {
        setOffset(0)
        setAnimating(false)
        animatingRef.current = false
        setPaging(false)
        return
      }

      const reduced = prefersReducedMotion()
      const destination = direction < 0 ? -viewportWidth : viewportWidth
      if (!reduced) {
        setAnimating(true)
        animatingRef.current = true
        setOffset(destination)
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 200)
        })
      }

      await selectArtifact(targetId)
      // Selection effect resets offset; clear animation flags here too.
      setAnimating(false)
      animatingRef.current = false
      setPaging(false)
      offsetRef.current = 0
      setDragOffset(0)
    },
    [neighbors.nextId, neighbors.prevId, selectArtifact, setOffset, viewportWidth],
  )

  const settleOffset = useCallback(
    (velocityPxPerMs: number) => {
      if (!viewportWidth || animatingRef.current) return
      const decision = shouldCommitPagerSwipe(offsetRef.current, viewportWidth, velocityPxPerMs)
      if (decision === 0) {
        setAnimating(true)
        animatingRef.current = true
        setOffset(0)
        window.setTimeout(() => {
          setAnimating(false)
          animatingRef.current = false
          setPaging(false)
        }, prefersReducedMotion() ? 0 : 200)
        return
      }
      void finishCommit(decision)
    },
    [finishCommit, setOffset, viewportWidth],
  )
  settleOffsetRef.current = settleOffset

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPage || event.button !== 0 || animatingRef.current) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      axis: 'undecided',
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.axis === 'undecided') {
      if (!isHorizontalGesture(dx, dy)) {
        if (Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx)) {
          drag.axis = 'vertical'
        }
        return
      }
      drag.axis = 'horizontal'
      setPaging(true)
    }
    if (drag.axis !== 'horizontal') return
    event.preventDefault()
    const now = performance.now()
    const dt = now - drag.lastT
    if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt
    drag.lastX = event.clientX
    drag.lastT = now
    setOffset(dx)
  }

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
    if (drag.axis !== 'horizontal') {
      setPaging(false)
      return
    }
    settleOffset(drag.velocity)
  }

  const translateX =
    viewportWidth > 0 ? pagerTrackTranslatePx(viewportWidth, dragOffset) : dragOffset

  const showEmpty = !currentHtml && !busy && !ensuring && !error && !onboardingOpen

  return (
    <div
      ref={viewportRef}
      className={[styles.viewport, paging ? styles.viewportPaging : ''].filter(Boolean).join(' ')}
      data-diagram-stage-pager=""
      data-paging={paging ? 'true' : 'false'}
      aria-label={ts('chat.diagramGraph.stagePager')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        className={[styles.track, animating ? styles.trackAnimated : ''].filter(Boolean).join(' ')}
        style={{ transform: `translate3d(${translateX}px, 0, 0)` }}
        data-diagram-stage-track=""
      >
        <div className={styles.page} aria-hidden={!hasPrev}>
          <PageFrame
            html={prevHtml}
            title={ts('chat.diagramGraph.preview')}
            placeholder={ts('chat.diagramGraph.stageSwipeHint')}
          />
        </div>
        <div className={styles.page} ref={currentPageRef} data-diagram-stage-current="">
          {currentHtml ? (
            <PageFrame
              html={currentHtml}
              title={ts('chat.diagramGraph.preview')}
              placeholder={ts('chat.diagramGraph.stageSwipeHint')}
            />
          ) : showEmpty ? (
            <div className={styles.empty}>{ts('chat.diagramGraph.empty')}</div>
          ) : null}
        </div>
        <div className={styles.page} aria-hidden={!hasNext}>
          <PageFrame
            html={nextHtml}
            title={ts('chat.diagramGraph.preview')}
            placeholder={ts('chat.diagramGraph.stageSwipeHint')}
          />
        </div>
      </div>

      {onboardingOpen && onboarding ? <div className={styles.onboarding}>{onboarding}</div> : null}
      {busy || ensuring ? (
        <div className={styles.loading}>{ts('chat.diagramGraph.generating')}</div>
      ) : null}
      {error && !(busy || ensuring) ? <div className={styles.error}>{error}</div> : null}
    </div>
  )
}

/** Onboarding card body used by the overlay (keeps pager free of style-choice wiring). */
export function DiagramStyleOnboardingCard({
  busy,
  onChooseProjectOs,
  onChooseDefault,
}: {
  busy: boolean
  onChooseProjectOs: () => void
  onChooseDefault: () => void
}) {
  const { ts } = useI18n()
  return (
    <div className={styles.onboardingCard}>
      <h3>{ts('chat.diagramGraph.onboardingTitle')}</h3>
      <p>{ts('chat.diagramGraph.onboardingBody')}</p>
      <div className={styles.onboardingActions}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={onChooseProjectOs}
        >
          {ts('chat.diagramGraph.styleProjectOs')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onChooseDefault}
        >
          {ts('chat.diagramGraph.styleDefault')}
        </Button>
      </div>
    </div>
  )
}
