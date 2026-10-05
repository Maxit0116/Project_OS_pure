import Link from 'next/link'

const ADMIN_LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/analytics', label: 'Analytics' },
]

export function AdminNav() {
  return (
    <nav className="admin-nav">
      <h2>Admin</h2>
      <ul>
        {ADMIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
