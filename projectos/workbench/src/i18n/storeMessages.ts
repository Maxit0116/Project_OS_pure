import type { Locale } from '../i18n/types'
import zh from '../i18n/locales/zh'
import en from '../i18n/locales/en'
import { interpolateMessage } from './interpolation'

const LOCALE_KEY = 'projectos_locale'

export function loadLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {
    /* ignore */
  }
  return systemLocale()
}

/** The language of the person's system: Chinese for zh-*, English for anything else. */
export function systemLocale(languages?: readonly string[]): Locale {
  let list = languages
  if (!list) {
    try {
      list = [...(navigator.languages ?? []), navigator.language]
    } catch {
      return 'zh'
    }
  }
  const first = list.find((language) => typeof language === 'string' && language.length > 0)
  if (!first) return 'zh'
  return /^zh/iu.test(first) ? 'zh' : 'en'
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export function getStoreMessage(
  locale: Locale,
  path: string,
  params?: Record<string, string | number>,
): string {
  const messages = locale === 'en' ? en : zh
  const parts = path.split('.')
  let cur: unknown = messages
  for (const p of parts) {
    cur = (cur as Record<string, unknown>)?.[p]
  }
  return interpolateMessage(typeof cur === 'string' ? cur : path, params)
}
