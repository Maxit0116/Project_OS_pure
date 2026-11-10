import type { OrbSize, OrbState, OrbTheme } from 'thinking-orbs'
import LiveStatusPulse from './LiveStatusPulse'
import styles from './ThinkingOrb.module.css'

export type { OrbSize, OrbState, OrbTheme }

/** The library's animation states plus the resting and finished states this marker also shows. */
export type ActivityOrbState = OrbState | 'error' | 'failed' | 'complete' | 'idle'

interface Props {
  state?: ActivityOrbState
  size?: OrbSize
  theme?: OrbTheme
  speed?: number
  paused?: boolean
  label?: string
  className?: string
}

/** Status marker. Live agent work uses a breathing accent dot. */
export default function ThinkingOrb({
  state = 'working',
  label,
  className = '',
}: Props) {
  const live =
    state !== 'error' &&
    state !== 'failed' &&
    state !== 'complete' &&
    state !== 'idle'

  if (live) {
    return (
      <span role={label ? 'img' : undefined} aria-label={label} className={className || undefined}>
        <LiveStatusPulse active className={styles.liveDot} />
      </span>
    )
  }

  return (
    <span
      className={`${styles.dot} ${className}`.trim()}
      data-state={state}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
