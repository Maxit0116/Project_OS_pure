import type { LucideIcon } from 'lucide-react'
import styles from './SettingsPanel.module.css'

interface Props {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}

export default function SettingsNavRow({ label, icon: Icon, active, onClick }: Props) {
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={15} strokeWidth={1.75} className={styles.navItemIcon} aria-hidden />
      <span className={styles.navItemLabel}>{label}</span>
    </button>
  )
}
