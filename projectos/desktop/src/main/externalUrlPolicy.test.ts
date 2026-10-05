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
})
