import { useCallback, useEffect, useRef, useState } from 'react'

export type ComposePanelSize = { width: number; height: number }

/**
 * Measure live compose-panel box size so arrow tips dock to the real
 * 8 edge/corner anchors instead of a stale height estimate.
 *
 * Returns a *stable* per-arrowId ref callback. Inline `ref={(el) => …}`
 * identities change every render; React then calls the previous callback
 * with `null` and the new one with the node, which previously drove a
 * setState loop and crashed the workbench ("hit a rendering error").
 */
export function useComposePanelMetrics() {
  const [metrics, setMetrics] = useState<Record<string, ComposePanelSize>>({})
  const observersRef = useRef(new Map<string, ResizeObserver>())
  const callbacksRef = useRef(
    new Map<string, (el: HTMLElement | null) => void>(),
  )

  const publishSize = useCallback((arrowId: string, el: HTMLElement) => {
    const width = el.offsetWidth
    const height = el.offsetHeight
    if (width < 1 || height < 1) return
    setMetrics((prev) => {
      const cur = prev[arrowId]
      if (
        cur &&
        Math.abs(cur.width - width) < 0.5 &&
        Math.abs(cur.height - height) < 0.5
      ) {
        return prev
      }
      return { ...prev, [arrowId]: { width, height } }
    })
  }, [])

  const bindPanel = useCallback(
    (arrowId: string) => {
      const existing = callbacksRef.current.get(arrowId)
      if (existing) return existing

      const callback = (el: HTMLElement | null) => {
        const prevRo = observersRef.current.get(arrowId)
        if (prevRo) {
          prevRo.disconnect()
          observersRef.current.delete(arrowId)
        }
        if (!el) {
          setMetrics((prev) => {
            if (!(arrowId in prev)) return prev
            const next = { ...prev }
            delete next[arrowId]
            return next
          })
          return
        }
        const ro = new ResizeObserver(() => publishSize(arrowId, el))
        ro.observe(el)
        observersRef.current.set(arrowId, ro)
        // After layout — avoid sync setState during ref attach.
        queueMicrotask(() => publishSize(arrowId, el))
      }
      callbacksRef.current.set(arrowId, callback)
      return callback
    },
    [publishSize],
  )

  useEffect(
    () => () => {
      for (const ro of observersRef.current.values()) ro.disconnect()
      observersRef.current.clear()
      callbacksRef.current.clear()
    },
    [],
  )

  return { metrics, bindPanel }
}

export function resolveComposePanelSize(
  metrics: Record<string, ComposePanelSize>,
  arrowId: string,
  fallbackWidth: number,
  fallbackHeight: number,
): ComposePanelSize {
  return metrics[arrowId] ?? { width: fallbackWidth, height: fallbackHeight }
}
