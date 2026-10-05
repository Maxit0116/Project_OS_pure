import { describe, expect, it, vi } from 'vitest'

const hookHarness = vi.hoisted(() => {
  type Locale = 'zh' | 'en'
  type MemoCell = { deps: readonly unknown[]; value: unknown }

  const cells: MemoCell[] = []
  let cursor = 0
  let locale: Locale = 'zh'

  function dependenciesMatch(
    previous: readonly unknown[],
    next: readonly unknown[],
  ): boolean {
    return (
      previous.length === next.length &&
      previous.every((value, index) => Object.is(value, next[index]))
    )
  }

  function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
    const index = cursor++
    const existing = cells[index]
    if (existing && dependenciesMatch(existing.deps, deps)) {
      return existing.value as T
    }
    const value = factory()
    cells[index] = { deps: [...deps], value }
    return value
  }

  return {
    beginRender(nextLocale: Locale) {
      cursor = 0
      locale = nextLocale
    },
    getLocale() {
      return locale
    },
    useMemo,
    useCallback<T extends (...args: never[]) => unknown>(
      callback: T,
      deps: readonly unknown[],
    ): T {
      return useMemo(() => callback, deps)
    },
  }
})

vi.mock('react', () => ({
  useMemo: hookHarness.useMemo,
  useCallback: hookHarness.useCallback,
}))

vi.mock('../state/workbenchStore', () => ({
  useWorkbenchStore: (
    selector: (state: { locale: 'zh' | 'en' }) => unknown,
  ) => selector({ locale: hookHarness.getLocale() }),
}))

import { useI18n } from './index'
import { interpolateMessage } from './interpolation'

function renderI18n(locale: 'zh' | 'en') {
  hookHarness.beginRender(locale)
  return useI18n()
}

describe('useI18n identity stability', () => {
  it('preserves messages and translator identities across same-locale renders', () => {
    const first = renderI18n('zh')
    const second = renderI18n('zh')

    expect(second).toBe(first)
    expect(second.messages).toBe(first.messages)
    expect(second.t).toBe(first.t)
    expect(second.ts).toBe(first.ts)
  })

  it('refreshes translators when the active locale changes', () => {
    const zh = renderI18n('zh')
    const en = renderI18n('en')

    expect(en).not.toBe(zh)
    expect(en.messages).not.toBe(zh.messages)
    expect(en.t).not.toBe(zh.t)
    expect(en.ts).not.toBe(zh.ts)
    expect(en.ts('terminal.noWorkspace')).not.toBe(zh.ts('terminal.noWorkspace'))
  })

  it('interpolates every occurrence of a placeholder', () => {
    expect(interpolateMessage('{count} of {count}', { count: 7 }))
      .toBe('7 of 7')
  })

  it('warns once in development and keeps the missing-key fallback', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const i18n = renderI18n('en')

    expect(i18n.ts('missing.phase29.message')).toBe('missing.phase29.message')
    expect(i18n.ts('missing.phase29.message')).toBe('missing.phase29.message')
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(
      "[projectos:i18n] Missing 'missing.phase29.message' translation for locale 'en'",
    )
    warning.mockRestore()
  })
})
