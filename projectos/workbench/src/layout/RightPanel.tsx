import { type AnimationEvent, useEffect, useRef } from 'react'
import { resolveClientMode } from '../data/clientMode'
import ChatHistoryActions from '../components/ChatHistory/ChatHistoryActions'
import ChatSessionTitle from '../components/ChatSessionTitle/ChatSessionTitle'
import ChatContextHeader from '../components/ChatContextHeader/ChatContextHeader'
import ChatPanel from '../components/ChatPanel/ChatPanel'
import DebugHarnessPanel from '../components/DebugHarness/DebugHarnessPanel'
import TabBar from '../components/ui/TabBar'
import Button from '../components/ui/Button'
import { GlassPanelShell } from '../components/Glass'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import type { PanelMotionPhase } from '../hooks/usePanelPresence'
import styles from './RightPanel.module.css'

const isDemoMode = resolveClientMode() === 'mock'

interface Props {
  drawer?: boolean
  graphBleed?: boolean
  /** Drawer slide runs on the WorkbenchSidePanels shell (AI chat). */
  shellMotion?: boolean
  motionPhase?: PanelMotionPhase
  onMotionEnd?: (event: AnimationEvent<HTMLElement>) => void
  onClose?: () => void
}

export default function RightPanel({
  drawer,
  graphBleed,
  shellMotion,
  motionPhase,
  onMotionEnd,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const rightPanelTab = useWorkbenchStore((s) => s.rightPanelTab)
  const setRightPanelTab = useWorkbenchStore((s) => s.setRightPanelTab)
  const harnessRecord = useWorkbenchStore((s) => s.harnessRecord)
  const harnessFixRunId = useWorkbenchStore((s) => s.harnessFixRunId)
  const startHarnessFix = useWorkbenchStore((s) => s.startHarnessFix)
  const { ts } = useI18n()

  useEffect(() => {
    if (motionPhase === 'enter') {
      panelRef.current?.style.removeProperty('visibility')
    }
  }, [motionPhase])

  const tabs = [
    { id: 'chat', label: ts('rightTabs.chat') },
    { id: 'harness', label: ts('rightTabs.harness'), dot: !!harnessRecord },
  ]

  const frostClass = graphBleed ? '' : drawer ? 'glass-panel-edge-left-drawer' : 'glass-panel-edge-left'
  const motionClass =
    drawer && !shellMotion
      ? motionPhase === 'exit'
        ? styles.drawerExit
        : motionPhase === 'enter'
          ? styles.drawerEnter
          : ''
      : drawer
        ? ''
        : rightPanelTab === 'chat'
          ? ''
          : 'glass-slide-right'

  const panel = (
    <aside
      ref={panelRef}
      className={`${styles.panel} ${graphBleed ? styles.panelBleed : frostClass} ${motionClass}`}
      data-tour="chat-panel"
      onAnimationEnd={shellMotion ? undefined : onMotionEnd}
    >
      <div className={styles.header}>
        <TabBar
          tabs={tabs}
          activeId={rightPanelTab}
          onChange={(id) => setRightPanelTab(id as 'chat' | 'harness')}
          size="sm"
          chrome="nested"
        />
        <div className={styles.headerRight}>
          {rightPanelTab === 'chat' && <ChatHistoryActions />}
          {isDemoMode && <span className={styles.badge}>{ts('demo.mock')}</span>}
          {drawer && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
              ×
            </Button>
          )}
        </div>
      </div>
      <div className={`${styles.body} tab-content-fade`} key={rightPanelTab}>
        {rightPanelTab === 'chat' && (
          <div className={styles.chatLayout}>
            <ChatSessionTitle />
            <ChatContextHeader />
            <ChatPanel />
          </div>
        )}
        {rightPanelTab === 'harness' && (
          <div data-tour="harness-panel" className={styles.harnessPane}>
            {harnessRecord ? (
              <DebugHarnessPanel
                record={harnessRecord}
                onStartFix={() => void startHarnessFix()}
                fixStarted={!!harnessFixRunId}
              />
            ) : (
              <div className={styles.harnessEmpty}>{ts('harness.empty')}</div>
            )}
          </div>
        )}
      </div>
    </aside>
  )

  if (!graphBleed) {
    return panel
  }

  return (
    <GlassPanelShell active edge="left" className={styles.shell} zoneInteractive>
      {panel}
    </GlassPanelShell>
  )
}
