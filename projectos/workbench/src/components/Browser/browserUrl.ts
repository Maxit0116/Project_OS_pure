export const DEFAULT_BROWSER_URL = 'http://localhost:5173'

const BROWSER_URL_STORAGE_KEY = 'projectos.browser.url'

export function loadPersistedBrowserUrl(): string {
  if (typeof sessionStorage === 'undefined') return DEFAULT_BROWSER_URL
  try {
    const stored = sessionStorage.getItem(BROWSER_URL_STORAGE_KEY)
    if (stored && normalizeBrowserUrl(stored)) return stored
  } catch {
    // sessionStorage may be unavailable
  }
  return DEFAULT_BROWSER_URL
}

export function persistBrowserUrl(url: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(BROWSER_URL_STORAGE_KEY, url)
  } catch {
    // ignore quota / privacy errors
  }
}

export function normalizeBrowserUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const withScheme = trimmed.includes('://') ? trimmed : `http://${trimmed}`
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function isAllowedBrowserUrl(input: string): boolean {
  return normalizeBrowserUrl(input) !== null
}
