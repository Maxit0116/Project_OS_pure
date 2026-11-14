import { create } from 'zustand'
import type {
  LabCapabilityProposal,
  LabFinding,
  LabFindingKind,
  LabLaunchProfile,
  LabSession,
  LabStateDocument,
} from '@contracts/index'
import {
  addLabFinding,
  buildLabCapabilitySearchPrompt,
  buildLabHandoffPrompt,
  buildLabJourneyPrompt,
  buildLabStartPrompt,
  buildLabCapabilityInventory,
  buildMarketplaceProposals,
  createEmptyLabDocument,
  endLabSession,
  getActiveLabSession,
  inferJourneyFailureFromAgentText,
  labNodeFindingCounts,
  matchInstalledCapabilities,
  openFindingsForSession,
  parseLabCapabilitySearchResult,
  patchLabFinding,
  patchLabSession,
  startLabSession,
  type MarketplaceListingHit,
} from '../../../services/product-lab/index'
import type { LabCaptureGuestEvent } from '../components/Browser/injectLabCapture'
import {
  DEFAULT_BROWSER_URL,
  normalizeBrowserUrl,
} from '../components/Browser/browserUrl'
import { isDesktopApp } from '../data/clientMode'
import { buildLabJourneyPlan } from './buildLabJourneyPlan'
import { useBottomDockStore } from './bottomDockStore'
import { useBrowserStore } from './browserStore'
import { useChatSessionStore } from './chatSessionStore'
import { useTerminalStore } from './terminalStore'
import { useWorkbenchStore } from './workbenchStore'

const AUTO_DEDUPE_MS = 12_000
const recentAutoFingerprints = new Map<string, number>()

function projectClient() {
  const { client, project } = useWorkbenchStore.getState()
  if (!client || !project) return null
  return { client, projectId: project.projectId, project }
}

function resolvePreviewUrl(route: string | null | undefined): string {
  const base = normalizeBrowserUrl(DEFAULT_BROWSER_URL) ?? DEFAULT_BROWSER_URL
  if (!route || !route.trim()) return base
  try {
    if (route.startsWith('http://') || route.startsWith('https://')) {
      return normalizeBrowserUrl(route) ?? base
    }
    return new URL(route.startsWith('/') ? route : `/${route}`, base).toString()
  } catch {
    return base
  }
}

const FALLBACK_WEB_PROFILE: LabLaunchProfile = {
  hasWebPreview: true,
  needsTerminalStart: true,
  needsIdeCapabilities: false,
  capabilityNeeds: [],
  surface: 'web',
  suggestedCommands: ['npm run dev'],
  startHints: ['fallback web profile'],
  rationale: 'fallback',
}

async function collectMarketplaceHits(
  client: NonNullable<ReturnType<typeof projectClient>>['client'],
  projectId: string,
): Promise<MarketplaceListingHit[]> {
  const hits: MarketplaceListingHit[] = []
  try {
    const mcp = await client.listMcpCatalog(projectId)
    for (const listing of mcp.document.listings) {
      hits.push({
        id: listing.id,
        name: listing.name,
        summary: listing.description,
        kind: 'mcp',
        gitUrl: listing.homepage ?? null,
      })
    }
  } catch {
    // catalog optional
  }
  try {
    const skills = await client.listSkillCatalog(projectId)
    for (const listing of skills.document.listings) {
      hits.push({
        id: listing.id,
        name: listing.name,
        summary: listing.description,
        kind: 'skill',
        gitUrl: listing.homepage ?? null,
      })
    }
  } catch {
    // catalog optional
  }
  return hits
}

/**
 * Enrich builtin stubs with real Marketplace listings after the Lab Card is already
 * visible. forceRefresh is best-effort and must never block startLab.
 */
async function refreshMarketplaceProposalsInBackground(
  sessionId: string,
  profile: LabLaunchProfile,
): Promise<void> {
  const ctx = projectClient()
  if (!ctx) {
    void useProductLabStore.getState().searchCapabilitiesOnWeb()
    return
  }
  try {
    await Promise.allSettled([
      ctx.client.listMcpCatalog(ctx.projectId, { forceRefresh: true }),
      ctx.client.listSkillCatalog(ctx.projectId, { forceRefresh: true }),
    ])
  } catch {
    /* optional */
  }
  const hits = await collectMarketplaceHits(ctx.client, ctx.projectId)
  const proposals = buildMarketplaceProposals(profile, hits)

  const store = useProductLabStore.getState()
  const session = getActiveLabSession(store.document)
  if (!session || session.id !== sessionId || session.status === 'ended') {
    void store.searchCapabilitiesOnWeb()
    return
  }
  // Keep user decisions (approved/denied/installed); only replace still-open stubs.
  const decided = new Map(
    session.capabilityProposals
      .filter((p) => p.status !== 'proposed' && p.status !== 'failed')
      .map((p) => [p.need, p] as const),
  )
  const merged = proposals.map((p) => decided.get(p.need) ?? p)
  for (const p of session.capabilityProposals) {
    if (
      (p.status !== 'proposed' && p.status !== 'failed') &&
      !merged.some((m) => m.need === p.need)
    ) {
      merged.push(p)
    }
  }
  let document = patchLabSession(store.document, sessionId, {
    capabilityProposals: merged,
  })
  document = await persist(document)
  useProductLabStore.setState({
    ...withDerived(document),
    launchProfile: profile,
  })
  void useProductLabStore.getState().searchCapabilitiesOnWeb()
}

