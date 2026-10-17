import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export const SESSION_DRAG_HOLD_MS = 120
export const SESSION_DRAG_MOVE_PX = 4

export type SessionDropKind = 'rail' | 'graph' | 'folder' | 'canvas' | 'misc'

export type SessionDragSource = 'misc' | 'canvas' | 'rail'

export interface SessionDropTarget {
  kind: SessionDropKind
  graphId?: string
  folderId?: string
  railDropIndex?: number
}

export interface SessionDragState {
  /** Session being moved (misc / canvas). Absent when dragging a whole rail graph. */
  sessionId: string | null
  /** Graph being moved (rail). Also set for session drags once known. */
  graphId: string | null
  title: string
  source: SessionDragSource
  x: number
  y: number
  target: SessionDropTarget | null
  railDropIndex: number | null
}

function readDropTarget(element: Element | null): SessionDropTarget | null {
  const host = element?.closest?.('[data-session-graph-drop]') as HTMLElement | null
  if (!host) return null
  const kind = host.dataset.sessionGraphDrop as SessionDropKind | undefined
  if (!kind) return null
  if (kind === 'graph') {
    const graphId = host.dataset.graphId
    return graphId ? { kind, graphId } : null
  }
  if (kind === 'folder') {
    const folderId = host.dataset.folderId
    return folderId ? { kind, folderId } : null
  }
  return { kind }
}

function readRailDropIndex(
  clientY: number,
  draggedGraphId: string | null,
): number | null {
  const list = document.querySelector('[data-working-session-rail-list]')
  if (!list) return null
  const items = Array.from(
    list.querySelectorAll<HTMLElement>('[data-rail-entry-index]'),
  ).filter((el) => el.dataset.graphId !== draggedGraphId)
  if (items.length === 0) return 0
  for (const item of items) {
    const rect = item.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const idx = Number(item.dataset.railEntryIndex)
    if (!Number.isFinite(idx)) continue
    if (clientY < mid) return idx
  }
  const last = items[items.length - 1]
  const lastIdx = Number(last?.dataset.railEntryIndex)
  return Number.isFinite(lastIdx) ? lastIdx + 1 : items.length
}

interface Options {
  onDragStart: (state: Pick<SessionDragState, 'sessionId' | 'graphId' | 'source'>) => void
  onDragEnd: () => void
  onDrop: (state: SessionDragState, target: SessionDropTarget) => void
}

export function useSessionGraphDrag({ onDragStart, onDragEnd, onDrop }: Options) {
  const [drag, setDrag] = useState<SessionDragState | null>(null)
  const pendingRef = useRef<{
    sessionId: string | null
    graphId: string | null
    title: string
    source: SessionDragSource
    pointerId: number
    startX: number
    startY: number
    timer: ReturnType<typeof setTimeout>
    target: EventTarget | null
  } | null>(null)
  const dragRef = useRef<SessionDragState | null>(null)
  const activePointerRef = useRef<number | null>(null)
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
      graphId: string | null,
      title: string,
      source: SessionDragSource,
      pointerId: number,
      x: number,
      y: number,
      captureTarget: EventTarget | null,
    ) => {
      clearPending()
      if (captureTarget instanceof Element) {
        try {
          captureTarget.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
      }
      const next: SessionDragState = {
        sessionId,
        graphId,
        title,
        source,
        x,
        y,
        target: null,
        railDropIndex: null,
      }
      dragRef.current = next
      activePointerRef.current = pointerId
      setDrag(next)
      onDragStartRef.current({ sessionId, graphId, source })
    },
    [clearPending],
  )

  const endDrag = useCallback(() => {
    clearPending()
    if (dragRef.current) {
      dragRef.current = null
      setDrag(null)
      onDragEndRef.current()
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
      const target = readDropTarget(el)
      const overRail =
        target?.kind === 'rail' ||
        target?.kind === 'graph' ||
        target?.kind === 'folder' ||
        Boolean(el?.closest?.('[data-working-session-rail]'))
      const railDropIndex = overRail
        ? readRailDropIndex(event.clientY, current.graphId)
        : null
      const next: SessionDragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        target,
        railDropIndex,
      }
      dragRef.current = next
      setDrag(next)
    }

    const onUp = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return
      const current = dragRef.current
      const el = document.elementFromPoint(event.clientX, event.clientY)
      let target = current?.target ?? readDropTarget(el)
      if (current && target?.kind === 'rail' && current.railDropIndex != null) {
        target = { ...target, railDropIndex: current.railDropIndex }
      }
      if (
        current &&
        !target &&
        current.railDropIndex != null &&
        el?.closest?.('[data-working-session-rail]')
      ) {
        target = { kind: 'rail', railDropIndex: current.railDropIndex }
      }
      if (current && target) {
        const selfGraph =
          target.kind === 'graph' &&
          current.graphId &&
          target.graphId === current.graphId
        if (!selfGraph) {
          onDropRef.current(current, target)
        } else if (current.source === 'rail' && current.railDropIndex != null) {
          onDropRef.current(current, {
            kind: 'rail',
            railDropIndex: current.railDropIndex,
          })
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
        graphId?: string | null
        title: string
        source: SessionDragSource
      },
    ) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('[data-session-drag-ignore]')) return
      clearPending()
      const startX = event.clientX
      const startY = event.clientY
      const pointerId = event.pointerId
      const target = event.currentTarget
      const sessionId = payload.sessionId ?? null
      const graphId = payload.graphId ?? null
      pendingRef.current = {
        sessionId,
        graphId,
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
            graphId,
            payload.title,
            payload.source,
            pointerId,
            startX,
            startY,
            pending.target,
          )
        }, SESSION_DRAG_HOLD_MS),
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
      if (dx * dx + dy * dy >= SESSION_DRAG_MOVE_PX * SESSION_DRAG_MOVE_PX) {
        beginDrag(
          pending.sessionId,
          pending.graphId,
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

  return {
    drag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}

/**
 * Build a live rail preview: remove dragged graph, leave a gap at dropIndex.
 * `dropIndex` is relative to the list *without* the dragged graph.
 */
export function previewRailReorder(
  entries: Array<{ kind: string; graphId?: string; id?: string }>,
  draggedGraphId: string,
  dropIndex: number | null,
): { display: typeof entries; placeholderIndex: number | null } {
  const fromIndex = entries.findIndex(
    (entry) => entry.kind === 'graph' && entry.graphId === draggedGraphId,
  )
  if (fromIndex < 0) {
    return {
      display: entries,
      placeholderIndex:
        dropIndex == null
          ? null
          : Math.max(0, Math.min(entries.length, dropIndex)),
    }
  }
  const without = entries.filter((_, i) => i !== fromIndex)
  if (dropIndex == null) {
    return { display: without, placeholderIndex: null }
  }
  const insertAt = Math.max(0, Math.min(without.length, dropIndex))
  return { display: without, placeholderIndex: insertAt }
}
