import { useState } from 'react'
import type { ActivityEntry } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './ActivityView.module.css'

interface Props {
  entry: ActivityEntry
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

export default function ActivityEntryRow({ entry }: Props) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const statusClass = entry.status ? styles[`status_${entry.status}`] : ''

  return (
    <div className={`${styles.entry} ${statusClass}`}>
      <time className={styles.time} dateTime={entry.timestamp}>
        {formatTime(entry.timestamp)}
      </time>
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{entry.title}</span>
        </div>
        {entry.detail ? <p className={styles.detail}>{entry.detail}</p> : null}
        {entry.body && expanded ? <pre className={styles.body}>{entry.body}</pre> : null}
        {entry.body ? (
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? ts('activity.collapse') : ts('activity.expand')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
