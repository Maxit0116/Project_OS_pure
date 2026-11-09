import { forwardRef, type TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  fieldClassName?: string
  mono?: boolean
  size?: 'sm' | 'md'
  resize?: 'none' | 'vertical'
}

const TextArea = forwardRef<HTMLTextAreaElement, Props>(function TextArea(
  {
    label,
    className = '',
    fieldClassName = '',
    mono = false,
    size = 'md',
    resize = 'none',
    id,
    rows = 3,
    ...rest
  },
  ref,
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
  return (
    <label className={`${styles.field} ${fieldClassName}`} htmlFor={inputId}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <textarea
        ref={ref}
        id={inputId}
        className={[
          styles.textarea,
          size === 'sm' ? styles.sm : '',
          mono ? styles.mono : '',
          resize === 'vertical' ? styles.resizeVertical : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        rows={rows}
        {...rest}
      />
    </label>
  )
})

export default TextArea
