import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'

export type ArtifactResizeEdge = 'east' | 'west' | 'north' | 'south'

export interface MapArtifactResizeEndParams {
  x: number
  y: number
  width: number
  height: number
}

interface Options {
  nodeId: string
  edge: ArtifactResizeEdge
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  onResizeStart?: () => void
  onResize?: (params: MapArtifactResizeEndParams) => void
  onResizeEnd?: (params: MapArtifactResizeEndParams) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readNumericStyle(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function readNodeSize(node: {
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
  style?: { width?: unknown; height?: unknown }
}) {
  const width =
    node.measured?.width ??
    (typeof node.width === 'number' ? node.width : undefined) ??
    readNumericStyle(node.style?.width, 280)
  const height =
    node.measured?.height ??
    (typeof node.height === 'number' ? node.height : undefined) ??
    readNumericStyle(node.style?.height, 160)
  return { width, height }
}

export function useMapArtifactPointerResize({
  nodeId,
  edge,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  onResizeStart,
  onResize,
  onResizeEnd,
}: Options) {
  const { getZoom } = useReactFlow()
  const store = useStoreApi()
  const sessionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      activeCleanupRef.current?.()
    },
    [],
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      activeCleanupRef.current?.()

      const node = store.getState().nodeLookup.get(nodeId)
      if (!node) return

      const { width: startWidth, height: startHeight } = readNodeSize(node)
      sessionRef.current = {
        x: node.position.x,
        y: node.position.y,
        width: startWidth,
        height: startHeight,
      }

      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const zoom = getZoom()
      let lastClientX = event.clientX
      let lastClientY = event.clientY

      const pushChanges = (next: { x: number; y: number; width: number; height: number }) => {
        sessionRef.current = next
        const changes = []
        const affectsX = edge === 'west'
        const affectsY = edge === 'north'

        if (affectsX || affectsY) {
          changes.push({
            id: nodeId,
            type: 'position' as const,
            position: { x: next.x, y: next.y },
          })
        }

        changes.push({
          id: nodeId,
          type: 'dimensions' as const,
          resizing: true,
          setAttributes: edge === 'east' || edge === 'west' ? ('width' as const) : ('height' as const),
          dimensions: {
            width: next.width,
            height: next.height,
          },
        })

        store.getState().triggerNodeChanges(changes)
        onResize?.(next)
      }

      // Mark the node as resizing before any resize-start side effects so the
      // canvas layout pass stays paused for the whole gesture.
      onResizeStart?.()
      pushChanges({
        x: node.position.x,
        y: node.position.y,
        width: startWidth,
        height: startHeight,
      })

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - lastClientX) / zoom
        const dy = (moveEvent.clientY - lastClientY) / zoom
        lastClientX = moveEvent.clientX
        lastClientY = moveEvent.clientY
        if (dx === 0 && dy === 0) return

        const current = sessionRef.current
        if (!current) return

        let { x, y, width, height } = current

        if (edge === 'east') {
          width = clamp(width + dx, minWidth, maxWidth)
        } else if (edge === 'west') {
          const nextWidth = clamp(width - dx, minWidth, maxWidth)
          x += width - nextWidth
          width = nextWidth
        } else if (edge === 'south') {
          height = clamp(height + dy, minHeight, maxHeight)
        } else {
          const nextHeight = clamp(height - dy, minHeight, maxHeight)
          y += height - nextHeight
          height = nextHeight
        }

        pushChanges({ x, y, width, height })
      }

      const cursor = edge === 'east' || edge === 'west' ? 'ew-resize' : 'ns-resize'
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

        const final = sessionRef.current
        sessionRef.current = null
        activeCleanupRef.current = null
        try {
          if (final) {
            const finalChanges = []
            if (edge === 'west' || edge === 'north') {
              finalChanges.push({
                id: nodeId,
                type: 'position' as const,
                position: { x: final.x, y: final.y },
              })
            }
            finalChanges.push({
              id: nodeId,
              type: 'dimensions' as const,
              resizing: false,
              dimensions: {
                width: final.width,
                height: final.height,
              },
            })
            store.getState().triggerNodeChanges(finalChanges)
            onResizeEnd?.(final)
          }
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
    [
      edge,
      getZoom,
      maxHeight,
      maxWidth,
      minHeight,
      minWidth,
      nodeId,
      onResize,
      onResizeEnd,
      onResizeStart,
      store,
    ],
  )

  return { onPointerDown }
}