async function chatSessionRecordExists(sessionId: string): Promise<boolean> {
  const ctx = projectClient()
  if (!ctx) return false
  try {
    const record = await ctx.client.getChatSession(ctx.projectId, sessionId)
    return Boolean(record)
  } catch {
    return false
  }
}

async function openLabChatSession(): Promise<string> {
  const wb = useWorkbenchStore.getState()
  wb.setRightPanelOpen(true)
  wb.setRightPanelTab('chat')
  const locale = wb.locale
  const { getStoreMessage } = await import('../i18n/storeMessages')
  const title = getStoreMessage(locale, 'productLab.title')
  const chat = useChatSessionStore.getState()
  const sessionId = await chat.createSession({
    seedWelcome: false,
    chatMode: 'ask',
    activate: true,
    title,
  })
  if (!sessionId) {
    throw new Error('Failed to create Product Lab chat session')
  }
  // Pin so empty Lab chats are not disposed when focus briefly leaves
  // (tryDeleteDisposableEmptySession treats unpinned empty misc as disposable).
  try {
    await chat.setPinned(sessionId, true)
  } catch {
    // Pin is best-effort; ensureLabChatSession can recreate if GC wins a race.
  }
  // Guarantee the new Lab session is active even if a concurrent persist raced.
  if (useChatSessionStore.getState().activeSessionId !== sessionId) {
    await useChatSessionStore.getState().switchSession(sessionId)
  }
  // Keep Chat tab selected after createSession/switchSession side effects.
  useWorkbenchStore.getState().setRightPanelTab('chat')
  return sessionId
}

/**
 * Bind (or re-create) the dedicated Lab chat session and make it active.
 * Survives orphaned chatSessionId pointers after empty-session GC.
 */
async function ensureLabChatSession(labSessionId: string): Promise<string> {
  const session = useProductLabStore
    .getState()
    .document.sessions.find((entry) => entry.id === labSessionId)
  if (!session || session.status === 'ended') {
    throw new Error('Lab session is not active')
  }

  const existingId = session.chatSessionId
  if (existingId && (await chatSessionRecordExists(existingId))) {
    const chat = useChatSessionStore.getState()
    if (chat.activeSessionId !== existingId) {
      await chat.switchSession(existingId)
    }
    if (!chat.pinnedIds.includes(existingId)) {
      try {
        await chat.setPinned(existingId, true)
      } catch {
        // best-effort
      }
    }
    const wb = useWorkbenchStore.getState()
    wb.setRightPanelOpen(true)
    wb.setRightPanelTab('chat')
    return existingId
  }

  const chatSessionId = await openLabChatSession()
  let document = patchLabSession(
    useProductLabStore.getState().document,
    labSessionId,
    { chatSessionId },
  )
  document = await persist(document)
  useProductLabStore.setState(withDerived(document))
  return chatSessionId
}

