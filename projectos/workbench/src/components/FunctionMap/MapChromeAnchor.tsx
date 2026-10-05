import { useEffect, useRef } from 'react'
import { useFunctionMap } from './FunctionMapContext'
import styles from '../../layout/CenterPanel.module.css'

/** Matches `--duration-panel-enter` plus a small settle buffer. */
const PANEL_INSET_SETTLE_MS = 520

/** Sentinel in the center column that anchors map chrome (controls, minimap) in bleed mode. */
export default function MapChromeAnchor() {
  const { viewportChromeRef, setChromeInsets } = useFunctionMap()
  const rafRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const latestInsetsRef = useRef({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  })

  useEffect(() => {
    const el = viewportChromeRef.current
    if (!el) return

    const measureInsets = () => {
      const rect = el.getBoundingClientRect()
      return {
        left: rect.left,
        right: window.innerWidth - rect.right,
        top: rect.top,
        bottom: window.innerHeight - rect.bottom,
      }
    }

    const commitInsets = (force = false) => {
      const next = latestInsetsRef.current
      setChromeInsets(next, force ? { force: true } : undefined)
    }

    const update = () => {
      latestInsetsRef.current = measureInsets()

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        commitInsets()

        if (settleTimerRef.current !== null) {
          window.clearTimeout(settleTimerRef.current)
        }
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null
          latestInsetsRef.current = measureInsets()
          commitInsets(true)
        }, PANEL_INSET_SETTLE_MS)
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current)
    }
  }, [viewportChromeRef, setChromeInsets])

  return <div ref={viewportChromeRef} className={styles.mapBleedViewport} aria-hidden />
}
