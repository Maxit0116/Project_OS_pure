import { useRef } from 'react'
import { GitBranch, History, Plus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import Button from '../ui/Button'
import ChatHistoryMenu from './ChatHistoryMenu'
import styles from './ChatHistoryActions.module.css'

interface Props {
  visible?: boolean
}

export default function ChatHistoryActions({ visible = true }: Props) {
  const { ts } = useI18n()
  const historyOpen = useChatSessionStore((s) => s.historyOpen)
  const sessionGraphOpen = useChatSessionStore((s) => s.sessionGraphOpen)
  const toggleHistory = useChatSessionStore((s) => s.toggleHistory)
  const toggleSessionGraph = useChatSessionStore((s) => s.toggleSessionGraph)
  const setHistoryOpen = useChatSessionStore((s) => s.setHistoryOpen)
  const createSession = useChatSessionStore((s) => s.createSession)
  const historyAnchorRef = useRef<HTMLDivElement>(null)

  if (!visible) return null

  return (
    <div className={styles.root}>
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={ts('chat.sessionGraph.title')}
        aria-pressed={sessionGraphOpen}
        title={ts('chat.sessionGraph.title')}
        onClick={toggleSessionGraph}
      >
        <GitBranch size={16} aria-hidden />
      </Button>
      <div className={styles.historyWrap} ref={historyAnchorRef}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={ts('chat.history.showHistory')}
          aria-expanded={historyOpen}
          title={ts('chat.history.showHistory')}
          onClick={toggleHistory}
        >
          <History size={16} aria-hidden />
        </Button>
      </div>
      <ChatHistoryMenu
        open={historyOpen}
        anchorRef={historyAnchorRef}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
