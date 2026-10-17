import { useEffect, useState } from 'react'
import type { ChatMessage } from '../../state/workbenchStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import RestrictedMarkdown from './RestrictedMarkdown'
import { parseSpatialPinChatContent, spatialPinSnapshotPath } from './spatialPinChatDisplay'
import styles from './ChatPanel.module.css'

export default function ChatMessageContent({ message }: { message: ChatMessage }) {
  const spatial = message.role === 'user' ? parseSpatialPinChatContent(message.content) : null
  const snapshotPath = spatial ? spatialPinSnapshotPath(message) : null
  return (
    <>
      {spatial ? (
        <div className={styles.spatialPin}>
          {snapshotPath ? <SpatialPinRegionImage path={snapshotPath} /> : null}
          {spatial.prompt ? <span className={styles.spatialPrompt}>{spatial.prompt}</span> : null}
        </div>
      ) : message.format === 'markdown' ? (
        <RestrictedMarkdown>{message.content}</RestrictedMarkdown>
      ) : (
        message.content
      )}
      {message.notice && <p className={styles.messageNotice}>{message.notice}</p>}
    </>
  )
}

function SpatialPinRegionImage({ path }: { path: string }) {
  const { ts } = useI18n()
  const projectId = useWorkbenchStore((state) => state.project?.projectId)
  const client = useWorkbenchStore((state) => state.client)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!client || !projectId) return
    let cancelled = false
    void client
      .readProjectAssetBase64(projectId, path)
      .then((asset) => {
        if (!cancelled && asset) {
          setSrc(`data:${asset.mimeType};base64,${asset.base64}`)
        }
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [client, path, projectId])

  if (!src) return null
  return <img className={styles.regionCite} src={src} alt={ts('chat.spatialPinRegion')} />
}
