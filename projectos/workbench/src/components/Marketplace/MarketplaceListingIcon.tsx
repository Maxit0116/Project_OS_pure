import { useState } from 'react'
import { resolveMarketplaceIcon } from './marketplaceIcons'
import styles from './MarketplaceListingIcon.module.css'

interface Props {
  id: string
  name: string
  homepage?: string
  iconUrl?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function MarketplaceListingIcon({
  id,
  name,
  homepage,
  iconUrl,
  size = 'md',
  className = '',
}: Props) {
  const resolved = resolveMarketplaceIcon({ id, name, homepage, iconUrl })
  const [index, setIndex] = useState(0)
  const src = resolved.candidates[index]
  const showFallback = !src || index >= resolved.candidates.length

  return (
    <span
      className={`${styles.wrap} ${styles[size]} ${className}`}
      style={showFallback ? { background: resolved.accent } : undefined}
      aria-hidden
    >
      {showFallback ? (
        <span className={styles.initials}>{resolved.initials}</span>
      ) : (
        <img
          className={styles.img}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setIndex((i) => i + 1)}
        />
      )}
    </span>
  )
}
