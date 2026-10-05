import type { MapArtifact } from '@contracts/index'
import { getStackNodeId } from '@contracts/index'

export interface FunctionMapNodeIdIndex {
  artifactCanvasNodeIds: ReadonlySet<string>
  workGroupNodeIds: ReadonlySet<string>
}

export function createFunctionMapNodeIdIndex(
  artifacts: readonly MapArtifact[],
  workGroups: readonly { id: string }[],
): FunctionMapNodeIdIndex {
  return {
    artifactCanvasNodeIds: new Set(artifacts.map(getStackNodeId)),
    workGroupNodeIds: new Set(workGroups.map((group) => group.id)),
  }
}
