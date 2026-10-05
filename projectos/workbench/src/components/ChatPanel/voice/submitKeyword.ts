import type { SubmitKeywordMatch } from './types'

function normalizeKeyword(word: string): string {
  return word.trim().toLowerCase()
}

export function matchSubmitKeyword(text: string, keywords: string[]): SubmitKeywordMatch {
  const trimmed = text.trim()
  if (!trimmed || keywords.length === 0) {
    return { isTrigger: false, spokenText: trimmed }
  }

  const normalizedKeywords = new Set(keywords.map(normalizeKeyword))
  const words = trimmed.split(/\s+/)
  const lastWord = words[words.length - 1] ?? ''
  const normalizedLast = normalizeKeyword(lastWord)

  if (!normalizedKeywords.has(normalizedLast)) {
    return { isTrigger: false, spokenText: trimmed }
  }

  const spokenWords = words.slice(0, -1)
  return {
    isTrigger: true,
    spokenText: spokenWords.join(' ').trim(),
  }
}
