import { describe, expect, it } from 'vitest'
import type { FunctionalNode } from '@contracts/index'
import { MAX_FILES_SHOWN, filesBlockHeight } from './fileList'
import { toC4Node } from './diagramShared'
import { C4_DEFAULT_NODE_SIZE } from './shapes'

const feature = (level: string, files: string[]) =>
  ({
    id: 'comp_auth',
    name: 'Sign-in',
    level,
    elementType: level,
    summary: 'Lets people log in',
    linkedFiles: files.map((path) => ({ path, role: 'primary' })),
  }) as unknown as FunctionalNode

describe('files listed under a feature box', () => {
  it('makes room for the names it lists and one line for "+N more", and none when there are no files', () => {
    expect(filesBlockHeight(0)).toBe(0)
    expect(filesBlockHeight(2)).toBeLessThan(filesBlockHeight(MAX_FILES_SHOWN))
    expect(filesBlockHeight(MAX_FILES_SHOWN + 9)).toBeGreaterThan(filesBlockHeight(MAX_FILES_SHOWN))
    expect(filesBlockHeight(MAX_FILES_SHOWN + 9)).toBe(filesBlockHeight(MAX_FILES_SHOWN + 1))
  })

  it('puts the file names on a feature (component level) and grows the box to fit them', () => {
    const node = toC4Node(feature('component', ['src/a/login.ts', 'src/a/signup.ts']), { x: 0, y: 0 })
    expect(node.files).toEqual(['login.ts', 'signup.ts'])
    expect(node.height).toBe(C4_DEFAULT_NODE_SIZE[node.shape].height + filesBlockHeight(2))
  })

  it('leaves other levels as they were', () => {
    const container = toC4Node(feature('container', ['src/a/login.ts']), { x: 0, y: 0 })
    expect(container.files).toBeUndefined()
    expect(container.height).toBe(C4_DEFAULT_NODE_SIZE[container.shape].height)
  })
})
