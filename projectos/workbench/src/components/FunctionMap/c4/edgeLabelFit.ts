/**
 * Fit C4 edge labels into the horizontal channel between nodes.
 *
 * Strategy:
 * 1. Measure available horizontal width (node gap / longest horizontal segment).
 * 2. Wrap the label into multiple lines so it stays readable left-to-right.
 * 3. If even a wrapped label still exceeds the channel, signal that the layout
 *    should increase vertical separation between the two endpoints.
 */

import type { RoutePoint, RouteRect } from './orthogonalRoute'

export const EDGE_LABEL_FONT_SIZE = 11
/** Approximate average glyph width for the workbench UI font at 11px. */
export const EDGE_LABEL_CHAR_WIDTH = 6.4
export const EDGE_LABEL_LINE_HEIGHT = 14
export const EDGE_LABEL_PAD_X = 14
export const EDGE_LABEL_PAD_Y = 8
export const EDGE_LABEL_MAX_LINES = 3
/** Hard cap so a single label never eats the whole diagram. */
export const EDGE_LABEL_MAX_WIDTH = 220
export const EDGE_LABEL_MIN_WIDTH = 56

export interface EdgeLabelFit {
  text: string
  lines: string[]
  /** Max line pixel width (content only). */
  contentWidth: number
  /** Boxed label width including padding. */
  boxWidth: number
  /** Boxed label height including padding. */
  boxHeight: number
  /** Horizontal channel the label may occupy. */
  availableWidth: number
  /**
   * True when wrapped label still wider than the channel — layout should
   * increase vertical gap between the endpoint nodes.
   */
  needsVerticalSeparation: boolean
  /** Extra vertical clear gap requested between the two node boxes. */
  requestedVerticalGap: number
}

export function estimateTextWidth(
  text: string,
  charWidth = EDGE_LABEL_CHAR_WIDTH,
): number {
  // CJK glyphs are roughly square; Latin averages ~0.55em — blend by codepoint.
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const isCjk =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    width += isCjk ? charWidth * 1.55 : charWidth
  }
  return width
}

/**
 * Word-aware wrap; falls back to character chunks for long tokens / CJK runs.
 */
export function wrapEdgeLabel(
  text: string,
  maxWidth: number,
  maxLines = EDGE_LABEL_MAX_LINES,
): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (estimateTextWidth(trimmed) <= maxWidth) return [trimmed]

  const tokens = tokenize(trimmed)
  const lines: string[] = []
  let current = ''

  const flush = () => {
    if (current) {
      lines.push(current)
      current = ''
    }
  }

  for (const token of tokens) {
    if (lines.length >= maxLines) break
    const candidate = current ? `${current}${token}` : token.trimStart()
    if (estimateTextWidth(candidate) <= maxWidth) {
      current = candidate
      continue
    }
    if (!current) {
      // Token alone is too long — hard-split by characters.
      const chunks = splitByWidth(token.trim(), maxWidth)
      for (let i = 0; i < chunks.length; i += 1) {
        if (lines.length >= maxLines - (i === chunks.length - 1 ? 0 : 1)) {
          const rest = chunks.slice(i).join('')
          lines.push(truncateWithEllipsis(rest, maxWidth))
          return lines.slice(0, maxLines)
        }
        if (i < chunks.length - 1) lines.push(chunks[i]!)
        else current = chunks[i]!
      }
      continue
    }
    flush()
    if (lines.length >= maxLines) break
    if (estimateTextWidth(token.trim()) <= maxWidth) {
      current = token.trim()
    } else {
      const chunks = splitByWidth(token.trim(), maxWidth)
      for (let i = 0; i < chunks.length; i += 1) {
        if (lines.length >= maxLines) break
        if (i < chunks.length - 1 || lines.length === maxLines - 1) {
          lines.push(
            i === chunks.length - 1 && lines.length === maxLines - 1
              ? truncateWithEllipsis(chunks[i]!, maxWidth)
              : chunks[i]!,
          )
        } else {
          current = chunks[i]!
        }
      }
    }
  }
  flush()

  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1)
    const tail = truncateWithEllipsis(lines.slice(maxLines - 1).join(' '), maxWidth)
    return [...head, tail]
  }
  return lines
}

