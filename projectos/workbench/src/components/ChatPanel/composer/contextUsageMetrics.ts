import type { ContextAssembly } from '@contracts/index'

export const CONTEXT_USAGE_CARD_ID = 'chat-context-usage-card'

/** Matches LocalContextBudget `unicode_chars_div_4_v1`. */
export const CHARS_PER_TOKEN = 4

/** Soft window used until model profiles expose a real context limit. */
export const DEFAULT_CONTEXT_TOKEN_WINDOW = 128_000

export const USAGE_SLOTS = [
  'instructions',
  'scope',
  'pins',
  'retrieval',
  'memory',
  'session',
] as const

export type UsageSlot = (typeof USAGE_SLOTS)[number]

/** Distinct slot colors for the segmented bar (Cursor-style legend). */
export const USAGE_SLOT_COLORS: Record<UsageSlot, string> = {
  instructions: '#8b919a',
  scope: '#5d9b6e',
  pins: '#c4884a',
  retrieval: '#5b8def',
  memory: '#9b6b9e',
  session: '#a66b6b',
}

export interface UsageSegment {
  slot: UsageSlot
  chars: number
  tokens: number
  /** Share of the context window (0–100). */
  windowPercent: number
  /** Share of used tokens only (0–100). */
  usedPercent: number
}

export interface ContextUsageMetrics {
  usedChars: number
  usedTokens: number
  windowTokens: number
  percentFull: number
  segments: UsageSegment[]
}

export function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.round(chars / CHARS_PER_TOKEN))
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return String(tokens)
  if (tokens < 10_000) {
    const value = tokens / 1_000
    return `${trimTrailingZero(value.toFixed(1))}K`
  }
  if (tokens < 1_000_000) {
    const value = tokens / 1_000
    return `${trimTrailingZero(value.toFixed(1))}K`
  }
  const value = tokens / 1_000_000
  return `${trimTrailingZero(value.toFixed(1))}M`
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/u, '')
}

export function buildContextUsageMetrics(
  assembly: ContextAssembly | null | undefined,
  windowTokens: number = DEFAULT_CONTEXT_TOKEN_WINDOW,
): ContextUsageMetrics {
  const safeWindow = Math.max(1, windowTokens)
  const segments: UsageSegment[] = USAGE_SLOTS.map((slot) => {
    const chars = assembly?.slots[slot].chars ?? 0
    const tokens = estimateTokensFromChars(chars)
    return {
      slot,
      chars,
      tokens,
      windowPercent: 0,
      usedPercent: 0,
    }
  })

  const usedChars = segments.reduce((sum, segment) => sum + segment.chars, 0)
  const usedTokens = estimateTokensFromChars(usedChars)
  const percentFull = Math.min(100, Math.round((usedTokens / safeWindow) * 100))

  for (const segment of segments) {
    segment.windowPercent =
      usedTokens > 0
        ? (segment.tokens / usedTokens) * percentFull
        : 0
    segment.usedPercent =
      usedTokens > 0 ? (segment.tokens / usedTokens) * 100 : 0
  }

  return {
    usedChars,
    usedTokens,
    windowTokens: safeWindow,
    percentFull,
    segments,
  }
}
