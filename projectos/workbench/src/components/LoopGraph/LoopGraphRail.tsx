import { useEffect, useRef, useState } from 'react'
import type { LoopDocumentStatus, LoopGraphHead } from '@contracts/index'
import {
  CircleCheck,
  CircleDashed,
  FilePen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import styles from './LoopGraphRail.module.css'

const EXPAND_DELAY_MS = 350
const COLLAPSE_DELAY_MS = 180

const STATUS_ICON = {
  draft: FilePen,
  compiled: CircleDashed,
  approved: CircleCheck,
  running: Play,
  paused: Pause,
  complete: CircleCheck,
  error: TriangleAlert,
} as const satisfies Record<
  LoopDocumentStatus,
  typeof FilePen
>

const STATUS_DOT = {
  draft: '',
  compiled: styles.statusDotReview,
  approved: '',
  running: styles.statusDotRunning,
  paused: styles.statusDotReview,
  complete: '',
  error: styles.statusDotError,
} as const

interface Props {
  items: LoopGraphHead[]
  activeLoopId: string | null
  onOpen: (loopId: string) => void
  onCreate: () => void
}

export default function LoopGraphRail({
  items,
  activeLoopId,
  onOpen,
  onCreate,
}: Props) {
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [])

  const clearTimers = () => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }

  const onEnter = () => {
    clearTimers()
    expandTimer.current = setTimeout(() => setExpanded(true), EXPAND_DELAY_MS)
  }

  const onLeave = () => {
    clearTimers()
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS)
  }

  return (
    <div className={styles.slot} data-loop-graph-rail-slot="">
      <nav
        className={`${styles.rail} ${expanded ? styles.railExpanded : ''}`}
        aria-label={ts('chat.loopGraph.rail')}
        data-loop-graph-rail=""
        data-expanded={expanded ? 'true' : 'false'}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocusCapture={() => {
          clearTimers()
          setExpanded(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onLeave()
          }
        }}
      >
        <div className={styles.list}>
          {items.map((item) => {
            const StatusIcon = STATUS_ICON[item.status] ?? RefreshCw
            const active = item.id === activeLoopId
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                data-status={item.status}
                aria-current={active ? 'true' : undefined}
                aria-label={item.title}
                title={item.title}
                onClick={() => onOpen(item.id)}
              >
                <span className={styles.icon}>
                  <StatusIcon size={18} strokeWidth={2} aria-hidden />
                </span>
                <span className={styles.label}>
                  <span className={styles.labelTitle}>{item.title}</span>
                  <span className={styles.labelMeta}>
                    <span
                      className={`${styles.statusDot} ${STATUS_DOT[item.status]}`}
                      aria-hidden
                    />
                    {ts(`chat.loopGraph.status.${item.status}`)} · r{item.draftRevision}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.create}
          aria-label={ts('chat.loopGraph.create')}
          title={ts('chat.loopGraph.create')}
          onClick={onCreate}
        >
          <span className={styles.createIcon}>
            <Plus size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.createLabel}>{ts('chat.loopGraph.create')}</span>
        </button>
      </nav>
    </div>
  )
}
