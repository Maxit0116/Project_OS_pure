import type { ReactNode } from 'react'
import Button from '../ui/Button'
import MarketplaceListingIcon from './MarketplaceListingIcon'
import styles from './MarketplaceCard.module.css'

export type MarketplaceCardAction = 'install' | 'update' | 'uninstall'

interface Props {
  id: string
  name: string
  description?: string
  homepage?: string
  iconUrl?: string
  installed: boolean
  community?: boolean
  busy?: boolean
  disabled?: boolean
  curatedLabel: string
  communityLabel: string
  installedLabel: string
  installLabel: string
  updateLabel: string
  uninstallLabel: string
  onOpen: () => void
  onAction: (action: MarketplaceCardAction) => void
  footer?: ReactNode
}

export default function MarketplaceCard({
  id,
  name,
  description,
  homepage,
  iconUrl,
  installed,
  community = false,
  busy = false,
  disabled = false,
  curatedLabel,
  communityLabel,
  installedLabel,
  installLabel,
  updateLabel,
  uninstallLabel,
  onOpen,
  onAction,
  footer,
}: Props) {
  return (
    <article className={styles.card} data-listing-id={id}>
      <button
        type="button"
        className={styles.hit}
        onClick={onOpen}
        aria-label={name}
      >
        <MarketplaceListingIcon
          id={id}
          name={name}
          homepage={homepage}
          iconUrl={iconUrl}
          size="md"
        />
        <div className={styles.copy}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{name}</span>
            <span className={styles.badge}>
              {community ? communityLabel : curatedLabel}
            </span>
            {installed ? (
              <span className={`${styles.badge} ${styles.badgeInstalled}`}>
                {installedLabel}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className={styles.desc}>{description}</p>
          ) : (
            <p className={styles.descMuted}>—</p>
          )}
        </div>
      </button>
      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
        {!installed ? (
          <Button
            size="sm"
            disabled={busy || disabled}
            onClick={() => onAction('install')}
          >
            {installLabel}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={busy || disabled}
              onClick={() => onAction('update')}
            >
              {updateLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || disabled}
              onClick={() => onAction('uninstall')}
            >
              {uninstallLabel}
            </Button>
          </>
        )}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </article>
  )
}
