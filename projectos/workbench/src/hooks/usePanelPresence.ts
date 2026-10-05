import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'

export type PanelMotionPhase = 'enter' | 'idle' | 'exit'

export interface PanelPresence {
  mounted: boolean
  phase: PanelMotionPhase
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * Keeps a panel mounted while its exit animation plays, so opening and closing
 * are symmetric. Closing sets `phase` to `exit` and unmounts only after the
 * exit animation finishes (or immediately when reduced motion is preferred).
 */
export function usePanelPresence(isOpen: boolean, exitDurationMs: number) {
  const [mounted, setMounted] = useState(isOpen)
  const [phase, setPhase] = useState<PanelMotionPhase>(isOpen ? 'enter' : 'idle')
  const exitTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (isOpen) {
      clearTimeout(exitTimer.current)
      setMounted(true)
      setPhase('enter')
      return
    }

    if (!mounted) return

    if (prefersReducedMotion()) {
      setMounted(false)
      setPhase('idle')
      return
    }

    setPhase('exit')
    // Fallback in case animationend does not fire (e.g. element detached).
    exitTimer.current = setTimeout(() => {
      setMounted(false)
      setPhase('idle')
    }, exitDurationMs + 80)
    return () => clearTimeout(exitTimer.current)
  }, [isOpen, mounted, exitDurationMs])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      // Ignore animations bubbling up from child elements.
      if (event.target !== event.currentTarget) return
      if (phase === 'exit') {
        clearTimeout(exitTimer.current)
        setMounted(false)
        setPhase('idle')
      } else if (phase === 'enter') {
        setPhase('idle')
      }
    },
    [phase],
  )

  return { mounted, phase, onAnimationEnd }
}
