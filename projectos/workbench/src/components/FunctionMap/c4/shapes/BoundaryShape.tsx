import styles from './C4ShapeShell.module.css'

export interface BoundaryShapeProps {
  label: string
  description?: string
  className?: string
}

/** Dashed system/container boundary used on Container and Component diagrams. */
export default function BoundaryShape({
  label,
  description,
  className,
}: BoundaryShapeProps) {
  return (
    <div
      className={[styles.boundary, className].filter(Boolean).join(' ')}
      data-c4-boundary
      aria-label={description ? `${label}: ${description}` : label}
    >
      <div className={styles.boundaryHeader}>
        <span className={styles.boundaryLabel}>{label}</span>
        {description ? (
          <span className={styles.boundaryDescription}>{description}</span>
        ) : null}
      </div>
    </div>
  )
}
