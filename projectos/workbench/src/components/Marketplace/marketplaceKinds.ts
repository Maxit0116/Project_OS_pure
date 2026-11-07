import { ACTIVE_MARKETPLACE_KINDS } from '@contracts/index'

/** Overlay tab ids — map CapabilityKind `skill` → UI tab `skills`. */
export type MarketplaceTabId =
  | 'mcp'
  | 'skills'
  | 'rules'
  | 'agents'
  | 'workflows'
  | 'stencils'

export interface MarketplaceKindTab {
  id: MarketplaceTabId
  /** i18n key under chat.marketplace.* */
  labelKey:
    | 'tabMcp'
    | 'tabSkills'
    | 'tabRules'
    | 'tabAgents'
    | 'tabWorkflows'
    | 'tabStencils'
  introKey:
    | 'mcpIntro'
    | 'skillsIntro'
    | 'rulesIntro'
    | 'agentsIntro'
    | 'workflowsIntro'
    | 'stencilsIntro'
  /** Git-url / pack-url installer supports all six kinds (CMP-6). */
  supportsGitUrl: boolean
  /** Paste Export pack JSON (rules/agent/workflow/stencil). */
  supportsPackImport: boolean
}

const KIND_TO_TAB: Record<(typeof ACTIVE_MARKETPLACE_KINDS)[number], MarketplaceTabId> = {
  mcp: 'mcp',
  skill: 'skills',
  rules: 'rules',
  agent: 'agents',
  workflow: 'workflows',
  stencil: 'stencils',
}

const TABS: Record<MarketplaceTabId, MarketplaceKindTab> = {
  mcp: {
    id: 'mcp',
    labelKey: 'tabMcp',
    introKey: 'mcpIntro',
    supportsGitUrl: true,
    supportsPackImport: false,
  },
  skills: {
    id: 'skills',
    labelKey: 'tabSkills',
    introKey: 'skillsIntro',
    supportsGitUrl: true,
    supportsPackImport: false,
  },
  rules: {
    id: 'rules',
    labelKey: 'tabRules',
    introKey: 'rulesIntro',
    supportsGitUrl: true,
    supportsPackImport: true,
  },
  agents: {
    id: 'agents',
    labelKey: 'tabAgents',
    introKey: 'agentsIntro',
    supportsGitUrl: true,
    supportsPackImport: true,
  },
  workflows: {
    id: 'workflows',
    labelKey: 'tabWorkflows',
    introKey: 'workflowsIntro',
    supportsGitUrl: true,
    supportsPackImport: true,
  },
  stencils: {
    id: 'stencils',
    labelKey: 'tabStencils',
    introKey: 'stencilsIntro',
    supportsGitUrl: true,
    supportsPackImport: true,
  },
}

/** Visible marketplace tabs for the current product phase (CMP P0–P6). */
export function visibleMarketplaceTabs(): MarketplaceKindTab[] {
  return ACTIVE_MARKETPLACE_KINDS.map((kind) => TABS[KIND_TO_TAB[kind]])
}

export function marketplaceTabSupportsGitUrl(tab: MarketplaceTabId): boolean {
  return TABS[tab].supportsGitUrl
}

export function marketplaceTabSupportsPackImport(tab: MarketplaceTabId): boolean {
  return TABS[tab].supportsPackImport
}

export function normalizeMarketplacePackId(listingId: string): string {
  return listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}
