import { memo, useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import type { ImageMapArtifact } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import MapArtifactChrome, { type MapArtifactNodeData } from './MapArtifactChrome'
import styles from './mapArtifactNodes.module.css'

type Data = MapArtifactNodeData & { artifact: ImageMapArtifact }

function MapImageNode({ data }: NodeProps & { data: Data }) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const [src, setSrc] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setLoadFailed(false)

    if (!project) return

    void client
      .getMapAssetDataUrl(project.projectId, data.artifact.image.assetPath)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [client, project, data.artifact.image.assetPath])

  const imageAlt =
    data.artifact.image.title?.trim() || data.artifact.image.fileName

  return (
    <MapArtifactChrome
      artifact={data.artifact}
      artifactType="image"
      typeIcon={<ImageIcon size={14} strokeWidth={1.75} />}
      scopeLabel={data.scopeLabel}
      isSelected={data.isSelected}
      linked={data.linked}
      dimmed={data.dimmed}
      bodyClassName={styles.imageBody}
      bodyWheelZoom
      onHeaderContextMenu={data.onHeaderContextMenu}
    >
      <div className={`${styles.imageFrame} nodrag nopan`}>
        {loadFailed ? (
          <span className={styles.imagePlaceholder}>{ts('mapArtifacts.imageLoadFailed')}</span>
        ) : src ? (
          <img
            className={styles.imagePreview}
            src={src}
            alt={imageAlt}
            draggable={false}
          />
        ) : (
          <span className={styles.imagePlaceholder}>{ts('mapArtifacts.imageLoading')}</span>
        )}
      </div>
    </MapArtifactChrome>
  )
}

export default memo(MapImageNode)
