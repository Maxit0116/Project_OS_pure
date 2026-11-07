import { describe, expect, it } from 'vitest'
import { loadChatModeSwitchPreference } from './chatModeSwitch'

describe('loadChatModeSwitchPreference', () => {
  it('defaults to same_session (Cursor-like multi-mode chat)', () => {
    // Node vitest has no localStorage — load path falls through to the default.
    expect(loadChatModeSwitchPreference()).toBe('same_session')
  })
})
