import { Globe2 } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** External system — muted grey dashed secondary box. */
export default function ExternalSystemShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.external)}
      data-c4-shape="external_system"
    >
      <span className={styles.icon} aria-hidden>
        <Globe2 size={16} strokeWidth={1.75} />
      </span>
      <C4ShapeMeta {...props} />
    </div>
  )
}
