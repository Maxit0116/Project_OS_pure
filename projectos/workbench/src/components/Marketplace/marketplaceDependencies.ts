import type { MarketplaceTabId } from './marketplaceKinds'

export type MarketplaceDependencyKind = 'mcp' | 'skills' | 'rules'

export type MarketplaceDependencyLink = {
  kind: MarketplaceDependencyKind
  listingId: string
  missing: boolean
}

export function dependencyKindToTab(
  kind: MarketplaceDependencyKind,
): MarketplaceTabId {
  return kind
}

export function normalizePackId(listingId: string): string {
  return listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

export function collectAgentDependencyLinks(input: {
  skillIds: string[]
  mcpListingIds: string[]
  rulesPackIds: string[]
  installed?: {
    skillIds?: Set<string>
    mcpListingIds?: Set<string>
    rulesPackIds?: Set<string>
  }
}): MarketplaceDependencyLink[] {
  const links: MarketplaceDependencyLink[] = []
  for (const id of input.skillIds) {
    const installed =
      !input.installed?.skillIds ||
      input.installed.skillIds.has(id) ||
      input.installed.skillIds.has(normalizePackId(id))
    links.push({ kind: 'skills', listingId: id, missing: !installed })
  }
  for (const id of input.mcpListingIds) {
    const installed =
      !input.installed?.mcpListingIds || input.installed.mcpListingIds.has(id)
    links.push({ kind: 'mcp', listingId: id, missing: !installed })
  }
  for (const id of input.rulesPackIds) {
    const installed =
      !input.installed?.rulesPackIds ||
      input.installed.rulesPackIds.has(id) ||
      input.installed.rulesPackIds.has(normalizePackId(id))
    links.push({ kind: 'rules', listingId: id, missing: !installed })
  }
  return links
}

export type MarketplaceInstalledEntry = {
  tab: MarketplaceTabId
  id: string
  name: string
  description?: string
  homepage?: string
  iconUrl?: string
  version: string
  community: boolean
}

/** Build cross-kind installed rows from catalog views + installed id sets. */
export function buildInstalledMarketplaceEntries(input: {
  mcp: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  skills: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  rules: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  agents: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  workflows: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  stencils: Array<{
    id: string
    name: string
    description?: string
    homepage?: string
    iconUrl?: string
    version: string
    trustTier: 'curated' | 'community'
  }>
  installedMcp: Set<string>
  installedSkills: Set<string>
  installedRules: Set<string>
  installedAgents: Set<string>
  installedWorkflows: Set<string>
  installedStencils: Set<string>
}): MarketplaceInstalledEntry[] {
  const out: MarketplaceInstalledEntry[] = []
  const push = (
    tab: MarketplaceTabId,
    listing: {
      id: string
      name: string
      description?: string
      homepage?: string
      iconUrl?: string
      version: string
      trustTier: 'curated' | 'community'
    },
    installed: boolean,
  ) => {
    if (!installed) return
    out.push({
      tab,
      id: listing.id,
      name: listing.name,
      ...(listing.description ? { description: listing.description } : {}),
      ...(listing.homepage ? { homepage: listing.homepage } : {}),
      ...(listing.iconUrl ? { iconUrl: listing.iconUrl } : {}),
      version: listing.version,
      community: listing.trustTier === 'community',
    })
  }

  for (const listing of input.mcp) {
    push('mcp', listing, input.installedMcp.has(listing.id))
  }
  for (const listing of input.skills) {
    push(
      'skills',
      listing,
      input.installedSkills.has(listing.id) ||
        input.installedSkills.has(normalizePackId(listing.id)),
    )
  }
  for (const listing of input.rules) {
    push(
      'rules',
      listing,
      input.installedRules.has(listing.id) ||
        input.installedRules.has(normalizePackId(listing.id)),
    )
  }
  for (const listing of input.agents) {
    push('agents', listing, input.installedAgents.has(listing.id))
  }
  for (const listing of input.workflows) {
    push(
      'workflows',
      listing,
      input.installedWorkflows.has(listing.id) ||
        input.installedWorkflows.has(normalizePackId(listing.id)),
    )
  }
  for (const listing of input.stencils) {
    push(
      'stencils',
      listing,
      input.installedStencils.has(listing.id) ||
        input.installedStencils.has(normalizePackId(listing.id)),
    )
  }
  return out
}
