import type { McpCatalogListing, SkillCatalogListing } from '@contracts/index'

export interface MarketplaceFact {
  label: string
  value: string
}

export interface MarketplaceDetailModel {
  facts: MarketplaceFact[]
  overview?: string
  homepage?: string
  riskNote?: string
  setupNotes: string[]
  installConfigTitle: string
  installConfig?: string
  credentials?: MarketplaceFact[]
  envVars?: MarketplaceFact[]
  headers?: MarketplaceFact[]
  tools?: string[]
  companionFiles?: string[]
  frontmatter?: MarketplaceFact[]
  documentationTitle: string
  documentation?: string
  installPath?: string
}

function skillInstallId(listingId: string): string {
  return listingId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function parseSkillMarkdown(raw: string): {
  frontmatter: Record<string, string>
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(raw.trim())
  if (!match) return { frontmatter: {}, body: raw.trim() }
  const frontmatter: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body: match[2]!.trim() }
}

function mcpInstallConfig(listing: McpCatalogListing): string {
  if (listing.transport === 'stdio') {
    const args = listing.args?.length ? ` ${listing.args.join(' ')}` : ''
    return `${listing.command ?? ''}${args}`.trim()
  }
  return listing.url ?? ''
}

function mcpConfigSnippet(listing: McpCatalogListing): string {
  if (listing.transport === 'stdio') {
    const payload: Record<string, unknown> = {
      command: listing.command,
      ...(listing.args?.length ? { args: listing.args } : {}),
      ...(listing.env ? { env: listing.env } : {}),
      ...(listing.cwd ? { cwd: listing.cwd } : {}),
    }
    return JSON.stringify(payload, null, 2)
  }
  const payload: Record<string, unknown> = {
    url: listing.url,
    ...(listing.headers ? { headers: listing.headers } : {}),
  }
  return JSON.stringify(payload, null, 2)
}

export function buildMcpDetailModel(
  listing: McpCatalogListing,
  labels: {
    listingId: string
    version: string
    trust: string
    transport: string
    authRequired: string
    authNotRequired: string
    yes: string
    no: string
    curated: string
    community: string
    installConfig: string
    documentation: string
    cwd: string
    gettingStartedDisabled: string
    gettingStartedPermissions: string
    gettingStartedAuth: string
    communityRisk: string
    authTokenHint: string
  },
): MarketplaceDetailModel {
  const community = listing.trustTier === 'community'
  const facts: MarketplaceFact[] = [
    { label: labels.listingId, value: listing.id },
    { label: labels.version, value: listing.version },
    {
      label: labels.trust,
      value: community ? labels.community : labels.curated,
    },
    { label: labels.transport, value: listing.transport },
    {
      label: labels.authRequired,
      value: listing.requiresAuth ? labels.yes : labels.no,
    },
  ]
  if (listing.cwd) {
    facts.push({ label: labels.cwd, value: listing.cwd })
  }

  const setupNotes = [
    labels.gettingStartedDisabled,
    labels.gettingStartedPermissions,
  ]
  if (listing.requiresAuth) setupNotes.push(labels.gettingStartedAuth)

  const envVars = listing.env
    ? Object.entries(listing.env).map(([label, value]) => ({ label, value }))
    : undefined
  const headers = listing.headers
    ? Object.entries(listing.headers).map(([label, value]) => ({
        label,
        value,
      }))
    : undefined

  const launch = mcpInstallConfig(listing)
  const snippet = mcpConfigSnippet(listing)

  return {
    facts,
    overview: listing.description,
    homepage: listing.homepage,
    riskNote: community ? labels.communityRisk : undefined,
    setupNotes,
    installConfigTitle: labels.installConfig,
    installConfig: launch ? `${launch}\n\n${snippet}` : snippet,
    credentials: listing.requiresAuth
      ? [{ label: labels.authRequired, value: labels.authTokenHint }]
      : undefined,
    envVars,
    headers,
    tools: listing.toolAllowlist?.length ? [...listing.toolAllowlist] : undefined,
    documentationTitle: labels.documentation,
    documentation: undefined,
  }
}
export function buildSkillDetailModel(
  listing: SkillCatalogListing,
  labels: {
    listingId: string
    installId: string
    version: string
    trust: string
    curated: string
    community: string
    installPath: string
    installConfig: string
    documentation: string
    gettingStartedPath: string
    gettingStartedInvoke: string
    communityRisk: string
  },
): MarketplaceDetailModel {
  const community = listing.trustTier === 'community'
  const installId = skillInstallId(listing.id)
  const installPath = `.projectos/skills/${installId}/`
  const parsed = parseSkillMarkdown(listing.skillMarkdown)
  const frontmatter = Object.entries(parsed.frontmatter).map(([label, value]) => ({
    label,
    value,
  }))
  const companionFiles = listing.files ? Object.keys(listing.files).sort() : undefined

  return {
    facts: [
      { label: labels.listingId, value: listing.id },
      { label: labels.installId, value: installId },
      { label: labels.version, value: listing.version },
      {
        label: labels.trust,
        value: community ? labels.community : labels.curated,
      },
      { label: labels.installPath, value: installPath },
    ],
    overview: listing.description ?? parsed.frontmatter.description,
    homepage: listing.homepage,
    riskNote: community ? labels.communityRisk : undefined,
    setupNotes: [labels.gettingStartedPath, labels.gettingStartedInvoke],
    installConfigTitle: labels.installConfig,
    installConfig: installPath,
    companionFiles,
    frontmatter: frontmatter.length > 0 ? frontmatter : undefined,
    documentationTitle: labels.documentation,
    documentation: parsed.body || listing.skillMarkdown.trim(),
    installPath,
  }
}
