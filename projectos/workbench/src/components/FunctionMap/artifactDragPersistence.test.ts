import { describe, expect, it, vi } from 'vitest'
import {
  applyArtifactDragMutationWithRollback,
  clearWorkGroupDragStartPositions,
  consumeArtifactDragStartPosition,
} from './artifactDragPersistence'

describe('artifact drag persistence', () => {
  it('restores the captured pre-drag position after a rejected mutation', async () => {
    const starts = new Map([['artifact-node', { x: 40, y: 80 }]])
    const captured = consumeArtifactDragStartPosition(starts, 'artifact-node')
    const updateMapArtifact = vi.fn(async () => undefined)

    expect(starts.has('artifact-node')).toBe(false)
    await expect(
      applyArtifactDragMutationWithRollback(
        async () => false,
        'artifact_1',
        captured,
        updateMapArtifact,
      ),
    ).resolves.toBe(false)

    expect(updateMapArtifact).toHaveBeenCalledOnce()
    expect(updateMapArtifact).toHaveBeenCalledWith('artifact_1', {
      position: { x: 40, y: 80 },
    })
  })

  it('does not roll back an accepted mutation', async () => {
    const updateMapArtifact = vi.fn(async () => undefined)

    await expect(
      applyArtifactDragMutationWithRollback(
        async () => true,
        'artifact_1',
        { x: 40, y: 80 },
        updateMapArtifact,
      ),
    ).resolves.toBe(true)
    expect(updateMapArtifact).not.toHaveBeenCalled()
  })

  it('clears a work-group and every member start after the group drag ends', () => {
    const starts = new Map([
      ['wg_1', { x: 0, y: 0 }],
      ['art_1', { x: 10, y: 20 }],
      ['stack_1', { x: 30, y: 40 }],
      ['unrelated', { x: 50, y: 60 }],
    ])

    clearWorkGroupDragStartPositions(starts, 'wg_1', ['art_1', 'stack_1'])

    expect([...starts.keys()]).toEqual(['unrelated'])
  })
})
