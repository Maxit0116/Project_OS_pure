import type { ReactNode } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Button from '../ui/Button'
import MarketplaceListingIcon from './MarketplaceListingIcon'
import MarketplaceDetailSections from './MarketplaceDetailSections'
import type { MarketplaceCardAction } from './MarketplaceCard'
import type { MarketplaceDependencyLink } from './marketplaceDependencies'
import type { MarketplaceDetailModel } from './marketplaceDetailModel'
import styles from './MarketplaceDetail.module.css'

interface Props {
  id: string
  name: string
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
  homepageLabel: string
  overviewTitle: string
  factsTitle: string
  setupTitle: string
  credentialsTitle: string
  envTitle: string
  headersTitle: string
  toolsTitle: string
  filesTitle: string
  frontmatterTitle: string
  riskTitle: string
  dependenciesTitle?: string
  goInstallLabel?: string
  installedDepLabel?: string
  model: MarketplaceDetailModel
  /**
   * When set, replaces the default text sections under header/actions.
   * Use for multi-page surfaces (e.g. workflow Graph / Plan / Details).
   */
  body?: ReactNode
  children?: ReactNode
  onBack: () => void
  onAction: (action: MarketplaceCardAction) => void
  onNavigateDependency?: (link: MarketplaceDependencyLink) => void
  secondaryActions?: ReactNode
}

export default function MarketplaceDetail({
  id,
  name,
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
  homepageLabel,
  overviewTitle,
  factsTitle,
  setupTitle,
  credentialsTitle,
  envTitle,
  headersTitle,
  toolsTitle,
  filesTitle,
  frontmatterTitle,
  riskTitle,
  dependenciesTitle,
  goInstallLabel,
  installedDepLabel,
  model,
  body,
  children,
  onBack,
  onAction,
  onNavigateDependency,
  secondaryActions,
}: Props) {
  const link = homepage ?? model.homepage

  return (
    <div className={`${styles.detail} ${body ? styles.detailPaged : ''}`}>
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
          homepage={link}
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
          </div>
          {link ? (
            <a
              className={styles.homepage}
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={12} aria-hidden />
              {homepageLabel}
            </a>
          ) : null}
        </div>
      </header>

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

      {body ? (
        <div className={styles.bodySlot}>{body}</div>
      ) : (
        <>
          {children}
          <MarketplaceDetailSections
            overviewTitle={overviewTitle}
            factsTitle={factsTitle}
            setupTitle={setupTitle}
            credentialsTitle={credentialsTitle}
            envTitle={envTitle}
            headersTitle={headersTitle}
            toolsTitle={toolsTitle}
            filesTitle={filesTitle}
            frontmatterTitle={frontmatterTitle}
            riskTitle={riskTitle}
            dependenciesTitle={dependenciesTitle}
            goInstallLabel={goInstallLabel}
            installedDepLabel={installedDepLabel}
            model={model}
            disabled={disabled}
            busy={busy}
            onNavigateDependency={onNavigateDependency}
          />
        </>
      )}
    </div>
  )
}
