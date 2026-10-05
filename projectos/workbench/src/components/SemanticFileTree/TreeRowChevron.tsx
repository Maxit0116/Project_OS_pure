import { ChevronRight } from 'lucide-react'
import styles from './SemanticFileTree.module.css'

interface TreeRowChevronProps {
  expanded: boolean
  visible: boolean
  onToggle: () => void
  label: string
}

export default function TreeRowChevron({ expanded, visible, onToggle, label }: TreeRowChevronProps) {
  if (!visible) {
    return <span className={styles.chevronSpacer} aria-hidden />
  }

  return (
    <span
      className={styles.chevronBtn}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      title={expanded ? `Collapse ${label}` : `Expand ${label}`}
      aria-hidden="true"
    >
      <ChevronRight
        size={14}
        strokeWidth={1.75}
        className={`${styles.chevronIcon} ${expanded ? styles.chevronExpanded : ''}`}
        aria-hidden
      />
    </span>
  )
}
