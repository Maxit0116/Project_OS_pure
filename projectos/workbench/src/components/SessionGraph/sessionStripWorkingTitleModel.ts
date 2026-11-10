/** Han / Hiragana / Katakana / Hangul — triggers CJK color cascade. */
const CJK_RE =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/u

/** Basic Latin letters that participate in case-flip cascade. */
const LATIN_LETTER_RE = /[A-Za-z]/

export type SessionStripWorkingScript = 'latin' | 'cjk'

export function sessionStripWorkingScript(title: string): SessionStripWorkingScript {
  return CJK_RE.test(title) ? 'cjk' : 'latin'
}

/** Prefer Intl.Segmenter graphemes; fall back to code points. */
export function splitSessionStripTitleUnits(title: string): string[] {
  const trimmed = title.normalize('NFC')
  if (!trimmed) return []
  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      return [...segmenter.segment(trimmed)].map((part) => part.segment)
    }
  } catch {
    // Fall through.
  }
  return Array.from(trimmed)
}

export function isLatinLetterUnit(unit: string): boolean {
  return unit.length === 1 && LATIN_LETTER_RE.test(unit)
}

export interface SessionStripWorkingUnit {
  raw: string
  /** Present for latin letter units — lower / upper pair for the cascade. */
  lower?: string
  upper?: string
  animates: boolean
}

export function buildSessionStripWorkingUnits(
  title: string,
  script: SessionStripWorkingScript = sessionStripWorkingScript(title),
): SessionStripWorkingUnit[] {
  return splitSessionStripTitleUnits(title).map((raw) => {
    if (script === 'latin' && isLatinLetterUnit(raw)) {
      return {
        raw,
        lower: raw.toLowerCase(),
        upper: raw.toUpperCase(),
        animates: true,
      }
    }
    if (script === 'cjk') {
      return { raw, animates: !/^\s+$/u.test(raw) }
    }
    return { raw, animates: false }
  })
}
