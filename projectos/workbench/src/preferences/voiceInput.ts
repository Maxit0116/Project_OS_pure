import type { Locale } from '../i18n/types'

const SUBMIT_KEYWORDS_KEY = 'projectos_voice_submit_keywords'

export function voiceLanguageFromLocale(locale: Locale): string {
  if (typeof navigator !== 'undefined') {
    const nav = navigator.language
    if (locale === 'zh' || nav.startsWith('zh')) {
      return nav.startsWith('zh') ? nav : 'zh-CN'
    }
    if (nav) return nav
  }
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

export function loadVoiceSubmitKeywords(): string[] {
  try {
    const stored = localStorage.getItem(SUBMIT_KEYWORDS_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export function saveVoiceSubmitKeywords(keywords: string[]) {
  try {
    localStorage.setItem(SUBMIT_KEYWORDS_KEY, JSON.stringify(keywords))
  } catch {
    /* ignore */
  }
}
