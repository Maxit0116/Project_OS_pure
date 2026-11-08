import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  NOTIFICATION_STACK_GROUP_ORDER,
  type AppNotification,
  type NotificationStackGroup,
} from '../../notifications/notificationCenterTypes'
import {
  selectGroupMailbox,
  useNotificationCenterStore,
} from '../../state/notificationCenterStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './ReminderNotificationCenter.module.css'

function formatMailboxTime(at: number): string {
  const date = new Date(at)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  try {
    if (sameDay) {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    }
    if (date.getFullYear() === now.getFullYear()) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(date)
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return ''
  }
}

function MailRow({
  item,
  selected,
  onSelect,
  onOpen,
  onDelete,
}: {
  item: AppNotification
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const { ts } = useI18n()
  const unread = item.status === 'active'
  const at = item.status === 'active' ? item.createdAt : (item.archivedAt ?? item.createdAt)

  return (
    <div
      className={`${styles.mailRow} ${unread ? styles.mailRowUnread : ''} ${
        selected ? styles.mailRowSelected : ''
      }`}
      role="option"
      aria-selected={selected}
    >
      <button type="button" className={styles.mailMain} onClick={onSelect} onDoubleClick={onOpen}>
        <div className={styles.mailTop}>
          <span className={styles.mailSubject}>{item.title}</span>
          <span className={styles.mailTime}>{formatMailboxTime(at)}</span>
        </div>
        <div className={styles.mailSnippet}>
          <span className={styles.mailSnippetText}>{item.body}</span>
          {item.deliveredViaSystem ? (
            <span className={styles.mailTag}>{ts('notificationCenter.viaSystem')}</span>
          ) : null}
        </div>
      </button>
      <div className={styles.mailActions}>
        <button
          type="button"
          className={styles.mailActionBtn}
          aria-label={ts('notificationCenter.openAction')}
          onClick={onOpen}
        >
          {ts('notificationCenter.openAction')}
        </button>
        <button
          type="button"
          className={styles.mailActionBtn}
          aria-label={ts('notificationCenter.delete')}
          onClick={onDelete}
        >
          <Trash2 size={12} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function TypeColumn({
  group,
  items,
  selectedId,
  onSelect,
  onOpen,
  onDelete,
  onClearColumn,
}: {
  group: NotificationStackGroup
  items: AppNotification[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onClearColumn: () => void
}) {
  const { ts } = useI18n()
  const unreadCount = items.filter((item) => item.status === 'active').length

  return (
    <section className={styles.column} aria-label={ts(`notificationCenter.group.${group}`)}>
      <header className={styles.columnHeader}>
        <h3 className={styles.columnTitle}>{ts(`notificationCenter.group.${group}`)}</h3>
        <span className={styles.columnCount}>
          {unreadCount > 0
            ? ts('notificationCenter.columnUnread', { count: unreadCount })
            : ts('notificationCenter.columnTotal', { count: items.length })}
        </span>
        {items.length > 0 ? (
          <button
            type="button"
            className={styles.columnClear}
            onClick={onClearColumn}
            title={ts('notificationCenter.clearColumn')}
            aria-label={ts('notificationCenter.clearColumn')}
          >
            <Trash2 size={12} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className={styles.columnEmpty}>{ts('notificationCenter.columnEmpty')}</p>
      ) : (
        <div className={styles.mailList} role="listbox">
          {items.map((item) => (
            <MailRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={() => onSelect(item.id)}
              onOpen={() => onOpen(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function ReminderNotificationCenter() {
  const { ts } = useI18n()
  const items = useNotificationCenterStore((s) => s.items)
  const removeNotification = useNotificationCenterStore((s) => s.removeNotification)
  const removeGroup = useNotificationCenterStore((s) => s.removeGroup)
  const clearArchived = useNotificationCenterStore((s) => s.clearArchived)
  const activateNotification = useNotificationCenterStore((s) => s.activateNotification)
  const navigateFromAgentNotification = useWorkbenchStore((s) => s.navigateFromAgentNotification)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const columns = useMemo(
    () =>
      NOTIFICATION_STACK_GROUP_ORDER.map((group) => ({
        group,
        items: selectGroupMailbox(items, group),
      })),
    [items],
  )

  const totalCount = items.length

  const onOpen = (id: string) => {
    const item = activateNotification(id)
    if (!item || item.destination === 'none') return
    void navigateFromAgentNotification(item.destination, item.runIds[0], item.decisionId)
  }

  return (
    <div className={styles.page} aria-label={ts('notificationCenter.title')}>
      <div className={styles.pageToolbar}>
        <div className={styles.pageTitleBlock}>
          <h2 className={styles.pageTitle}>{ts('notificationCenter.title')}</h2>
          <p className={styles.pageHint}>{ts('notificationCenter.pageHint')}</p>
        </div>
        <div className={styles.pageToolbarSpacer} />
        <span className={styles.pageMeta}>
          {ts('notificationCenter.pageTotal', { count: totalCount })}
        </span>
        {totalCount > 0 ? (
          <button
            type="button"
            className={styles.pageClear}
            onClick={clearArchived}
          >
            {ts('notificationCenter.clearShelved')}
          </button>
        ) : null}
      </div>

      <div className={styles.board}>
        {columns.map((column) => (
          <TypeColumn
            key={column.group}
            group={column.group}
            items={column.items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={onOpen}
            onDelete={removeNotification}
            onClearColumn={() => removeGroup(column.group, 'all')}
          />
        ))}
      </div>
    </div>
  )
}
