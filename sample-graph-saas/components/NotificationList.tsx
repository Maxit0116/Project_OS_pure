'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface NotificationSummary {
  id: string
  message: string
  read: boolean
  createdAt: string
}

type NotificationState =
  | { status: 'loading'; notifications: NotificationSummary[] }
  | { status: 'ready'; notifications: NotificationSummary[] }
  | { status: 'error'; notifications: NotificationSummary[] }

export function NotificationList() {
  const [state, setState] = useState<NotificationState>({
    status: 'loading',
    notifications: [],
  })
  const [markingRead, setMarkingRead] = useState(false)

  useEffect(() => {
    let active = true
    async function loadNotifications() {
      try {
        const response = await fetch('/api/notifications')
        if (!response.ok) throw new Error('notification_request_failed')
        const notifications: unknown = await response.json()
        if (!Array.isArray(notifications)) throw new Error('notification_shape_invalid')
        if (active) {
          setState({
            status: 'ready',
            notifications: notifications as NotificationSummary[],
          })
        }
      } catch {
        if (active) {
          setState({ status: 'error', notifications: [] })
        }
      }
    }
    void loadNotifications()
    return () => {
      active = false
    }
  }, [])

  async function markAllRead() {
    setMarkingRead(true)
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH' })
      if (!response.ok) throw new Error('notification_update_failed')
      setState((current) => ({
        status: 'ready',
        notifications: current.notifications.map((notification) => ({
          ...notification,
          read: true,
        })),
      }))
    } catch {
      setState((current) => ({
        status: 'error',
        notifications: current.notifications,
      }))
    } finally {
      setMarkingRead(false)
    }
  }

  if (state.status === 'loading') {
    return <p role="status">Loading notifications...</p>
  }

  if (state.status === 'error' && state.notifications.length === 0) {
    return <p role="alert">Notifications could not be loaded. Try again later.</p>
  }

  if (state.notifications.length === 0) {
    return <p role="status">No notifications are stored for the demo user.</p>
  }

  const hasUnread = state.notifications.some((notification) => !notification.read)

  return (
    <div className="notification-list" aria-live="polite">
      {state.status === 'error' ? (
        <p role="alert">The latest read-state update could not be saved.</p>
      ) : null}
      {hasUnread ? (
        <button type="button" onClick={markAllRead} disabled={markingRead}>
          {markingRead ? 'Saving...' : 'Mark all as read'}
        </button>
      ) : (
        <p role="status">All notifications are read.</p>
      )}
      {state.notifications.map((notification) => (
        <div
          key={notification.id}
          className={notification.read ? 'notification' : 'notification unread'}
        >
          <p>{notification.message}</p>
          <time dateTime={notification.createdAt}>
            {formatDate(notification.createdAt)}
          </time>
        </div>
      ))}
    </div>
  )
}
