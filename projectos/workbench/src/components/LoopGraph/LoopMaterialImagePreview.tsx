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
  /** Friendly status label for the person; contract codes stay on data-* only. */
  visionLabel?: string | null
}

export default function LoopMaterialImagePreview({
  material,
  objectUrl,
  visionGate,
  visionLabel,
}: Props) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [objectUrl])

  if (material.kind !== 'file' && material.kind !== 'image') return null
  const isImage =
    (material.mimeType ?? '').startsWith('image/') ||
    material.parseLevel === 'vision_attach' ||
    material.parseMessage?.toLowerCase().includes('image') === true
  if (!isImage && material.kind !== 'image') return null

  const dataUrl =
    typeof material.contentRef === 'string' &&
    material.contentRef.startsWith('data:image/')
      ? material.contentRef
      : null
  const src = objectUrl || dataUrl
  const gateCode = visionGate ?? material.parseLevel ?? material.parseStatus
  const label = visionLabel?.trim() || null

  return (
    <div
      className={styles.imagePreview}
      data-loop-material-image-preview=""
      data-loop-material-vision-gate={gateCode ?? undefined}
    >
      {src && !broken ? (
        <img
          className={styles.imageThumb}
          src={src}
          alt=""
          data-loop-material-image-thumb=""
          onError={() => setBroken(true)}
        />
      ) : (
        <div className={styles.imagePlaceholder} data-loop-material-image-placeholder="">
          {label ?? 'image'}
        </div>
      )}
      {label ? (
        <p
          className={styles.parseMsg}
          data-loop-material-vision-gate-label=""
        >
          {label}
        </p>
      ) : null}
    </div>
  )
}
