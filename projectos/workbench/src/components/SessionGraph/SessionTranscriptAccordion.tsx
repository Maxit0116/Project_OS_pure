import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  buildSessionPromptHistory,
  type ChatSessionRecord,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { formatSessionGraphRelativeTime } from './sessionGraphCardMeta'
import styles from './SessionGraphCenterSheet.module.css'

interface Props {
  sessionId: string
  /** Shown when the session has no title and no user prompts yet. */
  fallbackTitle: string
  expanded: boolean
  onToggle: () => void
  meta?: ReactNode
  aside?: ReactNode
}

export default function SessionTranscriptAccordion({
  sessionId,
  fallbackTitle,
  expanded,
  onToggle,
  meta,
  aside,
}: Props) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const [record, setRecord] = useState<ChatSessionRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || loaded) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      if (!client || !projectId) {
        if (!cancelled) {
          setRecord(null)
          setLoading(false)
          setLoaded(true)
        }
        return
      }
      const next = await client.getChatSession(projectId, sessionId)
      if (!cancelled) {
        setRecord(next)
        setLoading(false)
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, expanded, loaded, projectId, sessionId])

  useEffect(() => {
    if (!expanded) setExpandedPromptId(null)
  }, [expanded])

  const rows = useMemo(
    () => (record ? buildSessionPromptHistory(record.messages) : []),
    [record],
  )

  const displayTitle = useMemo(() => {
    const sessionTitle = record?.head.title.trim()
    if (sessionTitle) return sessionTitle
    const firstPrompt = rows[0]?.user.content.trim()
    if (firstPrompt) return firstPrompt
    const fallback = fallbackTitle.trim()
    if (fallback) return fallback
    return ts('chat.history.untitled')
  }, [fallbackTitle, record?.head.title, rows, ts])

  return (
    <div
      className={`${styles.transcriptBlock} ${
        expanded ? styles.transcriptBlockExpanded : ''
      }`}
    >
      <div className={styles.transcriptHeader}>
        <button
          type="button"
          className={styles.transcriptToggle}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRight
            size={14}
            className={`${styles.historyChevron} ${
              expanded ? styles.historyChevronOpen : ''
            }`}
            aria-hidden
          />
          <span className={styles.transcriptTitle} title={displayTitle}>
            {displayTitle}
          </span>
        </button>
        {aside ? <div className={styles.transcriptAside}>{aside}</div> : null}
      </div>

      {meta ? <div className={styles.transcriptMeta}>{meta}</div> : null}

      {expanded ? (
        <div className={styles.transcriptBody}>
          {loading ? (
            <div className={styles.transcriptEmpty}>
              {ts('chat.sessionGraph.history.loading')}
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.transcriptEmpty}>
              {ts('chat.sessionGraph.history.empty')}
            </div>
          ) : (
            <ul className={styles.transcriptTurns}>
              {rows.map((row) => {
                const turnExpanded = expandedPromptId === row.user.id
                const hasReply = Boolean(row.assistantContent)
                return (
                  <li
                    key={row.user.id}
                    className={`${styles.historyRow} ${
                      turnExpanded ? styles.historyRowExpanded : ''
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.historyPrompt}
                      aria-expanded={turnExpanded}
                      onClick={() =>
                        setExpandedPromptId((current) =>
                          current === row.user.id ? null : row.user.id,
                        )
                      }
                    >
                      <ChevronRight
                        size={14}
                        className={`${styles.historyChevron} ${
                          turnExpanded ? styles.historyChevronOpen : ''
                        }`}
                        aria-hidden
                      />
                      <span className={styles.historyPromptText}>
                        {row.user.content.trim()}
                      </span>
                    </button>

                    {turnExpanded ? (
                      <div className={styles.historyReply}>
                        <div className={styles.historyReplyLabel}>
                          {ts('chat.sessionGraph.history.assistantLabel')}
                        </div>
                        {hasReply ? (
                          <div className={styles.historyReplyBody}>
                            {row.assistantContent}
                          </div>
                        ) : (
                          <div className={styles.historyReplyBodyMuted}>
                            {ts('chat.sessionGraph.history.assistantPending')}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className={styles.historyActions}>
                      <time
                        className={styles.historyTime}
                        dateTime={row.user.timestamp}
                      >
                        {formatSessionGraphRelativeTime(row.user.timestamp) ??
                          row.user.timestamp}
                        {!turnExpanded && row.assistantSummary
                          ? ` · ${ts('chat.sessionGraph.history.tapToExpand')}`
                          : null}
                      </time>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
