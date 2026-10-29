import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import Button from '../ui/Button'
import MarketplaceListingIcon from './MarketplaceListingIcon'
import type { MarketplaceCardAction } from './MarketplaceCard'
import styles from './MarketplaceDetail.module.css'

interface Props {
  id: string
  name: string
  description?: string
  homepage?: string
  iconUrl?: string
  version: string
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
  backLabel: string
  metaLine?: string
  riskNote?: string
  preview?: string
  homepageLabel?: string
  children?: ReactNode
  onBack: () => void
  onAction: (action: MarketplaceCardAction) => void
  secondaryActions?: ReactNode
}

export default function MarketplaceDetail({
  id,
  name,
  description,
  homepage,
  iconUrl,
  version,
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
  backLabel,
  metaLine,
  riskNote,
  preview,
  homepageLabel,
  children,
  onBack,
  onAction,
  secondaryActions,
}: Props) {
  return (
    <div className={styles.detail}>
      <div className={styles.toolbar}>
        <Button variant="ghost" size="sm" onClick={onBack} aria-label={backLabel}>
          <ArrowLeft size={16} aria-hidden />
          {backLabel}
        </Button>
      </div>
      <header className={styles.header}>
        <MarketplaceListingIcon
          id={id}
          name={name}
          homepage={homepage}
          iconUrl={iconUrl}
          size="lg"
        />
        <div className={styles.headerCopy}>
          <h3 className={styles.title}>{name}</h3>
          <div className={styles.badges}>
            <span className={styles.badge}>
              {community ? communityLabel : curatedLabel}
            </span>
            {installed ? (
              <span className={`${styles.badge} ${styles.badgeInstalled}`}>
                {installedLabel}
              </span>
            ) : null}
            <span className={styles.meta}>v{version}</span>
            {metaLine ? <span className={styles.meta}>{metaLine}</span> : null}
          </div>
        </div>
      </header>
      {description ? <p className={styles.description}>{description}</p> : null}
      {homepage ? (
        <a
          className={styles.homepage}
          href={homepage}
          target="_blank"
          rel="noreferrer"
        >
          {homepageLabel ?? homepage}
        </a>
      ) : null}
      {riskNote ? (
        <p className={styles.risk} role="note">
          {riskNote}
        </p>
      ) : null}
      {children}
      {preview ? <pre className={styles.preview}>{preview}</pre> : null}
      <div className={styles.actions}>
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
        {secondaryActions}
      </div>
    </div>
  )
}
