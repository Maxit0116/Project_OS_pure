import { Monitor } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Web / browser container — window chrome with traffic-light dots. */
export default function WebAppShape(props: C4ShapeProps) {
  return (
    <div className={shapeRootClass(props, styles.web)} data-c4-shape="web_app">
      <div className={styles.webChrome} aria-hidden>
        <span className={styles.webDot} />
        <span className={styles.webDot} />
        <span className={styles.webDot} />
      </div>
      <div className={styles.webBody}>
        <span className={styles.icon}>
          <Monitor size={15} strokeWidth={1.75} />
        </span>
        <C4ShapeMeta {...props} />
      </div>
    </div>
  )
}
