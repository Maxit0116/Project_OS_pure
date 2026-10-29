import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Package, RefreshCw, X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import type {
  McpCatalogListing,
  McpCatalogView,
  SkillCatalogListing,
  SkillCatalogView,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import styles from './MarketplaceOverlay.module.css'

type MarketTab = 'mcp' | 'skills'

function mcpPreview(listing: McpCatalogListing): string {
  if (listing.transport === 'stdio') {
    const args = listing.args?.length ? ` ${listing.args.join(' ')}` : ''
    return `${listing.command ?? ''}${args}`.trim()
  }
  return listing.url ?? ''
}

function skillPreview(listing: SkillCatalogListing): string {
  const body = listing.skillMarkdown.trim()
  return body.length > 400 ? `${body.slice(0, 400)}…` : body
}

export default function MarketplaceOverlay() {
  const open = useChatSessionStore((s) => s.marketplaceOpen)
  const setMarketplaceOpen = useChatSessionStore((s) => s.setMarketplaceOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const settings = useWorkbenchStore((s) => s.settings)
  const listMcpCatalog = useWorkbenchStore((s) => s.listMcpCatalog)
  const refreshMcpCatalog = useWorkbenchStore((s) => s.refreshMcpCatalog)
  const installMcpFromCatalog = useWorkbenchStore((s) => s.installMcpFromCatalog)
  const disableMcpCatalogListing = useWorkbenchStore((s) => s.disableMcpCatalogListing)
  const reportMcpCatalogListing = useWorkbenchStore((s) => s.reportMcpCatalogListing)
  const listSkillCatalog = useWorkbenchStore((s) => s.listSkillCatalog)
  const refreshSkillCatalog = useWorkbenchStore((s) => s.refreshSkillCatalog)
  const installSkillFromCatalog = useWorkbenchStore((s) => s.installSkillFromCatalog)
  const disableSkillCatalogListing = useWorkbenchStore((s) => s.disableSkillCatalogListing)
  const reportSkillCatalogListing = useWorkbenchStore((s) => s.reportSkillCatalogListing)
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const { ts } = useI18n()

  const [tab, setTab] = useState<MarketTab>('mcp')
  const [mcpView, setMcpView] = useState<McpCatalogView | null>(null)
  const [skillView, setSkillView] = useState<SkillCatalogView | null>(null)
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authByListing, setAuthByListing] = useState<Record<string, string>>({})

  const shield = sessionGraphShieldCssInsets({
    leftPanelOpen,
    rightPanelOpen,
    terminalOpen,
  })

  const installedMcpListingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const server of settings?.mcpServers ?? []) {
      if (server.provenance?.listingId) ids.add(server.provenance.listingId)
    }
    return ids
  }, [settings?.mcpServers])

  const reloadInstalledSkills = useCallback(async () => {
    if (!client || !project) {
      setInstalledSkillIds(new Set())
      return
    }
    try {
      const result = await client.listSkills(project.projectId)
      setInstalledSkillIds(new Set(result.skills.map((s) => s.id)))
    } catch {
      setInstalledSkillIds(new Set())
    }
  }, [client, project])

  const loadMcp = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      const view = force ? await refreshMcpCatalog() : await listMcpCatalog()
      setMcpView(view)
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setLoading(false)
    },
    [listMcpCatalog, refreshMcpCatalog, ts],
  )

  const loadSkills = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      const view = force ? await refreshSkillCatalog() : await listSkillCatalog()
      setSkillView(view)
      await reloadInstalledSkills()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setLoading(false)
    },
    [listSkillCatalog, refreshSkillCatalog, reloadInstalledSkills, ts],
  )

  useEffect(() => {
    if (!open) return
    if (tab === 'mcp') void loadMcp(false)
    else void loadSkills(false)
  }, [open, tab, loadMcp, loadSkills])

  if (!open || typeof document === 'undefined') return null

  const mcpListings = mcpView?.document.listings ?? []
  const skillListings = skillView?.document.listings ?? []
  const mcpCurated = mcpListings.filter((l) => l.trustTier === 'curated')
  const mcpCommunity = mcpListings.filter((l) => l.trustTier === 'community')
  const skillCurated = skillListings.filter((l) => l.trustTier === 'curated')
  const skillCommunity = skillListings.filter((l) => l.trustTier === 'community')

  const renderMcpListing = (listing: McpCatalogListing) => {
    const installed = installedMcpListingIds.has(listing.id)
    const community = listing.trustTier === 'community'
    return (
      <div key={listing.id} className={styles.row}>
        <div>
          <div className={styles.rowTitle}>
            {listing.name}{' '}
            <span className={styles.badge}>
              {community
                ? ts('chat.marketplace.community')
                : ts('chat.marketplace.curated')}
            </span>
            {installed ? (
              <span className={`${styles.badge} ${styles.badgeInstalled}`}>
                {ts('chat.marketplace.installed')}
              </span>
            ) : null}
          </div>
          {listing.description ? (
            <div className={styles.rowMeta}>{listing.description}</div>
          ) : null}
          <div className={styles.rowMeta}>
            {listing.transport} · v{listing.version}
          </div>
          {community ? (
            <p className={styles.help}>{ts('chat.marketplace.mcpCommunityRisk')}</p>
          ) : null}
          <pre className={styles.preview}>{mcpPreview(listing)}</pre>
          {listing.requiresAuth ? (
            <div style={{ marginTop: 8 }}>
              <TextInput
                label={ts('chat.marketplace.authToken')}
                type="password"
                value={authByListing[listing.id] ?? ''}
                onChange={(e) =>
                  setAuthByListing((prev) => ({ ...prev, [listing.id]: e.target.value }))
                }
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
        <div className={styles.rowActions}>
          <Button
            size="sm"
            disabled={busyId === listing.id || loading}
            onClick={() => {
              setBusyId(listing.id)
              void installMcpFromCatalog({
                listingId: listing.id,
                ...(authByListing[listing.id]?.trim()
                  ? { authToken: authByListing[listing.id]!.trim() }
                  : {}),
              }).finally(() => setBusyId(null))
            }}
          >
            {ts('chat.marketplace.install')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void disableMcpCatalogListing(listing.id).then((ok) => {
                if (ok) void loadMcp(false)
              })
            }}
          >
            {ts('chat.marketplace.hide')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void reportMcpCatalogListing({ listingId: listing.id }).then((ok) => {
                if (ok) void loadMcp(false)
              })
            }}
          >
            {ts('chat.marketplace.report')}
          </Button>
        </div>
      </div>
    )
  }

  const renderSkillListing = (listing: SkillCatalogListing) => {
    const installId = listing.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
    const installed = installedSkillIds.has(installId)
    const community = listing.trustTier === 'community'
    return (
      <div key={listing.id} className={styles.row}>
        <div>
          <div className={styles.rowTitle}>
            {listing.name}{' '}
            <span className={styles.badge}>
              {community
                ? ts('chat.marketplace.community')
                : ts('chat.marketplace.curated')}
            </span>
            {installed ? (
              <span className={`${styles.badge} ${styles.badgeInstalled}`}>
                {ts('chat.marketplace.installed')}
              </span>
            ) : null}
          </div>
          {listing.description ? (
            <div className={styles.rowMeta}>{listing.description}</div>
          ) : null}
          <div className={styles.rowMeta}>v{listing.version}</div>
          {community ? (
            <p className={styles.help}>{ts('chat.marketplace.skillCommunityRisk')}</p>
          ) : null}
          <pre className={styles.preview}>{skillPreview(listing)}</pre>
        </div>
        <div className={styles.rowActions}>
          <Button
            size="sm"
            disabled={busyId === listing.id || loading}
            onClick={() => {
              setBusyId(listing.id)
              void installSkillFromCatalog({
                listingId: listing.id,
                ...(installed ? { replace: true } : {}),
              })
                .then((desc) => {
                  if (desc) void reloadInstalledSkills()
                })
                .finally(() => setBusyId(null))
            }}
          >
            {installed
              ? ts('chat.marketplace.replace')
              : ts('chat.marketplace.install')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void disableSkillCatalogListing(listing.id).then((ok) => {
                if (ok) void loadSkills(false)
              })
            }}
          >
            {ts('chat.marketplace.hide')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => {
              void reportSkillCatalogListing({ listingId: listing.id }).then((ok) => {
                if (ok) void loadSkills(false)
              })
            }}
          >
            {ts('chat.marketplace.report')}
          </Button>
        </div>
      </div>
    )
  }

  return createPortal(
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.marketplace.title')}
    >
      <div className={styles.main} data-marketplace-overlay="">
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{ts('chat.marketplace.title')}</h2>
            <div className={styles.subtitle}>{ts('chat.marketplace.subtitle')}</div>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={ts('chat.marketplace.refresh')}
              title={ts('chat.marketplace.refresh')}
              disabled={loading}
              onClick={() => {
                if (tab === 'mcp') void loadMcp(true)
                else void loadSkills(true)
              }}
            >
              <RefreshCw size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={ts('chat.marketplace.close')}
              title={ts('chat.marketplace.close')}
              onClick={() => setMarketplaceOpen(false)}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
        </header>
        <div className={styles.tabs} role="tablist" aria-label={ts('chat.marketplace.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mcp'}
            className={`${styles.tab} ${tab === 'mcp' ? styles.tabActive : ''}`}
            onClick={() => setTab('mcp')}
          >
            {ts('chat.marketplace.tabMcp')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'skills'}
            className={`${styles.tab} ${tab === 'skills' ? styles.tabActive : ''}`}
            onClick={() => setTab('skills')}
          >
            {ts('chat.marketplace.tabSkills')}
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.help}>
            {tab === 'mcp'
              ? ts('chat.marketplace.mcpIntro')
              : ts('chat.marketplace.skillsIntro')}
          </p>
          {tab === 'mcp' && mcpView ? (
            <p className={styles.help}>
              {ts('chat.marketplace.source', { source: mcpView.source })}
            </p>
          ) : null}
          {tab === 'skills' && skillView ? (
            <p className={styles.help}>
              {ts('chat.marketplace.source', { source: skillView.source })}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {tab === 'mcp' ? (
            <>
              {mcpListings.length === 0 && !loading ? (
                <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
              ) : null}
              {mcpCurated.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.curatedSection')}
                  </h3>
                  <div className={styles.list}>{mcpCurated.map(renderMcpListing)}</div>
                </>
              ) : null}
              {mcpCommunity.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.communitySection')}
                  </h3>
                  <div className={styles.list}>{mcpCommunity.map(renderMcpListing)}</div>
                </>
              ) : null}
            </>
          ) : (
            <>
              {skillListings.length === 0 && !loading ? (
                <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
              ) : null}
              {skillCurated.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.curatedSection')}
                  </h3>
                  <div className={styles.list}>{skillCurated.map(renderSkillListing)}</div>
                </>
              ) : null}
              {skillCommunity.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.communitySection')}
                  </h3>
                  <div className={styles.list}>
                    {skillCommunity.map(renderSkillListing)}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </GraphOverlayFrame>,
    document.body,
  )
}

/** Icon export for edge rail reuse. */
export { Package as MarketplaceIcon }
