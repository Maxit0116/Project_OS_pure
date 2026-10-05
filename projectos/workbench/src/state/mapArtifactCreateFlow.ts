import type { MapArtifactType } from '@contracts/index'

export type MapArtifactPlacement = {
  anchorNodeId?: string
} & (
  | { mode: 'viewportCenter' }
  | { mode: 'screenPoint'; x: number; y: number }
  | { mode: 'stack'; stackId: string }
)

export interface MapArtifactCreateFlow {
  type: MapArtifactType
  placement: MapArtifactPlacement
  targetStackId?: string
}
