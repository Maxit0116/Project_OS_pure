import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Package, RefreshCw, X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import type {
  AgentCatalogListing,
  AssembleWorkforceAgentResult,
  AssemblyBinding,
  AssemblySearchScope,
  McpCatalogListing,
  RulesCatalogListing,
  SkillCatalogListing,
  StencilCatalogListing,
  WorkforceAgentDraft,
  WorkflowCatalogListing,
} from '@contracts/index'
import AgentAssemblyCard from '../AgentWorkforce/AgentAssemblyCard'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import MarketplaceCard, { type MarketplaceCardAction } from './MarketplaceCard'
import MarketplaceComposeDock from './MarketplaceComposeDock'
import MarketplaceDetail from './MarketplaceDetail'
import LabCapabilityPrepPage from './LabCapabilityPrepPage'
import { useProductLabStore } from '../../state/productLabStore'
import {
  buildAgentDetailModel,
  buildMcpDetailModel,
  buildRulesDetailModel,
  buildSkillDetailModel,
  buildStencilDetailModel,
  buildWorkflowDetailModel,
} from './marketplaceDetailModel'
import {
  buildInstalledMarketplaceEntries,
  dependencyKindToTab,
  type MarketplaceDependencyLink,
} from './marketplaceDependencies'
import {
  marketplaceTabSupportsGitUrl,
  marketplaceTabSupportsPackImport,
  normalizeMarketplacePackId,
  visibleMarketplaceTabs,
  type MarketplaceTabId,
} from './marketplaceKinds'
import styles from './MarketplaceOverlay.module.css'

const TAB_STORAGE_KEY = 'projectos.marketplace.activeTab'
const VIEW_STORAGE_KEY = 'projectos.marketplace.viewMode'

type MarketplaceViewMode = 'catalog' | 'installed'

