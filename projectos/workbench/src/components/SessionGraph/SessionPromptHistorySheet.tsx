import { useEffect, useState } from 'react'
import { ChevronRight, GitBranch, X } from 'lucide-react'
import { buildSessionPromptHistory, type ChatSessionRecord } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useSessionSweepStore } from '../../state/sessionSweepStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { formatSessionGraphRelativeTime } from './sessionGraphCardMeta'
import { resolveSessionForkPlacementFromMessages } from './sessionForkLayout'
import styles from './SessionGraphCenterSheet.module.css'

interface Props {
  sessionId: string
}

export default function SessionPromptHistorySheet({ sessionId }: Props) {
  const { ts } = useI18n()
  const closeCenterSheet = useSessionSweepStore((s) => s.closeCenterSheet)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const heads = useChatSessionStore((s) => s.heads)
  const client = useWorkbenchStore((s) => s.client)
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const [record, setRecord] = useState<ChatSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [branchingId, setBranchingId] = useState<string | null>(null)
  /** Accordion: at most one expanded assistant reply. */
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)

  const title = heads.find((head) => head.id === sessionId)?.title ?? sessionId

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setExpandedPromptId(null)
    void (async () => {
      if (!client || !projectId) {
        if (!cancelled) {
          setRecord(null)
          setLoading(false)
        }
        return
      }
      const next = await client.getChatSession(projectId, sessionId)
      if (!cancelled) {
        setRecord(next)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, projectId, sessionId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCenterSheet()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeCenterSheet])

  const rows = record ? buildSessionPromptHistory(record.messages) : []

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeCenterSheet()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={ts('chat.sessionGraph.history.title')}
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{ts('chat.sessionGraph.history.title')}</h2>
            <p className={styles.subtitle}>{title}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.sessionGraph.history.close')}
            onClick={() => closeCenterSheet()}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        {loading ? (
          <div className={styles.empty}>{ts('chat.sessionGraph.history.loading')}</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>{ts('chat.sessionGraph.history.empty')}</div>
        ) : (
          <ul className={styles.historyList}>
            {rows.map((row) => {
              const expanded = expandedPromptId === row.user.id
              const hasReply = Boolean(row.assistantContent)
              return (
                <li
                  key={row.user.id}
                  className={`${styles.historyRow} ${expanded ? styles.historyRowExpanded : ''}`}
                >
                  <button
                    type="button"
                    className={styles.historyPrompt}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedPromptId((current) =>
                        current === row.user.id ? null : row.user.id,
                      )
                    }
                  >
                    <ChevronRight
                      size={14}
                      className={`${styles.historyChevron} ${
                        expanded ? styles.historyChevronOpen : ''
                      }`}
                      aria-hidden
                    />
                    <span className={styles.historyPromptText}>{row.user.content.trim()}</span>
                  </button>

                  {expanded ? (
                    <div className={styles.historyReply}>
                      <div className={styles.historyReplyLabel}>
                        {ts('chat.sessionGraph.history.assistantLabel')}
                      </div>
                      {hasReply ? (
                        <div className={styles.historyReplyBody}>{row.assistantContent}</div>
                      ) : (
                        <div className={styles.historyReplyBodyMuted}>
                          {ts('chat.sessionGraph.history.assistantPending')}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className={styles.historyActions}>
                    <time className={styles.historyTime} dateTime={row.user.timestamp}>
                      {formatSessionGraphRelativeTime(row.user.timestamp) ?? row.user.timestamp}
                      {!expanded && row.assistantSummary
                        ? ` · ${ts('chat.sessionGraph.history.tapToExpand')}`
                        : null}
                    </time>
                    <button
                      type="button"
                      className={styles.toolbarButton}
                      disabled={branchingId === row.user.id}
                      onClick={() => {
                        setBranchingId(row.user.id)
                        const placement = resolveSessionForkPlacementFromMessages(
                          record?.messages ?? [],
                          row.user.id,
                        )
                        void forkSession(sessionId, row.user.id, placement).finally(() => {
                          setBranchingId(null)
                          closeCenterSheet()
                        })
                      }}
                    >
                      <GitBranch size={12} aria-hidden />
                      {ts('chat.sessionGraph.branchFromHere')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
