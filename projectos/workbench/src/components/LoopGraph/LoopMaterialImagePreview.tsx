/**
 * Pure image material preview — keeps the card visible.
 * Does not claim vision ingest; shows gate + optional local object URL thumb.
 */
import { useEffect, useState } from 'react'
import type { LoopTaskMaterial } from '@contracts/index'
import styles from './LoopRunMaterialsPanel.module.css'

type Props = {
  material: LoopTaskMaterial
  /** Ephemeral blob URL from the picker — never persisted into Intent/Spec. */
  objectUrl?: string | null
  visionGate?: string | null
}

export default function LoopMaterialImagePreview({
  material,
  objectUrl,
  visionGate,
}: Props) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [objectUrl])

  if (material.kind !== 'file' && material.kind !== 'image') return null
  const isImage =
    (material.mimeType ?? '').startsWith('image/') ||
    material.parseMessage?.toLowerCase().includes('image') === true
  if (!isImage && material.kind !== 'image') return null

  return (
    <div
      className={styles.imagePreview}
      data-loop-material-image-preview=""
      data-loop-material-vision-gate={visionGate ?? undefined}
    >
      {objectUrl && !broken ? (
        <img
          className={styles.imageThumb}
          src={objectUrl}
          alt=""
          data-loop-material-image-thumb=""
          onError={() => setBroken(true)}
        />
      ) : (
        <div className={styles.imagePlaceholder} data-loop-material-image-placeholder="">
          image · {material.parseLevel ?? material.parseStatus}
        </div>
      )}
      {visionGate ? (
        <p className={styles.parseMsg} data-loop-material-vision-gate-label="">
          vision: {visionGate}
        </p>
      ) : null}
    </div>
  )
}
