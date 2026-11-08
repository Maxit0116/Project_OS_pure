import { useI18n } from '../../i18n'
import {
  NOTIFICATION_STACK_MAX_HEIGHT_PX,
  type NotificationStackGroup,
} from '../../notifications/notificationCenterTypes'
import {
  useNotificationCenterStore,
  type NotificationStackBucket,
} from '../../state/notificationCenterStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import NotificationCard from './NotificationCard'
import styles from './NotificationStack.module.css'

interface Props {
  bucket: NotificationStackBucket
}

function groupLabelKey(group: NotificationStackGroup): string {
  return `notificationCenter.group.${group}`
}

export default function NotificationTypeStack({ bucket }: Props) {
  const { ts } = useI18n()
  const expanded = useNotificationCenterStore((s) => Boolean(s.expandedGroups[bucket.group]))
  const setGroupExpanded = useNotificationCenterStore((s) => s.setGroupExpanded)
  const archiveNotification = useNotificationCenterStore((s) => s.archiveNotification)
  const removeNotification = useNotificationCenterStore((s) => s.removeNotification)
  const removeGroup = useNotificationCenterStore((s) => s.removeGroup)
  const activateNotification = useNotificationCenterStore((s) => s.activateNotification)
  const navigateFromAgentNotification = useWorkbenchStore((s) => s.navigateFromAgentNotification)
  const beginFirstPrinciplesFromVision = useWorkbenchStore((s) => s.beginFirstPrinciplesFromVision)
  const setAskSubMode = useWorkbenchStore((s) => s.setAskSubMode)
  const dismissFirstPrinciplesSuggest = useWorkbenchStore((s) => s.dismissFirstPrinciplesSuggest)

  const { active, archived, group } = bucket
  if (active.length === 0 && archived.length === 0) return null

  const handleActivate = (id: string) => {
    const item = activateNotification(id)
    if (!item) return
    if (item.kind === 'first_principles_suggest') {
      const vision = item.visionText?.trim()
      if (vision) void beginFirstPrinciplesFromVision(vision)
      else setAskSubMode('first_principles')
      return
    }
    if (item.destination === 'none') return
    void navigateFromAgentNotification(item.destination, item.runIds[0], item.decisionId)
  }

  const handleIgnore = (id: string) => {
    removeNotification(id)
    dismissFirstPrinciplesSuggest()
  }

  const collapsed = !expanded && active.length > 1
  const visibleActive = collapsed ? active.slice(0, 3) : active
  const showArchivedBelow = expanded || (active.length <= 1 && archived.length > 0)

  return (
    <section className={styles.typeStack} aria-label={ts(groupLabelKey(group))}>
      <div className={styles.typeHeader}>
        <span className={styles.typeTitle}>{ts(groupLabelKey(group))}</span>
        <span className={styles.typeCount}>
          {active.length > 0
            ? ts('notificationCenter.activeCount', { count: active.length })
            : ts('notificationCenter.archivedOnlyCount', { count: archived.length })}
        </span>
        {active.length > 1 || archived.length > 0 ? (
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setGroupExpanded(group, !expanded)}
          >
            {expanded
              ? ts('notificationCenter.collapseStack')
              : ts('notificationCenter.expandStack', {
                  count: active.length + archived.length,
                })}
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div className={styles.stack} style={{ minHeight: 88 + Math.min(active.length - 1, 2) * 10 }}>
          {visibleActive.map((notification, index) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              stacked
              stackIndex={index}
              deleteWholeStack
              onActivate={handleActivate}
              onArchive={archiveNotification}
              onDelete={() => removeGroup(group, 'all')}
              onExpandStack={() => setGroupExpanded(group, true)}
              onIgnore={
                notification.kind === 'first_principles_suggest' ? handleIgnore : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className={styles.expanded} style={{ maxHeight: NOTIFICATION_STACK_MAX_HEIGHT_PX }}>
          <div className={styles.expandedList}>
            {visibleActive.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onActivate={handleActivate}
                onArchive={archiveNotification}
                onDelete={() => removeNotification(notification.id)}
                onIgnore={
                  notification.kind === 'first_principles_suggest' ? handleIgnore : undefined
                }
              />
            ))}
            {showArchivedBelow && archived.length > 0 ? (
              <>
                <div className={styles.archivedDivider}>
                  {ts('notificationCenter.archivedBelow')}
                </div>
                {archived.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    muted
                    onActivate={handleActivate}
                    onArchive={archiveNotification}
                    onDelete={() => removeNotification(notification.id)}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
