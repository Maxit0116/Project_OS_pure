import { useLayoutEffect, useState, type RefObject } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { navRailViewportLeft } from './conversationNavTurns'

export interface RailAnchorPoint {
  left: number
  top: number
}

/**
 * Keep a fixed-position rail glued to the AI Chat sidebar’s left exterior.
 *
 * Font zoom (⌘⇧+) and panel resize often skip `window.resize` / ResizeObserver,
 * so we also sample `getBoundingClientRect` every animation frame while active.
 */
export function useChatSidebarRailAnchor(
  host: HTMLElement | null,
  enabled: boolean,
  railRef: RefObject<HTMLElement | null>,
): RailAnchorPoint | null {
  const rightPanelWidth = useWorkbenchStore((s) => s.rightPanelWidth)
  const [anchor, setAnchor] = useState<RailAnchorPoint | null>(null)

  useLayoutEffect(() => {
    if (!host || !enabled) {
      setAnchor(null)
      return
    }

    const panel =
      host.closest('[data-zone="chat-panel"]') instanceof HTMLElement
        ? (host.closest('[data-zone="chat-panel"]') as HTMLElement)
        : host

    let raf = 0
    let cancelled = false
    let lastLeft = Number.NaN
    let lastTop = Number.NaN

    const apply = (next: RailAnchorPoint) => {
      const el = railRef.current
      if (el) {
        el.style.left = `${next.left}px`
        el.style.top = `${next.top}px`
      }
      if (
        Number.isFinite(lastLeft) &&
        Math.abs(lastLeft - next.left) < 0.5 &&
        Math.abs(lastTop - next.top) < 0.5
      ) {
        return
      }
      lastLeft = next.left
      lastTop = next.top
      setAnchor(next)
    }

    const sync = () => {
      if (cancelled) return
      const rect = panel.getBoundingClientRect()
      apply({
        left: navRailViewportLeft(rect.left),
        top: rect.top + rect.height / 2,
      })
    }

    const tick = () => {
      if (cancelled) return
      sync()
      raf = window.requestAnimationFrame(tick)
    }

    sync()
    raf = window.requestAnimationFrame(tick)

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(panel)
    const layer = panel.parentElement
    if (layer) ro?.observe(layer)

    window.addEventListener('resize', sync)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', sync)
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
    }
  }, [enabled, host, railRef, rightPanelWidth])

  return anchor
}
