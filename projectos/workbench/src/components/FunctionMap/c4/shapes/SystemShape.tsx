import { Box } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Software system — filled primary box. */
export default function SystemShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.system)}
      data-c4-shape="system"
    >
      <span className={styles.icon} aria-hidden>
        <Box size={16} strokeWidth={1.75} />
      </span>
      <C4ShapeMeta {...props} />
    </div>
  )
}
