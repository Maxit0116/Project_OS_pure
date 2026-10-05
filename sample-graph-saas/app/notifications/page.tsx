import { NotificationList } from '@/components/NotificationList'

export const metadata = { title: 'Notifications' }

export default function NotificationsPage() {
  return (
    <main className="notifications-page">
      <h1>Notifications</h1>
      <p>Database-backed notices for the fixed demo user.</p>
      <NotificationList />
    </main>
  )
}
