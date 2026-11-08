import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMapDetail, saveMapDetail } from './mapDetailPreference'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('the map detail preference', () => {
  it('is simple until the person chooses technical, and remembers the choice', () => {
    expect(loadMapDetail()).toBe('simple')
    saveMapDetail('technical')
    expect(loadMapDetail()).toBe('technical')
    saveMapDetail('simple')
    expect(loadMapDetail()).toBe('simple')
  })

  it('ignores a value it does not know', () => {
    localStorage.setItem('projectos_map_detail', 'expert')
    expect(loadMapDetail()).toBe('simple')
  })
})
