import { memo } from 'react'
import { FileText } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import type { NoteMapArtifact } from '@contracts/index'
import MapArtifactChrome, { type MapArtifactNodeData } from './MapArtifactChrome'
import NoteRichTextEditor from './noteEditor/NoteRichTextEditor'
import styles from './mapArtifactNodes.module.css'

type Data = MapArtifactNodeData & { artifact: NoteMapArtifact }

function MapNoteNode({ data }: NodeProps & { data: Data }) {
  return (
    <MapArtifactChrome
      artifact={data.artifact}
      artifactType="note"
      typeIcon={<FileText size={14} strokeWidth={1.75} />}
      scopeLabel={data.scopeLabel}
      isSelected={data.isSelected}
      linked={data.linked}
      dimmed={data.dimmed}
      onHeaderContextMenu={data.onHeaderContextMenu}
    >
      <div className={`${styles.noteBody} nodrag nopan`}>
        <NoteRichTextEditor artifact={data.artifact} />
      </div>
    </MapArtifactChrome>
  )
}

export default memo(MapNoteNode)
