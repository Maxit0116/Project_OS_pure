import { describe, expect, it } from 'vitest'

import {
  buildInstalledMarketplaceEntries,
  collectAgentDependencyLinks,
  dependencyKindToTab,
} from './marketplaceDependencies'

describe('marketplaceDependencies', () => {
  it('marks missing skill/mcp/rules deps', () => {
    const links = collectAgentDependencyLinks({
      skillIds: ['curated.ask-mode', 'installed-skill'],
      mcpListingIds: ['curated.playwright'],
      rulesPackIds: ['curated.demo-rules'],
      installed: {
        skillIds: new Set(['installed-skill']),
        mcpListingIds: new Set(),
        rulesPackIds: new Set(['curated.demo-rules']),
      },
    })
    expect(links).toEqual([
      { kind: 'skills', listingId: 'curated.ask-mode', missing: true },
      { kind: 'skills', listingId: 'installed-skill', missing: false },
      { kind: 'mcp', listingId: 'curated.playwright', missing: true },
      { kind: 'rules', listingId: 'curated.demo-rules', missing: false },
    ])
    expect(dependencyKindToTab('skills')).toBe('skills')
    expect(dependencyKindToTab('mcp')).toBe('mcp')
  })

  it('builds installed overview rows across kinds', () => {
    const rows = buildInstalledMarketplaceEntries({
      mcp: [
        {
          id: 'curated.playwright',
          name: 'Playwright',
          version: '1',
          trustTier: 'curated',
        },
      ],
      skills: [
        {
          id: 'curated.ask-mode',
          name: 'Ask',
          version: '1',
          trustTier: 'curated',
        },
      ],
      rules: [],
      agents: [
        {
          id: 'curated.code-reviewer',
          name: 'Reviewer',
          version: '1',
          trustTier: 'curated',
        },
      ],
      workflows: [],
      stencils: [],
      installedMcp: new Set(['curated.playwright']),
      installedSkills: new Set(),
      installedRules: new Set(),
      installedAgents: new Set(['curated.code-reviewer']),
      installedWorkflows: new Set(),
      installedStencils: new Set(),
    })
    expect(rows.map((row) => row.id)).toEqual([
      'curated.playwright',
      'curated.code-reviewer',
    ])
    expect(rows[0]?.tab).toBe('mcp')
    expect(rows[1]?.tab).toBe('agents')
  })
})
