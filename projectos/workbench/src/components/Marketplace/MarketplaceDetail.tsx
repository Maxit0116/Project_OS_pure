import type { ReactNode } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Button from '../ui/Button'
import MarketplaceListingIcon from './MarketplaceListingIcon'
import type { MarketplaceCardAction } from './MarketplaceCard'
import type { MarketplaceDetailModel, MarketplaceFact } from './marketplaceDetailModel'
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
  model: MarketplaceDetailModel
  children?: ReactNode
  onBack: () => void
  onAction: (action: MarketplaceCardAction) => void
  secondaryActions?: ReactNode
}

function FactGrid({ items }: { items: MarketplaceFact[] }) {
  if (items.length === 0) return null
  return (
    <dl className={styles.factGrid}>
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className={styles.fact}>
          <dt className={styles.factLabel}>{item.label}</dt>
          <dd className={styles.factValue}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </section>
  )
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
  model,
  children,
  onBack,
  onAction,
  secondaryActions,
}: Props) {
  const link = homepage ?? model.homepage

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

      {children}

      {model.overview ? (
        <Section title={overviewTitle}>
          <p className={styles.description}>{model.overview}</p>
        </Section>
      ) : null}

      <Section title={factsTitle}>
        <FactGrid items={model.facts} />
      </Section>

      {model.setupNotes.length > 0 ? (
        <Section title={setupTitle}>
          <ol className={styles.steps}>
            {model.setupNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {model.installConfig ? (
        <Section title={model.installConfigTitle}>
          <pre className={styles.code}>{model.installConfig}</pre>
        </Section>
      ) : null}

      {model.credentials && model.credentials.length > 0 ? (
        <Section title={credentialsTitle}>
          <FactGrid items={model.credentials} />
        </Section>
      ) : null}

      {model.envVars && model.envVars.length > 0 ? (
        <Section title={envTitle}>
          <FactGrid items={model.envVars} />
        </Section>
      ) : null}

      {model.headers && model.headers.length > 0 ? (
        <Section title={headersTitle}>
          <FactGrid items={model.headers} />
        </Section>
      ) : null}

      {model.tools && model.tools.length > 0 ? (
        <Section title={toolsTitle}>
          <ul className={styles.chipList}>
            {model.tools.map((tool) => (
              <li key={tool} className={styles.chip}>
                {tool}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {model.frontmatter && model.frontmatter.length > 0 ? (
        <Section title={frontmatterTitle}>
          <FactGrid items={model.frontmatter} />
        </Section>
      ) : null}

      {model.companionFiles && model.companionFiles.length > 0 ? (
        <Section title={filesTitle}>
          <ul className={styles.fileList}>
            {model.companionFiles.map((file) => (
              <li key={file} className={styles.fileItem}>
                {file}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {model.documentation ? (
        <Section title={model.documentationTitle}>
          <pre className={styles.docs}>{model.documentation}</pre>
        </Section>
      ) : null}

      {model.riskNote ? (
        <Section title={riskTitle}>
          <p className={styles.risk} role="note">
            {model.riskNote}
          </p>
        </Section>
      ) : null}
    </div>
  )
}
