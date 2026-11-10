import type { ReactNode } from 'react'
import ThinkingOrb, { type ActivityOrbState } from './ThinkingOrb'
import LiveStatusPulse from './LiveStatusPulse'
import styles from './AgentActivityIndicator.module.css'

type Variant = 'inline' | 'pill'

interface Props {
  state?: ActivityOrbState
  label: string
  variant?: Variant
  className?: string
  children?: ReactNode
}

export default function AgentActivityIndicator({
  state = 'working',
  label,
  variant = 'inline',
  className = '',
  children,
}: Props) {
  const size = variant === 'pill' ? 64 : 20
  const live =
    state !== 'error' &&
    state !== 'failed' &&
    state !== 'complete' &&
    state !== 'idle'

  return (
    <div
      className={`${styles.root} ${styles[variant]} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-live={live ? 'true' : undefined}
    >
      <ThinkingOrb state={state} size={size} label={label} />
      <LiveStatusPulse active={live} variant="label" className={styles.label}>
        {label}
      </LiveStatusPulse>
      {children}
    </div>
  )
}
