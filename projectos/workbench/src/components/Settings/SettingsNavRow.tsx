import { ChevronRight } from 'lucide-react'
import styles from './SettingsPanel.module.css'

interface Props {
  label: string
  summary?: string
  onClick: () => void
}

export default function SettingsNavRow({ label, summary, onClick }: Props) {
  return (
    <button type="button" className={styles.navRow} onClick={onClick}>
      <span className={styles.navRowContent}>
        <span className={styles.navRowLabel}>{label}</span>
        {summary && <span className={styles.navRowSummary}>{summary}</span>}
      </span>
      <ChevronRight size={16} strokeWidth={1.75} className={styles.navChevron} aria-hidden />
    </button>
  )
}
