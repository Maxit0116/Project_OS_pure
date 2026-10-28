import { Plus, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import Button from '../ui/Button'
import styles from './ChatHistoryActions.module.css'

interface Props {
  visible?: boolean
  /** New-chat control — chat tab only. Graph / history tools live on the edge rail. */
  showSessionTools?: boolean
  onClose?: () => void
}

export default function ChatHistoryActions({
  visible = true,
  showSessionTools = true,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const createSession = useChatSessionStore((s) => s.createSession)

  if (!visible) return null

  return (
    <div className={styles.root}>
      {showSessionTools ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={ts('chat.history.newChat')}
          title={ts('chat.history.newChat')}
          onClick={() => void createSession()}
        >
          <Plus size={16} aria-hidden />
        </Button>
      ) : null}
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={ts('common.close')}
          title={ts('common.close')}
          onClick={onClose}
        >
          <X size={16} strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
