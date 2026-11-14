import { useEffect, useState } from 'react'
import { User, UserRound } from 'lucide-react'
import styles from './AccountAvatar.module.css'

interface Props {
  src?: string | null
  size: number
  /** Larger circular treatment for the open menu identity header. */
  variant?: 'chrome' | 'menu'
  className?: string
}

/**
 * Account avatar with load-failure fallback.
 * External hosts (GitHub / Google) can fail due to CSP, DNS, or rate limits —
 * never leave a broken <img> in the title-bar chrome.
 */
export default function AccountAvatar({
  src,
  size,
  variant = 'chrome',
  className = '',
}: Props) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!showImage) {
    const FallbackIcon = variant === 'menu' ? User : UserRound
    return (
      <span
        className={`${styles.fallback} ${variant === 'menu' ? styles.menuFallback : styles.chromeFallback} ${className}`}
        style={variant === 'menu' ? undefined : { width: size, height: size }}
        aria-hidden
      >
        <FallbackIcon size={variant === 'menu' ? 18 : Math.max(12, size - 2)} strokeWidth={1.75} />
      </span>
    )
  }

  return (
    <img
      className={`${variant === 'menu' ? styles.menuImg : styles.chromeImg} ${className}`}
      src={src!}
      alt=""
      width={variant === 'menu' ? 36 : size}
      height={variant === 'menu' ? 36 : size}
      referrerPolicy="no-referrer"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
