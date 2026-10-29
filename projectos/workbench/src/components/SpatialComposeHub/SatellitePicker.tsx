import { useEffect, useMemo, useRef } from 'react'
import styles from './hubMotion.module.css'
import {
  PICKER_HEIGHT,
  PICKER_WIDTH,
  placeSatellitePicker,
  type PickerRect,
  type PickerSide,
} from './placeSatellitePicker'

export interface SatellitePickerItem {
  id: string
  label: string
  description?: string
  selected?: boolean
}

interface Props {
  open: boolean
  title: string
  items: SatellitePickerItem[]
  loading?: boolean
  emptyLabel?: string
  anchorRect: PickerRect
  /** Other hub cards / compose card to avoid overlapping. */
  obstacleRects?: readonly PickerRect[]
  preferredSide?: PickerSide
  onClose: () => void
  onSelect: (id: string, meta?: { drill?: boolean }) => void
  /** Breadcrumb / path nav for folder picker. */
  pathLabel?: string
  onNavigateUp?: () => void
  /** When true, show a drill affordance on each item. */
  allowDrill?: boolean
}

export default function SatellitePicker({
  open,
  title,
  items,
  loading = false,
  emptyLabel = 'Nothing found',
  anchorRect,
  obstacleRects = [],
  preferredSide = 'right',
  onClose,
  onSelect,
  pathLabel,
  onNavigateUp,
  allowDrill = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const placement = useMemo(() => {
    if (!open) return { x: 0, y: 0, side: preferredSide as PickerSide }
    return placeSatellitePicker({
      anchor: anchorRect,
      obstacles: obstacleRects,
      preferredSide,
      pickerSize: { width: PICKER_WIDTH, height: PICKER_HEIGHT },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    })
  }, [open, anchorRect, obstacleRects, preferredSide])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={styles.picker}
      style={{ left: placement.x, top: placement.y }}
      data-picker-side={placement.side}
      role="listbox"
      aria-label={title}
    >
      <div className={styles.pickerHeader}>
        <span>{title}</span>
        {pathLabel ? (
          <button
            type="button"
            className={styles.pickerPath}
            onClick={onNavigateUp}
            disabled={!onNavigateUp}
          >
            {pathLabel}
          </button>
        ) : null}
      </div>
      <div className={styles.pickerBody}>
        {loading ? (
          <div className={styles.pickerEmpty}>Loading…</div>
        ) : items.length === 0 ? (
          <div className={styles.pickerEmpty}>{emptyLabel}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.pickerItemRow}>
              <button
                type="button"
                role="option"
                aria-selected={Boolean(item.selected)}
                className={`${styles.pickerItem}${item.selected ? ` ${styles.pickerItemSelected}` : ''}`}
                onClick={(event) =>
                  onSelect(item.id, {
                    drill: allowDrill && (event.metaKey || event.ctrlKey),
                  })
                }
              >
                <span className={styles.pickerItemLabel}>{item.label}</span>
                {item.description ? (
                  <span className={styles.pickerItemDesc}>{item.description}</span>
                ) : null}
              </button>
              {allowDrill ? (
                <button
                  type="button"
                  className={styles.pickerDrill}
                  aria-label={`Open ${item.label}`}
                  title="Open folder"
                  onClick={() => onSelect(item.id, { drill: true })}
                >
                  ›
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
