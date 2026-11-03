import type { ReactNode } from 'react'
import styles from './SettingsPanel.module.css'

interface Props {
  label?: string
  children: ReactNode
}

export default function SettingsGroup({ label, children }: Props) {
  return (
    <div className={styles.group}>
      {label ? <h3 className={styles.groupLabel}>{label}</h3> : null}
      <div className={styles.card}>{children}</div>
    </div>
  )
}
