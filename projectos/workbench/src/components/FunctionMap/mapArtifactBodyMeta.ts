import type { MapArtifact } from '@contracts/index'
import styles from './mapArtifactNodes.module.css'

export function mapArtifactBodyClassName(artifact: MapArtifact): string | undefined {
  if (artifact.type === 'terminal') return styles.terminalBody
  if (artifact.type === 'image') return styles.imageBody
  return undefined
}

export function mapArtifactBodyWheelZoom(artifact: MapArtifact): boolean {
  return artifact.type === 'image'
}
