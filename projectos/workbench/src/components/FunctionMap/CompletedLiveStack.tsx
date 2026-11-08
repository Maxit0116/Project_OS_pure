import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import drawerStyles from './C4NodeDetailDrawer.module.css'
import styles from './CompletedAgentActivityStack.module.css'

interface Props<T> {
  items: T[]
  expanded: boolean
  onToggle: () => void
  countLabel: string
  expandLabel: string
  collapseLabel: string
  testId: string
  faceText: (item: T) => string
  statusClassName: (item: T) => string
  renderItem: (item: T) => ReactNode
}

/** Shared collapsed deck + expandable list for completed Live sidebar rows. */
export default function CompletedLiveStack<T>({
  items,
  expanded,
  onToggle,
  countLabel,
  expandLabel,
  collapseLabel,
  testId,
  faceText,
  statusClassName,
  renderItem,
}: Props<T>) {
  if (items.length === 0) return null

  const top = items[0]!
  const behindCount = Math.min(Math.max(items.length - 1, 0), 2)
  const toggleLabel = expanded ? collapseLabel : expandLabel

  return (
    <div className={styles.stack} data-testid={testId}>
      <div className={styles.header}>
        <span className={styles.count}>{countLabel}</span>
        <button
          type="button"
          className={styles.toggle}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {expanded ? (
            <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>

      {expanded ? (
        <ul className={drawerStyles.actionList}>{items.map(renderItem)}</ul>
      ) : (
        <button
          type="button"
          className={styles.deckButton}
          onClick={onToggle}
          aria-expanded={false}
          aria-label={toggleLabel}
        >
          <span
            className={styles.deck}
            style={behindCount > 0 ? { paddingTop: `${behindCount * 3 + 2}px` } : undefined}
            aria-hidden
          >
            {Array.from({ length: behindCount }, (_, index) => {
              const depth = behindCount - index
              return (
                <span
                  key={depth}
                  className={styles.deckLayer}
                  style={{
                    transform: `translateY(${depth * -3}px) scale(${1 - depth * 0.03})`,
                    zIndex: behindCount + 1 - depth,
                    opacity: 1 - depth * 0.22,
                  }}
                />
              )
            })}
            <span className={`${styles.deckFace} ${styles.deckFaceFront}`}>
              <span className={`${drawerStyles.statusDot} ${statusClassName(top)}`} />
              <span className={styles.deckFaceText}>{faceText(top)}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
