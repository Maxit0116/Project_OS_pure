import { describe, expect, it } from 'vitest'

import type { MapArtifact } from '@contracts/index'
import { createFunctionMapNodeIdIndex } from './functionMapNodeClassification'

describe('Function Map node classification', () => {
  it('uses actual map collections rather than generated-id prefixes', () => {
    const artifact = {
      id: 'art_real',
      type: 'note',
      stackId: null,
    } as unknown as MapArtifact
    const index = createFunctionMapNodeIdIndex([artifact], [{ id: 'wg_real' }])

    expect(index.artifactCanvasNodeIds.has('art_real')).toBe(true)
    expect(index.workGroupNodeIds.has('wg_real')).toBe(true)
    expect(index.artifactCanvasNodeIds.has('art_feature_node')).toBe(false)
    expect(index.workGroupNodeIds.has('wg_feature_node')).toBe(false)
    expect(index.artifactCanvasNodeIds.has('stack_feature_node')).toBe(false)
  })
})
