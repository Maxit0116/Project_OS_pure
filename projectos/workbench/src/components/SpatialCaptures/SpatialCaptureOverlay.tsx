import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import SpatialCaptureCanvas from './SpatialCaptureCanvas'
import styles from './SpatialCaptureOverlay.module.css'

export default function SpatialCaptureOverlay() {
  const open = useChatSessionStore((s) => s.spatialCaptureOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const project = useWorkbenchStore((s) => s.project)
  const client = useWorkbenchStore((s) => s.client)
  const { ts } = useI18n()

  const session = useSpatialCaptureStore((s) => s.activeSession)
  const closeSession = useSpatialCaptureStore((s) => s.closeSession)
  const [backdropUrl, setBackdropUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session || !client || !project) {
      setBackdropUrl(null)
      return
    }
    const path = session.backdropAssetPath
    if (!path) {
      setBackdropUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const asset = await client.readProjectAssetBase64(
          project.projectId,
          path,
        )
        if (!cancelled && asset) {
          setBackdropUrl(`data:${asset.mimeType};base64,${asset.base64}`)
        }
      } catch {
        if (!cancelled) setBackdropUrl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, session?.id, session?.backdropAssetPath, client, project])

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('spatialCaptures.title')}
    >
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <h2 className={styles.title}>
            {session?.title ?? ts('spatialCaptures.title')}
          </h2>
          <span className={styles.frozenTag}>
            {ts('spatialCaptures.frozenBanner')}
          </span>
          <button
            type="button"
            className={styles.exitBtn}
            aria-label={ts('common.close')}
            title="Exit (Esc)"
            onClick={() => closeSession()}
          >
            <X size={14} strokeWidth={2.25} aria-hidden />
            <span>Exit</span>
          </button>
        </div>
        {session ? (
          <SpatialCaptureCanvas
            session={session}
            backdropUrl={backdropUrl}
            onExit={() => closeSession()}
          />
        ) : (
          <div className={styles.loading}>{ts('spatialCaptures.loadError')}</div>
        )}
      </div>
    </GraphOverlayFrame>
  )
}
