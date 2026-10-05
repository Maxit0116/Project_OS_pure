import { Panel, PanelGroup } from 'react-resizable-panels'
import { MessageSquare, PanelLeft } from 'lucide-react'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import CenterPanel from './CenterPanel'
import styles from './ThreeZoneLayout.module.css'

interface Props {
  narrow?: boolean
  /** Bleed canvas is mounted — layout must stack above it. */
  canvasBleed?: boolean
  /** Transparent pass-through layout for canvas bleed. */
  graphBleed?: boolean
  /** Function map tab uses bleed canvas (toolbar only in center). */
  mapBleed?: boolean
  /** Bottom dock open — centre bottom yield and edge-rail offset (sync with slide exit). */
  bottomDockOpen?: boolean
  /** @deprecated Use bottomDockOpen */
  terminalDocked?: boolean
  /** Panel still mounted (including exit animation) — hide edge reopen rails until unmounted. */
  leftPanelMounted?: boolean
  rightPanelMounted?: boolean
}

export default function ThreeZoneLayout({
  canvasBleed,
  graphBleed,
  mapBleed,
  bottomDockOpen,
  terminalDocked,
  leftPanelMounted = false,
  rightPanelMounted = false,
}: Props) {
  const dockOpen = bottomDockOpen ?? terminalDocked ?? false
  const setLeftPanelOpen = useWorkbenchStore((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const { ts } = useI18n()

  return (
    <div
      className={`${styles.wrapper} ${canvasBleed ? styles.layoutAboveCanvas : ''} ${graphBleed ? styles.graphBleedPassThrough : ''} ${dockOpen ? styles.wrapperTerminalDocked : ''} ${dockOpen ? styles.wrapperCenterYieldTerminal : ''}`}
    >
      <PanelGroup direction="horizontal" className={styles.group}>
        <Panel
          defaultSize={100}
          minSize={100}
          className={graphBleed ? styles.centerPassThrough : undefined}
        >
          <CenterPanel mapBleed={mapBleed} />
        </Panel>
      </PanelGroup>

      {!leftPanelMounted && (
        <button
          type="button"
          className={`${styles.edgeRail} ${styles.edgeRailLeft}`}
          data-edge-rail=""
          onClick={() => setLeftPanelOpen(true)}
          aria-label={ts('topBar.toggleTree')}
          title={ts('tree.title')}
        >
          <PanelLeft size={18} strokeWidth={1.75} aria-hidden />
        </button>
      )}

      {!rightPanelMounted && (
        <button
          type="button"
          className={`${styles.edgeRail} ${styles.edgeRailRight}`}
          data-edge-rail=""
          onClick={() => setRightPanelOpen(true)}
          aria-label={ts('topBar.toggleChat')}
          title={ts('rightTabs.chat')}
        >
          <MessageSquare size={18} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  )
}
