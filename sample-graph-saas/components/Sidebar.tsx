import Link from 'next/link'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  return (
    <nav className={styles.root} style={{ width: 260, borderRight: '1px solid #dbe4f0', padding: 22, backgroundColor: '#0f172a', color: '#e2e8f0' }}>
      <div className={styles.brandMark}>OS</div>
      <h2>Workspace</h2>
      <p className={styles.subtitle}>Design-ready operations hub</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li className={styles.activeLink}><Link href="/dashboard">Dashboard</Link></li>
        <li className={styles.link}><Link href="/projects">Projects</Link></li>
        <li className={styles.link}><Link href="/team">Team</Link></li>
        <li className={styles.link}><Link href="/billing">Billing</Link></li>
        <li className={styles.link}><Link href="/settings">Settings</Link></li>
      </ul>
    </nav>
  )
}
