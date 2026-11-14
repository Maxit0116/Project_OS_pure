import type { ReactNode } from 'react'
import Button from '../ui/Button'
import type { MarketplaceDependencyLink } from './marketplaceDependencies'
import type { MarketplaceDetailModel, MarketplaceFact } from './marketplaceDetailModel'
import styles from './MarketplaceDetail.module.css'

interface Props {
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
  disabled?: boolean
  busy?: boolean
  onNavigateDependency?: (link: MarketplaceDependencyLink) => void
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

/** Textual marketplace detail sections (overview, facts, setup, docs, risk). */
export default function MarketplaceDetailSections({
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
  disabled = false,
  busy = false,
  onNavigateDependency,
}: Props) {
  const dependencyLinks = model.dependencyLinks ?? []

  return (
    <div className={styles.sections}>
      {model.overview ? (
        <Section title={overviewTitle}>
          <p className={styles.description}>{model.overview}</p>
        </Section>
      ) : null}

      <Section title={factsTitle}>
        <FactGrid items={model.facts} />
      </Section>

      {model.profileSections?.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph.slice(0, 48)} className={styles.description}>
              {paragraph}
            </p>
          ))}
          {section.bullets && section.bullets.length > 0 ? (
            <ul className={styles.steps}>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {section.chips && section.chips.length > 0 ? (
            <ul className={styles.chipList}>
              {section.chips.map((chip) => (
                <li key={chip} className={styles.chip}>
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}

      {model.setupNotes.length > 0 ? (
        <Section title={setupTitle}>
          <ol className={styles.steps}>
            {model.setupNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {dependencyLinks.length > 0 && dependenciesTitle ? (
        <Section title={dependenciesTitle}>
          <ul className={styles.depList}>
            {dependencyLinks.map((dep) => (
              <li key={`${dep.kind}:${dep.listingId}`} className={styles.depRow}>
                <span className={styles.depMeta}>
                  <span className={styles.depKind}>{dep.kind}</span>
                  <span className={styles.depId}>{dep.listingId}</span>
                  {!dep.missing && installedDepLabel ? (
                    <span className={styles.depOk}>{installedDepLabel}</span>
                  ) : null}
                </span>
                {dep.missing && onNavigateDependency && goInstallLabel ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || busy}
                    onClick={() => onNavigateDependency(dep)}
                  >
                    {goInstallLabel}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
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
