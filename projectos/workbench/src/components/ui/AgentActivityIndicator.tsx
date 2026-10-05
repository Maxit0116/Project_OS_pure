import type { ReactNode } from 'react'
import ThinkingOrb, { type OrbState } from './ThinkingOrb'
import styles from './AgentActivityIndicator.module.css'

type Variant = 'inline' | 'pill'

interface Props {
  state?: OrbState
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

  return (
    <div
      className={`${styles.root} ${styles[variant]} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <ThinkingOrb state={state} size={size} label={label} />
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
