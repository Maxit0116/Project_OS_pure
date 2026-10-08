import { Puzzle } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Component — UML-style box with side interface tabs. */
export default function ComponentShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.component)}
      data-c4-shape="component"
    >
      <span className={`${styles.componentTab} ${styles.componentTabTop}`} aria-hidden />
      <span
        className={`${styles.componentTab} ${styles.componentTabBottom}`}
        aria-hidden
      />
      <span className={styles.icon} aria-hidden>
        <Puzzle size={15} strokeWidth={1.75} />
      </span>
      <C4ShapeMeta {...props} />
    </div>
  )
}
