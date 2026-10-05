import type { Session, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import {
  installMainWindowNavigationGuard,
  installMainWindowSessionSecurity,
  isAllowedMainWindowMediaPermission,
  isAllowedMainWindowNavigation,
  mainWindowContentSecurityPolicy,
} from './mainWindowSecurity.js'

describe('main-window navigation and capability policy', () => {
  it('allows the Vite React-refresh inline preamble only in development', () => {
    const scriptDirective = (policy: string) => policy
      .split('; ')
      .find((directive) => directive.startsWith('script-src '))

    expect(scriptDirective(mainWindowContentSecurityPolicy(false)))
      .toBe("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
    expect(scriptDirective(mainWindowContentSecurityPolicy(true)))
      .toBe("script-src 'self' 'wasm-unsafe-eval'")
    expect(mainWindowContentSecurityPolicy(true))
      .toContain('https://storage.googleapis.com')
    expect(mainWindowContentSecurityPolicy(true))
      .toContain('https://cdn.jsdelivr.net')
    expect(mainWindowContentSecurityPolicy(true))
      .toContain('https://huggingface.co')
    expect(mainWindowContentSecurityPolicy(true))
      .toContain('https://hf-mirror.com')
    expect(installedMainFramePolicy(false))
      .toBe(mainWindowContentSecurityPolicy(false))
    expect(installedMainFramePolicy(true))
      .toBe(mainWindowContentSecurityPolicy(true))
  })

  it('allows only the configured app document/origin and blocks redirects away', () => {
    expect(isAllowedMainWindowNavigation(
      'file:///Applications/ProjectOS/renderer/index.html#settings',
      'file:///Applications/ProjectOS/renderer/index.html',
    )).toBe(true)
    expect(isAllowedMainWindowNavigation(
      'file:///etc/passwd',
      'file:///Applications/ProjectOS/renderer/index.html',
    )).toBe(false)
    expect(isAllowedMainWindowNavigation(
      'http://127.0.0.1:5173/workbench',
      'http://127.0.0.1:5173/',
    )).toBe(true)
    expect(isAllowedMainWindowNavigation(
      'https://example.com/',
      'http://127.0.0.1:5173/',
    )).toBe(false)

    const listeners = new Map<string, (...args: unknown[]) => void>()
    const webContents = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener)
      }),
    } as unknown as WebContents
    installMainWindowNavigationGuard(
      webContents,
      'file:///Applications/ProjectOS/renderer/index.html',
    )
    const event = { preventDefault: vi.fn() }
    listeners.get('will-redirect')?.(event, 'https://example.com/')
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('allows main-window media and denies other permissions on the approved document', () => {
    const allowedDocument = 'file:///Applications/ProjectOS/renderer/index.html'
    expect(isAllowedMainWindowMediaPermission('media', 'file://', allowedDocument)).toBe(true)
    expect(isAllowedMainWindowMediaPermission('media', 'https://evil.example/', allowedDocument)).toBe(false)
    expect(isAllowedMainWindowMediaPermission('notifications', 'file://', allowedDocument)).toBe(false)

    let permissionCheck: ((
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
    ) => boolean) | undefined
    let permissionRequest: ((
      webContents: unknown,
      permission: unknown,
      callback: (allowed: boolean) => void,
    ) => void) | undefined
    let headersReceived: ((
      details: Record<string, unknown>,
      callback: (response: Record<string, unknown>) => void,
    ) => void) | undefined
    const mainSession = {
      setPermissionCheckHandler: vi.fn((handler) => { permissionCheck = handler }),
      setPermissionRequestHandler: vi.fn((handler) => { permissionRequest = handler }),
      webRequest: {
        onHeadersReceived: vi.fn((_filter, handler) => { headersReceived = handler }),
      },
    } as unknown as Session

    installMainWindowSessionSecurity(
      mainSession,
      allowedDocument,
      true,
    )

    expect(permissionCheck?.(undefined, 'notifications', 'file://')).toBe(false)
    expect(permissionCheck?.(undefined, 'media', 'file://')).toBe(true)
    const denied = vi.fn()
    permissionRequest?.(undefined, 'geolocation', denied)
    expect(denied).toHaveBeenCalledWith(false)
    const allowed = vi.fn()
    permissionRequest?.(undefined, 'media', allowed)
    expect(allowed).toHaveBeenCalledWith(true)

    const response = vi.fn()
    headersReceived?.({
      resourceType: 'mainFrame',
      url: 'file:///Applications/ProjectOS/renderer/index.html',
      responseHeaders: { Existing: ['value'] },
    }, response)
    expect(response).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        Existing: ['value'],
        'Content-Security-Policy': [mainWindowContentSecurityPolicy(true)],
      }),
    })
    expect(mainWindowContentSecurityPolicy(true)).toContain("object-src 'none'")
  })
})

function installedMainFramePolicy(packaged: boolean): string | undefined {
  let headersReceived: ((
    details: Record<string, unknown>,
    callback: (response: Record<string, unknown>) => void,
  ) => void) | undefined
  const mainSession = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    webRequest: {
      onHeadersReceived: vi.fn((_filter, handler) => { headersReceived = handler }),
    },
  } as unknown as Session
  installMainWindowSessionSecurity(
    mainSession,
    'file:///Applications/ProjectOS/renderer/index.html',
    packaged,
  )

  let installedPolicy: string | undefined
  headersReceived?.({
    resourceType: 'mainFrame',
    url: 'file:///Applications/ProjectOS/renderer/index.html',
  }, (response) => {
    const headers = response.responseHeaders as Record<string, string[]> | undefined
    installedPolicy = headers?.['Content-Security-Policy']?.[0]
  })
  return installedPolicy
}
