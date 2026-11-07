import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  PackagePlus,
  Search,
  XCircle,
} from 'lucide-react'
import {
  buildLabCapabilityInventory,
  matchInstalledCapabilities,
  pendingInstallProposals,
} from '../../../../services/product-lab/index'
import { useI18n } from '../../i18n'
import { useProductLabStore } from '../../state/productLabStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import styles from './LabCapabilityPrepPage.module.css'

export default function LabCapabilityPrepPage() {
  const { ts } = useI18n()
  const document = useProductLabStore((s) => s.document)
  const launchProfile = useProductLabStore((s) => s.launchProfile)
  const capabilitySearchBusy = useProductLabStore((s) => s.capabilitySearchBusy)
  const approveCapability = useProductLabStore((s) => s.approveCapability)
  const denyCapability = useProductLabStore((s) => s.denyCapability)
  const searchCapabilitiesOnWeb = useProductLabStore((s) => s.searchCapabilitiesOnWeb)
  const continueAfterBootstrap = useProductLabStore((s) => s.continueAfterBootstrap)
  const dismissToCatalog = useProductLabStore((s) => s.dismissLabCapabilityPrepToCatalog)

  const settings = useWorkbenchStore((s) => s.settings)
  const installedSkillIds = useWorkbenchStore((s) => s.installedMarketplaceSkillIds)
  const skillView = useWorkbenchStore((s) => s.skillCatalogView)

  const [installingId, setInstallingId] = useState<string | null>(null)

  const session = useMemo(() => {
    const id = document.activeSessionId
    if (!id) return null
    return document.sessions.find((s) => s.id === id) ?? null
  }, [document])

  const needs = session?.capabilityNeeds ?? launchProfile?.capabilityNeeds ?? []
  const proposals = session?.capabilityProposals ?? []

  const installedHits = useMemo(() => {
    const skillNames = new Map(
      (skillView?.document.listings ?? []).map((l) => [l.id, l.name] as const),
    )
    return matchInstalledCapabilities(needs, {
      mcpServers: settings?.mcpServers ?? [],
      skills: installedSkillIds.map((id) => ({
        id,
        name: skillNames.get(id) ?? id,
      })),
    })
  }, [needs, settings?.mcpServers, installedSkillIds, skillView])

  const inventory = useMemo(
    () =>
      buildLabCapabilityInventory(needs, proposals, installedHits, {
        searching: capabilitySearchBusy,
      }),
    [needs, proposals, installedHits, capabilitySearchBusy],
  )

  const pending = useMemo(
    () => pendingInstallProposals(proposals, inventory),
    [proposals, inventory],
  )

  const readyCount = inventory.filter(
    (item) => item.status === 'ready' || item.status === 'installed',
  ).length

  const statusLabel = (status: (typeof inventory)[number]['status']) =>
    ts(`productLab.prep.status.${status}` as 'productLab.prep.status.ready')

  return (
    <div className={styles.page} data-testid="lab-capability-prep-page">
      <div className={styles.toolbar}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => dismissToCatalog()}
          aria-label={ts('productLab.prep.browseCatalog')}
        >
          <ArrowLeft size={14} aria-hidden />
          {ts('productLab.prep.browseCatalog')}
        </Button>
      </div>

      <header className={styles.hero}>
        <div className={styles.heroTitle}>
          <FlaskConical size={16} strokeWidth={1.75} aria-hidden />
          <h3>{ts('productLab.prep.title')}</h3>
        </div>
        <p className={styles.heroHint}>{ts('productLab.prep.hint')}</p>
        <p className={styles.summary}>
          {ts('productLab.prep.readySummary', {
            ready: readyCount,
            total: inventory.length,
          })}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="lab-prep-inventory">
        <h4 id="lab-prep-inventory" className={styles.sectionTitle}>
          {ts('productLab.prep.inventoryTitle')}
        </h4>
        {inventory.length === 0 ? (
          <p className={styles.muted}>{ts('productLab.prep.emptyNeeds')}</p>
        ) : (
          <ul className={styles.inventoryList}>
            {inventory.map((item) => (
              <li key={item.need} className={styles.inventoryRow} data-status={item.status}>
                <div className={styles.inventoryMain}>
                  <span className={styles.needLabel}>{item.label}</span>
                  <span className={styles.needId}>{item.need}</span>
                  {item.bindingTitle ? (
                    <span className={styles.binding}>
                      {item.bindingKind ? `${item.bindingKind} · ` : ''}
                      {item.bindingTitle}
                    </span>
                  ) : null}
                </div>
                <span className={styles.statusBadge} data-status={item.status}>
                  {item.status === 'ready' || item.status === 'installed' ? (
                    <CheckCircle2 size={12} aria-hidden />
                  ) : item.status === 'failed' || item.status === 'denied' ? (
                    <XCircle size={12} aria-hidden />
                  ) : item.status === 'installing' || item.status === 'searching' ? (
                    <Loader2 size={12} aria-hidden className={styles.spin} />
                  ) : (
                    <PackagePlus size={12} aria-hidden />
                  )}
                  {statusLabel(item.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="lab-prep-pending">
        <h4 id="lab-prep-pending" className={styles.sectionTitle}>
          {ts('productLab.prep.pendingTitle')}
        </h4>
        {pending.length === 0 ? (
          <p className={styles.muted}>
            {capabilitySearchBusy
              ? ts('productLab.card.searchingWeb')
              : ts('productLab.prep.noPending')}
          </p>
        ) : (
          <ul className={styles.proposalList}>
            {pending.map((proposal) => (
              <li key={proposal.id} className={styles.proposal}>
                <div className={styles.proposalMain}>
                  <strong>{proposal.title}</strong>
                  <span className={styles.meta}>
                    {proposal.source} · {proposal.kind} · {proposal.need}
                    {proposal.status !== 'proposed' ? ` · ${proposal.status}` : ''}
                  </span>
                  {proposal.detail ? <p className={styles.detail}>{proposal.detail}</p> : null}
                  {proposal.gitUrl || proposal.homepageUrl ? (
                    <p className={styles.url}>{proposal.gitUrl || proposal.homepageUrl}</p>
                  ) : null}
                  {proposal.error ? <p className={styles.error}>{proposal.error}</p> : null}
                </div>
                {proposal.status === 'proposed' || proposal.status === 'failed' ? (
                  <div className={styles.rowActions}>
                    {proposal.listingId || proposal.gitUrl ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={installingId === proposal.id}
                        onClick={() => {
                          setInstallingId(proposal.id)
                          void approveCapability(proposal.id).finally(() =>
                            setInstallingId(null),
                          )
                        }}
                      >
                        {installingId === proposal.id ? (
                          <Loader2 size={12} aria-hidden className={styles.spin} />
                        ) : null}
                        {ts('productLab.card.allowInstall')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={capabilitySearchBusy}
                        onClick={() => void searchCapabilitiesOnWeb()}
                      >
                        <Search size={12} aria-hidden />
                        {capabilitySearchBusy
                          ? ts('productLab.card.searchingWeb')
                          : ts('productLab.card.searchWeb')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void denyCapability(proposal.id)}
                    >
                      {ts('productLab.card.denyInstall')}
                    </Button>
                  </div>
                ) : proposal.status === 'installing' ? (
                  <span className={styles.mutedInline}>
                    <Loader2 size={12} aria-hidden className={styles.spin} />
                    {ts('productLab.prep.status.installing')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.footer}>
        <Button
          size="sm"
          variant="secondary"
          disabled={capabilitySearchBusy}
          onClick={() => void searchCapabilitiesOnWeb()}
        >
          <Search size={12} aria-hidden />
          {capabilitySearchBusy
            ? ts('productLab.card.searchingWeb')
            : ts('productLab.card.searchWeb')}
        </Button>
        <Button size="sm" onClick={() => void continueAfterBootstrap()}>
          {ts('productLab.card.continueExperience')}
        </Button>
      </footer>
    </div>
  )
}
