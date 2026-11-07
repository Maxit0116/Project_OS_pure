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
  depends_on: '#8e8e93',
  redirects_to: '#c98518',
  data_flows_to: '#3a9a58',
  imports: '#71717a',
  shares_data: '#9570c4',
  uses: '#8e8e93',
  calls: '#3a9a58',
  reads_from: '#9570c4',
  writes_to: '#c98518',
  publishes_to: '#3a9a58',
  subscribes_to: '#9570c4',
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Keep a single `[tech]` when the intent already contains that bracket. */
function collapseRepeatedBracket(text: string, tech: string): string {
  const re = new RegExp(`(?:\\s*\\[${escapeRegExp(tech)}\\])+`, 'g')
  return text.replace(re, ` [${tech}]`).replace(/\s{2,}/g, ' ').trim()
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

  if (intent && tech) {
    if (intent.includes(`[${tech}]`)) return collapseRepeatedBracket(intent, tech)
    return `${intent} [${tech}]`
  }
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
