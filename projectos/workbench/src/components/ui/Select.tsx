import type { SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

interface Option {
  value: string
  label: string
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Option[]
}

export default function Select({ label, options, className = '', id, ...rest }: Props) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <label className={styles.field} htmlFor={selectId}>
      {label && <span className={styles.label}>{label}</span>}
      <select id={selectId} className={`${styles.select} ${className}`} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
