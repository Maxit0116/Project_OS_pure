/**
 * Official / publisher icons for marketplace listings.
 *
 * Prefer assets under `/marketplace-icons` (scraped from publisher sites or
 * GitHub org/user avatars). Fall back to live publisher URLs, then initials.
 */

export interface MarketplaceIconResolved {
  /** Preferred local or absolute URL candidates (first that loads wins). */
  candidates: string[]
  /** Single-letter / short fallback when all images fail. */
  initials: string
  /** Accent used for the initials tile. */
  accent: string
}

interface IconEntry {
  local?: string[]
  remote?: string[]
  accent?: string
}

const ICON_BASE = '/marketplace-icons'

/** GitHub avatar URL for a user or org — the homepage identity for most skill repos. */
function githubAvatar(owner: string): string {
  return `https://github.com/${owner}.png?size=128`
}

const ENTRIES: Record<string, IconEntry> = {
  // MCP
  'curated.playwright': {
    local: [`${ICON_BASE}/playwright.svg`],
    remote: ['https://playwright.dev/img/playwright-logo.svg'],
    accent: '#E2574C',
  },
  'curated.chrome-devtools': {
    local: [`${ICON_BASE}/chrome.svg`, `${ICON_BASE}/chrome-devtools.png`],
    remote: [githubAvatar('ChromeDevTools')],
    accent: '#4285F4',
  },
  'curated.context7': {
    local: [`${ICON_BASE}/context7.svg`, `${ICON_BASE}/upstash.png`],
    remote: ['https://context7.com/favicon.ico', githubAvatar('upstash')],
    accent: '#00E9A3',
  },
  'curated.filesystem': {
    local: [`${ICON_BASE}/mcp.svg`, `${ICON_BASE}/mcp-org.png`],
    remote: [githubAvatar('modelcontextprotocol')],
    accent: '#C084FC',
  },
  'community.storybook-mcp': {
    local: [`${ICON_BASE}/storybook.svg`, `${ICON_BASE}/storybook-org.png`],
    remote: [
      'https://storybook.js.org/icon.svg',
      githubAvatar('storybookjs'),
    ],
    accent: '#FF4785',
  },

  // Skills
  'curated.ask-mode': {
    local: [`${ICON_BASE}/ask-mode.svg`],
    accent: '#38BDF8',
  },
  'community.create-skill': {
    local: [`${ICON_BASE}/create-skill.svg`],
    accent: '#A5B4FC',
  },
  'community.karpathy-guidelines': {
    local: [`${ICON_BASE}/skill-karpathy.png`],
    remote: [githubAvatar('multica-ai')],
    accent: '#F59E0B',
  },
  'community.ponytail': {
    local: [`${ICON_BASE}/skill-ponytail.png`],
    remote: [githubAvatar('DietrichGebert')],
    accent: '#EC4899',
  },
  'community.ui-ux-pro-max': {
    local: [`${ICON_BASE}/skill-uiux.png`],
    remote: [githubAvatar('nextlevelbuilder')],
    accent: '#8B5CF6',
  },
  'community.graphify': {
    local: [`${ICON_BASE}/skill-graphify.png`],
    remote: [githubAvatar('Graphify-Labs')],
    accent: '#06B6D4',
  },
  'community.caveman': {
    local: [`${ICON_BASE}/skill-caveman.png`],
    remote: [githubAvatar('JuliusBrussee')],
    accent: '#A16207',
  },
  'community.taste-skill': {
    local: [`${ICON_BASE}/skill-taste.png`],
    remote: [githubAvatar('Leonxlnx')],
    accent: '#F43F5E',
  },
  'community.archify': {
    local: [`${ICON_BASE}/skill-archify.png`],
    remote: [githubAvatar('tt-a1i')],
    accent: '#3B82F6',
  },
  'community.impeccable': {
    local: [`${ICON_BASE}/skill-impeccable.png`],
    remote: [githubAvatar('pbakaus')],
    accent: '#10B981',
  },
  'community.last30days': {
    local: [`${ICON_BASE}/skill-last30.png`],
    remote: [githubAvatar('mvanhorn')],
    accent: '#6366F1',
  },
  'community.diagram-design': {
    local: [`${ICON_BASE}/skill-diagram.png`],
    remote: [githubAvatar('cathrynlavery')],
    accent: '#0EA5E9',
  },
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/[\s/_-]+/u)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

/**
 * Resolve icon candidates for a marketplace listing.
 * Optional `homepage` / `iconUrl` let remote catalogs supply their own art.
 */
export function resolveMarketplaceIcon(input: {
  id: string
  name: string
  homepage?: string
  iconUrl?: string
}): MarketplaceIconResolved {
  const entry = ENTRIES[input.id]
  const candidates: string[] = []
  if (input.iconUrl?.trim()) candidates.push(input.iconUrl.trim())
  if (entry?.local) candidates.push(...entry.local)
  if (entry?.remote) candidates.push(...entry.remote)

  // Derive GitHub owner avatar from homepage when no curated entry.
  if (candidates.length === 0 && input.homepage) {
    try {
      const url = new URL(input.homepage)
      if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
        const owner = url.pathname.split('/').filter(Boolean)[0]
        if (owner) candidates.push(githubAvatar(owner))
      } else {
        candidates.push(
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=128`,
        )
      }
    } catch {
      // ignore invalid homepage
    }
  }

  if (candidates.length === 0) {
    candidates.push(`${ICON_BASE}/github-mark.svg`)
  }

  return {
    candidates: [...new Set(candidates)],
    initials: initialsFromName(input.name),
    accent: entry?.accent ?? '#4c7dff',
  }
}
