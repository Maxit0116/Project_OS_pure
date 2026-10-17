import type { ReactNode } from 'react'
import {
  SESSION_GRAPH_GAP_PX,
  type SessionGraphCssInsets,
  type SessionGraphInsets,
} from '@contracts/index'
import styles from './GraphOverlayFrame.module.css'

export function GraphOverlayFrame({
  shield,
  resizing,
  label,
  children,
}: {
  shield: SessionGraphInsets | SessionGraphCssInsets
  resizing: boolean
  label: string
  children: ReactNode
}) {
  return (
    <div
      className={`${styles.shield} ${resizing ? styles.shieldResizing : ''}`}
      style={{ top: shield.top, right: shield.right, bottom: shield.bottom, left: shield.left }}
      data-graph-overlay-shield
      data-session-graph-shield
    >
      <section
        className={styles.card}
        style={{
          top: SESSION_GRAPH_GAP_PX,
          right: SESSION_GRAPH_GAP_PX,
          bottom: SESSION_GRAPH_GAP_PX,
          left: SESSION_GRAPH_GAP_PX,
        }}
        role="region"
        aria-label={label}
        data-graph-overlay-card
        data-session-graph-card
      >
        {children}
      </section>
    </div>
  )
}
