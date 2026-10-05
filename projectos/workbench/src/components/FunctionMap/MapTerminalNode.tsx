import { memo } from 'react'
import { Terminal } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import type { TerminalMapArtifact } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useTerminalStore } from '../../state/terminalStore'
import MapArtifactChrome, { type MapArtifactNodeData } from './MapArtifactChrome'
import MapTerminalHost from './MapTerminalHost'
import styles from './mapArtifactNodes.module.css'

type Data = MapArtifactNodeData & { artifact: TerminalMapArtifact }

function MapTerminalNode({ data }: NodeProps & { data: Data }) {
  const selectArtifact = useWorkbenchStore((s) => s.selectArtifact)
  const setFocusedMapArtifact = useTerminalStore((s) => s.setFocusedMapArtifact)
  const focusedMapArtifactId = useTerminalStore((s) => s.focusedMapArtifactId)

  const handleFocus = () => {
    selectArtifact(data.artifact.id)
    setFocusedMapArtifact(data.artifact.id)
  }

  return (
    <MapArtifactChrome
      artifact={data.artifact}
      artifactType="terminal"
      typeIcon={<Terminal size={14} strokeWidth={1.75} />}
      scopeLabel={data.scopeLabel}
      isSelected={data.isSelected}
      linked={data.linked}
      dimmed={data.dimmed}
      bodyClassName={styles.terminalBody}
      onHeaderContextMenu={data.onHeaderContextMenu}
    >
      <div
        className="nodrag nopan"
        style={{ display: 'flex', flex: 1, minHeight: 0 }}
        onMouseDown={handleFocus}
      >
        <MapTerminalHost
          artifactId={data.artifact.id}
          cwd={data.artifact.terminal.cwd}
          width={data.artifact.size.width}
          height={data.artifact.size.height}
          focused={focusedMapArtifactId === data.artifact.id}
        />
      </div>
    </MapArtifactChrome>
  )
}

export default memo(MapTerminalNode)
