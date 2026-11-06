import { describe, expect, it, vi } from 'vitest'

import {
  assertAllowedExternalUrl,
  openAllowedExternalUrlInBackground,
} from './externalUrlPolicy.js'

describe('external URL policy', () => {
  it('accepts only explicitly allowed external protocols', () => {
    expect(assertAllowedExternalUrl('http://example.com')).toBe('http://example.com/')
    expect(assertAllowedExternalUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(assertAllowedExternalUrl('mailto:team@example.com')).toBe('mailto:team@example.com')

    for (const url of [
      'file:///tmp/private',
      'projectos://settings',
      'smb://fileserver/share',
      'javascript:alert(1)',
    ]) {
      expect(() => assertAllowedExternalUrl(url)).toThrow(
        'External URL protocol is not allowed',
      )
    }
  })

  it('contains background opener rejection and never calls it for a rejected URL', async () => {
    const openExternal = vi.fn().mockRejectedValue(new Error('OS rejected the URL'))

    expect(openAllowedExternalUrlInBackground('file:///tmp/private', openExternal)).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
    expect(openAllowedExternalUrlInBackground('https://example.com', openExternal)).toBe(true)
    await Promise.resolve()
    expect(openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it('keeps dangerous schemes at zero opener calls for the LocalApi/desktop egress pattern', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const guarded = async (url: string) => {
      const allowed = assertAllowedExternalUrl(url)
      await openExternal(allowed)
    }

    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'projectos://settings',
      'data:text/html,hi',
    ]) {
      await expect(guarded(url)).rejects.toThrow('External URL protocol is not allowed')
    }
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('allows legitimate catalog-report and GitHub OAuth https URLs through the same guard', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const guarded = async (url: string) => {
      const allowed = assertAllowedExternalUrl(url)
      await openExternal(allowed)
    }

    await guarded('https://github.com/Maxit0116/Project_OS_pure/issues/new')
    await guarded('https://github.com/login/oauth/authorize?client_id=abc')
    await guarded('https://github.com/login/device')
    expect(openExternal).toHaveBeenCalledTimes(3)
    expect(openExternal.mock.calls.map((call) => call[0])).toEqual([
      'https://github.com/Maxit0116/Project_OS_pure/issues/new',
      'https://github.com/login/oauth/authorize?client_id=abc',
      'https://github.com/login/device',
    ])
  })
})
