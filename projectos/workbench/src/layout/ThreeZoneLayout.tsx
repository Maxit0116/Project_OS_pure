import { Panel, PanelGroup } from 'react-resizable-panels'
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
  /** Bottom dock open — centre column yields its bottom edge. */
  bottomDockOpen?: boolean
  /** @deprecated Use bottomDockOpen */
  terminalDocked?: boolean
}

export default function ThreeZoneLayout({
  canvasBleed,
  graphBleed,
  mapBleed,
  bottomDockOpen,
  terminalDocked,
}: Props) {
  const dockOpen = bottomDockOpen ?? terminalDocked ?? false

  return (
    <div
      className={`${styles.wrapper} ${canvasBleed ? styles.layoutAboveCanvas : ''} ${graphBleed ? styles.graphBleedPassThrough : ''} ${dockOpen ? styles.wrapperCenterYieldTerminal : ''}`}
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
    </div>
  )
}
