import Link from 'next/link'

export default function WorkspaceNav() {
  return (
    <nav aria-label="Workspace" style={{ width: 240, borderRight: '1px solid #eee', padding: 16 }}>
      <h2>Workspace</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li><Link href="/dashboard">Dashboard</Link></li>
        <li><Link href="/projects">Projects</Link></li>
        <li><Link href="/team">Team</Link></li>
        <li><Link href="/billing">Billing</Link></li>
        <li><Link href="/settings">Settings</Link></li>
      </ul>
    </nav>
  )
}
