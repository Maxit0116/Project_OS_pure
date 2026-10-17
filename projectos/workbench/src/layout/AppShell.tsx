import { useEffect, useState, type CSSProperties } from 'react'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import { usePanelPresence } from '../hooks/usePanelPresence'
import ThreeZoneLayout from './ThreeZoneLayout'
import WorkbenchTopBar from './WorkbenchTopBar'
import DesktopTitleBar from './DesktopTitleBar'
import WelcomeScreen from '../components/WelcomeScreen'
import ToastContainer from '../components/ui/ToastContainer'
import CommandPalette from '../components/CommandPalette/CommandPalette'
import AppMenuBridge from '../appMenu/AppMenuBridge'
import SettingsPanel from '../components/Settings/SettingsPanel'
import BottomDockPanel from '../components/BottomDock/BottomDockPanel'
import { useBottomDockStore } from '../state/bottomDockStore'
import { useTerminalShortcuts } from '../components/Terminal/useTerminalShortcuts'
import { useEditorShortcuts } from '../components/CodeEditor/useEditorShortcuts'
import WorkbenchSidePanels from './WorkbenchSidePanels'
import SessionGraphOverlay from '../components/SessionGraph/SessionGraphOverlay'
import LoopGraphOverlay from '../components/LoopGraph/LoopGraphOverlay'
import SpatialCaptureOverlay from '../components/SpatialCaptures/SpatialCaptureOverlay'
import EdgeRails from './EdgeRails'
import { FunctionMapBleedRoot } from '../components/FunctionMap/FunctionMapBleedLayer'
import { preloadLocalWhisper } from '../components/ChatPanel/voice/localWhisperTranscribe'
import { preloadMonacoEditor } from '../components/CodeEditor/preloadMonacoEditor'
import styles from './AppShell.module.css'

const PANEL_EXIT_MS = 200
const TERMINAL_EXIT_MS = 200

export default function AppShell() {
  const phase = useWorkbenchStore((s) => s.phase)
  const error = useWorkbenchStore((s) => s.error)
  const loadingMessage = useWorkbenchStore((s) => s.loadingMessage)
  const graph = useWorkbenchStore((s) => s.graph)
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const openWorkspace = useWorkbenchStore((s) => s.openWorkspace)
  const dismissError = useWorkbenchStore((s) => s.dismissError)
  const settingsOpen = useWorkbenchStore((s) => s.settingsOpen)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const bottomDockOpen = useBottomDockStore((s) => s.open)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const leftPanelWidth = useWorkbenchStore((s) => s.leftPanelWidth)
  const rightPanelWidth = useWorkbenchStore((s) => s.rightPanelWidth)
  const terminalHeight = useWorkbenchStore((s) => s.terminalHeight)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const reclampPanelLayout = useWorkbenchStore((s) => s.reclampPanelLayout)
  const { ts } = useI18n()

  const leftPresence = usePanelPresence(leftPanelOpen, PANEL_EXIT_MS)
  const rightPresence = usePanelPresence(rightPanelOpen, PANEL_EXIT_MS)
  const bottomDockPresence = usePanelPresence(bottomDockOpen, TERMINAL_EXIT_MS)

  useTerminalShortcuts()
  useEditorShortcuts()

  useEffect(() => {
    if (phase === 'ready') {
      preloadLocalWhisper()
      preloadMonacoEditor()
    }
  }, [phase])

  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1280)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const onResize = () => reclampPanelLayout()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [reclampPanelLayout])

  const workbenchBodyStyle = {
    '--workbench-left-panel-width': `${leftPanelWidth}px`,
    '--workbench-right-panel-width': `${rightPanelWidth}px`,
    '--terminal-dock-height': `${terminalHeight}px`,
  } as CSSProperties

  const mapBleedActive = centerTab === 'function-map' && !!graph && graph.nodes.length > 0
  const centerSideInset =
    centerTab === 'function-map' ||
    centerTab === 'spatial-captures' ||
    centerTab === 'code' ||
    centerTab === 'agent-flow' ||
    centerTab === 'browser'

  const workbenchBodyClassName = [
    styles.workbenchBody,
    panelResizing ? styles.workbenchBodyResizing : '',
    centerSideInset ? styles.workbenchBodyCenterSideInset : '',
    centerSideInset && leftPanelOpen ? styles.workbenchBodyLeftOpen : '',
    centerSideInset && rightPanelOpen ? styles.workbenchBodyRightOpen : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (phase === 'idle' || phase === 'loading' || phase === 'error') {
    return (
      <div className={styles.shell}>
        <DesktopTitleBar variant="welcome" />
        <div className={styles.welcomeHost}>
          <WelcomeScreen
            loading={phase === 'loading'}
            loadingMessage={loadingMessage}
            error={error}
            onOpenWorkspace={(path) => void openWorkspace(path)}
          />
        </div>
        <ToastContainer />
        <CommandPalette />
        <AppMenuBridge />
      </div>
    )
  }

  return (
    <FunctionMapBleedRoot>
      <div
        className={`${styles.shell} ${mapBleedActive ? styles.shellChromeBleed : ''} ${mapBleedActive ? styles.shellMapPassThrough : ''}`}
      >
        <DesktopTitleBar variant="workbench" onOpenSettings={() => setSettingsOpen(true)} />
        <WorkbenchTopBar onOpenSettings={() => setSettingsOpen(true)} />

        {error && (
          <div className={styles.errorBar} role="alert">
            <span>{error}</span>
            <button type="button" className={styles.dismissBtn} onClick={dismissError} aria-label={ts('common.dismiss')}>
              ×
            </button>
          </div>
        )}

        <div className={workbenchBodyClassName} style={workbenchBodyStyle}>
          <main className={styles.main}>
            <ThreeZoneLayout
              narrow={narrow}
              canvasBleed={mapBleedActive}
              graphBleed={mapBleedActive}
              mapBleed={mapBleedActive}
              bottomDockOpen={bottomDockOpen}
            />
          </main>

          <SessionGraphOverlay />
          <LoopGraphOverlay />
          <SpatialCaptureOverlay />
          <EdgeRails
            leftMounted={leftPresence.mounted}
            rightMounted={rightPresence.mounted}
            terminalDocked={bottomDockOpen}
          />
          <WorkbenchSidePanels
            left={leftPresence}
            right={rightPresence}
            bottomDockOpen={bottomDockOpen}
            centerSideInset={centerSideInset}
          />
          <BottomDockPanel centerSideInset={centerSideInset} presence={bottomDockPresence} />
        </div>

        <ToastContainer />
        <CommandPalette />
        <AppMenuBridge />
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </FunctionMapBleedRoot>
  )
}
