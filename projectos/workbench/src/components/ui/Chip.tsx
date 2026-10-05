import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Chip.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  active?: boolean
  asButton?: boolean
}

export default function Chip({
  children,
  active,
  asButton = true,
  className = '',
  onClick,
  ...rest
}: Props) {
  const cls = `${styles.chip} ${active ? styles.active : ''} ${className}`

  if (asButton && onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {children}
      </button>
    )
  }

  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  )
}
