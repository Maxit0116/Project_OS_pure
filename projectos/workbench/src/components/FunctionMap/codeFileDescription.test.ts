import { describe, expect, it } from 'vitest'
import type { FunctionalNode } from '@contracts/index'
import { isTrivialCodeDescription } from './codeFileDescription'

function codeNode(partial: Partial<FunctionalNode> & Pick<FunctionalNode, 'id' | 'name'>): FunctionalNode {
  return {
    type: 'capability',
    status: 'active',
    description: partial.description ?? partial.name,
    summary: partial.summary ?? partial.name,
    responsibility: partial.responsibility ?? partial.name,
    elementType: 'code_element',
    level: 'code',
    layer: 'code',
    linkedFiles: partial.linkedFiles ?? [
      { path: 'app/Main.kt', role: 'primary', summary: partial.name },
    ],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    children: [],
    refs: [],
    depth: 3,
    ...partial,
  }
}

describe('isTrivialCodeDescription', () => {
  it('treats basename / Exports heuristics as trivial', () => {
    const node = codeNode({ id: 'code_file_main', name: 'Main.kt' })
    expect(isTrivialCodeDescription(node, 'Main.kt')).toBe(true)
    expect(isTrivialCodeDescription(node, 'app/Main.kt')).toBe(true)
    expect(isTrivialCodeDescription(node, 'Exports Foo, Bar')).toBe(true)
    expect(
      isTrivialCodeDescription(
        node,
        'Wires the Android Application entry and registers global services used by feature modules.',
      ),
    ).toBe(false)
  })
})
