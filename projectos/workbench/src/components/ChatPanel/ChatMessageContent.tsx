import type { ChatMessage } from '../../state/workbenchStore'
import RestrictedMarkdown from './RestrictedMarkdown'
import styles from './ChatPanel.module.css'

export default function ChatMessageContent({ message }: { message: ChatMessage }) {
  return (
    <>
      {message.format === 'markdown'
        ? <RestrictedMarkdown>{message.content}</RestrictedMarkdown>
        : message.content}
      {message.notice && <p className={styles.messageNotice}>{message.notice}</p>}
    </>
  )
}
