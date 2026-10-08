import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Data store — vertical cylinder silhouette. */
export default function DatabaseShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.database)}
      data-c4-shape="database"
    >
      <span className={styles.databaseTop} aria-hidden />
      <div className={styles.databaseBody}>
        <C4ShapeMeta {...props} />
      </div>
    </div>
  )
}