async function inferLaunchProfileFromListing(
  ctx: NonNullable<ReturnType<typeof projectClient>>,
): Promise<LabLaunchProfile | null> {
  try {
    const entries = await ctx.client.listWorkspaceDirectory(ctx.projectId, '')
    const names = new Set(entries.map((entry) => entry.name.toLowerCase()))
    const hasMacos = names.has('macos')
    const hasAndroid = names.has('android')
    const hasIos = names.has('ios')
    const hasPackageJson = names.has('package.json')
    const capabilityNeeds: string[] = []
    if (hasMacos || hasIos) capabilityNeeds.push('xcode')
    if (hasIos) capabilityNeeds.push('ios-simulator')
    if (hasAndroid) {
      capabilityNeeds.push('android-studio', 'android-emulator')
    }
    if (capabilityNeeds.length > 0 && !hasPackageJson) {
      return {
        hasWebPreview: false,
        needsTerminalStart: true,
        needsIdeCapabilities: true,
        capabilityNeeds: [...new Set(capabilityNeeds)],
        surface: 'native',
        suggestedCommands: hasMacos ? ['cd macos && swift run'] : [],
        startHints: [
          ...(hasMacos ? ['Swift / macOS'] : []),
          ...(hasAndroid ? ['Android Studio'] : []),
          ...(hasIos ? ['iOS / Xcode'] : []),
        ],
        rationale: 'listing_native_without_web',
      }
    }
    if (hasPackageJson) {
      return {
        ...FALLBACK_WEB_PROFILE,
        rationale: 'listing_has_package_json',
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Legacy Lab sessions (pre-capability bootstrap) sit in `experiencing` with empty
 * capabilityNeeds. Re-entering Lab must still surface Marketplace install prompts.
 */
async function healCapabilityBootstrapIfNeeded(
  sessionId: string,
  profile: LabLaunchProfile,
): Promise<boolean> {
  const needsBootstrap =
    profile.needsIdeCapabilities || profile.capabilityNeeds.length > 0
  if (!needsBootstrap) return false

  const session = getActiveLabSession(
    useProductLabStore.getState().document,
  )
  if (!session || session.id !== sessionId || session.status === 'ended') {
    return false
  }

  const isLegacyWithoutCaps =
    session.capabilityNeeds.length === 0 ||
    (session.capabilityProposals.length === 0 &&
      session.cardPhase === 'experiencing')
  if (!isLegacyWithoutCaps) return false

  const ctx = projectClient()
  if (!ctx) return false

  // Instant stubs — do not await Marketplace forceRefresh on the heal path.
  const proposals = buildMarketplaceProposals(profile, [])

  let document = patchLabSession(useProductLabStore.getState().document, sessionId, {
    status: 'starting',
    cardPhase: 'bootstrapping',
    capabilityNeeds: profile.capabilityNeeds,
    capabilityProposals: proposals,
  })
  document = await persist(document)
  useProductLabStore.setState({
    ...withDerived(document),
    launchProfile: profile,
  })

  void refreshMarketplaceProposalsInBackground(sessionId, profile)
  useProductLabStore.getState().openLabCapabilityPrep()
  return true
}

async function resolveLaunchProfile(
  ctx: NonNullable<ReturnType<typeof projectClient>>,
): Promise<LabLaunchProfile> {
  try {
    if (typeof ctx.client.getLabLaunchProfile === 'function') {
      const profile = await ctx.client.getLabLaunchProfile(ctx.projectId)
      return profile
    }
  } catch (error) {
    console.warn('[productLab] getLabLaunchProfile failed', error)
  }
  const inferred = await inferLaunchProfileFromListing(ctx)
  if (inferred) {
    return inferred
  }
  return FALLBACK_WEB_PROFILE
}

async function openLabTerminalAndRunStart(
  profile: LabLaunchProfile,
  workspaceRoot: string,
): Promise<void> {
  useBottomDockStore.getState().openPanel('terminal')
  const terminal = useTerminalStore.getState()
  if (!terminal.getActivePtyId()) {
    await terminal.createTab(undefined, workspaceRoot || undefined)
  }

  const lines = [
    '',
    '# ── Product Lab · project start ──',
    `# surface=${profile.surface}  webPreview=${profile.hasWebPreview ? 'yes' : 'no'}`,
    `# ${profile.rationale}`,
    ...profile.startHints.map((hint) => `# hint: ${hint}`),
  ]

  if (profile.suggestedCommands.length > 0) {
    lines.push('# agent start plan:')
    for (const command of profile.suggestedCommands) {
      lines.push(`#   $ ${command}`)
    }
  } else {
    lines.push('# agent will derive start commands from the workspace')
  }
  lines.push('')

  terminal.writeToActivePty(`${lines.join('\r\n')}\r\n`)

  // Run the first high-confidence command in the integrated Terminal so the
  // user sees the live start flow. Agent supervises / completes afterward.
  const primary = profile.suggestedCommands[0]
  if (primary && isDesktopApp()) {
    terminal.writeToActivePty(`${primary}\r`)
  }
}

async function kickLabStartAgent(profile: LabLaunchProfile): Promise<void> {
  const wb = useWorkbenchStore.getState()
  wb.setRightPanelOpen(true)
  wb.setRightPanelTab('chat')
  try {
    // Stay on the dedicated Lab chat. isolate:true creates a Change session,
    // steals activeSessionId (hides ProductLabCard), and can dispose the still-
    // empty Lab chat via tryDeleteDisposableEmptySession.
    const labSession = useProductLabStore.getState().activeSession()
    if (labSession) {
      await ensureLabChatSession(labSession.id)
    }
    const live = useWorkbenchStore.getState()
    if (live.chatMode !== 'change') {
      await live.setChatMode('change', { isolate: false })
    }
    useWorkbenchStore.getState().setRightPanelTab('chat')
    // Fire-and-forget: Lab Card stays mounted while Agent starts the project.
    void useWorkbenchStore.getState().sendPrompt(buildLabStartPrompt(profile))
  } catch {
    // Terminal start already ran; agent assist is best-effort.
  }
}

async function persist(document: LabStateDocument): Promise<LabStateDocument> {
  const ctx = projectClient()
  if (!ctx) return document
  try {
    return await ctx.client.upsertLabState(ctx.projectId, document)
  } catch {
    return document
  }
}

interface ProductLabStore {
  document: LabStateDocument
  findingsOpen: boolean
  noteDraft: string
  busy: boolean
  /** Synthetic journey in flight (disables double-clicks). */
  journeyBusy: boolean
  capabilitySearchBusy: boolean
  error: string | null
  /** Last launch profile for the active workspace (drives Browser vs Terminal). */
  launchProfile: LabLaunchProfile | null
  /**
   * Marketplace overlay shows the temporary Lab capability-prep page
   * (inventory + install permission) instead of the normal catalog.
   */
  labMarketplacePrepOpen: boolean
  /** Draft Debug List ids while cardPhase === reviewing. */
  draftDebugListIds: string[]
  /** Derived open-finding counts by Function Map node id. */
  nodeFindingCounts: Record<string, number>
  /** Derived open finding count for the active session (stable primitive). */
  openFindingCount: number

  /** Prefer selecting `document` + `document.activeSessionId` in React; helpers for imperative code. */
  activeSession: () => LabSession | null
  openFindings: () => LabFinding[]

  setFindingsOpen: (open: boolean) => void
  setNoteDraft: (value: string) => void
  clearError: () => void
  loadForWorkspace: () => Promise<void>
  clear: () => void

  /** Top-bar entry: start or focus Lab (zero prompt). */
  toggleOrStartLab: () => Promise<void>
  startLab: () => Promise<void>
  endLab: () => Promise<void>
  focusLabSurfaces: () => Promise<void>

  beginReview: () => Promise<void>
  toggleDebugListItem: (findingId: string) => void
  confirmDebugList: () => Promise<void>
  searchCapabilitiesOnWeb: () => Promise<void>
  approveCapability: (proposalId: string) => Promise<void>
  denyCapability: (proposalId: string) => Promise<void>
  continueAfterBootstrap: () => Promise<void>
  openMarketplaceFromLab: () => void
  /** Open Marketplace central overlay on the Lab capability-prep temp page. */
  openLabCapabilityPrep: () => void
  /** Leave prep page but keep Marketplace open on the normal catalog. */
  dismissLabCapabilityPrepToCatalog: () => void
  /** Close the prep temp page flag (overlay may already be closed). */
  closeLabCapabilityPrep: () => void

  recordManualFinding: () => Promise<void>
  ingestAutoCapture: (event: LabCaptureGuestEvent) => Promise<void>
  runAgentJourney: () => Promise<void>
  importExternalFinding: (input: {
    title: string
    detail?: string
    evidenceBody?: string
  }) => Promise<void>
  dismissFinding: (findingId: string) => Promise<void>
  handoffFinding: (findingId: string) => Promise<void>
  markVerified: (findingId: string, fixed: boolean) => Promise<void>
  showFindingOnMap: (findingId: string) => void
}

function withDerived(document: LabStateDocument) {
  const session = getActiveLabSession(document)
  const openCount = session
    ? openFindingsForSession(document, session.id).length
    : 0
  return {
    document,
    nodeFindingCounts: labNodeFindingCounts(document, session?.id ?? null),
    openFindingCount: openCount,
  }
}

export const useProductLabStore = create<ProductLabStore>((set, get) => ({
  document: createEmptyLabDocument(),
  findingsOpen: false,
  noteDraft: '',
  busy: false,
  journeyBusy: false,
  capabilitySearchBusy: false,
  error: null,
  launchProfile: null,
  labMarketplacePrepOpen: false,
  draftDebugListIds: [],
  nodeFindingCounts: {},
  openFindingCount: 0,

  activeSession: () => getActiveLabSession(get().document),
  openFindings: () => {
    const session = getActiveLabSession(get().document)
    if (!session) return []
    return openFindingsForSession(get().document, session.id)
  },

  setFindingsOpen: (open) => set({ findingsOpen: open }),
  setNoteDraft: (value) => set({ noteDraft: value }),
  clearError: () => set({ error: null }),

  clear: () =>
    set({
      ...withDerived(createEmptyLabDocument()),
      findingsOpen: false,
      noteDraft: '',
      busy: false,
      journeyBusy: false,
      capabilitySearchBusy: false,
      error: null,
      launchProfile: null,
      labMarketplacePrepOpen: false,
      draftDebugListIds: [],
    }),

  loadForWorkspace: async () => {
    const ctx = projectClient()
    if (!ctx) {
      get().clear()
      return
    }
    // Do not set `busy` here — that flag gates startLab / endLab. Blocking the
    // flask on workspace load made clicks silently no-op after open.
    set({ error: null })
    try {
      const [document, profile] = await Promise.all([
        ctx.client.getLabState(ctx.projectId),
        resolveLaunchProfile(ctx),
      ])
      let next = document
      // Heal sessions that previously bound Project OS's own web UI by mistake.
      if (!profile.hasWebPreview) {
        const active = getActiveLabSession(next)
        if (active?.previewUrl || active?.browserTabId) {
          next = patchLabSession(next, active.id, {
            previewUrl: null,
            browserTabId: null,
          })
          next = await persist(next)
        }
      }
      set({ ...withDerived(next), launchProfile: profile })
      const active = getActiveLabSession(get().document)
      if (active && active.status !== 'ended') {
        await healCapabilityBootstrapIfNeeded(active.id, profile)
      }
    } catch (error) {
      set({
        ...withDerived(createEmptyLabDocument()),
        launchProfile: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  focusLabSurfaces: async () => {
    const session = get().activeSession()
    const profile = get().launchProfile
    const wb = useWorkbenchStore.getState()
    wb.setRightPanelOpen(true)
    wb.setRightPanelTab('chat')
    if (session && session.status !== 'ended') {
      try {
        await ensureLabChatSession(session.id)
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const linkBrowser =
      Boolean(profile?.hasWebPreview) && Boolean(session?.previewUrl)
    if (linkBrowser && session?.previewUrl) {
      wb.setCenterTab('browser')
      useBrowserStore.getState().openOrSwitchTab(session.previewUrl)
    }
    if (
      profile?.needsTerminalStart &&
      session?.cardPhase !== 'bootstrapping'
    ) {
      useBottomDockStore.getState().openPanel('terminal')
    }
  },

  toggleOrStartLab: async () => {
    const session = get().activeSession()
    if (get().busy) return
    if (session && session.status !== 'ended') {
      try {
        // Recreate chat when chatSessionId is missing OR points at a GC'd session.
        await ensureLabChatSession(session.id)
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }
      const ctx = projectClient()
      if (ctx) {
        const profile = get().launchProfile ?? (await resolveLaunchProfile(ctx))
        set({ launchProfile: profile })
        const healed = await healCapabilityBootstrapIfNeeded(session.id, profile)
        if (!healed && session.cardPhase === 'bootstrapping') {
          get().openLabCapabilityPrep()
        }
      }
      await get().focusLabSurfaces()
      set({ findingsOpen: true })
      return
    }
    await get().startLab()
  },

  startLab: async () => {
    const ctx = projectClient()
    if (!ctx) {
      set({ error: 'open_workspace' })
      const locale = useWorkbenchStore.getState().locale
      const { getStoreMessage } = await import('../i18n/storeMessages')
      useWorkbenchStore.getState().pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'productLab.openWorkspaceFirst'),
        autoDismiss: 5000,
      })
      return
    }
    set({ busy: true, error: null })
    const wb = useWorkbenchStore.getState()
    const selectedNodeId = wb.selectedNodeId
    const node = selectedNodeId
      ? wb.graph?.nodes.find((n) => n.id === selectedNodeId)
      : undefined
    const route = node?.preview?.route ?? null
    const profile = await resolveLaunchProfile(ctx)
    const previewUrl = profile.hasWebPreview ? resolvePreviewUrl(route) : null
    const needsBootstrap =
      profile.needsIdeCapabilities || profile.capabilityNeeds.length > 0

    try {
      const chatSessionId = await openLabChatSession()
      const started = startLabSession(get().document, {
        projectId: ctx.projectId,
        scopeNodeIds: selectedNodeId ? [selectedNodeId] : [],
        previewUrl,
      })
      let document = started.document
      // Never await Marketplace IPC before committing Lab session — forceRefresh can
      // hang and leave activeSession null (Card never mounts; clicks re-enter startLab).
      const proposals: LabCapabilityProposal[] = needsBootstrap
        ? buildMarketplaceProposals(profile, [])
        : []

      document = patchLabSession(document, started.session.id, {
        status: needsBootstrap || profile.needsTerminalStart ? 'starting' : 'experiencing',
        cardPhase: needsBootstrap ? 'bootstrapping' : 'experiencing',
        previewUrl,
        capabilityNeeds: profile.capabilityNeeds,
        capabilityProposals: proposals,
        chatSessionId,
        debugListFindingIds: null,
      })
      // Commit in-memory first so Lab Card can mount before slow upsertLabState IPC.
      set({
        ...withDerived(document),
        busy: false,
        findingsOpen: true,
        noteDraft: '',
        launchProfile: profile,
        draftDebugListIds: [],
      })
      document = await persist(document)
      set({ ...withDerived(document), launchProfile: profile })

      // Stay on the Lab chat session (Marketplace overlay is separate).
      await ensureLabChatSession(started.session.id)

      const installedHits = matchInstalledCapabilities(profile.capabilityNeeds, {
        mcpServers: wb.settings?.mcpServers ?? [],
        skills: (wb.installedMarketplaceSkillIds ?? []).map((id) => ({ id })),
      })
      const inventory = buildLabCapabilityInventory(
        profile.capabilityNeeds,
        proposals,
        installedHits,
      )
      const allCapabilitiesReady =
        needsBootstrap &&
        inventory.length > 0 &&
        inventory.every(
          (item) => item.status === 'ready' || item.status === 'installed',
        )

      if (needsBootstrap && !allCapabilitiesReady) {
        get().openLabCapabilityPrep()
        void refreshMarketplaceProposalsInBackground(started.session.id, profile)
      } else {
        if (needsBootstrap && allCapabilitiesReady) {
          document = patchLabSession(document, started.session.id, {
            status: profile.needsTerminalStart ? 'starting' : 'experiencing',
            cardPhase: 'experiencing',
          })
          document = await persist(document)
          set({ ...withDerived(document), launchProfile: profile })
        }
        if (profile.needsTerminalStart) {
          await openLabTerminalAndRunStart(
            profile,
            ctx.project.workspaceRoot ?? '',
          )
          void kickLabStartAgent(profile)
        }
        if (profile.hasWebPreview && previewUrl) {
          wb.setCenterTab('browser')
          useBrowserStore.getState().openOrSwitchTab(previewUrl)
          const tabId = useBrowserStore.getState().activeTabId
          document = patchLabSession(document, started.session.id, {
            browserTabId: tabId,
            status: 'experiencing',
            cardPhase: 'experiencing',
          })
        } else {
          document = patchLabSession(document, started.session.id, {
            browserTabId: null,
            status: 'experiencing',
            cardPhase: 'experiencing',
          })
        }
        document = await persist(document)
        set({ ...withDerived(document), launchProfile: profile })
      }

      const locale = wb.locale
      const { getStoreMessage } = await import('../i18n/storeMessages')
      const needsPrepToast = needsBootstrap && !allCapabilitiesReady
      wb.pushToast({
        type: 'info',
        message: getStoreMessage(
          locale,
          needsPrepToast
            ? 'productLab.startedNeedsCapabilities'
            : !profile.hasWebPreview
              ? 'productLab.startedWithoutBrowser'
              : 'productLab.startedWithTerminal',
        ),
        autoDismiss: 5500,
      })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  beginReview: async () => {
    const session = get().activeSession()
    if (!session) return
    const openIds = openFindingsForSession(get().document, session.id).map(
      (f) => f.id,
    )
    let document = patchLabSession(get().document, session.id, {
      status: 'triaging',
      cardPhase: 'reviewing',
    })
    document = await persist(document)
    set({ ...withDerived(document), draftDebugListIds: openIds, findingsOpen: true })
  },

  toggleDebugListItem: (findingId) => {
    set((state) => {
      const has = state.draftDebugListIds.includes(findingId)
      return {
        draftDebugListIds: has
          ? state.draftDebugListIds.filter((id) => id !== findingId)
          : [...state.draftDebugListIds, findingId],
      }
    })
  },

  confirmDebugList: async () => {
    const session = get().activeSession()
    if (!session) return
    const ids = get().draftDebugListIds
    let document = patchLabSession(get().document, session.id, {
      debugListFindingIds: ids,
      status: ids.length > 0 ? 'fixing' : 'experiencing',
      cardPhase: ids.length > 0 ? 'fixing' : 'experiencing',
    })
    document = await persist(document)
    set({ ...withDerived(document), findingsOpen: true })
    const locale = useWorkbenchStore.getState().locale
    const { getStoreMessage } = await import('../i18n/storeMessages')
    useWorkbenchStore.getState().pushToast({
      type: 'success',
      message: getStoreMessage(locale, 'productLab.card.debugListConfirmed', {
        count: ids.length,
      }),
      autoDismiss: 4500,
    })
  },

  searchCapabilitiesOnWeb: async () => {
    const session = get().activeSession()
    const profile = get().launchProfile
    if (!session || !profile || get().capabilitySearchBusy) return
    if (profile.capabilityNeeds.length === 0) return
    set({ capabilitySearchBusy: true })
    const wb = useWorkbenchStore.getState()
    try {
      wb.setRightPanelOpen(true)
      if (session.chatSessionId) {
        const active = useChatSessionStore.getState().activeSessionId
        if (active !== session.chatSessionId) {
          await useChatSessionStore.getState().switchSession(session.chatSessionId)
        }
      }
      // Keep the Lab session; do not isolate into another chat.
      if (wb.chatMode !== 'ask') {
        await wb.setChatMode('ask', { isolate: false })
      }
      const prompt = buildLabCapabilitySearchPrompt(
        profile,
        session.capabilityProposals,
      )
      await wb.sendPrompt(prompt)
      const messages = useWorkbenchStore.getState().messages
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant')
      const webProposals = parseLabCapabilitySearchResult(
        lastAssistant?.content ?? '',
        profile.capabilityNeeds,
      )
      const live = get().activeSession() ?? session
      const merged = [...live.capabilityProposals]
      for (const proposal of webProposals) {
        const dup = merged.some(
          (item) =>
            item.title === proposal.title ||
            (proposal.gitUrl && item.gitUrl === proposal.gitUrl),
        )
        if (!dup) merged.push(proposal)
      }
      // Drop builtin stubs for needs that now have real marketplace/web hits.
      const coveredNeeds = new Set(
        merged
          .filter((item) => item.source === 'marketplace' || item.source === 'web')
          .map((item) => item.need),
      )
      const pruned = merged.filter(
        (item) =>
          !(item.source === 'builtin' && coveredNeeds.has(item.need)),
      )
      let document = patchLabSession(get().document, live.id, {
        capabilityProposals: pruned.slice(0, 40),
      })
      document = await persist(document)
      set(withDerived(document))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      set({ capabilitySearchBusy: false })
    }
  },

  approveCapability: async (proposalId) => {
    const session = get().activeSession()
    if (!session) return
    const proposal = session.capabilityProposals.find((p) => p.id === proposalId)
    if (!proposal) return
    const wb = useWorkbenchStore.getState()

    const mark = async (
      status: LabCapabilityProposal['status'],
      error: string | null = null,
    ) => {
      const next = session.capabilityProposals.map((item) =>
        item.id === proposalId ? { ...item, status, error } : item,
      )
      // refresh session from store in case of races
      const live = get().activeSession()
      if (!live) return
      const proposals = live.capabilityProposals.map((item) =>
        item.id === proposalId ? { ...item, status, error } : item,
      )
      let document = patchLabSession(get().document, live.id, {
        capabilityProposals: proposals.length ? proposals : next,
      })
      document = await persist(document)
      set(withDerived(document))
    }

    await mark('installing')
    try {
      if (proposal.listingId && proposal.kind === 'mcp') {
        const ok = await wb.installMcpFromCatalog({ listingId: proposal.listingId })
        if (!ok) throw new Error('MCP install failed')
      } else if (proposal.listingId && proposal.kind === 'skill') {
        const ok = await wb.installSkillFromCatalog({ listingId: proposal.listingId })
        if (!ok) throw new Error('Skill install failed')
      } else if (proposal.gitUrl) {
        const kind =
          proposal.kind === 'skill'
            ? 'skills'
            : proposal.kind === 'rules'
              ? 'rules'
              : 'mcp'
        const result = await wb.installFromGitUrl({ url: proposal.gitUrl, kind })
        if (!result || result.status === 'failed' || result.status === 'conflict') {
          throw new Error(
            result && 'message' in result ? result.message : 'Git install failed',
          )
        }
      } else {
        throw new Error('No listingId or gitUrl to install')
      }
      await mark('installed')
    } catch (error) {
      await mark(
        'failed',
        error instanceof Error ? error.message : String(error),
      )
    }
  },

  denyCapability: async (proposalId) => {
    const session = get().activeSession()
    if (!session) return
    const proposals = session.capabilityProposals.map((item) =>
      item.id === proposalId ? { ...item, status: 'denied' as const } : item,
    )
    let document = patchLabSession(get().document, session.id, {
      capabilityProposals: proposals,
    })
    document = await persist(document)
    set(withDerived(document))
  },

  openLabCapabilityPrep: () => {
    set({ labMarketplacePrepOpen: true })
    useWorkbenchStore.getState().setRightPanelOpen(true)
    useChatSessionStore.getState().setMarketplaceOpen(true)
  },

  dismissLabCapabilityPrepToCatalog: () => {
    set({ labMarketplacePrepOpen: false })
  },

  closeLabCapabilityPrep: () => {
    set({ labMarketplacePrepOpen: false })
  },

  continueAfterBootstrap: async () => {
    const session = get().activeSession()
    const profile = get().launchProfile
    if (!session || !profile) return
    const ctx = projectClient()
    set({ labMarketplacePrepOpen: false })
    useChatSessionStore.getState().setMarketplaceOpen(false)
    if (profile.needsTerminalStart && ctx) {
      await openLabTerminalAndRunStart(profile, ctx.project.workspaceRoot ?? '')
      void kickLabStartAgent(profile)
    }
    let document = get().document
    if (profile.hasWebPreview && session.previewUrl) {
      useWorkbenchStore.getState().setCenterTab('browser')
      useBrowserStore.getState().openOrSwitchTab(session.previewUrl)
      document = patchLabSession(document, session.id, {
        browserTabId: useBrowserStore.getState().activeTabId,
        status: 'experiencing',
        cardPhase: 'experiencing',
      })
    } else {
      document = patchLabSession(document, session.id, {
        browserTabId: null,
        status: 'experiencing',
        cardPhase: 'experiencing',
      })
    }
    document = await persist(document)
    set({ ...withDerived(document), launchProfile: profile })
    try {
      await ensureLabChatSession(session.id)
    } catch {
      // Experience can continue; Card may remount on next flask click.
    }
  },

  openMarketplaceFromLab: () => {
    const session = get().activeSession()
    if (session?.cardPhase === 'bootstrapping') {
      get().openLabCapabilityPrep()
      return
    }
    useWorkbenchStore.getState().setRightPanelOpen(true)
    useChatSessionStore.getState().setMarketplaceOpen(true)
  },

  endLab: async () => {
    const session = get().activeSession()
    if (!session) return
    set({ busy: true })
    let document = endLabSession(get().document, session.id)
    document = await persist(document)
    set({
      ...withDerived(document),
      busy: false,
      findingsOpen: false,
      noteDraft: '',
    })
  },

  recordManualFinding: async () => {
    const session = get().activeSession()
    if (!session) return
    const draft = get().noteDraft.trim()
    if (!draft) return
    const browser = useBrowserStore.getState()
    const tab = browser.getActiveTab()
    const added = addLabFinding(get().document, {
      sessionId: session.id,
      kind: 'manual' satisfies LabFindingKind,
      title: draft.slice(0, 120),
      detail: draft,
      nodeIds: session.scopeNodeIds,
      evidence: [{ kind: 'note', label: 'User note', body: draft }],
      location: {
        url: tab && !tab.isHome ? tab.url : session.previewUrl ?? undefined,
        title: tab?.title,
      },
    })
    const document = await persist(added.document)
    set({ ...withDerived(document), noteDraft: '', findingsOpen: true })
  },

  ingestAutoCapture: async (event) => {
    const session = get().activeSession()
    if (!session || session.status === 'ended') return
    if (session.status === 'fixing') return

    const capture = session.capture
    if (event.kind === 'console_error' && !capture.consoleErrors) return
    if (event.kind === 'unhandled_rejection' && !capture.unhandledRejections) return
    if (event.kind === 'network_failure' && !capture.failedNetwork) return

    const fingerprint = `${event.kind}|${event.title}|${event.url ?? ''}`
    const now = Date.now()
    const last = recentAutoFingerprints.get(fingerprint)
    if (last && now - last < AUTO_DEDUPE_MS) return
    recentAutoFingerprints.set(fingerprint, now)

    const browser = useBrowserStore.getState()
    const tab = browser.getActiveTab()
    const evidenceKind =
      event.kind === 'network_failure'
        ? ('network' as const)
        : event.kind === 'unhandled_rejection'
          ? ('stack' as const)
          : ('console' as const)

    const added = addLabFinding(get().document, {
      sessionId: session.id,
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      nodeIds: session.scopeNodeIds,
      evidence: [
        {
          kind: evidenceKind,
          label: event.kind,
          body: event.detail,
        },
      ],
      location: {
        url: event.url ?? (tab && !tab.isHome ? tab.url : session.previewUrl ?? undefined),
        title: tab?.title,
      },
    })
    const document = await persist(added.document)
    set({ ...withDerived(document), findingsOpen: true })
  },

  runAgentJourney: async () => {
    const session = get().activeSession()
    if (!session || get().journeyBusy) return
    const profile = get().launchProfile
    if (profile && !profile.hasWebPreview) {
      const locale = useWorkbenchStore.getState().locale
      const { getStoreMessage } = await import('../i18n/storeMessages')
      useWorkbenchStore.getState().pushToast({
        type: 'info',
        message: getStoreMessage(locale, 'productLab.agentJourneyUnavailable'),
        autoDismiss: 5000,
      })
      return
    }
    const wb = useWorkbenchStore.getState()
    const plan = buildLabJourneyPlan({
      session,
      graph: wb.graph,
      mapContent: wb.mapContent,
    })
    const prompt = buildLabJourneyPrompt(session, plan)

    set({ journeyBusy: true })
    let document = patchLabSession(get().document, session.id, {
      status: 'recording',
    })
    document = await persist(document)
    set(withDerived(document))

    try {
      wb.setRightPanelOpen(true)
      wb.setRightPanelTab('chat')
      await get().focusLabSurfaces()
      // Keep Lab chat + Lab Card; isolating would orphan/dispose the Lab session.
      const live = useWorkbenchStore.getState()
      if (live.chatMode !== 'ask') {
        await live.setChatMode('ask', { isolate: false })
      }
      await useWorkbenchStore.getState().sendPrompt(prompt)

      const messages = useWorkbenchStore.getState().messages
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant')
      const verdict = inferJourneyFailureFromAgentText(
        lastAssistant?.content ?? '',
      )
      const locale = useWorkbenchStore.getState().locale
      const { getStoreMessage } = await import('../i18n/storeMessages')

      if (verdict.failed) {
        const added = addLabFinding(get().document, {
          sessionId: session.id,
          kind: 'journey_failure',
          title: verdict.title,
          detail: verdict.detail,
          nodeIds: session.scopeNodeIds,
          evidence: [
            {
              kind: 'note',
              label: 'Synthetic journey',
              body: verdict.detail,
            },
          ],
          location: { url: session.previewUrl ?? undefined },
        })
        document = await persist(added.document)
        document = patchLabSession(document, session.id, { status: 'triaging' })
        document = await persist(document)
        set({ ...withDerived(document), findingsOpen: true })
        useWorkbenchStore.getState().pushToast({
          type: 'warning',
          message: getStoreMessage(locale, 'productLab.journeyFailed'),
          autoDismiss: 6000,
        })
      } else {
        document = patchLabSession(get().document, session.id, {
          status: 'experiencing',
        })
        document = await persist(document)
        set(withDerived(document))
        useWorkbenchStore.getState().pushToast({
          type: 'success',
          message: getStoreMessage(locale, 'productLab.journeyPassed'),
          autoDismiss: 5000,
        })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      set({ journeyBusy: false })
    }
  },

  importExternalFinding: async (input) => {
    const session = get().activeSession()
    if (!session) return
    const title = input.title.trim()
    if (!title) return
    const detail = input.detail?.trim() ?? ''
    const added = addLabFinding(get().document, {
      sessionId: session.id,
      kind: 'external',
      title,
      detail,
      nodeIds: session.scopeNodeIds,
      evidence: input.evidenceBody
        ? [
            {
              kind: 'note',
              label: 'ELU / external',
              body: input.evidenceBody,
            },
          ]
        : [],
      location: { url: session.previewUrl ?? undefined },
    })
    const document = await persist(added.document)
    set({ ...withDerived(document), findingsOpen: true })
  },

  dismissFinding: async (findingId) => {
    let document = patchLabFinding(get().document, findingId, {
      status: 'dismissed',
    })
    document = await persist(document)
    set(withDerived(document))
  },

  handoffFinding: async (findingId) => {
    const session = get().activeSession()
    const finding = get().document.findings.find((f) => f.id === findingId)
    if (!session || !finding) return

    const { mode, prompt } = buildLabHandoffPrompt(finding, session)
    let document = patchLabFinding(get().document, findingId, {
      status: 'handed_off',
    })
    document = patchLabSession(document, session.id, { status: 'fixing' })
    document = await persist(document)
    set(withDerived(document))

    const wb = useWorkbenchStore.getState()
    wb.setRightPanelOpen(true)
    await wb.setChatMode(mode, { isolate: true })
    await wb.sendPrompt(prompt)

    document = patchLabFinding(get().document, findingId, {
      status: 'fix_proposed',
    })
    document = patchLabSession(document, session.id, { status: 'verifying' })
    document = await persist(document)
    set(withDerived(document))
  },

  markVerified: async (findingId, fixed) => {
    let document = patchLabFinding(get().document, findingId, {
      status: fixed ? 'verified_fixed' : 'verified_still_broken',
    })
    const session = get().activeSession()
    if (session) {
      const stillOpen = openFindingsForSession(document, session.id).length
      const stillBroken = document.findings.some(
        (f) =>
          f.sessionId === session.id && f.status === 'verified_still_broken',
      )
      document = patchLabSession(document, session.id, {
        status: stillBroken || stillOpen > 0 ? 'triaging' : 'experiencing',
      })
    }
    document = await persist(document)
    set(withDerived(document))
  },

  showFindingOnMap: (findingId) => {
    const finding = get().document.findings.find((f) => f.id === findingId)
    const nodeId = finding?.nodeIds[0]
    const wb = useWorkbenchStore.getState()
    wb.setCenterTab('function-map')
    if (nodeId) {
      void wb.selectNode(nodeId)
    }
  },
}))
