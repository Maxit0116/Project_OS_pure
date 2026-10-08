import type { C4ShapeProps } from '../types'
import styles from './C4ShapeShell.module.css'

export function shapeRootClass(
  props: Pick<C4ShapeProps, 'selected' | 'dimmed' | 'className'>,
  variant: string,
): string {
  return [
    styles.root,
    variant,
    props.selected ? styles.selected : '',
    props.dimmed ? styles.dimmed : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function C4ShapeMeta({
  label,
  technology,
  description,
  stereotype,
}: Pick<C4ShapeProps, 'label' | 'technology' | 'description' | 'stereotype'>) {
  const techLine = stereotype ?? (technology ? `[${technology}]` : undefined)
  return (
    <div className={styles.meta}>
      {stereotype ? (
        <span className={styles.technology} title={stereotype}>
          {stereotype}
        </span>
      ) : null}
      <span className={styles.label} title={label}>
        {label}
      </span>
      {!stereotype && techLine ? (
        <span className={styles.technology} title={technology}>
          {techLine}
        </span>
      ) : null}
      {description ? (
        <span className={styles.description} title={description}>
          {description}
        </span>
      ) : null}
    </div>
  )
}
