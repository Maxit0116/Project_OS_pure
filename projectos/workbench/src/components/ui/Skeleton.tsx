import styles from './Skeleton.module.css'

interface Props {
  width?: string | number
  height?: string | number
  className?: string
}

export default function Skeleton({ width = '100%', height = 16, className = '' }: Props) {
  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={{ width, height }}
      aria-hidden
    />
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card}>
      <Skeleton height={20} width="60%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '80%' : '100%'} />
      ))}
    </div>
  )
}
