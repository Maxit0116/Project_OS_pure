import { useEffect } from 'react'
import { X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import AgentFlowPanel from './AgentFlowPanel'
import styles from './AgentFlowOverlay.module.css'

export default function AgentFlowOverlay() {
  const open = useChatSessionStore((s) => s.agentFlowOpen)
  const closeAgentFlow = useChatSessionStore((s) => s.closeAgentFlow)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const flowSteps = useWorkbenchStore((s) => s.flowSteps)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const diffReady = useWorkbenchStore((s) => s.diffReady)
  const navigateToDiffReview = useWorkbenchStore((s) => s.navigateToDiffReview)
  const { ts } = useI18n()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAgentFlow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeAgentFlow])

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('agentFlow.title')}
    >
      <div className={styles.root} data-tour="agent-flow">
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('agentFlow.close')}
            title={ts('agentFlow.close')}
            onClick={closeAgentFlow}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className={styles.body}>
          <AgentFlowPanel
            steps={flowSteps}
            status={flowStatus}
            diffReady={diffReady}
            onReviewDiff={() => {
              closeAgentFlow()
              void navigateToDiffReview()
            }}
          />
        </div>
      </div>
    </GraphOverlayFrame>
  )
}
