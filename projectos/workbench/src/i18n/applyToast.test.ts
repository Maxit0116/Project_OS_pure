import { describe, expect, it } from 'vitest'
import { getStoreMessage } from './storeMessages'

describe('the message shown after a change is applied', () => {
  // Found on a FastAPI project: after applying a change to an items endpoint the app announced
  // "Google Login is now active", a sentence left over from the demo scenario.
  it.each(['en', 'zh'] as const)('says only what was done, in %s', (locale) => {
    const message = getStoreMessage(locale, 'toast.applySuccess', { count: 2 })
    expect(message).toContain('2')
    expect(message).not.toMatch(/google/i)
  })
})
