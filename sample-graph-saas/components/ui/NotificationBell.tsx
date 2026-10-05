import Link from 'next/link'

export function NotificationBell({ count }: { count: number }) {
  return (
    <Link href="/notifications" className="notification-bell">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
      </svg>
      {count > 0 && <span className="bell-badge">{count}</span>}
    </Link>
  )
}
