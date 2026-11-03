import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import styles from './Checkbox.module.css'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  size?: 'sm' | 'md'
}

export default function Checkbox({
  checked,
  onCheckedChange,
  label,
  size = 'sm',
  disabled = false,
  className = '',
  ...rest
}: Props) {
  const iconSize = size === 'md' ? 12 : 10

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.root} ${styles[size]} ${checked ? styles.rootChecked : ''} ${className}`}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className={`${styles.box} ${checked ? styles.boxChecked : ''}`} aria-hidden>
        {checked ? <Check size={iconSize} strokeWidth={3} /> : null}
      </span>
      {label != null ? <span className={styles.label}>{label}</span> : null}
    </button>
  )
}
