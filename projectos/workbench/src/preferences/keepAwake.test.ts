import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadKeepAwakeModePreference,
  saveKeepAwakeModePreference,
} from './keepAwake'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  })
  return store
}

describe('keepAwake preference', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to off', () => {
    expect(loadKeepAwakeModePreference()).toBe('off')
  })

  it('round-trips a valid mode', () => {
    saveKeepAwakeModePreference('while_agents_running')
    expect(loadKeepAwakeModePreference()).toBe('while_agents_running')
  })

  it('falls back to off for garbage', () => {
    localStorage.setItem('projectos_keep_awake_mode', 'definitely-not')
    expect(loadKeepAwakeModePreference()).toBe('off')
  })
})
