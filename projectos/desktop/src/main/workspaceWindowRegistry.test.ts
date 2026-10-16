import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findWindowIdForWorkspace,
  forgetWorkspaceWindow,
  rememberWorkspacePath,
  resetWorkspaceWindowRegistryForTests,
  setInitialWorkspacePath,
} from './workspaceWindowRegistry.js'

const roots: string[] = []

afterEach(() => {
  resetWorkspaceWindowRegistryForTests()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('findWindowIdForWorkspace', () => {
  it('focuses the window that already has the folder, including one still starting', () => {
    const root = mkdtempSync(join(tmpdir(), 'projectos-window-'))
    roots.push(root)
    rememberWorkspacePath(1, `${root}/`)
    setInitialWorkspacePath(2, root)

    expect(findWindowIdForWorkspace(root, [
      { id: 1, destroyed: true },
      { id: 2, destroyed: false },
    ])).toBe(2)
    expect(findWindowIdForWorkspace(join(root, 'other'), [
      { id: 2, destroyed: false },
    ])).toBeNull()

    forgetWorkspaceWindow(2)
    expect(findWindowIdForWorkspace(root, [{ id: 2, destroyed: false }])).toBeNull()
  })
})
