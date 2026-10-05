import { ThinkingOrb as ThinkingOrbCanvas, type OrbSize, type OrbState, type OrbTheme } from 'thinking-orbs'
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

export default function ThinkingOrb({
  state = 'working',
  size = 20,
  theme = 'auto',
  speed,
  paused,
  label,
  className = '',
}: Props) {
  return (
    <ThinkingOrbCanvas
      state={state}
      size={size}
      theme={theme}
      speed={speed}
      paused={paused}
      aria-label={label}
      className={`${styles.orb} ${styles[`size${size}`]} ${className}`.trim()}
    />
  )
}
