import type { FunctionalEdgeRelation } from '@contracts/index'

export const EDGE_COLORS: Record<FunctionalEdgeRelation, string> = {
  depends_on: 'var(--color-accent)',
  redirects_to: 'var(--color-warning)',
  data_flows_to: 'var(--color-success)',
  imports: 'var(--color-text-muted)',
  shares_data: 'var(--color-violet)',
  uses: 'var(--color-accent)',
  calls: 'var(--color-success)',
  reads_from: 'var(--color-violet)',
  writes_to: 'var(--color-warning)',
  publishes_to: 'var(--color-success)',
  subscribes_to: 'var(--color-violet)',
}

/** Hex colors for WebGL (dark theme tokens). */
export const EDGE_COLORS_HEX: Record<FunctionalEdgeRelation, string> = {
  depends_on: '#0a84ff',
  redirects_to: '#ff9f0a',
  data_flows_to: '#30d158',
  imports: '#8e8e93',
  shares_data: '#bf5af2',
  uses: '#0a84ff',
  calls: '#30d158',
  reads_from: '#bf5af2',
  writes_to: '#ff9f0a',
  publishes_to: '#30d158',
  subscribes_to: '#bf5af2',
}

export function isEdgeDashed(
  relation: FunctionalEdgeRelation | 'trunk' | 'branch',
  confidence = 1,
): boolean {
  return relation === 'depends_on' || confidence < 0.8
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export type C4EdgeLabelDensity = 'full' | 'tech' | 'hover'

/**
 * Classic C4 relationship text: intent plus optional technology in brackets.
 * Example: `Gets account information from [JSON/HTTPS]`.
 *
 * Prefer `label` (intent / purpose). Fall back to `relationI18n`, then a
 * humanized `relation` key. Technology alone renders as `[tech]`.
 * Dense diagrams can pass `density: 'tech'` to show only the protocol.
 */
export function formatC4EdgeLabel(
  label?: string,
  technology?: string,
  relation?: FunctionalEdgeRelation | 'trunk' | 'branch' | string,
  relationI18n?: string,
  density: C4EdgeLabelDensity = 'full',
): string {
  const intent =
    trimText(label) ??
    trimText(relationI18n) ??
    (relation ? relation.replace(/_/g, ' ') : undefined)
  const tech = trimText(technology)

  if (density === 'tech') {
    if (tech) return `[${tech}]`
    return intent ?? ''
  }

  if (intent && tech) return `${intent} [${tech}]`
  if (intent) return intent
  if (tech) return `[${tech}]`
  return ''
}

export function resolveEdgeDisplayLabel(
  label: string | undefined,
  relation: FunctionalEdgeRelation | 'trunk' | 'branch',
  relationI18n: string | undefined,
): string {
  return formatC4EdgeLabel(label, undefined, relation, relationI18n)
}

export function edgeColorHex(
  relation: FunctionalEdgeRelation | 'trunk' | 'branch',
): string {
  if (relation === 'trunk' || relation === 'branch') return '#94a3b8'
  return EDGE_COLORS_HEX[relation]
}
