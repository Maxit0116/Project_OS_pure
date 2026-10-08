import { Smartphone } from 'lucide-react'
import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { C4ShapeMeta, shapeRootClass } from './shared'

/** Mobile app — phone bezel with notch and home indicator. */
export default function MobileAppShape(props: C4ShapeProps) {
  return (
    <div
      className={shapeRootClass(props, styles.mobile)}
      data-c4-shape="mobile_app"
    >
      <span className={styles.mobileNotch} aria-hidden />
      <div className={styles.mobileScreen}>
        <span className={styles.icon} aria-hidden>
          <Smartphone size={14} strokeWidth={1.75} />
        </span>
        <C4ShapeMeta {...props} />
      </div>
      <span className={styles.mobileHome} aria-hidden />
    </div>
  )
}
