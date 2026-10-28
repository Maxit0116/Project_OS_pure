import { CONTEXT_USAGE_CARD_ID, type ContextUsageMetrics } from './contextUsageMetrics'
import styles from './ContextUsageRing.module.css'

interface Props {
  metrics: ContextUsageMetrics
  active?: boolean
  onClick: () => void
  label: string
}

const SIZE = 18
const STROKE = 2.25
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function ContextUsageRing({ metrics, active = false, onClick, label }: Props) {
  const progress = Math.min(100, Math.max(0, metrics.percentFull))
  const dashOffset = CIRCUMFERENCE * (1 - progress / 100)

  return (
    <button
      type="button"
      className={`${styles.ringButton} ${active ? styles.ringButtonActive : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={active}
      aria-controls={CONTEXT_USAGE_CARD_ID}
      aria-label={label}
      title={label}
    >
      <svg
        className={styles.ringSvg}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
      >
        <circle
          className={styles.ringTrack}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
        />
        <circle
          className={styles.ringProgress}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
    </button>
  )
}
