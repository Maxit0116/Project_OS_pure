import { Laptop } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Desktop client — screen with a short stand. Same surface color as the other devices. */
export default function DesktopAppShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.desktop)}
      data-c4-shape="desktop_app"
    >
      <div className={styles.desktopScreen}>
        <span className={styles.icon} aria-hidden>
          <Laptop size={14} strokeWidth={1.75} />
        </span>
        <C4ShapeMeta {...props} />
      </div>
      <span className={styles.desktopBase} aria-hidden />
    </div>
  )
}