function loadStoredTab(fallback: MarketplaceTabId): MarketplaceTabId {
  try {
    const raw = sessionStorage.getItem(TAB_STORAGE_KEY)
    const tabs = visibleMarketplaceTabs()
    if (raw && tabs.some((entry) => entry.id === raw)) {
      return raw as MarketplaceTabId
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function loadStoredViewMode(): MarketplaceViewMode {
  try {
    return sessionStorage.getItem(VIEW_STORAGE_KEY) === 'installed'
      ? 'installed'
      : 'catalog'
  } catch {
    return 'catalog'
  }
}

function buildAgentInstallPrompt(input: {
  kind: MarketplaceTabId
  url: string
  message: string
  ts: (key: string, vars?: Record<string, string | number>) => string
}): string {
  const keyByKind: Record<MarketplaceTabId, string> = {
    mcp: 'chat.marketplace.gitUrlAgentPromptMcp',
    skills: 'chat.marketplace.gitUrlAgentPromptSkill',
    rules: 'chat.marketplace.gitUrlAgentPromptRules',
    agents: 'chat.marketplace.gitUrlAgentPromptAgents',
    workflows: 'chat.marketplace.gitUrlAgentPromptWorkflows',
    stencils: 'chat.marketplace.gitUrlAgentPromptStencils',
  }
  return input.ts(keyByKind[input.kind], { url: input.url, message: input.message })
}

function gitUrlKindLabel(
  kind: MarketplaceTabId,
  ts: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const keyByKind: Record<MarketplaceTabId, string> = {
    mcp: 'chat.marketplace.gitUrlKindMcp',
    skills: 'chat.marketplace.gitUrlKindSkill',
    rules: 'chat.marketplace.gitUrlKindRules',
    agents: 'chat.marketplace.gitUrlKindAgents',
    workflows: 'chat.marketplace.gitUrlKindWorkflows',
    stencils: 'chat.marketplace.gitUrlKindStencils',
  }
  return ts(keyByKind[kind])
}

type DetailSelection =
  | { kind: 'mcp'; listing: McpCatalogListing }
  | { kind: 'skills'; listing: SkillCatalogListing }
  | { kind: 'rules'; listing: RulesCatalogListing }
  | { kind: 'agents'; listing: AgentCatalogListing }
  | { kind: 'workflows'; listing: WorkflowCatalogListing }
  | { kind: 'stencils'; listing: StencilCatalogListing }

export default function MarketplaceOverlay() {
  const open = useChatSessionStore((s) => s.marketplaceOpen)
  const setMarketplaceOpen = useChatSessionStore((s) => s.setMarketplaceOpen)
  const labPrepOpen = useProductLabStore((s) => s.labMarketplacePrepOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const settings = useWorkbenchStore((s) => s.settings)
  const mcpView = useWorkbenchStore((s) => s.mcpCatalogView)
  const skillView = useWorkbenchStore((s) => s.skillCatalogView)
  const rulesView = useWorkbenchStore((s) => s.rulesCatalogView)
  const installedSkillIds = useWorkbenchStore((s) => s.installedMarketplaceSkillIds)
  const installedRulesPackIds = useWorkbenchStore((s) => s.installedMarketplaceRulesPackIds)
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
  const refreshRulesCatalog = useWorkbenchStore((s) => s.refreshRulesCatalog)
  const installRulesFromCatalog = useWorkbenchStore((s) => s.installRulesFromCatalog)
  const uninstallRulesFromCatalog = useWorkbenchStore((s) => s.uninstallRulesFromCatalog)
  const disableRulesCatalogListing = useWorkbenchStore((s) => s.disableRulesCatalogListing)
  const reportRulesCatalogListing = useWorkbenchStore((s) => s.reportRulesCatalogListing)
  const listMcpCatalog = useWorkbenchStore((s) => s.listMcpCatalog)
  const listSkillCatalog = useWorkbenchStore((s) => s.listSkillCatalog)
  const listRulesCatalog = useWorkbenchStore((s) => s.listRulesCatalog)
  const refreshInstalledMarketplaceSkills = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceSkills,
  )
  const refreshInstalledMarketplaceRulesPacks = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceRulesPacks,
  )
  const agentView = useWorkbenchStore((s) => s.agentCatalogView)
  const installedAgentListingIds = useWorkbenchStore((s) => s.installedMarketplaceAgentListingIds)
  const refreshAgentCatalog = useWorkbenchStore((s) => s.refreshAgentCatalog)
  const installAgentFromCatalog = useWorkbenchStore((s) => s.installAgentFromCatalog)
  const uninstallAgentFromCatalog = useWorkbenchStore((s) => s.uninstallAgentFromCatalog)
  const disableAgentCatalogListing = useWorkbenchStore((s) => s.disableAgentCatalogListing)
  const reportAgentCatalogListing = useWorkbenchStore((s) => s.reportAgentCatalogListing)
  const listAgentCatalog = useWorkbenchStore((s) => s.listAgentCatalog)
  const refreshInstalledMarketplaceAgents = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceAgents,
  )
  const workflowView = useWorkbenchStore((s) => s.workflowCatalogView)
  const installedWorkflowListingIds = useWorkbenchStore(
    (s) => s.installedMarketplaceWorkflowListingIds,
  )
  const refreshWorkflowCatalog = useWorkbenchStore((s) => s.refreshWorkflowCatalog)
  const installWorkflowFromCatalog = useWorkbenchStore((s) => s.installWorkflowFromCatalog)
  const uninstallWorkflowFromCatalog = useWorkbenchStore((s) => s.uninstallWorkflowFromCatalog)
  const disableWorkflowCatalogListing = useWorkbenchStore((s) => s.disableWorkflowCatalogListing)
  const reportWorkflowCatalogListing = useWorkbenchStore((s) => s.reportWorkflowCatalogListing)
  const listWorkflowCatalog = useWorkbenchStore((s) => s.listWorkflowCatalog)
  const refreshInstalledMarketplaceWorkflows = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceWorkflows,
  )
  const stencilView = useWorkbenchStore((s) => s.stencilCatalogView)
  const installedStencilListingIds = useWorkbenchStore(
    (s) => s.installedMarketplaceStencilListingIds,
  )
  const refreshStencilCatalog = useWorkbenchStore((s) => s.refreshStencilCatalog)
  const installStencilFromCatalog = useWorkbenchStore((s) => s.installStencilFromCatalog)
  const uninstallStencilFromCatalog = useWorkbenchStore((s) => s.uninstallStencilFromCatalog)
  const disableStencilCatalogListing = useWorkbenchStore((s) => s.disableStencilCatalogListing)
  const reportStencilCatalogListing = useWorkbenchStore((s) => s.reportStencilCatalogListing)
  const listStencilCatalog = useWorkbenchStore((s) => s.listStencilCatalog)
  const refreshInstalledMarketplaceStencils = useWorkbenchStore(
    (s) => s.refreshInstalledMarketplaceStencils,
  )
  const installFromGitUrl = useWorkbenchStore((s) => s.installFromGitUrl)
  const installAgentFromExportPack = useWorkbenchStore((s) => s.installAgentFromExportPack)
  const installRulesFromExportPack = useWorkbenchStore((s) => s.installRulesFromExportPack)
  const installWorkflowFromExportPack = useWorkbenchStore((s) => s.installWorkflowFromExportPack)
  const installStencilFromExportPack = useWorkbenchStore((s) => s.installStencilFromExportPack)
  const assembleWorkforceAgent = useWorkbenchStore((s) => s.assembleWorkforceAgent)
  const confirmMarketplaceAgentAssembly = useWorkbenchStore(
    (s) => s.confirmMarketplaceAgentAssembly,
  )
  const setActiveAgentDefinitionId = useWorkbenchStore((s) => s.setActiveAgentDefinitionId)
  const sendPrompt = useWorkbenchStore((s) => s.sendPrompt)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const { ts } = useI18n()

  const tabs = useMemo(() => visibleMarketplaceTabs(), [])
  const [tab, setTab] = useState<MarketplaceTabId>(() => loadStoredTab('mcp'))
  const [viewMode, setViewMode] = useState<MarketplaceViewMode>(() => loadStoredViewMode())
  const [detail, setDetail] = useState<DetailSelection | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authByListing, setAuthByListing] = useState<Record<string, string>>({})
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [gitInstalling, setGitInstalling] = useState(false)
  const [packJson, setPackJson] = useState('')
  const [packImporting, setPackImporting] = useState(false)
  const [highlightListingId, setHighlightListingId] = useState<string | null>(null)
  const [composePrompt, setComposePrompt] = useState('')
  const [composeConsentOpen, setComposeConsentOpen] = useState(false)
  const [composeMatching, setComposeMatching] = useState(false)
  const [composeBusy, setComposeBusy] = useState(false)
  const [assemblyResult, setAssemblyResult] = useState<AssembleWorkforceAgentResult | null>(null)
  const [createdAssemblyId, setCreatedAssemblyId] = useState<string | null>(null)
  const [assemblyInstallErrors, setAssemblyInstallErrors] = useState<string[]>([])

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  useEffect(() => {
    if (!highlightListingId) return
    const timer = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-marketplace-overlay] [data-listing-id="${CSS.escape(highlightListingId)}"]`,
      )
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
    const clear = window.setTimeout(() => setHighlightListingId(null), 2800)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(clear)
    }
  }, [highlightListingId, tab, viewMode])

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
  const installedRulesIdSet = useMemo(
    () => new Set(installedRulesPackIds),
    [installedRulesPackIds],
  )
  const installedAgentIdSet = useMemo(
    () => new Set(installedAgentListingIds),
    [installedAgentListingIds],
  )
  const installedWorkflowIdSet = useMemo(
    () => new Set(installedWorkflowListingIds),
    [installedWorkflowListingIds],
  )
  const installedStencilIdSet = useMemo(
    () => new Set(installedStencilListingIds),
    [installedStencilListingIds],
  )

  const activeView =
    tab === 'mcp'
      ? mcpView
      : tab === 'skills'
        ? skillView
        : tab === 'rules'
          ? rulesView
          : tab === 'agents'
            ? agentView
            : tab === 'stencils'
              ? stencilView
              : workflowView
  const loading =
    manualRefreshing ||
    (catalogStatus === 'loading' && !activeView) ||
    (catalogStatus === 'idle' && !activeView)
  const gitUrlEnabled = marketplaceTabSupportsGitUrl(tab)
  const packImportEnabled = marketplaceTabSupportsPackImport(tab)

  useEffect(() => {
    if (!open) return
    setDetail(null)
    setError(null)
    void prefetchMarketplaceCatalogs().then(() => {
      const state = useWorkbenchStore.getState()
      const view =
        tab === 'mcp'
          ? state.mcpCatalogView
          : tab === 'skills'
            ? state.skillCatalogView
            : tab === 'rules'
              ? state.rulesCatalogView
              : tab === 'agents'
                ? state.agentCatalogView
                : tab === 'stencils'
                  ? state.stencilCatalogView
                  : state.workflowCatalogView
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

  const loadRules = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshRulesCatalog() : await listRulesCatalog()
      await refreshInstalledMarketplaceRulesPacks()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listRulesCatalog, refreshInstalledMarketplaceRulesPacks, refreshRulesCatalog, ts],
  )

  const loadAgents = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshAgentCatalog() : await listAgentCatalog()
      await refreshInstalledMarketplaceAgents()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listAgentCatalog, refreshInstalledMarketplaceAgents, refreshAgentCatalog, ts],
  )

  const loadWorkflows = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshWorkflowCatalog() : await listWorkflowCatalog()
      await refreshInstalledMarketplaceWorkflows()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listWorkflowCatalog, refreshInstalledMarketplaceWorkflows, refreshWorkflowCatalog, ts],
  )

  const loadStencils = useCallback(
    async (force = false) => {
      setError(null)
      if (force) setManualRefreshing(true)
      const view = force ? await refreshStencilCatalog() : await listStencilCatalog()
      await refreshInstalledMarketplaceStencils()
      if (!view) setError(ts('chat.marketplace.loadFailed'))
      setManualRefreshing(false)
    },
    [listStencilCatalog, refreshInstalledMarketplaceStencils, refreshStencilCatalog, ts],
  )

  const refreshActiveTab = useCallback(
    (force: boolean) => {
      if (tab === 'mcp') void loadMcp(force)
      else if (tab === 'skills') void loadSkills(force)
      else if (tab === 'rules') void loadRules(force)
      else if (tab === 'agents') void loadAgents(force)
      else if (tab === 'stencils') void loadStencils(force)
      else void loadWorkflows(force)
    },
    [loadAgents, loadMcp, loadRules, loadSkills, loadStencils, loadWorkflows, tab],
  )

  const handOffGitInstallToAgent = useCallback(
    async (url: string, message: string) => {
      if (tab !== 'mcp' && tab !== 'skills') return
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
    const gitKind = tab
    const url = gitUrl.trim()
    if (!url) {
      setError(ts('chat.marketplace.gitUrlEmpty'))
      return
    }
    const kindLabel = gitUrlKindLabel(gitKind, ts)
    const confirmed = window.confirm(
      ts('chat.marketplace.gitUrlConfirm', { kind: kindLabel, url }),
    )
    if (!confirmed) return

    setGitInstalling(true)
    setError(null)
    try {
      let result = await installFromGitUrl({ url, kind: gitKind })
      if (result?.status === 'conflict') {
        const replaceOk = window.confirm(
          ts('chat.marketplace.gitUrlConflictConfirm', { name: result.existingName }),
        )
        if (!replaceOk) return
        result = await installFromGitUrl({ url, kind: gitKind, replace: true })
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
      if (gitKind === 'skills') await refreshInstalledMarketplaceSkills()
      if (gitKind === 'rules') await refreshInstalledMarketplaceRulesPacks()
      if (gitKind === 'agents') await refreshInstalledMarketplaceAgents()
      if (gitKind === 'workflows') await refreshInstalledMarketplaceWorkflows()
      if (gitKind === 'stencils') await refreshInstalledMarketplaceStencils()
    } finally {
      setGitInstalling(false)
    }
  }, [
    gitUrl,
    handOffGitInstallToAgent,
    installFromGitUrl,
    refreshInstalledMarketplaceAgents,
    refreshInstalledMarketplaceRulesPacks,
    refreshInstalledMarketplaceSkills,
    refreshInstalledMarketplaceStencils,
    refreshInstalledMarketplaceWorkflows,
    tab,
    ts,
  ])

  const beginComposeConsent = useCallback(() => {
    const prompt = composePrompt.trim()
    if (!prompt) {
      setError(ts('chat.marketplace.composePlaceholder'))
      return
    }
    setError(null)
    setComposeConsentOpen(true)
  }, [composePrompt, ts])

  const runAssemble = useCallback(
    async (scope: AssemblySearchScope) => {
      const prompt = composePrompt.trim()
      if (!prompt) return
      setComposeConsentOpen(false)
      setComposeMatching(true)
      setError(null)
      setCreatedAssemblyId(null)
      setAssemblyInstallErrors([])
      try {
        const result = await assembleWorkforceAgent({ prompt, scope })
        if (!result) {
          setError(ts('chat.marketplace.composeFailed'))
          return
        }
        setAssemblyResult(result)
      } finally {
        setComposeMatching(false)
      }
    },
    [assembleWorkforceAgent, composePrompt, ts],
  )

  const updateAssemblyDraft = useCallback((draft: WorkforceAgentDraft) => {
    setAssemblyResult((prev) => (prev ? { ...prev, draft } : prev))
  }, [])

  const updateAssemblyBindings = useCallback((bindings: AssemblyBinding[]) => {
    setAssemblyResult((prev) => (prev ? { ...prev, bindings } : prev))
  }, [])

  const runAssemblyConfirm = useCallback(
    async (installOnly: boolean) => {
      if (!assemblyResult) return
      setComposeBusy(true)
      setAssemblyInstallErrors([])
      try {
        const outcome = await confirmMarketplaceAgentAssembly({
          draft: assemblyResult.draft,
          bindings: assemblyResult.bindings,
          installOnly,
        })
        if (!outcome) {
          setError(ts('chat.marketplace.composeFailed'))
          return
        }
        setAssemblyResult((prev) =>
          prev ? { ...prev, bindings: outcome.bindings } : prev,
        )
        setAssemblyInstallErrors(outcome.installErrorIds)
        if (outcome.createdId) {
          setCreatedAssemblyId(outcome.createdId)
        } else if (outcome.installErrorIds.length > 0 && !installOnly) {
          setError(ts('workforce.assemblyInstallFailed'))
        }
      } finally {
        setComposeBusy(false)
      }
    },
    [assemblyResult, confirmMarketplaceAgentAssembly, ts],
  )

  const useCreatedAssemblyInChat = useCallback(() => {
    if (!createdAssemblyId || !assemblyResult) return
    setActiveAgentDefinitionId(createdAssemblyId, assemblyResult.draft.displayName)
    setMarketplaceOpen(false)
    setRightPanelOpen(true)
    setAssemblyResult(null)
    setCreatedAssemblyId(null)
    setComposePrompt('')
  }, [
    assemblyResult,
    createdAssemblyId,
    setActiveAgentDefinitionId,
    setMarketplaceOpen,
    setRightPanelOpen,
  ])

  const dismissAssembly = useCallback(() => {
    setAssemblyResult(null)
    setCreatedAssemblyId(null)
    setAssemblyInstallErrors([])
    setComposeConsentOpen(false)
  }, [])

  const runPackImport = useCallback(async () => {
    const raw = packJson.trim()
    if (!raw) {
      setError(ts('chat.marketplace.importPackEmpty'))
      return
    }
    let parsed: { kind?: string; listing?: unknown }
    try {
      parsed = JSON.parse(raw) as { kind?: string; listing?: unknown }
    } catch (error) {
      setError(
        ts('chat.marketplace.importPackInvalid', {
          message: error instanceof Error ? error.message : 'JSON parse error',
        }),
      )
      return
    }
    if (!parsed.kind || !parsed.listing || typeof parsed.listing !== 'object') {
      setError(
        ts('chat.marketplace.importPackInvalid', {
          message: 'expected { kind, listing }',
        }),
      )
      return
    }
    const expectedKind =
      tab === 'rules'
        ? 'rules'
        : tab === 'agents'
          ? 'agent'
          : tab === 'workflows'
            ? 'workflow'
            : tab === 'stencils'
              ? 'stencil'
              : null
    if (!expectedKind) {
      setError(ts('chat.marketplace.importPackWrongTab', { kind: String(parsed.kind) }))
      return
    }
    if (parsed.kind !== expectedKind) {
      setError(ts('chat.marketplace.importPackWrongTab', { kind: String(parsed.kind) }))
      return
    }

    setPackImporting(true)
    setError(null)
    try {
      const listing = parsed.listing as { id?: string; name?: string }
      const name = listing.name ?? listing.id ?? 'pack'
      const tryInstall = async (replace?: boolean) => {
        if (tab === 'rules') {
          return installRulesFromExportPack({
            listing: parsed.listing as Parameters<typeof installRulesFromExportPack>[0]['listing'],
            ...(replace ? { replace: true } : {}),
          })
        }
        if (tab === 'agents') {
          return installAgentFromExportPack({
            listing: parsed.listing as Parameters<typeof installAgentFromExportPack>[0]['listing'],
            ...(replace ? { replace: true } : {}),
          })
        }
        if (tab === 'workflows') {
          return installWorkflowFromExportPack({
            listing: parsed.listing as Parameters<
              typeof installWorkflowFromExportPack
            >[0]['listing'],
            ...(replace ? { replace: true } : {}),
          })
        }
        return installStencilFromExportPack({
          listing: parsed.listing as Parameters<typeof installStencilFromExportPack>[0]['listing'],
          ...(replace ? { replace: true } : {}),
        })
      }

      let result = await tryInstall()
      if (!result) {
        const replaceOk = window.confirm(
          ts('chat.marketplace.importPackConflictConfirm', { name }),
        )
        if (!replaceOk) return
        result = await tryInstall(true)
      }
      if (!result) {
        setError(ts('chat.marketplace.importPackInvalid', { message: 'install failed' }))
        return
      }
      setPackJson('')
    } finally {
      setPackImporting(false)
    }
  }, [
    installAgentFromExportPack,
    installRulesFromExportPack,
    installStencilFromExportPack,
    installWorkflowFromExportPack,
    packJson,
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

  const runRulesAction = useCallback(
    async (listing: RulesCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallRulesFromCatalog(listing.id)
          return
        }
        await installRulesFromCatalog({
          listingId: listing.id,
          ...(action === 'update' ? { replace: true } : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [installRulesFromCatalog, uninstallRulesFromCatalog],
  )

  const runAgentAction = useCallback(
    async (listing: AgentCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallAgentFromCatalog(listing.id)
          return
        }
        await installAgentFromCatalog({
          listingId: listing.id,
          ...(action === 'update' ? { replace: true } : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [installAgentFromCatalog, uninstallAgentFromCatalog],
  )

  const navigateToDependency = useCallback((link: MarketplaceDependencyLink) => {
    const nextTab = dependencyKindToTab(link.kind)
    setViewMode('catalog')
    setDetail(null)
    setError(null)
    setTab(nextTab)
    setHighlightListingId(link.listingId)
  }, [])

  const runWorkflowAction = useCallback(
    async (listing: WorkflowCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallWorkflowFromCatalog(listing.id)
          return
        }
        await installWorkflowFromCatalog({
          listingId: listing.id,
          ...(action === 'update' ? { replace: true } : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [installWorkflowFromCatalog, uninstallWorkflowFromCatalog],
  )

  const runStencilAction = useCallback(
    async (listing: StencilCatalogListing, action: MarketplaceCardAction) => {
      setBusyId(listing.id)
      try {
        if (action === 'uninstall') {
          await uninstallStencilFromCatalog(listing.id)
          return
        }
        await installStencilFromCatalog({
          listingId: listing.id,
          ...(action === 'update' ? { replace: true } : {}),
        })
      } finally {
        setBusyId(null)
      }
    },
    [installStencilFromCatalog, uninstallStencilFromCatalog],
  )

  if (!open) return null

  const mcpListings = mcpView?.document.listings ?? []
  const skillListings = skillView?.document.listings ?? []
  const rulesListings = rulesView?.document.listings ?? []
  const agentListings = agentView?.document.listings ?? []
  const workflowListings = workflowView?.document.listings ?? []
  const stencilListings = stencilView?.document.listings ?? []
  const mcpCurated = mcpListings.filter((l) => l.trustTier === 'curated')
  const mcpCommunity = mcpListings.filter((l) => l.trustTier === 'community')
  const skillCurated = skillListings.filter((l) => l.trustTier === 'curated')
  const skillCommunity = skillListings.filter((l) => l.trustTier === 'community')
  const rulesCurated = rulesListings.filter((l) => l.trustTier === 'curated')
  const rulesCommunity = rulesListings.filter((l) => l.trustTier === 'community')
  const agentCurated = agentListings.filter((l) => l.trustTier === 'curated')
  const agentCommunity = agentListings.filter((l) => l.trustTier === 'community')
  const workflowCurated = workflowListings.filter((l) => l.trustTier === 'curated')
  const workflowCommunity = workflowListings.filter((l) => l.trustTier === 'community')
  const stencilCurated = stencilListings.filter((l) => l.trustTier === 'curated')
  const stencilCommunity = stencilListings.filter((l) => l.trustTier === 'community')

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

  const installedEntries = buildInstalledMarketplaceEntries({
    mcp: mcpListings,
    skills: skillListings,
    rules: rulesListings,
    agents: agentListings,
    workflows: workflowListings,
    stencils: stencilListings,
    installedMcp: installedMcpListingIds,
    installedSkills: installedSkillIdSet,
    installedRules: installedRulesIdSet,
    installedAgents: installedAgentIdSet,
    installedWorkflows: installedWorkflowIdSet,
    installedStencils: installedStencilIdSet,
  })

  const installedCountByTab: Record<MarketplaceTabId, number> = {
    mcp: 0,
    skills: 0,
    rules: 0,
    agents: 0,
    workflows: 0,
    stencils: 0,
  }
  for (const entry of installedEntries) {
    installedCountByTab[entry.tab] += 1
  }
  const installedForTab = installedEntries.filter((entry) => entry.tab === tab)
  const installedCurated = installedForTab.filter((entry) => !entry.community)
  const installedCommunity = installedForTab.filter((entry) => entry.community)

  const runInstalledUninstall = async (entry: (typeof installedEntries)[number]) => {
    setBusyId(entry.id)
    try {
      if (entry.tab === 'mcp') await uninstallMcpListing(entry.id)
      else if (entry.tab === 'skills') await uninstallSkillFromCatalog(entry.id)
      else if (entry.tab === 'rules') await uninstallRulesFromCatalog(entry.id)
      else if (entry.tab === 'agents') await uninstallAgentFromCatalog(entry.id)
      else if (entry.tab === 'workflows') await uninstallWorkflowFromCatalog(entry.id)
      else await uninstallStencilFromCatalog(entry.id)
    } finally {
      setBusyId(null)
    }
  }

  const openInstalledDetail = (entry: (typeof installedEntries)[number]) => {
    if (entry.tab === 'mcp') {
      const listing = mcpListings.find((item) => item.id === entry.id)
      if (listing) setDetail({ kind: 'mcp', listing })
      return
    }
    if (entry.tab === 'skills') {
      const listing = skillListings.find((item) => item.id === entry.id)
      if (listing) setDetail({ kind: 'skills', listing })
      return
    }
    if (entry.tab === 'rules') {
      const listing = rulesListings.find((item) => item.id === entry.id)
      if (listing) setDetail({ kind: 'rules', listing })
      return
    }
    if (entry.tab === 'agents') {
      const listing = agentListings.find((item) => item.id === entry.id)
      if (listing) setDetail({ kind: 'agents', listing })
      return
    }
    if (entry.tab === 'workflows') {
      const listing = workflowListings.find((item) => item.id === entry.id)
      if (listing) setDetail({ kind: 'workflows', listing })
      return
    }
    const listing = stencilListings.find((item) => item.id === entry.id)
    if (listing) setDetail({ kind: 'stencils', listing })
  }

  const renderInstalledGrid = (entries: typeof installedForTab) => (
    <div className={styles.grid}>
      {entries.map((entry) => (
        <MarketplaceCard
          key={`${entry.tab}:${entry.id}`}
          id={entry.id}
          name={entry.name}
          description={entry.description}
          homepage={entry.homepage}
          iconUrl={entry.iconUrl}
          installed
          community={entry.community}
          busy={busyId === entry.id}
          disabled={loading}
          highlighted={highlightListingId === entry.id}
          {...cardLabels}
          onOpen={() => openInstalledDetail(entry)}
          onAction={(action) => {
            if (action === 'uninstall') void runInstalledUninstall(entry)
          }}
        />
      ))}
    </div>
  )

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
            highlighted={highlightListingId === listing.id}
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
        const installed = installedSkillIdSet.has(normalizeMarketplacePackId(listing.id))
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
            highlighted={highlightListingId === listing.id}
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

  const renderRulesGrid = (listings: RulesCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed = installedRulesIdSet.has(normalizeMarketplacePackId(listing.id))
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
            highlighted={highlightListingId === listing.id}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'rules', listing })}
            onAction={(action) => {
              void runRulesAction(listing, action)
            }}
          />
        )
      })}
    </div>
  )

  const renderAgentGrid = (listings: AgentCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed = installedAgentIdSet.has(listing.id)
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
            highlighted={highlightListingId === listing.id}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'agents', listing })}
            onAction={(action) => {
              void runAgentAction(listing, action)
            }}
          />
        )
      })}
    </div>
  )

  const renderStencilGrid = (listings: StencilCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed =
          installedStencilIdSet.has(listing.id) ||
          installedStencilIdSet.has(normalizeMarketplacePackId(listing.id))
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
            highlighted={highlightListingId === listing.id}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'stencils', listing })}
            onAction={(action) => {
              void runStencilAction(listing, action)
            }}
          />
        )
      })}
    </div>
  )

  const renderWorkflowGrid = (listings: WorkflowCatalogListing[]) => (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const installed =
          installedWorkflowIdSet.has(listing.id) ||
          installedWorkflowIdSet.has(normalizeMarketplacePackId(listing.id))
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
            highlighted={highlightListingId === listing.id}
            {...cardLabels}
            onOpen={() => setDetail({ kind: 'workflows', listing })}
            onAction={(action) => {
              void runWorkflowAction(listing, action)
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

    if (detail.kind === 'rules') {
      const listing = detail.listing
      const installed = installedRulesIdSet.has(normalizeMarketplacePackId(listing.id))
      const community = listing.trustTier === 'community'
      const model = buildRulesDetailModel(listing, {
        listingId: ts('chat.marketplace.detailListingId'),
        installId: ts('chat.marketplace.detailInstallId'),
        version: ts('chat.marketplace.detailVersion'),
        trust: ts('chat.marketplace.detailTrust'),
        curated: ts('chat.marketplace.curated'),
        community: ts('chat.marketplace.community'),
        installPath: ts('chat.marketplace.detailInstallPath'),
        installConfig: ts('chat.marketplace.detailInstallConfig'),
        documentation: ts('chat.marketplace.detailDocumentation'),
        gettingStartedPath: ts('chat.marketplace.detailRulesStepPath'),
        gettingStartedInvoke: ts('chat.marketplace.detailRulesStepInvoke'),
        communityRisk: ts('chat.marketplace.rulesCommunityRisk'),
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
            void runRulesAction(listing, action)
          }}
          secondaryActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void disableRulesCatalogListing(listing.id).then((ok) => {
                    if (ok) {
                      setDetail(null)
                      void loadRules(false)
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
                  void reportRulesCatalogListing({ listingId: listing.id }).then((ok) => {
                    if (ok) void loadRules(false)
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

    if (detail.kind === 'agents') {
      const listing = detail.listing
      const installed = installedAgentIdSet.has(listing.id)
      const community = listing.trustTier === 'community'
      const model = buildAgentDetailModel(
        listing,
        {
          listingId: ts('chat.marketplace.detailListingId'),
          installId: ts('chat.marketplace.detailInstallId'),
          version: ts('chat.marketplace.detailVersion'),
          trust: ts('chat.marketplace.detailTrust'),
          curated: ts('chat.marketplace.curated'),
          community: ts('chat.marketplace.community'),
          installPath: ts('chat.marketplace.detailInstallPath'),
          installConfig: ts('chat.marketplace.detailInstallConfig'),
          documentation: ts('chat.marketplace.detailDocumentation'),
          gettingStartedPath: ts('chat.marketplace.detailAgentStepPath'),
          gettingStartedInvoke: ts('chat.marketplace.detailAgentStepInvoke'),
          communityRisk: ts('chat.marketplace.agentsCommunityRisk'),
          dependsOnSkills: ts('chat.marketplace.detailDependsOnSkills'),
          dependsOnMcp: ts('chat.marketplace.detailDependsOnMcp'),
          dependsOnRules: ts('chat.marketplace.detailDependsOnRules'),
          dependsOnMissing: ts('chat.marketplace.detailDependsOnMissing'),
          none: ts('chat.marketplace.detailNone'),
        },
        {
          skillIds: installedSkillIdSet,
          mcpListingIds: installedMcpListingIds,
          rulesPackIds: installedRulesIdSet,
        },
      )
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
          dependenciesTitle={ts('chat.marketplace.detailDependencies')}
          goInstallLabel={ts('chat.marketplace.goInstallDependency')}
          installedDepLabel={ts('chat.marketplace.dependencyInstalled')}
          onNavigateDependency={navigateToDependency}
          onBack={() => setDetail(null)}
          onAction={(action) => {
            void runAgentAction(listing, action)
          }}
          secondaryActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void disableAgentCatalogListing(listing.id).then((ok) => {
                    if (ok) {
                      setDetail(null)
                      void loadAgents(false)
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
                  void reportAgentCatalogListing({ listingId: listing.id }).then((ok) => {
                    if (ok) void loadAgents(false)
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

    if (detail.kind === 'stencils') {
      const listing = detail.listing
      const installed =
        installedStencilIdSet.has(listing.id) ||
        installedStencilIdSet.has(normalizeMarketplacePackId(listing.id))
      const community = listing.trustTier === 'community'
      const model = buildStencilDetailModel(listing, {
        listingId: ts('chat.marketplace.detailListingId'),
        installId: ts('chat.marketplace.detailInstallId'),
        version: ts('chat.marketplace.detailVersion'),
        trust: ts('chat.marketplace.detailTrust'),
        curated: ts('chat.marketplace.curated'),
        community: ts('chat.marketplace.community'),
        installPath: ts('chat.marketplace.detailInstallPath'),
        installConfig: ts('chat.marketplace.detailInstallConfig'),
        documentation: ts('chat.marketplace.detailDocumentation'),
        gettingStartedPath: ts('chat.marketplace.detailStencilStepPath'),
        gettingStartedInvoke: ts('chat.marketplace.detailStencilStepInvoke'),
        communityRisk: ts('chat.marketplace.stencilsCommunityRisk'),
        stencilCount: ts('chat.marketplace.detailStencilCount'),
        licenseNotes: ts('chat.marketplace.detailLicenseNotes'),
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
            void runStencilAction(listing, action)
          }}
          secondaryActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void disableStencilCatalogListing(listing.id).then((ok) => {
                    if (ok) {
                      setDetail(null)
                      void loadStencils(false)
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
                  void reportStencilCatalogListing({ listingId: listing.id }).then((ok) => {
                    if (ok) void loadStencils(false)
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

    if (detail.kind === 'workflows') {
      const listing = detail.listing
      const installed =
        installedWorkflowIdSet.has(listing.id) ||
        installedWorkflowIdSet.has(normalizeMarketplacePackId(listing.id))
      const community = listing.trustTier === 'community'
      const model = buildWorkflowDetailModel(listing, {
        listingId: ts('chat.marketplace.detailListingId'),
        installId: ts('chat.marketplace.detailInstallId'),
        version: ts('chat.marketplace.detailVersion'),
        trust: ts('chat.marketplace.detailTrust'),
        curated: ts('chat.marketplace.curated'),
        community: ts('chat.marketplace.community'),
        installPath: ts('chat.marketplace.detailInstallPath'),
        installConfig: ts('chat.marketplace.detailInstallConfig'),
        documentation: ts('chat.marketplace.detailDocumentation'),
        gettingStartedPath: ts('chat.marketplace.detailWorkflowStepPath'),
        gettingStartedInvoke: ts('chat.marketplace.detailWorkflowStepInvoke'),
        communityRisk: ts('chat.marketplace.workflowsCommunityRisk'),
        nodeCount: ts('chat.marketplace.detailWorkflowNodeCount'),
        edgeCount: ts('chat.marketplace.detailWorkflowEdgeCount'),
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
            void runWorkflowAction(listing, action)
          }}
          secondaryActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void disableWorkflowCatalogListing(listing.id).then((ok) => {
                    if (ok) {
                      setDetail(null)
                      void loadWorkflows(false)
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
                  void reportWorkflowCatalogListing({ listingId: listing.id }).then((ok) => {
                    if (ok) void loadWorkflows(false)
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

    const listing = detail.listing
    const installed = installedSkillIdSet.has(normalizeMarketplacePackId(listing.id))
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

  const activeTabMeta = tabs.find((entry) => entry.id === tab) ?? tabs[0]!
  const intro = ts(`chat.marketplace.${activeTabMeta.introKey}`)

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.marketplace.title')}
    >
      <div className={styles.main} data-marketplace-overlay="">
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>
              {labPrepOpen
                ? ts('productLab.prep.title')
                : ts('chat.marketplace.title')}
            </h2>
            <div className={styles.subtitle}>
              {labPrepOpen
                ? ts('productLab.prep.subtitle')
                : ts('chat.marketplace.subtitle')}
            </div>
          </div>
          <div className={styles.headerActions}>
            {!labPrepOpen ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={ts('chat.marketplace.refresh')}
                title={ts('chat.marketplace.refresh')}
                disabled={loading}
                aria-busy={loading || undefined}
                onClick={() => {
                  refreshActiveTab(true)
                }}
              >
                <RefreshCw
                  size={16}
                  aria-hidden
                  className={loading ? styles.loadingSpin : undefined}
                />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              aria-label={ts('chat.marketplace.close')}
              title={ts('chat.marketplace.close')}
              onClick={() => {
                // Keep prep flag so Lab Card can reopen the temp page.
                setMarketplaceOpen(false)
              }}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
        </header>
        {labPrepOpen ? (
          <LabCapabilityPrepPage />
        ) : (
          <>
        {!detail ? (
          <>
            <div className={styles.viewToggle} role="tablist" aria-label={ts('chat.marketplace.viewMode')}>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'catalog'}
                className={`${styles.viewToggleBtn} ${viewMode === 'catalog' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('catalog')}
              >
                {ts('chat.marketplace.viewCatalog')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'installed'}
                className={`${styles.viewToggleBtn} ${viewMode === 'installed' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('installed')}
              >
                {ts('chat.marketplace.viewInstalled')}
                {installedEntries.length > 0 ? ` (${installedEntries.length})` : ''}
              </button>
            </div>
            {viewMode === 'catalog' && gitUrlEnabled ? (
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
            ) : null}
            {viewMode === 'catalog' && packImportEnabled ? (
              <div className={styles.importPackBar}>
                <textarea
                  className={styles.importPackInput}
                  value={packJson}
                  onChange={(e) => setPackJson(e.target.value)}
                  placeholder={ts('chat.marketplace.importPackPlaceholder')}
                  aria-label={ts('chat.marketplace.importPackPlaceholder')}
                  disabled={packImporting || loading}
                  rows={3}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={packImporting || loading || !packJson.trim()}
                  onClick={() => {
                    void runPackImport()
                  }}
                >
                  {packImporting
                    ? ts('chat.marketplace.importPackInstalling')
                    : ts('chat.marketplace.importPackInstall')}
                </Button>
              </div>
            ) : null}
            <div className={styles.tabs} role="tablist" aria-label={ts('chat.marketplace.title')}>
              {tabs.map((entry) => {
                const count = installedCountByTab[entry.id]
                const showCount = viewMode === 'installed' && count > 0
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === entry.id}
                    className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ''}`}
                    onClick={() => setTab(entry.id)}
                  >
                    {ts(`chat.marketplace.${entry.labelKey}`)}
                    {showCount ? ` (${count})` : ''}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
        <div className={styles.body}>
          {detail ? (
            renderDetail()
          ) : viewMode === 'installed' ? (
            <>
              <p className={styles.help}>{ts('chat.marketplace.installedIntro')}</p>
              {loading && installedEntries.length === 0 ? (
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <Loader2 size={18} strokeWidth={2} className={styles.loadingSpin} aria-hidden />
                  <div className={styles.loadingCopy}>
                    <p className={styles.loadingTitle}>{ts('chat.marketplace.loadingTitle')}</p>
                    <p className={styles.loadingHint}>{ts('chat.marketplace.loadingHint')}</p>
                  </div>
                </div>
              ) : null}
              {installedEntries.length === 0 && !loading ? (
                <p className={styles.empty}>
                  {ts('chat.marketplace.installedEmpty')}{' '}
                  {ts('chat.marketplace.composeEmptyLibrary')}
                </p>
              ) : null}
              {installedEntries.length > 0 && installedForTab.length === 0 && !loading ? (
                <p className={styles.empty}>{ts('chat.marketplace.installedEmptyKind')}</p>
              ) : null}
              {error && !detail ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {assemblyResult ? (
                <AgentAssemblyCard
                  result={assemblyResult}
                  busy={composeBusy || composeMatching}
                  createdDefinitionId={createdAssemblyId}
                  installErrorIds={assemblyInstallErrors}
                  onChangeDraft={updateAssemblyDraft}
                  onChangeBindings={updateAssemblyBindings}
                  onCancel={dismissAssembly}
                  onInstallMissingOnly={() => {
                    void runAssemblyConfirm(true)
                  }}
                  onConfirmCreate={() => {
                    void runAssemblyConfirm(false)
                  }}
                  onUseInChat={useCreatedAssemblyInChat}
                  onDismissSuccess={dismissAssembly}
                />
              ) : null}
              {composeConsentOpen ? (
                <div className={styles.consentCard} role="dialog" aria-modal="true">
                  <h3 className={styles.consentTitle}>
                    {ts('chat.marketplace.composeConsentTitle')}
                  </h3>
                  <p className={styles.consentBody}>{ts('chat.marketplace.composeConsentBody')}</p>
                  <div className={styles.consentActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={composeMatching}
                      onClick={() => setComposeConsentOpen(false)}
                    >
                      {ts('chat.marketplace.composeConsentCancel')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={composeMatching}
                      onClick={() => {
                        void runAssemble('local')
                      }}
                    >
                      {ts('chat.marketplace.composeConsentLocal')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={composeMatching}
                      onClick={() => {
                        void runAssemble('local_and_catalog')
                      }}
                    >
                      {ts('chat.marketplace.composeConsentExpand')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {installedCurated.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.curatedSection')}
                  </h3>
                  {renderInstalledGrid(installedCurated)}
                </>
              ) : null}
              {installedCommunity.length > 0 ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {ts('chat.marketplace.communitySection')}
                  </h3>
                  {renderInstalledGrid(installedCommunity)}
                </>
              ) : null}
            </>
          ) : (
            <>
              <p className={styles.help}>{intro}</p>
              {activeView ? (
                <p className={styles.help}>
                  {ts('chat.marketplace.source', { source: activeView.source })}
                </p>
              ) : null}
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {loading && !activeView ? (
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <Loader2 size={18} strokeWidth={2} className={styles.loadingSpin} aria-hidden />
                  <div className={styles.loadingCopy}>
                    <p className={styles.loadingTitle}>{ts('chat.marketplace.loadingTitle')}</p>
                    <p className={styles.loadingHint}>{ts('chat.marketplace.loadingHint')}</p>
                  </div>
                </div>
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
              ) : null}
              {tab === 'skills' ? (
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
              ) : null}
              {tab === 'rules' ? (
                <>
                  {rulesListings.length === 0 && !loading ? (
                    <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
                  ) : null}
                  {rulesCurated.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.curatedSection')}
                      </h3>
                      {renderRulesGrid(rulesCurated)}
                    </>
                  ) : null}
                  {rulesCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderRulesGrid(rulesCommunity)}
                    </>
                  ) : null}
                </>
              ) : null}
              {tab === 'agents' ? (
                <>
                  {agentListings.length === 0 && !loading ? (
                    <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
                  ) : null}
                  {agentCurated.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.curatedSection')}
                      </h3>
                      {renderAgentGrid(agentCurated)}
                    </>
                  ) : null}
                  {agentCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderAgentGrid(agentCommunity)}
                    </>
                  ) : null}
                </>
              ) : null}
              {tab === 'workflows' ? (
                <>
                  {workflowListings.length === 0 && !loading ? (
                    <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
                  ) : null}
                  {workflowCurated.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.curatedSection')}
                      </h3>
                      {renderWorkflowGrid(workflowCurated)}
                    </>
                  ) : null}
                  {workflowCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderWorkflowGrid(workflowCommunity)}
                    </>
                  ) : null}
                </>
              ) : null}
              {tab === 'stencils' ? (
                <>
                  {stencilListings.length === 0 && !loading ? (
                    <p className={styles.empty}>{ts('chat.marketplace.empty')}</p>
                  ) : null}
                  {stencilCurated.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.curatedSection')}
                      </h3>
                      {renderStencilGrid(stencilCurated)}
                    </>
                  ) : null}
                  {stencilCommunity.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>
                        {ts('chat.marketplace.communitySection')}
                      </h3>
                      {renderStencilGrid(stencilCommunity)}
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
        {!detail && viewMode === 'installed' ? (
          <MarketplaceComposeDock
            value={composePrompt}
            disabled={composeBusy}
            matching={composeMatching}
            onChange={setComposePrompt}
            onSubmit={beginComposeConsent}
          />
        ) : null}
          </>
        )}
      </div>
    </GraphOverlayFrame>
  )
}

/** Icon export for edge rail reuse. */
export { Package as MarketplaceIcon }
