import { type ReactNode } from 'react'
import styles from './Glass.module.css'

/**
 * Tech-style shell for navigation panels — solid surface, hairline border.
 * Replaces the Tier B glass shell; no live backdrop sampling or rim refraction.
 */

interface GlassPanelShellProps {
  children: ReactNode
  className?: string
  /** Which edge gets the stronger border highlight. */
  edge?: 'left' | 'right' | 'top' | 'none'
  /** When false, children render without the shell (e.g. code editor tab). */
  active?: boolean
  /** Restores pointer events when parent layout is in graph-bleed pass-through mode. */
  zoneInteractive?: boolean
}

export default function GlassPanelShell({
  children,
  className = '',
  edge = 'none',
  active = true,
  zoneInteractive = false,
}: GlassPanelShellProps) {
  if (!active) {
    return (
      <div className={className} {...(zoneInteractive ? { 'data-zone-interactive': '' } : {})}>
        {children}
      </div>
    )
  }

  return (
    <div
      className={`${styles.panelShell} ${styles[`edge${edge.charAt(0).toUpperCase()}${edge.slice(1)}`]} ${className}`}
      data-glass-panel
      {...(zoneInteractive ? { 'data-zone-interactive': '' } : {})}
    >
      <div className={styles.panelContent}>{children}</div>
    </div>
  )
}
