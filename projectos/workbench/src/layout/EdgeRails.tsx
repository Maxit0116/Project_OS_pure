import { MessageSquare, PanelLeft } from 'lucide-react'
import { useI18n } from '../i18n'
import { useWorkbenchStore } from '../state/workbenchStore'
import styles from './EdgeRails.module.css'

interface Props {
  leftMounted: boolean
  rightMounted: boolean
  terminalDocked: boolean
}

/** Reopen controls for collapsed side panels. Sits above the session graph. */
export default function EdgeRails({ leftMounted, rightMounted, terminalDocked }: Props) {
  const setLeftPanelOpen = useWorkbenchStore((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const { ts } = useI18n()

  if (leftMounted && rightMounted) return null

  return (
    <div
      className={`${styles.layer} ${terminalDocked ? styles.layerTerminalDocked : ''}`}
      data-edge-rail-layer=""
    >
      {!leftMounted && (
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

      {!rightMounted && (
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
