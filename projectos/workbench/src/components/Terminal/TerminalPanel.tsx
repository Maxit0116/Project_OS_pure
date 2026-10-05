import { Fragment, useEffect, useRef } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useTerminalStore } from '../../state/terminalStore'
import { useI18n } from '../../i18n'
import type { PanelPresence } from '../../hooks/usePanelPresence'
import PanelResizeHandle from '../layout/PanelResizeHandle'
import {
  TERMINAL_MIN_HEIGHT,
  maxTerminalHeight,
} from '../../layout/panelLayout'
import TerminalPaneView from './TerminalPaneView'
import { isDesktopApp } from '../../data/clientMode'
import styles from './TerminalPanel.module.css'

interface Props {
  centerSideInset?: boolean
  presence: PanelPresence
}

export default function TerminalPanel({ centerSideInset, presence }: Props) {
  const splitDirection = useTerminalStore((s) => s.splitDirection)
  const panes = useTerminalStore((s) => s.panes)
  const initIpcListeners = useTerminalStore((s) => s.initIpcListeners)
  const closePanel = useTerminalStore((s) => s.closePanel)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const settingsOpen = useWorkbenchStore((s) => s.settingsOpen)
  const terminalHeight = useWorkbenchStore((s) => s.terminalHeight)
  const adjustTerminalHeight = useWorkbenchStore((s) => s.adjustTerminalHeight)
  const terminalLines = useWorkbenchStore((s) => s.terminalLines)
  const triggerAuthError = useWorkbenchStore((s) => s.triggerAuthError)
  const { ts } = useI18n()
  const bodyRef = useRef<HTMLPreElement>(null)
  const isNative = isDesktopApp()
  const { mounted, phase, onAnimationEnd } = presence

  useEffect(() => {
    initIpcListeners()
  }, [initIpcListeners])

  useEffect(() => {
    if (!isNative && mounted && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [terminalLines, mounted, isNative])

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
      data-terminal-dock
    >
      <div className={`${styles.shellMotion} ${motionClass}`} onAnimationEnd={onAnimationEnd}>
        <div className={`${styles.shellChrome} glass-panel-edge-bottom`}>
          {isNative ? (
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
                <span className={styles.title}>{ts('demo.terminal')}</span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.simulateBtn}
                    onClick={() => void triggerAuthError()}
                  >
                    {ts('demo.simulateAuthError')}
                  </button>
                  <button
                    type="button"
                    className={styles.simulateBtn}
                    onClick={closePanel}
                    aria-label={ts('terminal.closePanel')}
                  >
                    ×
                  </button>
                </div>
              </div>
              <pre ref={bodyRef} className={styles.body}>
                {terminalLines.length === 0 ? (
                  <span className={styles.placeholder}>{ts('terminal.empty')}</span>
                ) : (
                  terminalLines.join('\n')
                )}
              </pre>
            </>
          )}
        </div>
      </div>

      {phase !== 'exit' ? (
        <PanelResizeHandle
          edge="north"
          onDelta={adjustTerminalHeight}
          value={terminalHeight}
          min={TERMINAL_MIN_HEIGHT}
          max={maxTerminalHeight(typeof window === 'undefined' ? 800 : window.innerHeight)}
          ariaLabel={ts('resize.terminal')}
          disabled={settingsOpen}
        />
      ) : null}
    </div>
  )
}
