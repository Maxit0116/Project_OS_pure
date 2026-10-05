import Link from 'next/link'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { SearchBar } from '@/components/ui/SearchBar'

export function Header({ user }: { user: any }) {
  return (
    <header className="app-header">
      <Link href="/" className="logo">SaaSKit</Link>
      <nav>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className="header-actions">
        <SearchBar placeholder="Search..." />
        <NotificationBell count={user?.unreadCount || 0} />
      </div>
    </header>
  )
}
