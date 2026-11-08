import type { C4ShapeProps } from '../types'
import { MAX_FILES_SHOWN } from '../fileList'
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
  files,
  moreFilesLabel,
}: Pick<C4ShapeProps, 'label' | 'technology' | 'description' | 'stereotype' | 'files' | 'moreFilesLabel'>) {
  const techLine = stereotype ?? (technology ? `[${technology}]` : undefined)
  return (
    <div className={styles.meta}>
      {stereotype ? (
        <span className={styles.technology}>{stereotype}</span>
      ) : null}
      <span className={styles.label}>{label}</span>
      {!stereotype && techLine ? (
        <span className={styles.technology}>{techLine}</span>
      ) : null}
      {description ? (
        <span className={styles.description}>{description}</span>
      ) : null}
      {files && files.length > 0 ? (
        <ul className={styles.files} aria-label="files">
          {files.slice(0, MAX_FILES_SHOWN).map((name) => (
            <li key={name} className={styles.fileName} title={name}>
              {name}
            </li>
          ))}
          {files.length > MAX_FILES_SHOWN && moreFilesLabel ? (
            <li className={styles.fileMore}>{moreFilesLabel}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
