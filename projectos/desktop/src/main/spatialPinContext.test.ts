import { describe, expect, it } from 'vitest'

import {
  buildScreenLocationKey,
  isScreenLikeSurface,
  isWebSurface,
  workspaceSpatialUrl,
} from '../../../contracts/spatial-pin.js'

describe('spatial pin primary path helpers', () => {
  it('builds screen/workspace/terminal location keys without chrome', () => {
    expect(buildScreenLocationKey({}).surface).toBe('screen')
    expect(buildScreenLocationKey({}).url).toBe('spatial://screen')

    const workspace = buildScreenLocationKey({
      workspacePath: '/Users/me/proj',
    })
    expect(workspace.surface).toBe('workspace')
    expect(workspace.url).toBe(workspaceSpatialUrl('/Users/me/proj'))
    expect(workspace.workspacePath).toBe('/Users/me/proj')

    const terminal = buildScreenLocationKey({
      workspacePath: '/Users/me/proj',
      terminalCwd: '/Users/me/proj/apps/web',
    })
    expect(terminal.surface).toBe('terminal')
    expect(terminal.terminalCwd).toBe('/Users/me/proj/apps/web')
  })

  it('classifies surfaces for primary vs web enhance', () => {
    expect(isScreenLikeSurface('screen')).toBe(true)
    expect(isScreenLikeSurface('workspace')).toBe(true)
    expect(isScreenLikeSurface('terminal')).toBe(true)
    expect(isWebSurface('chrome')).toBe(true)
    expect(isWebSurface('projectos-browser')).toBe(true)
    expect(isWebSurface('screen')).toBe(false)
  })
})
