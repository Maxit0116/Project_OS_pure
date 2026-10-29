import { useEffect, useState } from 'react'
import type { McpCatalogListing, McpCatalogView } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import styles from './SettingsPanel.module.css'

function commandPreview(listing: McpCatalogListing): string | null {
  if (listing.transport !== 'stdio') return listing.url ?? null
  const args = listing.args?.length ? ` ${listing.args.join(' ')}` : ''
  return `${listing.command ?? ''}${args}`.trim() || null
}

export default function McpMarketplaceSection() {
  const listMcpCatalog = useWorkbenchStore((s) => s.listMcpCatalog)
  const refreshMcpCatalog = useWorkbenchStore((s) => s.refreshMcpCatalog)
  const installMcpFromCatalog = useWorkbenchStore((s) => s.installMcpFromCatalog)
  const disableMcpCatalogListing = useWorkbenchStore((s) => s.disableMcpCatalogListing)
  const reportMcpCatalogListing = useWorkbenchStore((s) => s.reportMcpCatalogListing)
  const settings = useWorkbenchStore((s) => s.settings)
  const { ts } = useI18n()

  const [view, setView] = useState<McpCatalogView | null>(null)
  const [loading, setLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [authByListing, setAuthByListing] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = async (force = false) => {
    setLoading(true)
    setError(null)
    const next = force ? await refreshMcpCatalog() : await listMcpCatalog()
    setView(next)
    if (!next) setError(ts('settings.mutationFailed'))
    setLoading(false)
  }

  useEffect(() => {
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per settings open
  }, [])

  if (!settings) return null

  const listings = view?.document.listings ?? []
  const curated = listings.filter((l) => l.trustTier === 'curated')
  const community = listings.filter((l) => l.trustTier === 'community')

  const renderListing = (listing: McpCatalogListing) => {
    const preview = commandPreview(listing)
    const isCommunity = listing.trustTier === 'community'
    return (
      <div key={listing.id} className={styles.row}>
        <div>
          <div className={styles.rowTitle}>
            {listing.name}{' '}
            <span className={styles.rowMeta}>
              ·{' '}
              {isCommunity
                ? ts('settings.mcp.marketCommunity')
                : ts('settings.mcp.marketCurated')}
            </span>
          </div>
          {listing.description && <div className={styles.rowMeta}>{listing.description}</div>}
          <div className={styles.rowMeta}>
            {listing.transport} · v{listing.version}
            {listing.requiresAuth ? ` · ${ts('settings.mcp.marketRequiresAuth')}` : ''}
          </div>
          {isCommunity && (
            <p className={styles.help} role="note">
              {ts('settings.mcp.marketCommunityRisk')}
            </p>
          )}
          {preview && (
            <pre className={styles.help} style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
              {ts('settings.mcp.marketCommandPreview')}: {preview}
            </pre>
          )}
          {listing.requiresAuth && (
            <div className={styles.formGrid} style={{ marginTop: 8 }}>
              <TextInput
                label={ts('settings.mcp.marketAuthToken')}
                type="password"
                value={authByListing[listing.id] ?? ''}
                onChange={(e) =>
                  setAuthByListing((prev) => ({ ...prev, [listing.id]: e.target.value }))
                }
                autoComplete="off"
              />
            </div>
          )}
        </div>
        <div className={styles.rowActions}>
          <Button
            size="sm"
            disabled={installingId === listing.id || loading}
            onClick={() => {
              setInstallingId(listing.id)
              void installMcpFromCatalog({
                listingId: listing.id,
                ...(authByListing[listing.id]?.trim()
                  ? { authToken: authByListing[listing.id]!.trim() }
                  : {}),
              }).finally(() => setInstallingId(null))
            }}
          >
            {installingId === listing.id
              ? ts('settings.mcp.marketInstalling')
              : ts('settings.mcp.marketInstall')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void disableMcpCatalogListing(listing.id).then((ok) => {
                if (ok) void load(false)
              })
            }}
          >
            {ts('settings.mcp.marketDisable')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void reportMcpCatalogListing({ listingId: listing.id }).then((ok) => {
                if (ok) void load(false)
              })
            }}
          >
            {ts('settings.mcp.marketReport')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{ts('settings.mcp.marketTitle')}</h3>
      <p className={styles.help}>{ts('settings.mcp.marketIntro')}</p>
      {view && (
        <p className={styles.help}>
          {ts('settings.mcp.marketSource', { source: view.source })}
        </p>
      )}
      <div className={styles.formActions}>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => {
            void load(true)
          }}
        >
          {loading ? ts('common.loading') : ts('settings.mcp.marketRefresh')}
        </Button>
      </div>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      {listings.length === 0 && !loading && (
        <p className={styles.empty}>{ts('settings.mcp.marketEmpty')}</p>
      )}
      {curated.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>{ts('settings.mcp.marketCuratedSection')}</h3>
          <div className={styles.list}>{curated.map(renderListing)}</div>
        </>
      )}
      {community.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>{ts('settings.mcp.marketCommunitySection')}</h3>
          <div className={styles.list}>{community.map(renderListing)}</div>
        </>
      )}
    </section>
  )
}
