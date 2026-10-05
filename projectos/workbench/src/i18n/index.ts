import { useCallback, useMemo } from 'react'
import { useWorkbenchStore } from '../state/workbenchStore'
import type { Locale, Messages } from './types'
import zh from './locales/zh'
import en from './locales/en'
import { interpolateMessage } from './interpolation'

const LOCALES: Record<Locale, Messages> = { zh, en }
const warnedMissingTranslations = new Set<string>()

export function getMessages(locale: Locale): Messages {
  return LOCALES[locale]
}

export function useI18n() {
  const locale = useWorkbenchStore((s) => s.locale)
  const messages = useMemo(() => getMessages(locale), [locale])

  const t = useCallback(
    (
      section: keyof Messages,
      key: string,
      params?: Record<string, string | number>,
    ): string => {
      const group = messages[section] as Record<string, unknown>
      const candidate = group[key]
      if (typeof candidate !== 'string') {
        warnMissingTranslation(locale, `${String(section)}.${key}`)
      }
      return interpolateMessage(
        typeof candidate === 'string' ? candidate : key,
        params,
      )
    },
    [locale, messages],
  )

  const ts = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const parts = path.split('.')
      let cur: unknown = messages
      for (const p of parts) {
        cur = (cur as Record<string, unknown>)?.[p]
      }
      if (typeof cur !== 'string') {
        warnMissingTranslation(locale, path)
      }
      return interpolateMessage(typeof cur === 'string' ? cur : path, params)
    },
    [locale, messages],
  )

  return useMemo(() => ({ locale, messages, t, ts }), [locale, messages, t, ts])
}

function warnMissingTranslation(locale: Locale, path: string): void {
  if (!import.meta.env.DEV) return
  const identity = `${locale}:${path}`
  if (warnedMissingTranslations.has(identity)) return
  warnedMissingTranslations.add(identity)
  console.warn(`[projectos:i18n] Missing '${path}' translation for locale '${locale}'`)
}

export type { Locale, Messages }
