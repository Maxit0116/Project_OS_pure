import {
  AGENT_DEPARTMENT_ORDER,
  type AgentCatalogListing,
  type AgentDepartment,
} from '@contracts/index'

export type AgentTalentDepartmentGroup = {
  department: AgentDepartment | 'ungrouped'
  listings: AgentCatalogListing[]
}

/**
 * Group catalog Templates for talent-library browsing.
 * Specialist pool stays in order but callers may collapse it in UI.
 */
export function groupAgentListingsByDepartment(
  listings: AgentCatalogListing[],
): AgentTalentDepartmentGroup[] {
  const buckets = new Map<AgentDepartment | 'ungrouped', AgentCatalogListing[]>()
  for (const dept of AGENT_DEPARTMENT_ORDER) {
    buckets.set(dept, [])
  }
  buckets.set('ungrouped', [])

  for (const listing of listings) {
    const key = listing.department ?? 'ungrouped'
    const list = buckets.get(key) ?? buckets.get('ungrouped')!
    list.push(listing)
  }

  const groups: AgentTalentDepartmentGroup[] = []
  for (const dept of AGENT_DEPARTMENT_ORDER) {
    const items = buckets.get(dept) ?? []
    if (items.length > 0) groups.push({ department: dept, listings: items })
  }
  const ungrouped = buckets.get('ungrouped') ?? []
  if (ungrouped.length > 0) {
    groups.push({ department: 'ungrouped', listings: ungrouped })
  }
  return groups
}

export function filterAgentListings(
  listings: AgentCatalogListing[],
  query: string,
): AgentCatalogListing[] {
  const q = query.trim().toLowerCase()
  if (!q) return listings
  return listings.filter((listing) => {
    const haystack = [
      listing.name,
      listing.tagline,
      listing.description,
      listing.roleLabel,
      listing.department,
      ...(listing.capabilityTags ?? []),
      ...(listing.taskTypes ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}
