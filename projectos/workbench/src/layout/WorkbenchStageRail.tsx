import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Code2,
  GitBranch,
  GitPullRequest,
  Globe,
  Map,
  Package,
  RefreshCw,
  Scan,
  Workflow,
} from 'lucide-react'
import { isDesktopApp } from '../data/clientMode'
import { useI18n } from '../i18n'
import { useChatSessionStore } from '../state/chatSessionStore'
import { useWorkbenchStore } from '../state/workbenchStore'
import Button from '../components/ui/Button'
import { STAGE_MANAGER_COLLAPSE_DELAY_MS } from './stageManagerHover'
import styles from './WorkbenchStageRail.module.css'

/**
 * Stage Manager–style horizontal rail under the top chrome.
 * Left: center-tab view switches. Right: graph / overlay toggles.
 */
export default function WorkbenchStageRail() {
  const { ts } = useI18n()
  const [hovering, setHovering] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const setCenterTab = useWorkbenchStore((s) => s.setCenterTab)
  const diffReady = useWorkbenchStore((s) => s.diffReady)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const refineLoading = useWorkbenchStore((s) => s.refineLoading)

  const sessionGraphOpen = useChatSessionStore((s) => s.sessionGraphOpen)
  const loopGraphOpen = useChatSessionStore((s) => s.loopGraphOpen)
  const githubGraphOpen = useChatSessionStore((s) => s.githubGraphOpen)
  const marketplaceOpen = useChatSessionStore((s) => s.marketplaceOpen)
  const agentFlowOpen = useChatSessionStore((s) => s.agentFlowOpen)
  const toggleSessionGraph = useChatSessionStore((s) => s.toggleSessionGraph)
  const toggleLoopGraph = useChatSessionStore((s) => s.toggleLoopGraph)
  const toggleGithubGraph = useChatSessionStore((s) => s.toggleGithubGraph)
  const toggleMarketplace = useChatSessionStore((s) => s.toggleMarketplace)
  const toggleAgentFlow = useChatSessionStore((s) => s.toggleAgentFlow)

  const agentFlowLive = !agentFlowOpen && (flowStatus === 'running' || refineLoading)
  // Hover / focus only — open overlays keep their pressed button state, but must
  // not pin the stage rail open (users expect Stage Manager–style tuck-away).
  const revealed = hovering

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const revealStage = useCallback(() => {
    clearHideTimer()
    setHovering(true)
  }, [clearHideTimer])

  const scheduleCollapse = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setHovering(false)
    }, STAGE_MANAGER_COLLAPSE_DELAY_MS)
  }, [clearHideTimer])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  return (
    <div
      className={`${styles.host} ${revealed ? styles.revealed : ''}`}
      data-workbench-stage-rail=""
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div
        className={styles.float}
        onPointerEnter={revealStage}
        onPointerLeave={scheduleCollapse}
        onFocusCapture={revealStage}
        onBlurCapture={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) return
          scheduleCollapse()
        }}
      >
        <div
          className={styles.stack}
          role="toolbar"
          aria-label={ts('topBar.stageRail.label')}
        >
          <div className={styles.group} role="group" aria-label={ts('topBar.stageRail.views')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={centerTab === 'function-map' ? styles.pressed : undefined}
              aria-label={ts('centerTabs.functionMap')}
              aria-pressed={centerTab === 'function-map'}
              title={ts('centerTabs.functionMap')}
              onClick={() => setCenterTab('function-map')}
            >
              <Map size={16} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={centerTab === 'spatial-captures' ? styles.pressed : undefined}
              aria-label={ts('centerTabs.spatialCaptures')}
              aria-pressed={centerTab === 'spatial-captures'}
              title={ts('centerTabs.spatialCaptures')}
              onClick={() => setCenterTab('spatial-captures')}
            >
              <Scan size={16} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`${styles.codeBtn} ${centerTab === 'code' ? styles.pressed : ''}`}
              aria-label={ts('centerTabs.codeDiff')}
              aria-pressed={centerTab === 'code'}
              title={ts('centerTabs.codeDiff')}
              onClick={() => setCenterTab('code')}
            >
              <Code2 size={16} aria-hidden />
              {diffReady ? <span className={styles.liveDot} aria-hidden /> : null}
            </Button>
            {isDesktopApp() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={centerTab === 'browser' ? styles.pressed : undefined}
                aria-label={ts('centerTabs.browser')}
                aria-pressed={centerTab === 'browser'}
                title={ts('centerTabs.browser')}
                onClick={() => setCenterTab('browser')}
              >
                <Globe size={16} aria-hidden />
              </Button>
            ) : null}
          </div>

          <span className={styles.separator} role="separator" aria-orientation="vertical">
            |
          </span>

          <div className={styles.group} role="group" aria-label={ts('topBar.stageRail.graphs')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sessionGraphOpen ? styles.pressed : undefined}
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
              className={loopGraphOpen ? styles.pressed : undefined}
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
              className={githubGraphOpen ? styles.pressed : undefined}
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
              className={marketplaceOpen ? styles.pressed : undefined}
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
              className={`${styles.agentFlowButton} ${agentFlowOpen ? styles.pressed : ''}`}
              aria-label={ts('agentFlow.title')}
              aria-pressed={agentFlowOpen}
              title={ts('agentFlow.title')}
              onClick={toggleAgentFlow}
            >
              <Workflow size={16} aria-hidden />
              {agentFlowLive ? <span className={styles.liveDot} aria-hidden /> : null}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
