import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MapArtifact } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useTerminalStore } from '../../state/terminalStore'
import MapArtifactChrome, { type MapArtifactNodeData } from './MapArtifactChrome'
import MapArtifactBody from './MapArtifactBody'
import { mapArtifactBodyClassName, mapArtifactBodyWheelZoom } from './mapArtifactBodyMeta'
import { MAP_CREATE_ARTIFACT_ACTIONS } from './mapCreateActions'

export interface MapStackNodeData extends MapArtifactNodeData {
  stackNodeId: string
  stackMembers: MapArtifact[]
  activeArtifact: MapArtifact
  onStackDetach?: (artifactId: string, screenPoint: { x: number; y: number }) => void
  onStackMerge?: (artifactId: string, targetNodeId: string) => void
  onStackReorder?: (orderedIds: string[]) => void
}

type Data = MapStackNodeData

function MapStackNode({ data }: NodeProps & { data: Data }) {
  const selectArtifact = useWorkbenchStore((s) => s.selectArtifact)
  const setStackActiveMember = useWorkbenchStore((s) => s.setStackActiveMember)
  const deleteMapArtifact = useWorkbenchStore((s) => s.deleteMapArtifact)
  const setFocusedMapArtifact = useTerminalStore((s) => s.setFocusedMapArtifact)

  const { activeArtifact, stackMembers, stackNodeId } = data
  const typeAction =
    MAP_CREATE_ARTIFACT_ACTIONS.find((action) => action.type === activeArtifact.type) ??
    MAP_CREATE_ARTIFACT_ACTIONS[0]
  const TypeIcon = typeAction.icon

  const handleTerminalFocus = () => {
    selectArtifact(activeArtifact.id)
    setFocusedMapArtifact(activeArtifact.id)
  }

  const handleStackDetach = (artifactId: string, screenPoint: { x: number; y: number }) => {
    data.onStackDetach?.(artifactId, screenPoint)
  }

  const handleStackMerge = (artifactId: string, targetNodeId: string) => {
    data.onStackMerge?.(artifactId, targetNodeId)
  }

  return (
    <MapArtifactChrome
      artifact={activeArtifact}
      artifactType={activeArtifact.type}
      typeIcon={<TypeIcon size={14} strokeWidth={1.75} />}
      scopeLabel={data.scopeLabel}
      isSelected={data.isSelected}
      linked={data.linked}
      dimmed={data.dimmed}
      bodyClassName={mapArtifactBodyClassName(activeArtifact)}
      bodyWheelZoom={mapArtifactBodyWheelZoom(activeArtifact)}
      onHeaderContextMenu={data.onHeaderContextMenu}
      stackNodeId={stackNodeId}
      stackMembers={stackMembers}
      onStackSelect={(artifactId) => {
        if (activeArtifact.stackId) {
          void setStackActiveMember(activeArtifact.stackId, artifactId)
        }
      }}
      onStackClose={(artifactId) => void deleteMapArtifact(artifactId)}
      onStackDetach={handleStackDetach}
      onStackMerge={handleStackMerge}
      onStackReorder={data.onStackReorder}
      onGeometryResizeStart={data.onGeometryResizeStart}
      onGeometryResize={data.onGeometryResize}
      onGeometryResizeEnd={data.onGeometryResizeEnd}
    >
      <MapArtifactBody
        key={activeArtifact.id}
        artifact={activeArtifact}
        onTerminalFocus={handleTerminalFocus}
      />
    </MapArtifactChrome>
  )
}

export default memo(MapStackNode)
