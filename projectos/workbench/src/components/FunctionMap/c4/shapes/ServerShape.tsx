import { Server } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Server / API container — rack rail with status LEDs and unit lines. */
export default function ServerShape(props: C4ShapeProps) {
  return (
    <div className={shapeRootClass(props, styles.server)} data-c4-shape="server">
      <div className={styles.serverRails} aria-hidden>
        <span className={styles.serverLed} />
        <span className={styles.serverLed} />
        <span className={styles.serverLed} />
      </div>
      <div className={styles.serverBody}>
        <span className={styles.icon}>
          <Server size={15} strokeWidth={1.75} />
        </span>
        <C4ShapeMeta {...props} />
      </div>
    </div>
  )
}