function tokenize(text: string): string[] {
  // Keep spaces with following Latin words; split CJK per character group.
  return text.match(/[^\s\u4e00-\u9fff]+|\s+|[\u4e00-\u9fff]/g) ?? [text]
}

function splitByWidth(text: string, maxWidth: number): string[] {
  const out: string[] = []
  let current = ''
  for (const ch of text) {
    const next = current + ch
    if (estimateTextWidth(next) <= maxWidth || !current) {
      current = next
    } else {
      out.push(current)
      current = ch
    }
  }
  if (current) out.push(current)
  return out
}

function truncateWithEllipsis(text: string, maxWidth: number): string {
  const ellipsis = '…'
  if (estimateTextWidth(text) <= maxWidth) return text
  let out = ''
  for (const ch of text) {
    const next = out + ch
    if (estimateTextWidth(next + ellipsis) > maxWidth) break
    out = next
  }
  return `${out}${ellipsis}`
}

/** Horizontal clear gap between two axis-aligned boxes (0 if overlapping in X). */
export function horizontalGap(a: RouteRect, b: RouteRect): number {
  if (a.x + a.width <= b.x) return b.x - (a.x + a.width)
  if (b.x + b.width <= a.x) return a.x - (b.x + b.width)
  return 0
}

/** Vertical clear gap between two axis-aligned boxes (0 if overlapping in Y). */
export function verticalGap(a: RouteRect, b: RouteRect): number {
  if (a.y + a.height <= b.y) return b.y - (a.y + a.height)
  if (b.y + b.height <= a.y) return a.y - (b.y + b.height)
  return 0
}

export function longestHorizontalSegmentLength(points: RoutePoint[]): number {
  let best = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    if (Math.abs(a.y - b.y) < 1e-6) {
      best = Math.max(best, Math.abs(b.x - a.x))
    }
  }
  return best
}

/**
 * Available width for a horizontally-read label between two nodes.
 * Prefer the clear gap between boxes; fall back to the longest H segment.
 */
export function availableLabelWidth(
  source: RouteRect,
  target: RouteRect,
  routePoints?: RoutePoint[],
): number {
  const gap = horizontalGap(source, target)
  const segment =
    routePoints && routePoints.length > 1
      ? longestHorizontalSegmentLength(routePoints)
      : 0
  const channel = Math.max(gap, segment * 0.85, EDGE_LABEL_MIN_WIDTH)
  return Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(EDGE_LABEL_MIN_WIDTH, channel - 16))
}

export function fitEdgeLabel(
  text: string,
  source: RouteRect,
  target: RouteRect,
  routePoints?: RoutePoint[],
): EdgeLabelFit {
  const availableWidth = availableLabelWidth(source, target, routePoints)
  const contentMax = Math.max(24, availableWidth - EDGE_LABEL_PAD_X)
  const lines = wrapEdgeLabel(text, contentMax)
  const contentWidth = lines.reduce(
    (max, line) => Math.max(max, estimateTextWidth(line)),
    0,
  )
  const boxWidth = Math.min(
    EDGE_LABEL_MAX_WIDTH,
    Math.ceil(contentWidth + EDGE_LABEL_PAD_X),
  )
  const boxHeight = Math.ceil(
    lines.length * EDGE_LABEL_LINE_HEIGHT + EDGE_LABEL_PAD_Y,
  )
  const singleLineWidth = estimateTextWidth(text) + EDGE_LABEL_PAD_X
  const gap = horizontalGap(source, target)
  // Need vertical separation when the label box is wider than the clear
  // horizontal channel between the two node boxes (even after wrapping).
  const needsVerticalSeparation =
    gap > 0 && boxWidth > gap - 8 && singleLineWidth > gap
  const requestedVerticalGap = needsVerticalSeparation
    ? Math.max(56, boxHeight + 36)
    : 0

  return {
    text,
    lines: lines.length > 0 ? lines : [text],
    contentWidth,
    boxWidth,
    boxHeight,
    availableWidth,
    needsVerticalSeparation,
    requestedVerticalGap,
  }
}
