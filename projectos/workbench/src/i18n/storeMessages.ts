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
  return 'zh'
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
