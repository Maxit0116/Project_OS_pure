import type { ReactNode } from 'react'
import styles from './LiveStatusPulse.module.css'

type Variant = 'dot' | 'label'

interface Props {
  active?: boolean
  variant?: Variant
  className?: string
  children?: ReactNode
}

/**
 * Cursor-like live presence: opacity breath on the dot and on status copy.
 * Running text gently brightens/dims (not a gradient sweep). Complete/error stay static.
 */
export default function LiveStatusPulse({
  active = true,
  variant = 'dot',
  className = '',
  children,
}: Props) {
  if (variant === 'label') {
    return (
      <span
        className={`${styles.label} ${active ? styles.labelLive : ''} ${className}`.trim()}
        data-live={active ? 'true' : undefined}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={`${styles.dot} ${active ? styles.dotLive : ''} ${className}`.trim()}
      data-live={active ? 'true' : undefined}
      aria-hidden
    />
  )
}
