import { type AnimationEvent, type ReactNode } from 'react'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import type { PanelMotionPhase, PanelPresence } from '../hooks/usePanelPresence'
import PanelResizeHandle from '../components/layout/PanelResizeHandle'
import {
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  maxPanelWidth,
} from './panelLayout'
import LeftPanel from './LeftPanel'
import RightPanel from './RightPanel'
import styles from './WorkbenchSidePanels.module.css'

function SidePanel({
  side,
  yieldTerminal,
  exiting,
  motionPhase,
  onMotionEnd,
  children,
}: {
  side: 'left' | 'right'
  yieldTerminal?: boolean
  exiting?: boolean
  motionPhase?: PanelMotionPhase
  onMotionEnd?: (event: AnimationEvent<HTMLElement>) => void
  children: ReactNode
}) {
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const settingsOpen = useWorkbenchStore((s) => s.settingsOpen)
  const adjustLeftPanelWidth = useWorkbenchStore((s) => s.adjustLeftPanelWidth)
  const adjustRightPanelWidth = useWorkbenchStore((s) => s.adjustRightPanelWidth)
  const leftPanelWidth = useWorkbenchStore((s) => s.leftPanelWidth)
  const rightPanelWidth = useWorkbenchStore((s) => s.rightPanelWidth)
  const { ts } = useI18n()

  const resizeEdge = side === 'left' ? 'east' : 'west'
  const shellMotionClass =
    motionPhase === 'exit'
      ? side === 'left'
        ? styles.shellDrawerExitLeft
        : styles.shellDrawerExitRight
      : motionPhase === 'enter'
        ? side === 'left'
          ? styles.shellDrawerEnterLeft
          : styles.shellDrawerEnterRight
        : ''

  return (
    <div
      className={`${styles.sidePanelLayer} ${side === 'left' ? styles.sidePanelLayerLeft : styles.sidePanelLayerRight} ${yieldTerminal ? styles.sidePanelLayerYieldTerminal : ''} ${exiting ? styles.sidePanelLayerExit : ''} ${panelResizing ? styles.sidePanelLayerResizing : ''}`}
    >
      <div
        className={`${side === 'left' ? styles.sidePanelFixedLeft : styles.sidePanelFixedRight} ${shellMotionClass}`}
        data-workbench-side-panel-content=""
        onAnimationEnd={onMotionEnd}
      >
        {children}
      </div>
      <PanelResizeHandle
        edge={resizeEdge}
        onDelta={side === 'left' ? adjustLeftPanelWidth : adjustRightPanelWidth}
        value={side === 'left' ? leftPanelWidth : rightPanelWidth}
        min={side === 'left' ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH}
        max={maxPanelWidth(typeof window === 'undefined' ? 1280 : window.innerWidth)}
        ariaLabel={side === 'left' ? ts('resize.tree') : ts('resize.chat')}
        disabled={settingsOpen}
      />
    </div>
  )
}

interface Props {
  left: PanelPresence
  right: PanelPresence
  /** Bottom dock open — side panel bottom inset (function-map overlay mode). */
  bottomDockOpen?: boolean
  /** @deprecated Use bottomDockOpen */
  terminalDocked?: boolean
  /** Code/Diff + Agent Flow — tree uses full-height column like chat (no terminal yield on panel). */
  centerSideInset?: boolean
}

/** Overlay side panels — positioned within workbenchBody (below top bar). */
export default function WorkbenchSidePanels({ left, right, bottomDockOpen, terminalDocked, centerSideInset }: Props) {
  const dockOpen = bottomDockOpen ?? terminalDocked ?? false
  const setLeftPanelOpen = useWorkbenchStore((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)

  return (
    <>
      {left.mounted && (
        <SidePanel
          side="left"
          yieldTerminal={dockOpen && !centerSideInset}
          exiting={left.phase === 'exit'}
          motionPhase={left.phase}
          onMotionEnd={left.onAnimationEnd}
        >
          <LeftPanel
            drawer
            shellMotion
            motionPhase={left.phase}
            onClose={() => setLeftPanelOpen(false)}
          />
        </SidePanel>
      )}

      {right.mounted && (
        <SidePanel
          side="right"
          exiting={right.phase === 'exit'}
          motionPhase={right.phase}
          onMotionEnd={right.onAnimationEnd}
        >
          <RightPanel
            drawer
            shellMotion
            motionPhase={right.phase}
            onClose={() => setRightPanelOpen(false)}
          />
        </SidePanel>
      )}
    </>
  )
}
