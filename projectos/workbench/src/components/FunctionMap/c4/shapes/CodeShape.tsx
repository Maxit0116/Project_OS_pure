import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'
import { shapeRootClass } from './shared'

/**
 * Classic C4 code element — UML-ish class/module box:
 * stereotype header, type name, optional exported symbols.
 */
export default function CodeShape(props: C4ShapeProps) {
  const members = props.members?.filter(Boolean).slice(0, 6) ?? []
  return (
    <div className={shapeRootClass(props, styles.codeClass)} data-c4-shape="code">
      <div className={styles.codeClassHeader}>
        <span className={styles.codeStereotype}>
          {props.stereotype ?? (props.technology ? `[${props.technology}]` : '[Code]')}
        </span>
        <span className={styles.codeClassName} title={props.label}>
          {props.label}
        </span>
      </div>
      {members.length > 0 ? (
        <ul className={styles.codeMembers}>
          {members.map((member) => (
            <li key={member} title={member}>
              + {member}
            </li>
          ))}
        </ul>
      ) : props.description ? (
        <p className={styles.codePurpose} title={props.description}>
          {props.description}
        </p>
      ) : null}
    </div>
  )
}
