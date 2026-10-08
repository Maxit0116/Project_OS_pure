import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Message queue — horizontal pipe with elliptical end caps. */
export default function QueueShape(props: C4ShapeProps) {
  return (
    <div className={shapeRootClass(props, styles.queue)} data-c4-shape="queue">
      <span className={styles.queueCap} aria-hidden />
      <div className={styles.queueBody}>
        <C4ShapeMeta {...props} />
      </div>
      <span className={styles.queueCap} aria-hidden />
    </div>
  )
}
