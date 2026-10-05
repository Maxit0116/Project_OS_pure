import { useEffect } from 'react'
import { useTerminalStore } from '../../state/terminalStore'
import { useTerminalView } from './useTerminalView'
import styles from './TerminalPanel.module.css'

interface Props {
  tabId: string
  paneId: string
  panelMounted: boolean
  panelResizing: boolean
  terminalHeight: number
  onAuthError?: (raw: string) => void
}

export default function TerminalTabView({
  tabId,
  paneId,
  panelMounted,
  panelResizing,
  terminalHeight,
  onAuthError,
}: Props) {
  const activeTabId = useTerminalStore(
    (s) => s.panes.find((p) => p.id === paneId)?.activeTabId ?? null,
  )
  const focusedPaneId = useTerminalStore((s) => s.focusedPaneId)
  const tabCount = useTerminalStore(
    (s) => s.panes.find((p) => p.id === paneId)?.tabIds.length ?? 0,
  )
  const tabTitle = useTerminalStore((s) => s.tabs[tabId]?.title)
  const tabExists = useTerminalStore((s) => !!s.tabs[tabId])
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const setFocusedPane = useTerminalStore((s) => s.setFocusedPane)

  const isActiveTab = activeTabId === tabId
  const focused = panelMounted && focusedPaneId === paneId && isActiveTab
  const mounted = panelMounted && isActiveTab

  const { containerRef, refit, isNative } = useTerminalView({
    tabId,
    mounted,
    focused,
    onAuthError,
  })

  useEffect(() => {
    if (isNative && mounted) {
      refit()
    }
  }, [terminalHeight, panelResizing, mounted, isNative, refit])

  if (!tabExists) return null

  return (
    <div
      className={`${styles.tabView} ${focused ? styles.tabViewActive : ''}`}
      onMouseDown={() => {
        setFocusedPane(paneId)
        setActiveTab(paneId, tabId)
      }}
    >
      {tabCount > 1 && (
        <div className={styles.tabViewLabel}>{tabTitle}</div>
      )}
      <div ref={containerRef} className={styles.tabViewHost} />
    </div>
  )
}
