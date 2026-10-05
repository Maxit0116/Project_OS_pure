import { useEffect, useMemo, useRef } from 'react'
import styles from './ComposerTriggerMenu.module.css'

export interface ComposerMenuItem {
  id: string
  label: string
  description?: string
  group: string
  disabled?: boolean
}

interface ComposerTriggerMenuProps {
  open: boolean
  items: ComposerMenuItem[]
  activeIndex: number
  onSelect: (item: ComposerMenuItem) => void
  onClose: () => void
  emptyLabel: string
}

export default function ComposerTriggerMenu({
  open,
  items,
  activeIndex,
  onSelect,
  onClose,
  emptyLabel,
}: ComposerTriggerMenuProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const active = listRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (listRef.current?.contains(event.target as Node)) return
      onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [onClose, open])

  const groups = useMemo(() => {
    const map = new Map<string, ComposerMenuItem[]>()
    for (const item of items) {
      const bucket = map.get(item.group) ?? []
      bucket.push(item)
      map.set(item.group, bucket)
    }
    return [...map.entries()]
  }, [items])

  if (!open) return null

  let itemIndex = -1

  return (
    <div className={styles.menu} ref={listRef} role="listbox">
      {items.length === 0 ? (
        <div className={styles.empty}>{emptyLabel}</div>
      ) : (
        groups.map(([group, groupItems]) => (
          <div key={group} className={styles.group}>
            <div className={styles.groupLabel}>{group}</div>
            {groupItems.map((item) => {
              itemIndex += 1
              const isActive = itemIndex === activeIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.item}
                  data-active={isActive ? 'true' : 'false'}
                  disabled={item.disabled}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    if (!item.disabled) onSelect(item)
                  }}
                >
                  <span className={styles.itemLabel}>{item.label}</span>
                  {item.description ? (
                    <span className={styles.itemDescription}>{item.description}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
