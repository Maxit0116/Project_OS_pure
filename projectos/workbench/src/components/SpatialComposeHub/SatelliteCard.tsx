import type { LucideIcon } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { SatelliteSide } from './hubLayout'
import styles from './hubMotion.module.css'

export type SatelliteTone =
  | 'neutral'
  | 'repo'
  | 'folder'
  | 'skill'
  | 'reference'
  | 'agent'
  | 'research'

interface Props {
  side: SatelliteSide
  title: string
  tone?: SatelliteTone
  icon?: LucideIcon
  delayMs?: number
  reducedMotion?: boolean
  rect: { x: number; y: number; width: number; height: number }
  actions?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  dragging?: boolean
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
}

const ENTER: Record<SatelliteSide, string> = {
  left: styles.satelliteEnterLeft,
  right: styles.satelliteEnterRight,
  bottom: styles.satelliteEnterBottom,
}

const TONE: Record<SatelliteTone, string> = {
  neutral: styles.toneNeutral,
  repo: styles.toneRepo,
  folder: styles.toneFolder,
  skill: styles.toneSkill,
  reference: styles.toneReference,
  agent: styles.toneAgent,
  research: styles.toneResearch,
}

export default function SatelliteCard({
  side,
  title,
  tone = 'neutral',
  icon: Icon,
  delayMs = 0,
  reducedMotion = false,
  rect,
  actions,
  children,
  footer,
  className,
  dragging = false,
  onDragHandlePointerDown,
}: Props) {
  return (
    <div
      className={`${styles.satellite} ${TONE[tone]}${reducedMotion || dragging ? '' : ` ${ENTER[side]}`}${dragging ? ` ${styles.satelliteDragging}` : ''}${className ? ` ${className}` : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        animationDelay: reducedMotion || dragging ? undefined : `${delayMs}ms`,
      }}
    >
      <div
        className={`${styles.satelliteHeader}${onDragHandlePointerDown ? ` ${styles.dragHandle}` : ''}`}
        onPointerDown={onDragHandlePointerDown}
        title={onDragHandlePointerDown ? 'Drag to reposition' : undefined}
      >
        <div className={styles.satelliteTitleRow}>
          {Icon ? (
            <span className={styles.satelliteIcon} aria-hidden>
              <Icon size={13} strokeWidth={2} />
            </span>
          ) : null}
          <span className={styles.satelliteTitle}>{title}</span>
        </div>
        {actions ? (
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children ? (
        <div
          className={styles.satelliteBody}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
      {footer ? (
        <div onPointerDown={(event) => event.stopPropagation()}>{footer}</div>
      ) : null}
    </div>
  )
}
