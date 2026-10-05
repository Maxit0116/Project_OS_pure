import type { LucideProps } from 'lucide-react'
import styles from './Icon.module.css'

interface Props extends LucideProps {
  icon: React.ComponentType<LucideProps>
}

export default function Icon({ icon: IconComponent, className = '', size = 16, ...rest }: Props) {
  return <IconComponent className={`${styles.icon} ${className}`} size={size} {...rest} />
}
