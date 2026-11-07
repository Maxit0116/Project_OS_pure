import { Minus } from 'lucide-react'
import type { ContextAssembly } from '@contracts/index'
import { useI18n } from '../../../i18n'
import {
  CONTEXT_USAGE_CARD_ID,
  USAGE_SLOT_COLORS,
  buildContextUsageMetrics,
  formatTokenCount,
  type ContextUsageMetrics,
} from './contextUsageMetrics'
import styles from './ContextUsageCard.module.css'

export { CONTEXT_USAGE_CARD_ID }

interface Props {
  assembly: ContextAssembly | null
  open: boolean
  detailed?: boolean
  onClose: () => void
  onToggleDetailed?: () => void
  metrics?: ContextUsageMetrics
}

export default function ContextUsageCard({
  assembly,
  open,
  detailed = true,
  onClose,
  onToggleDetailed,
  metrics: metricsProp,
}: Props) {
  const { ts } = useI18n()
  const metrics = metricsProp ?? buildContextUsageMetrics(assembly)
  const visibleSegments = metrics.segments.filter((segment) => segment.tokens > 0)
  const legendSegments = visibleSegments.length > 0 ? visibleSegments : metrics.segments

  if (!open) return null

  return (
    <div
      id={CONTEXT_USAGE_CARD_ID}
      className={styles.card}
      role="dialog"
      aria-label={ts('context.usageCardTitle')}
    >
      <div className={styles.header}>
        <span className={styles.title}>{ts('context.usageCardTitle')}</span>
        <div className={styles.headerActions}>
          {onToggleDetailed ? (
            <button
              type="button"
              className={styles.reportLink}
              onClick={onToggleDetailed}
            >
              {detailed ? ts('context.usageCompact') : ts('context.usageDetailed')}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.collapseButton}
            onClick={onClose}
            aria-label={ts('context.collapse')}
            title={ts('context.collapse')}
          >
            <Minus size={14} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      <div className={styles.summaryRow}>
        <span className={styles.percent}>
          {ts('context.usagePercentFull', { percent: metrics.percentFull })}
        </span>
        <span className={styles.tokenTotal}>
          {ts('context.usageTokenTotal', {
            used: formatTokenCount(metrics.usedTokens),
            total: formatTokenCount(metrics.windowTokens),
          })}
        </span>
      </div>

      <div className={styles.bar} aria-hidden>
        {visibleSegments.length === 0 ? (
          <span className={styles.barEmpty} />
        ) : (
          visibleSegments.map((segment) => (
            <span
              key={segment.slot}
              className={styles.barSegment}
              style={{
                width: `${Math.max(segment.windowPercent, 0.8)}%`,
                background: USAGE_SLOT_COLORS[segment.slot],
              }}
            />
          ))
        )}
      </div>

      {detailed ? (
        <ul className={styles.legend}>
          {legendSegments.map((segment) => {
            const detail =
              segment.slot === 'retrieval' &&
              assembly &&
              !assembly.slots.retrieval.searched &&
              segment.tokens === 0
                ? ts('context.usageNotSearched')
                : formatTokenCount(segment.tokens)
            return (
              <li className={styles.legendRow} key={segment.slot}>
                <span
                  className={styles.swatch}
                  style={{ background: USAGE_SLOT_COLORS[segment.slot] }}
                  aria-hidden
                />
                <span className={styles.legendLabel}>
                  {ts(`context.usageSlots.${segment.slot}`)}
                </span>
                <span className={styles.legendValue}>{detail}</span>
              </li>
            )
          })}
          {assembly?.omissions.map((item) => (
            <li className={styles.omission} key={item.reason}>
              {ts(`context.usageOmissions.${item.reason}`)} · {item.count}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
