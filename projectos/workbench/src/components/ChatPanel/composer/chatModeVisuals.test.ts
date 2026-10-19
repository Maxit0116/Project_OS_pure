import { describe, expect, it } from 'vitest'
import {
  CHAT_MODES,
  CYCLE_CHAT_MODES,
  chatModeHelpKey,
  cycleChatMode,
} from './chatModeVisuals'

describe('chatModeVisuals', () => {
  it('cycles Ask → Plan → Agent(change) → Debug and skips Anchored', () => {
    expect(CYCLE_CHAT_MODES).toEqual(['ask', 'plan', 'change', 'debug'])
    expect(CYCLE_CHAT_MODES).not.toContain('anchored')
    expect(CHAT_MODES).toContain('anchored')

    expect(cycleChatMode('ask')).toBe('plan')
    expect(cycleChatMode('plan')).toBe('change')
    expect(cycleChatMode('change')).toBe('debug')
    expect(cycleChatMode('debug')).toBe('ask')
  })

  it('enters the main cycle from Anchored at Ask', () => {
    expect(cycleChatMode('anchored')).toBe('ask')
  })

  it('maps help keys for every pickable mode', () => {
    expect(chatModeHelpKey('ask')).toBe('chat.askModeHelp')
    expect(chatModeHelpKey('change')).toBe('chat.changeModeHelp')
    expect(chatModeHelpKey('anchored')).toBe('chat.anchoredModeHelp')
  })
})
