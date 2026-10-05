import { describe, expect, it, vi } from 'vitest'

import { createBlobUrlLifecycle } from './blobUrlLifecycle'

describe('glass displacement-map blob lifecycle', () => {
  it('keeps the rendered URL alive until its replacement has committed', () => {
    const revoke = vi.fn()
    const lifecycle = createBlobUrlLifecycle(revoke)

    lifecycle.created('blob:old')
    lifecycle.committed('blob:old')
    lifecycle.created('blob:new')

    expect(revoke).not.toHaveBeenCalled()

    lifecycle.committed('blob:new')
    expect(revoke).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:old')
  })

  it('revokes pending and rendered URLs on cancellation or final disposal', () => {
    const revoke = vi.fn()
    const lifecycle = createBlobUrlLifecycle(revoke)

    lifecycle.created('blob:abandoned')
    lifecycle.abandoned('blob:abandoned')
    lifecycle.created('blob:current')
    lifecycle.committed('blob:current')
    lifecycle.dispose()

    expect(revoke.mock.calls.map(([url]) => url)).toEqual([
      'blob:abandoned',
      'blob:current',
    ])
  })
})
