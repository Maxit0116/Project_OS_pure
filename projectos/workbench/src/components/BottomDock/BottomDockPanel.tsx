import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useActivityStore } from '../../state/activityStore'
import { useTerminalStore } from '../../state/terminalStore'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useI18n } from '../../i18n'
import type { PanelPresence } from '../../hooks/usePanelPresence'
import PanelResizeHandle from '../layout/PanelResizeHandle'
import TerminalPaneView from '../Terminal/TerminalPaneView'
import BottomDockViewTabs from './BottomDockViewTabs'
import ActivityView from './ActivityView'
import ServicesView from './ServicesView'
import DiagnosticsView from './DiagnosticsView'
import { isDesktopApp } from '../../data/clientMode'
import styles from './BottomDockPanel.module.css'

interface Props {
  centerSideInset?: boolean
  presence: PanelPresence
}

export default function BottomDockPanel({ centerSideInset, presence }: Props) {
  const activeView = useBottomDockStore((s) => s.activeView)
  const closePanel = useBottomDockStore((s) => s.closePanel)
  const splitDirection = useTerminalStore((s) => s.splitDirection)
  const panes = useTerminalStore((s) => s.panes)
  const initIpcListeners = useTerminalStore((s) => s.initIpcListeners)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const settingsOpen = useWorkbenchStore((s) => s.settingsOpen)
  const terminalHeight = useWorkbenchStore((s) => s.terminalHeight)
  const adjustTerminalHeight = useWorkbenchStore((s) => s.adjustTerminalHeight)
  const activityEntries = useActivityStore((s) => s.entries)
  const systemLines = useMemo(
    () =>
      activityEntries
        .filter((entry) => entry.channel === 'system')
        .map((entry) => entry.title),
    [activityEntries],
  )
  const triggerAuthError = useWorkbenchStore((s) => s.triggerAuthError)
  const { ts } = useI18n()
  const bodyRef = useRef<HTMLPreElement>(null)
  const isNative = isDesktopApp()
  const { mounted, phase, onAnimationEnd } = presence

  useEffect(() => {
    initIpcListeners()
  }, [initIpcListeners])

  useEffect(() => {
    if (!isNative && mounted && bodyRef.current && activeView === 'terminal') {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [systemLines, mounted, isNative, activeView])

  if (!mounted) {
    return null
  }

  const splitClass =
    splitDirection === 'vertical'
      ? styles.splitVertical
      : splitDirection === 'horizontal'
        ? styles.splitHorizontal
        : ''

  const motionClass =
    phase === 'exit' ? styles.shellMotionExit : phase === 'enter' ? styles.shellMotionEnter : ''

  return (
    <div
      className={`${styles.shell} ${styles.expanded} ${phase === 'exit' ? styles.shellExiting : ''} ${centerSideInset && leftPanelOpen ? styles.yieldLeftPanel : ''} ${rightPanelOpen ? styles.yieldRightPanel : ''} ${panelResizing ? styles.shellResizing : ''}`}
      data-bottom-dock
    >
      <div className={`${styles.shellMotion} ${motionClass}`} onAnimationEnd={onAnimationEnd}>
        <div className={`${styles.shellChrome} glass-panel-edge-bottom`}>
          <BottomDockViewTabs onClosePanel={closePanel} />
          <div className={styles.viewBody} role="tabpanel">
            {activeView === 'terminal' ? (
              isNative ? (
                <div className={`${styles.splitGrid} ${splitClass}`}>
                  {panes.map((pane, index) => (
                    <Fragment key={pane.id}>
                      {index > 0 ? <div className={styles.paneDivider} aria-hidden /> : null}
                      <div className={styles.paneWrap}>
                        <TerminalPaneView
                          paneId={pane.id}
                          panelMounted={mounted}
                          panelResizing={panelResizing}
                          terminalHeight={terminalHeight}
                          showPanelActions={index === 0}
                          onSimulateAuthError={() => void triggerAuthError()}
                          onClosePanel={closePanel}
                        />
                      </div>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <>
                  <div className={styles.bar}>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.simulateBtn}
                        onClick={() => void triggerAuthError()}
                      >
                        {ts('demo.simulateAuthError')}
                      </button>
                    </div>
                  </div>
                  <pre ref={bodyRef} className={styles.body}>
                    {systemLines.length === 0 ? (
                      <span className={styles.placeholder}>{ts('terminal.empty')}</span>
                    ) : (
                      systemLines.join('\n')
                    )}
                  </pre>
                </>
              )
            ) : activeView === 'activity' ? (
              <ActivityView />
            ) : activeView === 'services' ? (
              <ServicesView />
            ) : activeView === 'diagnostics' ? (
              <DiagnosticsView />
            ) : null}
          </div>
        </div>
      </div>

      {phase !== 'exit' ? (
        <PanelResizeHandle
          edge="north"
          onDelta={adjustTerminalHeight}
          ariaLabel={ts('resize.terminal')}
          disabled={settingsOpen}
        />
      ) : null}
    </div>
  )
}
