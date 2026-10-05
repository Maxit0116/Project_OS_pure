import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import styles from './LeftSidebarSection.module.css'

interface Props {
  title: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export default function LeftSidebarSection({ title, expanded, onToggle, children }: Props) {
  const [contentVisible, setContentVisible] = useState(expanded)

  useEffect(() => {
    if (expanded) {
      setContentVisible(true)
    }
  }, [expanded])

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        )}
        <span>{title}</span>
      </button>
      {contentVisible ? (
        <div
          className={`${styles.sectionBody} ${expanded ? '' : styles.sectionBodyCollapsed}`}
          hidden={!expanded}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
