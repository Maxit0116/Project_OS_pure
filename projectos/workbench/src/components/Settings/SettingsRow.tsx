import type { ReactNode } from 'react'
import styles from './SettingsPanel.module.css'

interface Props {
  title: string
  description?: string
  children?: ReactNode
  /** Stretch the action column for wide controls (textarea, multi-button). */
  stacked?: boolean
}

export default function SettingsRow({ title, description, children, stacked = false }: Props) {
  return (
    <div className={`${styles.settingRow} ${stacked ? styles.settingRowStacked : ''}`}>
      <div className={styles.settingRowText}>
        <div className={styles.settingRowTitle}>{title}</div>
        {description ? <div className={styles.settingRowDesc}>{description}</div> : null}
      </div>
      {children != null ? <div className={styles.settingRowAction}>{children}</div> : null}
    </div>
  )
}
