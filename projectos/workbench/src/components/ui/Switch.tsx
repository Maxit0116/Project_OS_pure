import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Switch.module.css'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
}

export default function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className = '',
  ...rest
}: Props) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.track} ${checked ? styles.trackOn : ''} ${!label && !description ? className : ''}`}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className={styles.thumb} aria-hidden />
    </button>
  )

  if (label == null && description == null) return control

  return (
    <div className={`${styles.row} ${className}`}>
      <div className={styles.copy}>
        {label != null ? <div className={styles.label}>{label}</div> : null}
        {description != null ? <div className={styles.description}>{description}</div> : null}
      </div>
      {control}
    </div>
  )
}
