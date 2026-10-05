import { ViewportPortal } from '@xyflow/react'
import type { SnapGuideLine } from './mapArtifactSnap'
import styles from './MapSnapGuides.module.css'

interface Props {
  guides: SnapGuideLine[]
}

export default function MapSnapGuides({ guides }: Props) {
  if (guides.length === 0) {
    return null
  }

  return (
    <ViewportPortal>
      <svg className={styles.overlay} aria-hidden>
        {guides.map((guide, index) =>
          guide.orientation === 'vertical' ? (
            <line
              key={`${guide.orientation}-${guide.value}-${guide.start}-${index}`}
              x1={guide.value}
              y1={guide.start}
              x2={guide.value}
              y2={guide.end}
              className={guide.emphasis ? styles.lineEmphasis : styles.line}
            />
          ) : (
            <line
              key={`${guide.orientation}-${guide.value}-${guide.start}-${index}`}
              x1={guide.start}
              y1={guide.value}
              x2={guide.end}
              y2={guide.value}
              className={guide.emphasis ? styles.lineEmphasis : styles.line}
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  )
}
