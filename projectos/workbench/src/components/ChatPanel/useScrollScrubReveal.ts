import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  isScrubGesture,
  measureScrollVelocity,
  NAV_SCRUB_BURST_WINDOW_MS,
  NAV_SCRUB_IDLE_MS,
  NAV_SCRUB_SUPPRESS_MS,
  type ScrollSample,
} from './conversationNavTurns'

/**
 * Reveals while the user is scrubbing a scroll container, then hides after
 * idle. Programmatic scrolls can be suppressed via `suppress()`.
 */
export function useScrollScrubReveal(
  scrollParentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): { scrubbing: boolean; suppress: (ms?: number) => void } {
  const [scrubbing, setScrubbing] = useState(false)
  const scrubbingRef = useRef(false)
  const suppressUntilRef = useRef(0)
  const lastSampleRef = useRef<ScrollSample>({ top: 0, t: 0 })
  const burstRef = useRef({ startT: 0, delta: 0 })
  const idleTimerRef = useRef<number | null>(null)

  const setScrubbingBoth = useCallback((next: boolean) => {
    scrubbingRef.current = next
    setScrubbing(next)
  }, [])

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const bumpIdle = useCallback(() => {
    clearIdle()
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      setScrubbingBoth(false)
    }, NAV_SCRUB_IDLE_MS)
  }, [clearIdle, setScrubbingBoth])

  const suppress = useCallback((ms = NAV_SCRUB_SUPPRESS_MS) => {
    suppressUntilRef.current = performance.now() + ms
  }, [])

  useEffect(() => {
    if (!enabled) {
      clearIdle()
      setScrubbingBoth(false)
      return
    }

    const parent = scrollParentRef.current
    if (!parent) return

    lastSampleRef.current = { top: parent.scrollTop, t: performance.now() }
    burstRef.current = { startT: performance.now(), delta: 0 }

    const onScroll = () => {
      const now = performance.now()
      const next: ScrollSample = { top: parent.scrollTop, t: now }

      if (now < suppressUntilRef.current) {
        lastSampleRef.current = next
        burstRef.current = { startT: now, delta: 0 }
        return
      }

      const frameDelta = Math.abs(next.top - lastSampleRef.current.top)
      const velocity = measureScrollVelocity(lastSampleRef.current, next)
      lastSampleRef.current = next

      if (now - burstRef.current.startT > NAV_SCRUB_BURST_WINDOW_MS) {
        burstRef.current = { startT: now, delta: frameDelta }
      } else {
        burstRef.current.delta += frameDelta
      }

      if (
        isScrubGesture({
          velocity,
          burstDeltaPx: burstRef.current.delta,
        })
      ) {
        setScrubbingBoth(true)
        bumpIdle()
        return
      }

      // While already revealed, any scroll activity extends the idle window.
      if (scrubbingRef.current) {
        bumpIdle()
      }
    }

    parent.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      parent.removeEventListener('scroll', onScroll)
      clearIdle()
    }
  }, [bumpIdle, clearIdle, enabled, scrollParentRef, setScrubbingBoth])

  return { scrubbing, suppress }
}
