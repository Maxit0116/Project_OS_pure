import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { computeTabDropIndex } from '../../Browser/browserTabReorder'

const DRAG_THRESHOLD_PX = 5
const AUTO_SCROLL_EDGE_PX = 28
const AUTO_SCROLL_STEP_PX = 10

export interface TabStripDragGhost {
  tabId: string
  width: number
  height: number
  offsetX: number
  y: number
  x: number
}

export type TabStripItem =
  | { kind: 'tab'; id: string }
  | { kind: 'spacer' }

interface UseTabStripDragOptions {
  tabIds: string[]
  tabListRef: React.RefObject<HTMLDivElement | null>
  tabRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  onReorder: (tabId: string, toIndex: number) => void
  onActivate: (tabId: string) => void
}

export function useTabStripDrag({
  tabIds,
  tabListRef,
  tabRefs,
  onReorder,
  onActivate,
}: UseTabStripDragOptions) {
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [ghost, setGhost] = useState<TabStripDragGhost | null>(null)

  const dragTabIdRef = useRef<string | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const fromIndexRef = useRef(-1)
  const didDragRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const pendingPointerRef = useRef<{
    tabId: string
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const documentListenersRef = useRef<{
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
  } | null>(null)
  const flipFirstRef = useRef<Map<string, number>>(new Map())

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const detachDocumentListeners = useCallback(() => {
    const listeners = documentListenersRef.current
    if (!listeners) return
    document.removeEventListener('pointermove', listeners.move)
    document.removeEventListener('pointerup', listeners.up)
    document.removeEventListener('pointercancel', listeners.up)
    documentListenersRef.current = null
  }, [])

  const readTabMetrics = useCallback(() => {
    const draggedId = dragTabIdRef.current
    return tabIds
      .filter((id) => id !== draggedId)
      .map((id) => {
        const el = tabRefs.current.get(id)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return { id, left: rect.left, width: rect.width }
      })
      .filter((metric): metric is { id: string; left: number; width: number } => metric !== null)
  }, [tabIds, tabRefs])

  const clearTabTransforms = useCallback(() => {
    tabRefs.current.forEach((el) => {
      el.style.transform = ''
      el.style.transition = ''
    })
  }, [tabRefs])

  const captureTabPositions = useCallback(() => {
    const positions = new Map<string, number>()
    tabRefs.current.forEach((el, id) => {
      if (id === dragTabIdRef.current) return
      positions.set(id, el.getBoundingClientRect().left)
    })
    return positions
  }, [tabRefs])

  const finishDrag = useCallback(
    (commit: boolean) => {
      const draggedId = dragTabIdRef.current
      const targetIndex = dropIndexRef.current

      stopAutoScroll()
      detachDocumentListeners()
      pendingPointerRef.current = null
      dragTabIdRef.current = null
      dropIndexRef.current = null
      fromIndexRef.current = -1
      flipFirstRef.current = new Map()
      clearTabTransforms()
      setDragTabId(null)
      setDropIndex(null)
      setGhost(null)

      if (commit && draggedId !== null && targetIndex !== null) {
        onReorder(draggedId, targetIndex)
      }

      window.setTimeout(() => {
        didDragRef.current = false
      }, 0)
    },
    [clearTabTransforms, detachDocumentListeners, onReorder, stopAutoScroll],
  )

  const updateDropIndex = useCallback(
    (clientX: number, draggedId: string) => {
      const nextIndex = computeTabDropIndex(clientX, tabIds, readTabMetrics(), draggedId)
      if (nextIndex !== dropIndexRef.current) {
        flipFirstRef.current = captureTabPositions()
        dropIndexRef.current = nextIndex
        setDropIndex(nextIndex)
      }
    },
    [captureTabPositions, readTabMetrics, tabIds],
  )

  const tickAutoScroll = useCallback(() => {
    const list = tabListRef.current
    const pointerX = lastPointerRef.current.x
    const draggedId = dragTabIdRef.current
    if (!list || !draggedId) return

    const rect = list.getBoundingClientRect()
    if (pointerX < rect.left + AUTO_SCROLL_EDGE_PX) {
      list.scrollLeft -= AUTO_SCROLL_STEP_PX
    } else if (pointerX > rect.right - AUTO_SCROLL_EDGE_PX) {
      list.scrollLeft += AUTO_SCROLL_STEP_PX
    }

    updateDropIndex(pointerX, draggedId)
    autoScrollFrameRef.current = requestAnimationFrame(tickAutoScroll)
  }, [tabListRef, updateDropIndex])

  const startAutoScroll = useCallback(() => {
    stopAutoScroll()
    autoScrollFrameRef.current = requestAnimationFrame(tickAutoScroll)
  }, [stopAutoScroll, tickAutoScroll])

  const beginDrag = useCallback(
    (tabId: string, clientX: number, pointerId: number) => {
      const tabEl = tabRefs.current.get(tabId)
      if (!tabEl) return

      const fromIndex = tabIds.indexOf(tabId)
      if (fromIndex < 0) return

      const rect = tabEl.getBoundingClientRect()
      didDragRef.current = true
      dragTabIdRef.current = tabId
      fromIndexRef.current = fromIndex
      dropIndexRef.current = fromIndex

      detachDocumentListeners()

      setDragTabId(tabId)
      setDropIndex(fromIndex)
      setGhost({
        tabId,
        width: rect.width,
        height: rect.height,
        offsetX: clientX - rect.left,
        y: rect.top,
        x: rect.left,
      })

      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return
        lastPointerRef.current = { x: event.clientX, y: event.clientY }
        setGhost((prev) =>
          prev
            ? {
                ...prev,
                x: event.clientX - prev.offsetX,
              }
            : prev,
        )
        updateDropIndex(event.clientX, tabId)
      }

      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return
        finishDrag(true)
      }

      documentListenersRef.current = { move: onMove, up: onUp }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
      startAutoScroll()
    },
    [detachDocumentListeners, finishDrag, startAutoScroll, tabIds, tabRefs, updateDropIndex],
  )

  const clearPendingPointer = useCallback(() => {
    pendingPointerRef.current = null
    detachDocumentListeners()
  }, [detachDocumentListeners])

  const onTitlePointerDown = useCallback(
    (tabId: string, event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0 || tabIds.length <= 1) return

      event.preventDefault()
      onActivate(tabId)

      const pointerId = event.pointerId
      const startX = event.clientX
      const startY = event.clientY
      lastPointerRef.current = { x: startX, y: startY }
      pendingPointerRef.current = { tabId, pointerId, startX, startY }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        lastPointerRef.current = { x: moveEvent.clientX, y: moveEvent.clientY }

        if (dragTabIdRef.current) return

        const pending = pendingPointerRef.current
        if (!pending || pending.tabId !== tabId) return

        const dx = moveEvent.clientX - pending.startX
        const dy = moveEvent.clientY - pending.startY
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
        if (Math.abs(dx) <= Math.abs(dy)) {
          clearPendingPointer()
          return
        }

        pendingPointerRef.current = null
        beginDrag(tabId, moveEvent.clientX, pointerId)
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        if (!dragTabIdRef.current) {
          clearPendingPointer()
        }
      }

      detachDocumentListeners()
      documentListenersRef.current = { move: onMove, up: onUp }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
    },
    [beginDrag, clearPendingPointer, detachDocumentListeners, onActivate, tabIds.length],
  )

  const onTitleClick = useCallback((event: ReactMouseEvent<HTMLSpanElement>) => {
    if (didDragRef.current) {
      event.stopPropagation()
    }
  }, [])

  useLayoutEffect(() => {
    if (!dragTabId || dropIndex === null) return

    const first = flipFirstRef.current
    if (first.size === 0) return

    const animated: HTMLElement[] = []

    first.forEach((firstLeft, id) => {
      const el = tabRefs.current.get(id)
      if (!el) return
      const delta = firstLeft - el.getBoundingClientRect().left
      if (Math.abs(delta) < 1) return

      el.style.transition = 'transform 0s'
      el.style.transform = `translateX(${delta}px)`
      animated.push(el)
    })

    flipFirstRef.current = new Map()

    if (animated.length === 0) return

    const frame = requestAnimationFrame(() => {
      for (const el of animated) {
        el.style.transition = 'transform 160ms var(--ease-out)'
        el.style.transform = 'translateX(0)'
      }
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [dragTabId, dropIndex, tabRefs])

  useEffect(() => {
    return () => {
      stopAutoScroll()
      detachDocumentListeners()
      pendingPointerRef.current = null
      clearTabTransforms()
    }
  }, [clearTabTransforms, detachDocumentListeners, stopAutoScroll])

  const stripItems = useMemo((): TabStripItem[] => {
    if (!dragTabId || dropIndex === null) {
      return tabIds.map((id) => ({ kind: 'tab', id }))
    }

    const fromIndex = tabIds.indexOf(dragTabId)
    if (fromIndex < 0) {
      return tabIds.map((id) => ({ kind: 'tab', id }))
    }

    const rest = tabIds.filter((id) => id !== dragTabId)
    let insertAt = dropIndex
    if (dropIndex > fromIndex) insertAt = dropIndex - 1
    insertAt = Math.max(0, Math.min(insertAt, rest.length))

    const items: TabStripItem[] = rest.map((id) => ({ kind: 'tab', id }))
    items.splice(insertAt, 0, { kind: 'spacer' })
    return items
  }, [dragTabId, dropIndex, tabIds])

  const shouldSuppressTabClick = useCallback(() => didDragRef.current, [])

  return {
    stripItems,
    dragTabId,
    ghost,
    isDragging: dragTabId !== null,
    onTitlePointerDown,
    onTitleClick,
    shouldSuppressTabClick,
  }
}
