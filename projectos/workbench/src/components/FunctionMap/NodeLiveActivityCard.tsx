import type { LiveNodeActivity } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './C4NodeDetailDrawer.module.css'

interface Props {
  activity: LiveNodeActivity
  onOpenInAgentFlow: (activity: LiveNodeActivity) => void
  statusClass: (status: string) => string
}

export function nodeLiveActivityHeading(
  activity: LiveNodeActivity,
  ts: (key: string, params?: Record<string, string | number>) => string,
): string {
  const agent = activity.agentId
    ? `${ts('map.liveGraph.agentLabel', { agent: activity.agentId })} · `
    : ''
  return `${agent}${ts(`map.liveGraph.kind.${activity.kind}`)} · ${activity.label}`
}

export default function NodeLiveActivityCard({
  activity,
  onOpenInAgentFlow,
  statusClass,
}: Props) {
  const { ts } = useI18n()
  return (
    <li className={styles.actionCard}>
      <div className={styles.activityMeta}>
        <div className={styles.activityTitle}>
          <span
            className={`${styles.statusDot} ${statusClass(activity.status)}`}
            aria-hidden
          />
          <span className={styles.activityTitleText}>
            {nodeLiveActivityHeading(activity, ts)}
          </span>
        </div>
        <span className={styles.activitySub}>
          {ts(
            `map.liveGraph.status.${
              activity.status === 'error'
                ? 'error'
                : activity.status === 'running'
                  ? 'running'
                  : 'complete'
            }`,
          )}
          {activity.taskId ? ` · ${activity.taskId}` : ''}
          {activity.runId ? ` · ${activity.runId.slice(0, 8)}` : ''}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => onOpenInAgentFlow(activity)}>
        {ts('map.c4Detail.openInAgentFlow')}
      </Button>
    </li>
  )
}
