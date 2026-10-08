import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_WORKSPACES,
  normalizeRecentWorkspacePath,
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

  it(`keeps up to ${MAX_RECENT_WORKSPACES} distinct projects`, () => {
    const store = memoryStore()
    for (let i = 1; i <= MAX_RECENT_WORKSPACES + 2; i += 1) {
      rememberRecentWorkspace(
        { displayName: `P${i}`, workspaceRoot: `/Users/ada/Projects/p${i}` },
        store,
      )
    }
    const names = readRecentWorkspaces(store).map((item) => item.name)
    expect(names).toHaveLength(MAX_RECENT_WORKSPACES)
    expect(names[0]).toBe(`P${MAX_RECENT_WORKSPACES + 2}`)
    expect(names).not.toContain('P1')
    expect(names).not.toContain('P2')
  })

  it('ignores portable "." workspace roots that would collapse the list', () => {
    const store = memoryStore()
    rememberRecentWorkspace(
      { displayName: 'Alpha', workspaceRoot: '/Users/ada/Projects/alpha' },
      store,
    )
    rememberRecentWorkspace({ displayName: 'Broken', workspaceRoot: '.' }, store)
    expect(readRecentWorkspaces(store).map((item) => item.name)).toEqual(['Alpha'])
    expect(normalizeRecentWorkspacePath('.')).toBe('')
  })

  it('shortens a home path to the parent folder', () => {
    expect(recentWorkspaceLocation('/Users/ada/Projects/alpha')).toBe('~/Projects')
  })
})
