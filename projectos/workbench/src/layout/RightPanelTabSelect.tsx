import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { GlassLens } from '../components/Glass'
import { useI18n } from '../i18n'
import styles from './RightPanelTabSelect.module.css'

export type RightPanelTabId = 'chat' | 'harness'

interface Props {
  value: RightPanelTabId
  onChange: (id: RightPanelTabId) => void
  harnessDot?: boolean
}

const OPTIONS: RightPanelTabId[] = ['chat', 'harness']

export default function RightPanelTabSelect({ value, onChange, harnessDot }: Props) {
  const { ts } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ts('rightTabs.chat')}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.triggerLabel}>
          {value === 'chat' ? ts('rightTabs.chat') : ts('rightTabs.harness')}
        </span>
        {value === 'harness' && harnessDot ? <span className={styles.dot} aria-hidden /> : null}
        <ChevronDown size={12} strokeWidth={2.25} className={styles.chevron} aria-hidden />
      </button>
      {open ? (
        <div className={styles.menuAnchor} role="listbox">
          <GlassLens radius={12} tint="overlay" className={`${styles.menu} glass-overlay-enter`}>
            {OPTIONS.map((id) => {
              const active = id === value
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.option} ${active ? styles.optionActive : ''}`}
                  onClick={() => {
                    onChange(id)
                    setOpen(false)
                  }}
                >
                  <span>{id === 'chat' ? ts('rightTabs.chat') : ts('rightTabs.harness')}</span>
                  {id === 'harness' && harnessDot ? (
                    <span className={styles.dot} aria-hidden />
                  ) : null}
                </button>
              )
            })}
          </GlassLens>
        </div>
      ) : null}
    </div>
  )
}
