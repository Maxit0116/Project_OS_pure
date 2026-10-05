import type { MapArtifactType } from '@contracts/index'

export interface MapArtifactRenameFlow {
  artifactId: string
  artifactType: MapArtifactType
  initialTitle: string
}
