import { Columns2, Plus, Rows2, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useTerminalStore } from '../../state/terminalStore'
import { isDesktopApp } from '../../data/clientMode'
import Button from '../ui/Button'
import { focusTabAtIndex, nextRovingTabIndex } from '../ui/rovingTabKeyboard'
import styles from './TerminalTabBar.module.css'

interface Props {
  paneId: string
  showPanelActions?: boolean
  onSimulateAuthError?: () => void
  onClosePanel?: () => void
}

export default function TerminalTabBar({
  paneId,
  showPanelActions = false,
  onSimulateAuthError,
  onClosePanel,
}: Props) {
  const { ts } = useI18n()
  const pane = useTerminalStore((s) => s.panes.find((p) => p.id === paneId))
  const tabs = useTerminalStore((s) => s.tabs)
  const splitDirection = useTerminalStore((s) => s.splitDirection)
  const focusedPaneId = useTerminalStore((s) => s.focusedPaneId)
  const panes = useTerminalStore((s) => s.panes)
  const createTab = useTerminalStore((s) => s.createTab)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const setFocusedPane = useTerminalStore((s) => s.setFocusedPane)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const killPaneActiveTab = useTerminalStore((s) => s.killPaneActiveTab)

  if (!pane) return null

  const isFocused = focusedPaneId === paneId
  const canSplit = isDesktopApp() && panes.length === 1 && isFocused
  const activeTabId = pane.activeTabId

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs} role="tablist">
        {pane.tabIds.map((tabId, index) => {
          const tab = tabs[tabId]
          if (!tab) return null
          const label = tab.exited ? `${tab.title}${ts('terminal.exitedSuffix')}` : tab.title
          return (
            <div
              key={tabId}
              role="tab"
              aria-selected={activeTabId === tabId}
              tabIndex={activeTabId === tabId ? 0 : -1}
              className={`${styles.tab} ${activeTabId === tabId ? styles.tabActive : ''} ${tab.exited ? styles.tabExited : ''}`}
              onClick={() => {
                setFocusedPane(paneId)
                setActiveTab(paneId, tabId)
              }}
              onKeyDown={(event) => {
                const nextIndex = nextRovingTabIndex(event.key, index, pane.tabIds.length)
                if (nextIndex !== undefined) {
                  event.preventDefault()
                  const nextTabId = pane.tabIds[nextIndex]!
                  setFocusedPane(paneId)
                  setActiveTab(paneId, nextTabId)
                  focusTabAtIndex(event.currentTarget, nextIndex)
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setFocusedPane(paneId)
                  setActiveTab(paneId, tabId)
                }
              }}
            >
              <span className={styles.tabLabel}>{label}</span>
              {tab.hasUnread && activeTabId !== tabId && <span className={styles.unreadDot} aria-hidden />}
              <button
                type="button"
                className={styles.tabClose}
                aria-label={ts('terminal.closeTab')}
                onClick={(event) => {
                  event.stopPropagation()
                  void closeTab(tabId)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      <div className={styles.tools}>
        <button
          type="button"
          className={styles.toolBtn}
          aria-label={ts('terminal.newTab')}
          title={ts('terminal.newTab')}
          onClick={() => {
            setFocusedPane(paneId)
            void createTab(paneId)
          }}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {canSplit && (
          <>
            <button
              type="button"
              className={styles.toolBtn}
              aria-label={ts('terminal.splitDown')}
              title={ts('terminal.splitDown')}
              onClick={() => void splitTerminal('vertical')}
            >
              <Rows2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              aria-label={ts('terminal.splitRight')}
              title={ts('terminal.splitRight')}
              onClick={() => void splitTerminal('horizontal')}
            >
              <Columns2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.toolBtn}
          aria-label={ts('terminal.killTab')}
          title={ts('terminal.killTab')}
          disabled={!activeTabId}
          onClick={() => void killPaneActiveTab(paneId)}
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {showPanelActions && (
        <div className={styles.panelActions}>
          {onSimulateAuthError && (
            <button type="button" className={styles.simulateBtn} onClick={onSimulateAuthError}>
              {ts('demo.simulateAuthError')}
            </button>
          )}
          {onClosePanel && (
            <Button variant="ghost" size="sm" onClick={onClosePanel} aria-label={ts('terminal.closePanel')}>
              ×
            </Button>
          )}
        </div>
      )}

      {!showPanelActions && splitDirection && (
        <span className={styles.toolBtn} aria-hidden style={{ width: 0, padding: 0, overflow: 'hidden' }} />
      )}
    </div>
  )
}
