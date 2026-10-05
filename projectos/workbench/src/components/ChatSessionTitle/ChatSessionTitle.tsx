import { useMemo } from 'react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import ChatHistoryScrollingTitle from '../ChatHistory/ChatHistoryScrollingTitle'
import styles from './ChatSessionTitle.module.css'

export default function ChatSessionTitle() {
  const { ts } = useI18n()
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const heads = useChatSessionStore((s) => s.heads)

  const title = useMemo(() => {
    const untitled = ts('chat.history.untitled')
    if (!activeSessionId) return untitled
    const head = heads.find((item) => item.id === activeSessionId)
    return head?.title.trim() || untitled
  }, [activeSessionId, heads, ts])

  return (
    <div className={styles.root} aria-label={ts('chat.sessionTitle.label')}>
      <ChatHistoryScrollingTitle
        title={title}
        containerClassName={styles.title}
        textClassName={styles.titleText}
        scrollableTextClassName={styles.titleTextScrollable}
        scrollingTextClassName={styles.titleTextScrolling}
      />
    </div>
  )
}
