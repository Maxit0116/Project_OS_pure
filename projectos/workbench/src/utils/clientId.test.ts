import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClientId } from './clientId'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('client id generation', () => {
  it('falls back without crypto.randomUUID and stays unique in a tight loop', () => {
    vi.stubGlobal('crypto', {})
    vi.spyOn(Date, 'now').mockReturnValue(1_753_056_000_000)

    const ids = Array.from({ length: 1_000 }, () => createClientId('msg_'))

    expect(new Set(ids)).toHaveLength(ids.length)
    expect(ids.every((id) => id.startsWith('msg_'))).toBe(true)
  })

  it('falls back when an exposed randomUUID implementation throws', () => {
    vi.stubGlobal('crypto', { randomUUID: () => { throw new Error('insecure context') } })

    expect(createClientId('toast_')).toMatch(/^toast_[a-z0-9]+_[a-z0-9]+$/u)
  })
})
