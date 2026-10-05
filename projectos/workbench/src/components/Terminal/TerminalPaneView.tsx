import { useTerminalStore } from '../../state/terminalStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import TerminalTabBar from './TerminalTabBar'
import TerminalTabView from './TerminalTabView'
import styles from './TerminalPanel.module.css'
import { isDesktopApp } from '../../data/clientMode'

interface Props {
  paneId: string
  panelMounted: boolean
  panelResizing: boolean
  terminalHeight: number
  showPanelActions?: boolean
  onSimulateAuthError?: () => void
  onClosePanel?: () => void
}

export default function TerminalPaneView({
  paneId,
  panelMounted,
  panelResizing,
  terminalHeight,
  showPanelActions = false,
  onSimulateAuthError,
  onClosePanel,
}: Props) {
  const pane = useTerminalStore((s) => s.panes.find((p) => p.id === paneId))
  const focusedPaneId = useTerminalStore((s) => s.focusedPaneId)
  const setFocusedPane = useTerminalStore((s) => s.setFocusedPane)
  const triggerAuthError = useWorkbenchStore((s) => s.triggerAuthError)
  const isNative = isDesktopApp()

  return (
    <div
      className={`${styles.pane} ${focusedPaneId === paneId ? styles.paneFocused : ''}`}
      onMouseDown={() => setFocusedPane(paneId)}
    >
      <div className={styles.paneBar}>
        <TerminalTabBar
          paneId={paneId}
          showPanelActions={showPanelActions}
          onSimulateAuthError={onSimulateAuthError}
          onClosePanel={onClosePanel}
        />
      </div>
      {isNative ? (
        <div className={styles.tabStack}>
          {pane?.activeTabId ? (
            <TerminalTabView
              key={pane.activeTabId}
              tabId={pane.activeTabId}
              paneId={paneId}
              panelMounted={panelMounted}
              panelResizing={panelResizing}
              terminalHeight={terminalHeight}
              onAuthError={triggerAuthError}
            />
          ) : null}
        </div>
      ) : (
        <div className={styles.xtermHost} />
      )}
    </div>
  )
}
