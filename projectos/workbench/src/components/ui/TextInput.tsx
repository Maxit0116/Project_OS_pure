import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './TextInput.module.css'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  fieldClassName?: string
  mono?: boolean
  size?: 'sm' | 'md'
}

const TextInput = forwardRef<HTMLInputElement, Props>(function TextInput(
  {
    label,
    className = '',
    fieldClassName = '',
    mono = false,
    size = 'md',
    id,
    ...rest
  },
  ref,
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
  return (
    <label className={`${styles.field} ${fieldClassName}`} htmlFor={inputId}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={[
          styles.input,
          size === 'sm' ? styles.sm : '',
          mono ? styles.mono : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
    </label>
  )
})

export default TextInput
