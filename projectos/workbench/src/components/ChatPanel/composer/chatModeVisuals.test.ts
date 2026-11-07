import { describe, expect, it } from 'vitest'
import {
  CHAT_MODE_VISUALS,
  CHAT_MODES,
  CYCLE_CHAT_MODES,
  cycleChatMode,
  toneClassForChatMode,
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

  it('maps modes to ask/plan/agent/debug tones', () => {
    expect(CHAT_MODE_VISUALS.ask.toneClass).toBe('modeAsk')
    expect(CHAT_MODE_VISUALS.anchored.toneClass).toBe('modeAsk')
    expect(CHAT_MODE_VISUALS.plan.toneClass).toBe('modePlan')
    expect(CHAT_MODE_VISUALS.change.toneClass).toBe('modeAgent')
    expect(CHAT_MODE_VISUALS.debug.toneClass).toBe('modeDebug')
    expect(toneClassForChatMode('ask')).toBe('modeAsk')
    expect(toneClassForChatMode('change')).toBe('modeAgent')
    expect(toneClassForChatMode(undefined)).toBeNull()
  })
})
