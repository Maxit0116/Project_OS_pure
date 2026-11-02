import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, RefreshCw, X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import type {
  McpCatalogListing,
  SkillCatalogListing,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import MarketplaceCard, { type MarketplaceCardAction } from './MarketplaceCard'
import MarketplaceDetail from './MarketplaceDetail'
import {
  buildMcpDetailModel,
  buildSkillDetailModel,
} from './marketplaceDetailModel'
import styles from './MarketplaceOverlay.module.css'

type MarketTab = 'mcp' | 'skills'

function buildAgentInstallPrompt(input: {
  kind: MarketTab
  url: string
  message: string
  ts: (key: string, vars?: Record<string, string | number>) => string
}): string {
  const key =
    input.kind === 'mcp'
      ? 'chat.marketplace.gitUrlAgentPromptMcp'
      : 'chat.marketplace.gitUrlAgentPromptSkill'
  return input.ts(key, { url: input.url, message: input.message })
}

type DetailSelection =
  | { kind: 'mcp'; listing: McpCatalogListing }
  | { kind: 'skills'; listing: SkillCatalogListing }

function skillInstallId(listingId: string): string {
  return listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

export default function MarketplaceOverlay() {
  const open = useChatSessionStore((s) => s.marketplaceOpen)
  const setMarketplaceOpen = useChatSessionStore((s) => s.setMarketplaceOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const settings = useWorkbenchStore((s) => s.settings)
  const mcpView = useWorkbenchStore((s) => s.mcpCatalogView)
  const skillView = useWorkbenchStore((s) => s.skillCatalogView)
  const installedSkillIds = useWorkbenchStore((s) => s.installedMarketplaceSkillIds)
  const catalogStatus = useWorkbenchStore((s) => s.marketplaceCatalogStatus)
  const prefetchMarketplaceCatalogs = useWorkbenchStore((s) => s.prefetchMarketplaceCatalogs)
  const refreshMcpCatalog = useWorkbenchStore((s) => s.refreshMcpCatalog)
  const installMcpFromCatalog = useWorkbenchStore((s) => s.installMcpFromCatalog)
  const uninstallMcpListing = useWorkbenchStore((s) => s.uninstallMcpListing)
  const disableMcpCatalogListing = useWorkbenchStore((s) => s.disableMcpCatalogListing)
  const reportMcpCatalogListing = useWorkbenchStore((s) => s.reportMcpCatalogListing)
  const refreshSkillCatalog = useWorkbenchStore((s) => s.refreshSkillCatalog)
  const installSkillFromCatalog = useWorkbenchStore((s) => s.installSkillFromCatalog)
  const uninstallSkillFromCatalog = useWorkbenchStore((s) => s.uninstallSkillFromCatalog)
  const disableSkillCatalogListing = useWorkbenchStore((s) => s.disableSkillCatalogListing)
  const reportSkillCatalogListing = useWorkbenchStore((s) => s.reportSkillCatalogListing)
  const listMcpCatalog = useWorkbenchStore((s) => s.listMcpCatalog)
  const listSkillCatalog = useWorkbenchStore((s) => s.listSkillCatalog)
  const refreshInstalledMarketplaceSkills = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceSkills,
  )
  const installFromGitUrl = useWorkbenchStore((s) => s.installFromGitUrl)
  const sendPrompt = useWorkbenchStore((s) => s.sendPrompt)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const { ts } = useI18n()

  const [tab, setTab] = useState<MarketTab>('mcp')
  const [detail, setDetail] = useState<DetailSelection | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authByListing, setAuthByListing] = useState<Record<string, string>>({})
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [gitInstalling, setGitInstalling] = useState(false)

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  const installedMcpListingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const server of settings?.mcpServers ?? []) {
      if (server.provenance?.listingId) ids.add(server.provenance.listingId)
    }
    return ids
  }, [settings?.mcpServers])

  const installedSkillIdSet = useMemo(
    () => new Set(installedSkillIds),
    [installedSkillIds],
  )

  const activeView = tab === 'mcp' ? mcpView : skillView
  const loading =
    manualRefreshing ||
    (catalogStatus === 'loading' && !activeView) ||
    (catalogStatus === 'idle' && !activeView)

  // Ensure catalogs are warm whenever the overlay opens (usually already prefetched).
  useEffect(() => {
    if (!open) return
    setDetail(null)
    setError(null)
    void prefetchMarketplaceCatalogs().then(() => {
      const state = useWorkbenchStore.getState()
      const view = tab === 'mcp' ? state.mcpCatalogView : state.skillCatalogView
      if (!view && state.marketplaceCatalogStatus === 'error') {
        setError(ts('chat.marketplace.loadFailed'))
      }
    })
  }, [open, prefetchMarketplaceCatalogs, tab, ts])

  const loadMcp = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshMcpCatalog() : await listMcpCatalog()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listMcpCatalog, refreshMcpCatalog, ts],
  )

  const loadSkills = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshSkillCatalog() : await listSkillCatalog()
      await refreshInstalledMarketplaceSkills()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listSkillCatalog, refreshInstalledMarketplaceSkills, refreshSkillCatalog, ts],
  )

  const handOffGitInstallToAgent = useCallback(
    async (url: string, message: string) => {
      const ok = window.confirm(ts('chat.marketplace.gitUrlAgentFallbackConfirm'))
      if (!ok) {
        setError(ts('chat.marketplace.gitUrlFailed', { message }))
        return
      }
      const prompt = buildAgentInstallPrompt({ kind: tab, url, message, ts })
      setMarketplaceOpen(false)
      setRightPanelOpen(true)
      await sendPrompt(prompt)
    },
    [sendPrompt, setMarketplaceOpen, setRightPanelOpen, tab, ts],
  )

  const runGitUrlInstall = useCallback(async () => {
    const url = gitUrl.trim()
    if (!url) {
      setError(ts('chat.marketplace.gitUrlEmpty'))
      return
    }
    const kindLabel =
      tab === 'mcp'
        ? ts('chat.marketplace.gitUrlKindMcp')
        : ts('chat.marketplace.gitUrlKindSkill')
    const confirmed = window.confirm(
      ts('chat.marketplace.gitUrlConfirm', { kind: kindLabel, url }),
    )
    if (!confirmed) return

    setGitInstalling(true)
    setError(null)
    try {
      let result = await installFromGitUrl({ url, kind: tab })
      if (result?.status === 'conflict') {
        const replaceOk = window.confirm(
          ts('chat.marketplace.gitUrlConflictConfirm', { name: result.existingName }),
        )
        if (!replaceOk) return
        result = await installFromGitUrl({ url, kind: tab, replace: true })
      }
      if (!result) {
        setError(ts('chat.marketplace.gitUrlFailed', { message: 'Unknown error' }))
        return
      }
      if (result.status === 'failed') {
        await handOffGitInstallToAgent(url, result.message)
        return
      }
      if (result.status === 'conflict') {
        setError(result.message)
        return
      }
      setGitUrl('')
      if (tab === 'skills') await refreshInstalledMarketplaceSkills()
    } finally {
      setGitInstalling(false)
    }
  }, [
    gitUrl,
    handOffGitInstallToAgent,
    installFromGitUrl,
    refreshInstalledMarketplaceSkills,
    tab,
    ts,
  ])

  const runMcpAction = useCallback(
    async (listing: McpCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallMcpListing(listing.id)
          return
        }
        if (action === 'update') {
          await uninstallMcpListing(listing.id)
        }
        await installMcpFromCatalog({
          listingId: listing.id,
          ...(authByListing[listing.id]?.trim()
            ? { authToken: authByListing[listing.id]!.trim() }
            : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [authByListing, installMcpFromCatalog, uninstallMcpListing],
  )

  const runSkillAction = useCallback(
    async (listing: SkillCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallSkillFromCatalog(listing.id)
          return
        }
        await installSkillFromCatalog({
          listingId: listing.id,
          ...(action === 'update' ? { replace: true } : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [installSkillFromCatalog, uninstallSkillFromCatalog],
  )

  if (!open) return null

  const mcpListings = mcpView?.document.listings ?? []
  const skillListings = skillView?.document.listings ?? []
  const mcpCurated = mcpListings.filter((l) => l.trustTier === 'curated')
  const mcpCommunity = mcpListings.filter((l) => l.trustTier === 'community')
  const skillCurated = skillListings.filter((l) => l.trustTier === 'curated')
  const skillCommunity = skillListings.filter((l) => l.trustTier === 'community')

  const cardLabels = {
    curatedLabel: ts('chat.marketplace.curated'),
    communityLabel: ts('chat.marketplace.community'),
    installedLabel: ts('chat.marketplace.installed'),
    installLabel: ts('chat.marketplace.install'),
    updateLabel: ts('chat.marketplace.update'),
    uninstallLabel: ts('chat.marketplace.uninstall'),
  }

  const detailSectionLabels = {
    overviewTitle: ts('chat.marketplace.detailOverview'),
    factsTitle: ts('chat.marketplace.detailFacts'),
    setupTitle: ts('chat.marketplace.detailSetup'),
    credentialsTitle: ts('chat.marketplace.detailCredentials'),
    envTitle: ts('chat.marketplace.detailEnv'),
    headersTitle: ts('chat.marketplace.detailHeaders'),
    toolsTitle: ts('chat.marketplace.detailTools'),
    filesTitle: ts('chat.marketplace.detailFiles'),
    frontmatterTitle: ts('chat.marketplace.detailFrontmatter'),
    riskTitle: ts('chat.marketplace.detailRisk'),
  }

  const renderMcpGrid = (listings: McpCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed = installedMcpListingIds.has(listing.id)
        return (
          <MarketplaceCard
            key={listing.id}
            id={listing.id}
            name={listing.name}
            description={listing.description}
            homepage={listing.homepage}
            iconUrl={listing.iconUrl}
            installed={installed}
            community={listing.trustTier === 'community'}
            busy={busyId === listing.id}
            disabled={loading}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'mcp', listing })}
            onAction={(action) => {
              void runMcpAction(listing, action)
            }}
          />
        )
      })}
    </div>
  )

  const renderSkillGrid = (listings: SkillCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed = installedSkillIdSet.has(skillInstallId(listing.id))
        return (
          <MarketplaceCard
            key={listing.id}
            id={listing.id}
            name={listing.name}
            description={listing.description}
            homepage={listing.homepage}
            iconUrl={listing.iconUrl}
            installed={installed}
            community={listing.trustTier === 'community'}
            busy={busyId === listing.id}
            disabled={loading}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'skills', listing })}
            onAction={(action) => {
              void runSkillAction(listing, action)
            }}
          />
        )
      })}
    </div>
  )

  const renderDetail = () => {
    if (!detail) return null
    if (detail.kind === 'mcp') {
      const listing = detail.listing
      const installed = installedMcpListingIds.has(listing.id)
      const community = listing.trustTier === 'community'
      const model = buildMcpDetailModel(listing, {
        listingId: ts('chat.marketplace.detailListingId'),
        version: ts('chat.marketplace.detailVersion'),
        trust: ts('chat.marketplace.detailTrust'),
        transport: ts('chat.marketplace.detailTransport'),
        authRequired: ts('chat.marketplace.detailAuthRequired'),
        yes: ts('chat.marketplace.detailYes'),
        no: ts('chat.marketplace.detailNo'),
        curated: ts('chat.marketplace.curated'),
        community: ts('chat.marketplace.community'),
        installConfig: ts('chat.marketplace.detailInstallConfig'),
        documentation: ts('chat.marketplace.detailDocumentation'),
        cwd: ts('chat.marketplace.detailCwd'),
        gettingStartedDisabled: ts('chat.marketplace.detailMcpStepDisabled'),
        gettingStartedPermissions: ts('chat.marketplace.detailMcpStepPermissions'),
        gettingStartedAuth: ts('chat.marketplace.detailMcpStepAuth'),
        communityRisk: ts('chat.marketplace.mcpCommunityRisk'),
        authTokenHint: ts('chat.marketplace.detailAuthTokenHint'),
      })
      return (
        <MarketplaceDetail
          id={listing.id}
          name={listing.name}
          homepage={listing.homepage}
          iconUrl={listing.iconUrl}
          version={listing.version}
          installed={installed}
          community={community}
          busy={busyId === listing.id}
          disabled={loading}
          {...cardLabels}
          {...detailSectionLabels}
          backLabel={ts('chat.marketplace.back')}
          homepageLabel={ts('chat.marketplace.openHomepage')}
          model={model}
          onBack={() => setDetail(null)}
          onAction={(action) => {
            void runMcpAction(listing, action)
          }}
          secondaryActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void disableMcpCatalogListing(listing.id).then((ok) => {
                    if (ok) {
                      setDetail(null)
                      void loadMcp(false)
                    }
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
            </>
          }
        >
          {listing.requiresAuth ? (
            <TextInput
              label={ts('chat.marketplace.authToken')}
              type="password"
              value={authByListing[listing.id] ?? ''}
              onChange={(e) =>
                setAuthByListing((prev) => ({ ...prev, [listing.id]: e.target.value }))
              }
              autoComplete="off"
            />
          ) : null}
        </MarketplaceDetail>
      )
    }

    const listing = detail.listing
    const installed = installedSkillIdSet.has(skillInstallId(listing.id))
    const community = listing.trustTier === 'community'
    const model = buildSkillDetailModel(listing, {
      listingId: ts('chat.marketplace.detailListingId'),
      installId: ts('chat.marketplace.detailInstallId'),
      version: ts('chat.marketplace.detailVersion'),
      trust: ts('chat.marketplace.detailTrust'),
      curated: ts('chat.marketplace.curated'),
      community: ts('chat.marketplace.community'),
      installPath: ts('chat.marketplace.detailInstallPath'),
      installConfig: ts('chat.marketplace.detailInstallConfig'),
      documentation: ts('chat.marketplace.detailDocumentation'),
      gettingStartedPath: ts('chat.marketplace.detailSkillStepPath'),
      gettingStartedInvoke: ts('chat.marketplace.detailSkillStepInvoke'),
      communityRisk: ts('chat.marketplace.skillCommunityRisk'),
    })
    return (
      <MarketplaceDetail
        id={listing.id}
        name={listing.name}
        homepage={listing.homepage}
        iconUrl={listing.iconUrl}
        version={listing.version}
        installed={installed}
        community={community}
        busy={busyId === listing.id}
        disabled={loading}
        {...cardLabels}
        {...detailSectionLabels}
        backLabel={ts('chat.marketplace.back')}
        homepageLabel={ts('chat.marketplace.openHomepage')}
        model={model}
        onBack={() => setDetail(null)}
        onAction={(action) => {
          void runSkillAction(listing, action)
        }}
        secondaryActions={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => {
                void disableSkillCatalogListing(listing.id).then((ok) => {
                  if (ok) {
                    setDetail(null)
                    void loadSkills(false)
                  }
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
          </>
        }
      />
    )
  }

  return (
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
        {!detail ? (
          <>
            <div className={styles.gitUrlBar}>
              <input
                className={styles.gitUrlInput}
                type="url"
                value={gitUrl}
                disabled={gitInstalling || loading}
                placeholder={ts('chat.marketplace.gitUrlPlaceholder')}
                aria-label={ts('chat.marketplace.gitUrlPlaceholder')}
                onChange={(e) => setGitUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void runGitUrlInstall()
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={gitInstalling || loading || !gitUrl.trim()}
                onClick={() => {
                  void runGitUrlInstall()
                }}
              >
                {gitInstalling
                  ? ts('chat.marketplace.gitUrlInstalling')
                  : ts('chat.marketplace.gitUrlInstall')}
              </Button>
            </div>
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
          </>
        ) : null}
        <div className={styles.body}>
          {detail ? (
            renderDetail()
          ) : (
            <>
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
                      {renderMcpGrid(mcpCurated)}
                    </>
                  ) : null}
                  {mcpCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderMcpGrid(mcpCommunity)}
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
                      {renderSkillGrid(skillCurated)}
                    </>
                  ) : null}
                  {skillCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderSkillGrid(skillCommunity)}
                    </>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </GraphOverlayFrame>
  )
}

/** Icon export for edge rail reuse. */
export { Package as MarketplaceIcon }
