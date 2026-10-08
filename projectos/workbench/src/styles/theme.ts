export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const THEME_KEY = 'projectos_theme'

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function saveThemePreference(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark' || preference === 'light') return preference
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

export function applyThemeToDocument(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved
}

export function subscribeSystemTheme(onChange: (resolved: ResolvedTheme) => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange(mq.matches ? 'dark' : 'light')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
