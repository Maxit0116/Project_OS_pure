import { describe, expect, it } from 'vitest'
import { parseAppMenuCommand, parseAppMenuState } from './app-menu.js'

describe('parseAppMenuState', () => {
  it('accepts a bounded recent list and locale', () => {
    expect(parseAppMenuState({
      locale: 'zh',
      workspaceOpen: true,
      hasActiveEditor: false,
      recentWorkspaces: [{ name: 'Demo', path: '/tmp/demo' }],
    })).toEqual({
      locale: 'zh',
      workspaceOpen: true,
      hasActiveEditor: false,
      recentWorkspaces: [{ name: 'Demo', path: '/tmp/demo' }],
    })
  })

  it('rejects oversized recent lists and control characters', () => {
    expect(parseAppMenuState({
      locale: 'en',
      workspaceOpen: false,
      hasActiveEditor: false,
      recentWorkspaces: Array.from({ length: 6 }, (_, index) => ({
        name: `Project ${index}`,
        path: `/tmp/project-${index}`,
      })),
    })).toBeNull()
    expect(parseAppMenuState({
      locale: 'en',
      workspaceOpen: false,
      hasActiveEditor: false,
      recentWorkspaces: [{ name: 'Bad\nname', path: '/tmp/demo' }],
    })).toBeNull()
  })
})

describe('parseAppMenuCommand', () => {
  it('accepts known commands and recent paths', () => {
    expect(parseAppMenuCommand({ id: 'save' })).toEqual({ id: 'save' })
    expect(parseAppMenuCommand({ id: 'open-recent', path: '/tmp/demo' })).toEqual({
      id: 'open-recent',
      path: '/tmp/demo',
    })
  })

  it('rejects unknown commands and unsafe recent paths', () => {
    expect(parseAppMenuCommand({ id: 'run-task' })).toBeNull()
    expect(parseAppMenuCommand({ id: 'open-recent', path: '/tmp/bad\u0000' })).toBeNull()
  })
})
