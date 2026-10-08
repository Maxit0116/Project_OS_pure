import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Classic C4 person / actor — head + torso silhouette. */
export default function PersonShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.person)}
      data-c4-shape="person"
    >
      <span className={styles.personHead} aria-hidden />
      <div className={styles.personBody}>
        <C4ShapeMeta {...props} />
      </div>
    </div>
  )
}
