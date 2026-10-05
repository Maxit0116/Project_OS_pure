import type { InputHTMLAttributes } from 'react'
import styles from './TextInput.module.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export default function TextInput({ label, className = '', id, ...rest }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <label className={styles.field} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      <input id={inputId} className={`${styles.input} ${className}`} {...rest} />
    </label>
  )
}
