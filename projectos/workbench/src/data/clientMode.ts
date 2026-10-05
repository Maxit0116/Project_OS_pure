export type ClientMode = 'mock' | 'real'

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.projectOS !== undefined
}

/** Electron shell on macOS — works even before preload bridge is queried (title bar chrome). */
export function isMacElectronShell(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.userAgent.includes('Electron')) return false
  return (
    window.projectOS?.platform === 'darwin' ||
    navigator.platform === 'MacIntel' ||
    /Mac/i.test(navigator.userAgent)
  )
}

export function resolveClientMode(): ClientMode {
  if (isDesktopApp()) {
    return 'real'
  }
  const raw = import.meta.env.VITE_PROJECTOS_CLIENT
  return raw === 'real' ? 'real' : 'mock'
}

export function usesRealFileContent(): boolean {
  return resolveClientMode() === 'real'
}
