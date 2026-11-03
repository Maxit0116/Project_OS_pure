import type { TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export default function TextArea({ label, className = '', id, rows = 3, ...rest }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <label className={styles.field} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      <textarea
        id={inputId}
        className={`${styles.textarea} ${className}`}
        rows={rows}
        {...rest}
      />
    </label>
  )
}
