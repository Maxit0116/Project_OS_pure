import type { Session, WebContents } from 'electron'

const PACKAGED_CONNECT_SRC = [
  "'self'",
  'https://storage.googleapis.com',
  'https://cdn.jsdelivr.net',
  'https://huggingface.co',
  'https://cdn-lfs.huggingface.co',
  'https://cdn-lfs.hf.co',
  'https://cdn-lfs-us-1.hf.co',
  'https://cas-bridge.xethub.hf.co',
  'https://us.aws.cdn.hf.co',
  'https://hf-mirror.com',
].join(' ')

const PACKAGED_CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${PACKAGED_CONNECT_SRC}`,
  "frame-src http: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

const DEVELOPMENT_CSP = PACKAGED_CSP
  // @vitejs/plugin-react installs its React-refresh preamble as an inline module.
  .replace(
    "script-src 'self' 'wasm-unsafe-eval'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  )
  .replace(
    `connect-src ${PACKAGED_CONNECT_SRC}`,
    // #region agent log
    `connect-src ${PACKAGED_CONNECT_SRC} ws: wss: http://127.0.0.1:7605`,
    // #endregion
  )

export const MAIN_WINDOW_MEDIA_PERMISSION = 'media'

export function isAllowedMainWindowMediaPermission(
  permission: string,
  requestingOrigin: string,
  allowedDocumentUrl: string,
): boolean {
  if (permission !== MAIN_WINDOW_MEDIA_PERMISSION) return false
  if (!requestingOrigin) return true
  try {
    const allowed = new URL(allowedDocumentUrl)
    if (allowed.protocol === 'file:') {
      return requestingOrigin === 'file://' || requestingOrigin.startsWith('file:')
    }
    return new URL(requestingOrigin).origin === allowed.origin
  } catch {
    return false
  }
}

export function isAllowedMainWindowNavigation(
  candidateUrl: string,
  allowedDocumentUrl: string,
): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const allowed = new URL(allowedDocumentUrl)
    if (allowed.protocol === 'file:') {
      return candidate.protocol === 'file:' &&
        candidate.host === allowed.host &&
        candidate.pathname === allowed.pathname
    }
    return (allowed.protocol === 'http:' || allowed.protocol === 'https:') &&
      candidate.origin === allowed.origin
  } catch {
    return false
  }
}

export function installMainWindowNavigationGuard(
  webContents: WebContents,
  allowedDocumentUrl: string,
): void {
  const guard = (event: Electron.Event, url: string) => {
    if (!isAllowedMainWindowNavigation(url, allowedDocumentUrl)) {
      event.preventDefault()
    }
  }
  webContents.on('will-navigate', guard)
  webContents.on('will-redirect', guard)
}

function resolveRequestingOrigin(
  webContents: WebContents | undefined,
  requestingOrigin: string | undefined,
  details?: { requestingUrl?: string },
): string {
  if (requestingOrigin) return requestingOrigin
  if (details?.requestingUrl) return details.requestingUrl
  try {
    return webContents?.getURL?.() ?? ''
  } catch {
    return ''
  }
}

export function installMainWindowSessionSecurity(
  mainSession: Session,
  allowedDocumentUrl: string,
  packaged: boolean,
): void {
  mainSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = resolveRequestingOrigin(webContents, requestingOrigin)
    return isAllowedMainWindowMediaPermission(
      permission,
      origin,
      allowedDocumentUrl,
    )
  })
  mainSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = resolveRequestingOrigin(
      webContents,
      undefined,
      details as { requestingUrl?: string } | undefined,
    )
    callback(isAllowedMainWindowMediaPermission(
      permission,
      origin,
      allowedDocumentUrl,
    ))
  })
  const csp = packaged ? PACKAGED_CSP : DEVELOPMENT_CSP
  mainSession.webRequest.onHeadersReceived(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      if (
        details.resourceType !== 'mainFrame' ||
        !isAllowedMainWindowNavigation(details.url, allowedDocumentUrl)
      ) {
        callback({})
        return
      }
      const responseHeaders = Object.fromEntries(
        Object.entries(details.responseHeaders ?? {}).filter(
          ([name]) => name.toLowerCase() !== 'content-security-policy',
        ),
      )
      callback({
        responseHeaders: {
          ...responseHeaders,
          'Content-Security-Policy': [csp],
        },
      })
    },
  )
}

export function mainWindowContentSecurityPolicy(packaged: boolean): string {
  return packaged ? PACKAGED_CSP : DEVELOPMENT_CSP
}
