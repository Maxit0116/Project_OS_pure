import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styles from './TabBar.module.css'

export interface TabItem {
  id: string
  label: string
  badge?: ReactNode
  dot?: boolean
}

interface Props {
  tabs: TabItem[]
  activeId: string
  onChange: (id: string) => void
  size?: 'sm' | 'md'
  /** nested = inside a frosted panel shell (no extra backdrop-filter) */
  chrome?: 'standalone' | 'nested'
}

export default function TabBar({ tabs, activeId, onChange, size = 'md', chrome = 'standalone' }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 })

  const updateIndicator = useMemo(
    () => () => {
      const barEl = barRef.current
      const activeEl = tabRefs.current[activeId]
      if (!barEl || !activeEl) {
        setIndicator((prev) => ({ ...prev, opacity: 0 }))
        return
      }
      const barRect = barEl.getBoundingClientRect()
      const activeRect = activeEl.getBoundingClientRect()
      setIndicator({
        left: activeRect.left - barRect.left,
        width: activeRect.width,
        opacity: 1,
      })
    },
    [activeId],
  )

  useEffect(() => {
    updateIndicator()
    const resizeObserver = new ResizeObserver(() => updateIndicator())
    if (barRef.current) resizeObserver.observe(barRef.current)
    window.addEventListener('resize', updateIndicator)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [updateIndicator, tabs, size])

  return (
    <div
      className={`${styles.bar} ${chrome === 'nested' ? styles.nested : ''}`}
      role="tablist"
      ref={barRef}
    >
      <span
        className={styles.indicator}
        aria-hidden
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: indicator.width,
          opacity: indicator.opacity,
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          className={`${styles.tab} ${size === 'sm' ? styles.sm : ''} ${activeId === tab.id ? styles.active : ''}`}
          onClick={() => onChange(tab.id)}
          ref={(el) => {
            tabRefs.current[tab.id] = el
          }}
        >
          {tab.label}
          {tab.dot && <span className={styles.dot} />}
          {tab.badge}
        </button>
      ))}
    </div>
  )
}
