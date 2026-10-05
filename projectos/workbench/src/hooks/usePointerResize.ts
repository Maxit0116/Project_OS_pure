import { useCallback, useEffect, useRef } from 'react'

export type ResizeEdge = 'east' | 'west' | 'north' | 'south'

interface UsePointerResizeOptions {
  edge: ResizeEdge
  onDelta: (delta: number) => number | void
  value?: number
  min?: number
  max?: number
  onResizeStart?: () => void
  onResizeEnd?: () => void
  disabled?: boolean
}

function isVerticalEdge(edge: ResizeEdge): boolean {
  return edge === 'north' || edge === 'south'
}

export function usePointerResize({
  edge,
  onDelta,
  value,
  min,
  max,
  onResizeStart,
  onResizeEnd,
  disabled,
}: UsePointerResizeOptions) {
  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      activeCleanupRef.current?.()
    },
    [],
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      activeCleanupRef.current?.()

      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      let anchorPosition = isVerticalEdge(edge) ? event.clientY : event.clientX
      let lastPosition = anchorPosition
      let currentValue = value
      let anchorValue = value
      const bounded = value !== undefined && min !== undefined && max !== undefined
      onResizeStart?.()

      const onPointerMove = (moveEvent: PointerEvent) => {
        const pos = isVerticalEdge(edge) ? moveEvent.clientY : moveEvent.clientX
        const direction = edge === 'east' || edge === 'south' ? 1 : -1

        if (bounded && currentValue !== undefined && anchorValue !== undefined) {
          const desired = anchorValue + (pos - anchorPosition) * direction
          const effectiveMax = Math.max(min, max)
          const next = Math.min(effectiveMax, Math.max(min, desired))
          const requestedDelta = next - currentValue
          if (requestedDelta === 0) {
            if (next !== desired) {
              anchorPosition = pos
              anchorValue = currentValue
            }
            return
          }

          const reportedDelta = onDelta(requestedDelta)
          const appliedDelta =
            typeof reportedDelta === 'number' && Number.isFinite(reportedDelta)
              ? reportedDelta
              : requestedDelta
          currentValue += appliedDelta
          if (next !== desired || appliedDelta !== requestedDelta) {
            // Drop any over-travel at a clamp. The next reverse movement starts
            // from the visible handle position instead of traversing a dead zone.
            anchorPosition = pos
            anchorValue = currentValue
          }
          return
        }

        const rawDelta = pos - lastPosition
        lastPosition = pos
        if (rawDelta !== 0) onDelta(rawDelta * direction)
      }

      const cursor = isVerticalEdge(edge) ? 'row-resize' : 'col-resize'
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = cursor
      document.body.style.userSelect = 'none'

      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', finish)
        target.removeEventListener('pointercancel', finish)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        activeCleanupRef.current = null
        try {
          onResizeEnd?.()
        } finally {
          try {
            target.releasePointerCapture(event.pointerId)
          } catch {
            // Pointer capture can already be gone after DOM removal/cancellation.
          }
        }
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', finish)
      target.addEventListener('pointercancel', finish)
      activeCleanupRef.current = finish
    },
    [disabled, edge, max, min, onDelta, onResizeEnd, onResizeStart, value],
  )

  return { onPointerDown }
}
