import { useEffect, useRef, useState } from 'react'
import type { ChatSessionHead } from '@contracts/index'
import {
  Box,
  Bug,
  GitPullRequest,
  LayoutTemplate,
  Map,
  Plus,
  Search,
  Terminal,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { classifySessionTask } from './sessionTaskKind'
import styles from './WorkingSessionRail.module.css'

const EXPAND_DELAY_MS = 350
const COLLAPSE_DELAY_MS = 180

const TASK_ICON = {
  explore: Search,
  plan: Map,
  build: Box,
  fix: Bug,
  design: LayoutTemplate,
  git: GitPullRequest,
  setup: Terminal,
} as const

const STATUS_CLASS = {
  idle: '',
  running: styles.statusDotRunning,
  awaiting_review: styles.statusDotReview,
  error: styles.statusDotError,
} as const

interface Props {
  items: ChatSessionHead[]
  activeSessionId: string | null
  onOpen: (sessionId: string) => void
  onCreate: () => void
}

export default function WorkingSessionRail({
  items,
  activeSessionId,
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
    <div className={styles.slot} data-working-session-rail-slot="">
      <nav
        className={`${styles.rail} ${expanded ? styles.railExpanded : ''}`}
        aria-label={ts('chat.sessionGraph.workingRail')}
        data-working-session-rail=""
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
            const title = item.title.trim() || ts('chat.history.untitled')
            const task = classifySessionTask(title, item.responsibility)
            const TaskIcon = TASK_ICON[task]
            const active = item.id === activeSessionId
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                data-task={task}
                aria-current={active ? 'true' : undefined}
                aria-label={title}
                title={title}
                onClick={() => onOpen(item.id)}
              >
                <span className={styles.icon}>
                  <TaskIcon size={18} strokeWidth={2} aria-hidden />
                </span>
                <span className={styles.label}>
                  <span className={styles.labelTitle}>{title}</span>
                  <span className={styles.labelMeta}>
                    <span
                      className={`${styles.statusDot} ${STATUS_CLASS[item.status]}`}
                      aria-hidden
                    />
                    {ts(`chat.sessionGraph.status.${item.status}`)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.create}
          aria-label={ts('chat.history.newChat')}
          title={ts('chat.history.newChat')}
          onClick={onCreate}
        >
          <span className={styles.createIcon}>
            <Plus size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.createLabel}>{ts('chat.history.newChat')}</span>
        </button>
      </nav>
    </div>
  )
}
