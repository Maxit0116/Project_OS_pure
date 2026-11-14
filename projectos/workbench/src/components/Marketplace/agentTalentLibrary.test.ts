import { describe, expect, it } from 'vitest'
import {
  filterAgentListings,
  groupAgentListingsByDepartment,
} from './agentTalentLibrary'
import type { AgentCatalogListing } from '@contracts/index'

function listing(
  partial: Partial<AgentCatalogListing> & Pick<AgentCatalogListing, 'id' | 'name'>,
): AgentCatalogListing {
  return {
    trustTier: 'curated',
    version: '1.0.0',
    instructions: '',
    skillIds: [],
    ...partial,
  }
}

describe('agentTalentLibrary', () => {
  it('groups by department order and keeps ungrouped last', () => {
    const groups = groupAgentListingsByDepartment([
      listing({
        id: 'a',
        name: 'A',
        department: 'specialist_pool',
      }),
      listing({
        id: 'b',
        name: 'B',
        department: 'product_architecture',
      }),
      listing({ id: 'c', name: 'Legacy' }),
    ])
    expect(groups.map((g) => g.department)).toEqual([
      'product_architecture',
      'specialist_pool',
      'ungrouped',
    ])
  })

  it('filters by capability tag and task type', () => {
    const items = [
      listing({
        id: 'fe',
        name: 'Frontend',
        capabilityTags: ['React'],
        taskTypes: ['ui-implement'],
      }),
      listing({
        id: 'be',
        name: 'Backend',
        capabilityTags: ['API Design'],
      }),
    ]
    expect(filterAgentListings(items, 'react').map((l) => l.id)).toEqual(['fe'])
    expect(filterAgentListings(items, 'ui-implement').map((l) => l.id)).toEqual(['fe'])
  })
})
