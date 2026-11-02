import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export const CAPTURE_DRAG_HOLD_MS = 120
export const CAPTURE_DRAG_MOVE_PX = 4

export type CaptureDropKind =
  | 'misc'
  | 'folder'
  | 'session'
  | 'workspace-empty'
  | 'drill-folder'

export type CaptureDragSource = 'misc' | 'folder' | 'drill'

export interface CaptureDropTarget {
  kind: CaptureDropKind
  folderId?: string
  sessionId?: string
}

export interface CaptureDragState {
  sessionId: string | null
  folderId: string | null
  title: string
  source: CaptureDragSource
  x: number
  y: number
  target: CaptureDropTarget | null
}

function readDropTarget(element: Element | null): CaptureDropTarget | null {
  const host = element?.closest?.('[data-capture-drop]') as HTMLElement | null
  if (!host) return null
  const kind = host.dataset.captureDrop as CaptureDropKind | undefined
  if (!kind) return null
  if (kind === 'folder' || kind === 'drill-folder') {
    const folderId = host.dataset.folderId
    return folderId ? { kind, folderId } : null
  }
  if (kind === 'session') {
    const sessionId = host.dataset.sessionId
    return sessionId ? { kind, sessionId } : null
  }
  return { kind }
}

interface Options {
  onDragStart?: (state: Pick<CaptureDragState, 'sessionId' | 'folderId' | 'source'>) => void
  onDragEnd?: () => void
  onDrop: (state: CaptureDragState, target: CaptureDropTarget) => void
}

export function useCaptureFolderDrag({ onDragStart, onDragEnd, onDrop }: Options) {
  const [drag, setDrag] = useState<CaptureDragState | null>(null)
  const pendingRef = useRef<{
    sessionId: string | null
    folderId: string | null
    title: string
    source: CaptureDragSource
    pointerId: number
    startX: number
    startY: number
    timer: ReturnType<typeof setTimeout>
    target: EventTarget | null
  } | null>(null)
  const dragRef = useRef<CaptureDragState | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const onDragStartRef = useRef(onDragStart)
  const onDragEndRef = useRef(onDragEnd)
  const onDropRef = useRef(onDrop)
  onDragStartRef.current = onDragStart
  onDragEndRef.current = onDragEnd
  onDropRef.current = onDrop

  const clearPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRef.current = null
  }, [])

  const beginDrag = useCallback(
    (
      sessionId: string | null,
      folderId: string | null,
      title: string,
      source: CaptureDragSource,
      pointerId: number,
      x: number,
      y: number,
      captureTarget: EventTarget | null,
    ) => {
      clearPending()
      suppressClickRef.current = true
      if (captureTarget instanceof Element) {
        try {
          captureTarget.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
      }
      const next: CaptureDragState = {
        sessionId,
        folderId,
        title,
        source,
        x,
        y,
        target: null,
      }
      dragRef.current = next
      activePointerRef.current = pointerId
      setDrag(next)
      onDragStartRef.current?.({ sessionId, folderId, source })
    },
    [clearPending],
  )

  const endDrag = useCallback(() => {
    clearPending()
    if (dragRef.current) {
      dragRef.current = null
      setDrag(null)
      onDragEndRef.current?.()
    }
    activePointerRef.current = null
  }, [clearPending])

  useEffect(() => () => clearPending(), [clearPending])

  useEffect(() => {
    if (!drag) return undefined

    const onMove = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return
      const current = dragRef.current
      if (!current) return
      const el = document.elementFromPoint(event.clientX, event.clientY)
      const next: CaptureDragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        target: readDropTarget(el),
      }
      dragRef.current = next
      setDrag(next)
    }

    const onUp = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return
      const current = dragRef.current
      const el = document.elementFromPoint(event.clientX, event.clientY)
      const target = current?.target ?? readDropTarget(el)
      if (current && target) {
        const selfFolder =
          (target.kind === 'folder' || target.kind === 'drill-folder') &&
          current.source === 'folder' &&
          current.folderId &&
          target.folderId === current.folderId
        const selfSession =
          target.kind === 'session' &&
          current.sessionId &&
          target.sessionId === current.sessionId
        if (!selfFolder && !selfSession) {
          onDropRef.current(current, target)
        }
      }
      endDrag()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endDrag()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag, endDrag])

  const onPointerDown = useCallback(
    (
      event: ReactPointerEvent,
      payload: {
        sessionId?: string | null
        folderId?: string | null
        title: string
        source: CaptureDragSource
      },
    ) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('[data-capture-drag-ignore]')) return
      clearPending()
      const startX = event.clientX
      const startY = event.clientY
      const pointerId = event.pointerId
      const target = event.currentTarget
      const sessionId = payload.sessionId ?? null
      const folderId = payload.folderId ?? null
      pendingRef.current = {
        sessionId,
        folderId,
        title: payload.title,
        source: payload.source,
        pointerId,
        startX,
        startY,
        target,
        timer: setTimeout(() => {
          const pending = pendingRef.current
          if (!pending || pending.pointerId !== pointerId) return
          beginDrag(
            sessionId,
            folderId,
            payload.title,
            payload.source,
            pointerId,
            startX,
            startY,
            pending.target,
          )
        }, CAPTURE_DRAG_HOLD_MS),
      }
    },
    [beginDrag, clearPending],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      const dx = event.clientX - pending.startX
      const dy = event.clientY - pending.startY
      if (dx * dx + dy * dy >= CAPTURE_DRAG_MOVE_PX * CAPTURE_DRAG_MOVE_PX) {
        beginDrag(
          pending.sessionId,
          pending.folderId,
          pending.title,
          pending.source,
          pending.pointerId,
          event.clientX,
          event.clientY,
          pending.target,
        )
      }
    },
    [beginDrag],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const pending = pendingRef.current
      if (pending && pending.pointerId === event.pointerId) {
        clearPending()
      }
    },
    [clearPending],
  )

  const consumeClickSuppression = useCallback(() => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  return {
    drag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeClickSuppression,
  }
}
