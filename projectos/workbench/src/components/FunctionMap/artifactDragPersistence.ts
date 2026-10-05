import type { UpdateMapArtifactPatch } from '@contracts/index'

export interface ArtifactDragPosition {
  x: number
  y: number
}

export function consumeArtifactDragStartPosition(
  positions: Map<string, ArtifactDragPosition>,
  nodeId: string,
): ArtifactDragPosition | undefined {
  const position = positions.get(nodeId)
  positions.delete(nodeId)
  return position ? { ...position } : undefined
}

export function clearWorkGroupDragStartPositions(
  positions: Map<string, ArtifactDragPosition>,
  workGroupId: string,
  memberNodeIds: readonly string[],
): void {
  positions.delete(workGroupId)
  for (const memberNodeId of memberNodeIds) positions.delete(memberNodeId)
}

export async function applyArtifactDragMutationWithRollback(
  applyMutation: () => Promise<boolean>,
  artifactId: string,
  startPosition: ArtifactDragPosition | undefined,
  updateMapArtifact: (
    artifactId: string,
    patch: UpdateMapArtifactPatch,
  ) => Promise<void>,
): Promise<boolean> {
  const applied = await applyMutation()
  if (!applied && startPosition) {
    await updateMapArtifact(artifactId, { position: startPosition })
  }
  return applied
}
