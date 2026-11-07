import { useEffect, useId, useRef } from 'react'
import type { SatelliteSide } from './hubLayout'
import { satelliteConnectorPath } from './hubLayout'
import styles from './hubMotion.module.css'

interface Props {
  from: { x: number; y: number }
  to: { x: number; y: number }
  side: SatelliteSide
  delayMs?: number
  reducedMotion?: boolean
}

export default function SatelliteConnector({
  from,
  to,
  side,
  delayMs = 0,
  reducedMotion = false,
}: Props) {
  const pathRef = useRef<SVGPathElement | null>(null)
  const glowId = useId().replace(/:/g, '')
  const d = satelliteConnectorPath(from, to, side)

  useEffect(() => {
    const el = pathRef.current
    if (!el || reducedMotion) return
    const length = el.getTotalLength()
    el.style.strokeDasharray = `${length}`
    el.style.strokeDashoffset = `${length}`
    const animation = el.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
      {
        duration: 420,
        delay: delayMs,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )
    return () => animation.cancel()
  }, [d, delayMs, reducedMotion])

  return (
    <g className={styles.connectorGroup}>
      <defs>
        <linearGradient
          id={`hub-conn-${glowId}`}
          gradientUnits="userSpaceOnUse"
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
        >
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.38)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
        </linearGradient>
      </defs>
      {/* Soft under-glow */}
      <path
        className={styles.connectorGlow}
        d={d}
        fill="none"
      />
      <path
        ref={pathRef}
        className={`${styles.connectorPath}${reducedMotion ? '' : ` ${styles.connectorPathDraw}`}`}
        d={d}
        stroke={`url(#hub-conn-${glowId})`}
      />
      {/* Ports sit on card borders so the curve reads as “plugged in”. */}
      <circle
        className={styles.connectorPort}
        cx={from.x}
        cy={from.y}
        r={3.5}
      />
      <circle
        className={styles.connectorPort}
        cx={to.x}
        cy={to.y}
        r={3.5}
      />
    </g>
  )
}
