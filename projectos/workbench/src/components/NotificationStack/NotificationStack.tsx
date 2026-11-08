import { useMemo } from 'react'
import { useI18n } from '../../i18n'
import {
  selectNotificationStacks,
  useNotificationCenterStore,
} from '../../state/notificationCenterStore'
import NotificationTypeStack from './NotificationTypeStack'
import styles from './NotificationStack.module.css'

export default function NotificationStack() {
  const { ts } = useI18n()
  const items = useNotificationCenterStore((s) => s.items)
  const expandedGroups = useNotificationCenterStore((s) => s.expandedGroups)
  const stacks = useMemo(() => selectNotificationStacks(items), [items])

  // Keep a typed stack visible while it has active banners, or while expanded
  // with archived items sitting below (Mac-style).
  const liveStacks = stacks.filter(
    (bucket) =>
      bucket.active.length > 0 ||
      (Boolean(expandedGroups[bucket.group]) && bucket.archived.length > 0),
  )
  if (liveStacks.length === 0) return null

  return (
    <div className={styles.host} aria-label={ts('notificationCenter.stackLabel')}>
      {liveStacks.map((bucket) => (
        <NotificationTypeStack key={bucket.group} bucket={bucket} />
      ))}
    </div>
  )
}
