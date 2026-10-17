import { useRef } from 'react'
import { GitBranch, History, Plus, RefreshCw, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import Button from '../ui/Button'
import ChatHistoryMenu from './ChatHistoryMenu'
import styles from './ChatHistoryActions.module.css'

interface Props {
  visible?: boolean
  /** Session graph / history tools — chat tab only. */
  showSessionTools?: boolean
  onClose?: () => void
}

export default function ChatHistoryActions({
  visible = true,
  showSessionTools = true,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const historyOpen = useChatSessionStore((s) => s.historyOpen)
  const sessionGraphOpen = useChatSessionStore((s) => s.sessionGraphOpen)
  const loopGraphOpen = useChatSessionStore((s) => s.loopGraphOpen)
  const toggleHistory = useChatSessionStore((s) => s.toggleHistory)
  const toggleSessionGraph = useChatSessionStore((s) => s.toggleSessionGraph)
  const toggleLoopGraph = useChatSessionStore((s) => s.toggleLoopGraph)
  const setHistoryOpen = useChatSessionStore((s) => s.setHistoryOpen)
  const createSession = useChatSessionStore((s) => s.createSession)
  const historyAnchorRef = useRef<HTMLDivElement>(null)

  if (!visible) return null

  return (
    <div className={styles.root}>
      {showSessionTools ? (
        <>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={ts('chat.loopGraph.title')}
            aria-pressed={loopGraphOpen}
            title={ts('chat.loopGraph.title')}
            onClick={toggleLoopGraph}
          >
            <RefreshCw size={16} aria-hidden />
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
        </>
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
