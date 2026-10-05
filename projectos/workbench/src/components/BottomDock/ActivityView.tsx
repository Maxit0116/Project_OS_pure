import type { ActivityChannel } from '@contracts/index'
import { useActivityStore, type ActivityChannelFilter } from '../../state/activityStore'
import { useI18n } from '../../i18n'
import ActivityEntryRow from './ActivityEntryRow'
import styles from './ActivityView.module.css'

const CHANNELS: ActivityChannelFilter[] = ['all', 'agent', 'verification', 'build', 'system']

export default function ActivityView() {
  const activeChannel = useActivityStore((s) => s.activeChannel)
  const entries = useActivityStore((s) => s.entries)
  const setActiveChannel = useActivityStore((s) => s.setActiveChannel)
  const clearChannel = useActivityStore((s) => s.clearChannel)
  const { ts } = useI18n()

  const filtered =
    activeChannel === 'all'
      ? entries
      : entries.filter((entry) => entry.channel === activeChannel)

  const handleClear = () => {
    if (activeChannel === 'all') {
      useActivityStore.getState().clearAll()
      return
    }
    clearChannel(activeChannel as ActivityChannel)
  }

  return (
    <div className={styles.activityView}>
      <div className={styles.toolbar}>
        <select
          className={styles.channelSelect}
          value={activeChannel}
          onChange={(event) => setActiveChannel(event.target.value as ActivityChannelFilter)}
          aria-label={ts('activity.channelFilter')}
        >
          {CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {ts(`activity.channels.${channel}` as 'activity.channels.all')}
            </option>
          ))}
        </select>
        <button type="button" className={styles.clearBtn} onClick={handleClear}>
          {ts('activity.clear')}
        </button>
      </div>
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>{ts('activity.empty')}</p>
        ) : (
          filtered.map((entry) => <ActivityEntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}
