import { describe, expect, it } from 'vitest'
import {
  readRecentWorkspaces,
  recentWorkspaceLocation,
  rememberRecentWorkspace,
} from './recentWorkspaces'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('recent workspaces', () => {
  it('keeps the latest open first and drops duplicates', () => {
    const store = memoryStore()
    rememberRecentWorkspace(
      { displayName: 'Alpha', workspaceRoot: '/Users/ada/Projects/alpha' },
      store,
    )
    rememberRecentWorkspace(
      { displayName: 'Beta', workspaceRoot: '/Users/ada/Projects/beta' },
      store,
    )
    rememberRecentWorkspace(
      { displayName: 'Alpha', workspaceRoot: '/Users/ada/Projects/alpha' },
      store,
    )
    expect(readRecentWorkspaces(store).map((item) => item.name)).toEqual(['Alpha', 'Beta'])
  })

  it('shortens a home path to the parent folder', () => {
    expect(recentWorkspaceLocation('/Users/ada/Projects/alpha')).toBe('~/Projects')
  })
})
