import type { CSSProperties, ReactNode } from 'react'
import styles from './Glass.module.css'

/**
 * Tech-style overlay surface — solid background, hairline border, no glass.
 * Drop-in replacement for the previous Tier B liquid-glass lens: keeps the
 * same props API so existing call sites render unchanged, but without any
 * refraction, backdrop sampling, or blur.
 */

interface GlassLensProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  radius?: number
  gain?: number
  /** Surface tint variant (mapped to tech tokens in Glass.module.css). */
  tint?: 'regular' | 'clear' | 'overlay'
}

export default function GlassLens({
  children,
  className = '',
  style,
  radius = 8,
}: GlassLensProps) {
  return (
    <div
      className={`${styles.techLens} ${className}`}
      style={{ ...style, borderRadius: radius }}
    >
      <div className={styles.lensContent}>{children}</div>
    </div>
  )
}
