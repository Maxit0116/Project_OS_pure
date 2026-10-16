import { ReactFlowProvider } from '@xyflow/react'
import type {
  ArchitectureView,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  MapContentDocument,
  ProjectArchitecture,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import { FunctionMapProvider } from './FunctionMapContext'
import FunctionMapView from './FunctionMapView'
import styles from './FunctionMap.module.css'

interface Props {
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  fileIndex?: FileEntry[]
  fileRelations?: FileRelation[]
  architecture?: ProjectArchitecture
  architectureViews?: ArchitectureView[]
  projectName?: string
  mapContent?: MapContentDocument | null
  selectedNodeId: string | null
  selectedFilePath?: string | null
  onSelectNode: (nodeId: string) => void | Promise<void>
  onSelectFile?: (filePath: string, preferredNodeId?: string) => void | Promise<void>
  onClearSelection: () => void
}

export default function FunctionMap(props: Props) {
  const { ts } = useI18n()

  if (props.nodes.length === 0) {
    return <div className={styles.empty}>{ts('map.empty')}</div>
  }

  return (
    <ReactFlowProvider zIndexMode="manual">
      <FunctionMapProvider {...props}>
        <div className={styles.wrapper}>
          <FunctionMapView />
        </div>
      </FunctionMapProvider>
    </ReactFlowProvider>
  )
}

export { FunctionMapProvider }
export { default as FunctionMapCanvas } from './FunctionMapCanvas'
