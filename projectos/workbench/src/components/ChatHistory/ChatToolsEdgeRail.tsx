import { useRef, useState } from 'react'
import {
  GitBranch,
  GitPullRequest,
  History,
  Package,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import ChatHistoryMenu from './ChatHistoryMenu'
import styles from './ChatToolsEdgeRail.module.css'

/**
 * Stage Manager–style tool rail on the AI Chat sidebar’s right edge.
 * Session / Loop / GitHub / Agent Flow / History appear when the pointer
 * nears that edge (or when history / keyboard focus keeps the rail open).
 */
export default function ChatToolsEdgeRail() {
  const { ts } = useI18n()
  const [hovering, setHovering] = useState(false)
  const historyOpen = useChatSessionStore((s) => s.historyOpen)
  const sessionGraphOpen = useChatSessionStore((s) => s.sessionGraphOpen)
  const loopGraphOpen = useChatSessionStore((s) => s.loopGraphOpen)
  const githubGraphOpen = useChatSessionStore((s) => s.githubGraphOpen)
  const marketplaceOpen = useChatSessionStore((s) => s.marketplaceOpen)
  const agentFlowOpen = useChatSessionStore((s) => s.agentFlowOpen)
  const toggleHistory = useChatSessionStore((s) => s.toggleHistory)
  const toggleSessionGraph = useChatSessionStore((s) => s.toggleSessionGraph)
  const toggleLoopGraph = useChatSessionStore((s) => s.toggleLoopGraph)
  const toggleGithubGraph = useChatSessionStore((s) => s.toggleGithubGraph)
  const toggleMarketplace = useChatSessionStore((s) => s.toggleMarketplace)
  const toggleAgentFlow = useChatSessionStore((s) => s.toggleAgentFlow)
  const setHistoryOpen = useChatSessionStore((s) => s.setHistoryOpen)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)
  const agentFlowLive = !agentFlowOpen && (flowStatus === 'running' || refineLoading)
  const historyAnchorRef = useRef<HTMLDivElement>(null)

  const revealed = hovering || historyOpen

  return (
    <div
      className={`${styles.host} ${revealed ? styles.revealed : ''}`}
      data-chat-tools-edge-rail=""
      data-revealed={revealed ? 'true' : 'false'}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        if (!historyOpen) setHovering(false)
      }}
    >
      <div
        className={styles.stack}
        role="toolbar"
        aria-label={ts('chat.toolsRail.label')}
      >
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-chat-tool="github-graph"
          aria-label={ts('chat.githubGraph.title')}
          aria-pressed={githubGraphOpen}
          title={ts('chat.githubGraph.title')}
          onClick={toggleGithubGraph}
        >
          <GitPullRequest size={16} aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-chat-tool="marketplace"
          aria-label={ts('chat.marketplace.title')}
          aria-pressed={marketplaceOpen}
          title={ts('chat.marketplace.title')}
          onClick={toggleMarketplace}
        >
          <Package size={16} aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.agentFlowButton}
          aria-label={ts('agentFlow.title')}
          aria-pressed={agentFlowOpen}
          title={ts('agentFlow.title')}
          onClick={toggleAgentFlow}
        >
          <Workflow size={16} aria-hidden />
          {agentFlowLive ? <span className={styles.liveDot} aria-hidden /> : null}
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
      </div>
      <ChatHistoryMenu
        open={historyOpen}
        anchorRef={historyAnchorRef}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
