import type { LiveNodeChangeEntry } from '../../../../services/live-graph/index.js'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './C4NodeDetailDrawer.module.css'

interface Props {
  change: LiveNodeChangeEntry
  onOpenDiff: (path: string) => void
  statusClass: (status: string) => string
}

export function nodeLiveChangeHeading(change: LiveNodeChangeEntry): string {
  return change.path
}

export default function NodeLiveChangeCard({
  change,
  onOpenDiff,
  statusClass,
}: Props) {
  const { ts } = useI18n()
  return (
    <li className={styles.actionCard}>
      <div className={styles.diffRow}>
        <div className={styles.activityMeta}>
          <div className={styles.activityTitle}>
            <span
              className={`${styles.statusDot} ${statusClass(change.status)}`}
              aria-hidden
            />
            <span className={`${styles.activityTitleText} ${styles.diffPath}`}>
              {change.path}
            </span>
          </div>
          <span className={styles.activitySub}>
            {ts(`map.liveGraph.kind.${change.kind}`)} ·{' '}
            {ts(
              `map.liveGraph.status.${
                change.status === 'error'
                  ? 'error'
                  : change.status === 'running'
                    ? 'running'
                    : 'complete'
              }`,
            )}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onOpenDiff(change.path)}>
          {ts('map.c4Detail.openDiff')}
        </Button>
      </div>
    </li>
  )
}
