import type { OrbSize, OrbState, OrbTheme } from 'thinking-orbs'
import styles from './ThinkingOrb.module.css'

export type { OrbSize, OrbState, OrbTheme }

interface Props {
  state?: OrbState
  size?: OrbSize
  theme?: OrbTheme
  speed?: number
  paused?: boolean
  label?: string
  className?: string
}

/** Status dot. Agent activity is a state, not an animated avatar. */
export default function ThinkingOrb({
  state = 'working',
  label,
  className = '',
}: Props) {
  return (
    <span
      className={`${styles.dot} ${className}`.trim()}
      data-state={state}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
