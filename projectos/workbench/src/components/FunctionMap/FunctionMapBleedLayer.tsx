import type { ReactNode } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { FunctionMapProvider } from './FunctionMapContext'
import FunctionMapView from './FunctionMapView'
import styles from './FunctionMapBleedLayer.module.css'

/**
 * Full-bleed function map canvas behind the three-zone layout.
 * Mounted only on the function-map centre tab.
 */
export default function FunctionMapBleedLayer({ interactive = true }: { interactive?: boolean }) {
  return (
    <div
      className={`${styles.layer} ${interactive ? '' : styles.layerPassive}`}
      data-function-map-backdrop
      data-map-layer="architecture"
    >
      <FunctionMapView bleed />
    </div>
  )
}

export function FunctionMapBleedRoot({ children }: { children: ReactNode }) {
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const graph = useWorkbenchStore((s) => s.graph)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const selectNode = useWorkbenchStore((s) => s.selectNode)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const clearSelection = useWorkbenchStore((s) => s.clearSelection)
  const mapContent = useWorkbenchStore((s) => s.mapContent)

  const graphReady = !!graph && graph.nodes.length > 0
  const showBleedLayer = centerTab === 'function-map' && graphReady

  if (!graph) {
    return <>{children}</>
  }

  return (
    <FunctionMapProvider
      nodes={graph.nodes}
      edges={graph.edges}
      fileIndex={graph.fileIndex}
      fileRelations={graph.fileRelations}
      architecture={graph.architecture}
      projectName={graph.projectName}
      mapContent={mapContent}
      selectedNodeId={selectedNodeId}
      selectedFilePath={selectedFilePath}
      onSelectNode={selectNode}
      onSelectFile={selectFile}
      onClearSelection={clearSelection}
    >
      <div className={styles.bleedRoot}>
        <ReactFlowProvider zIndexMode="manual">
          {showBleedLayer ? <FunctionMapBleedLayer /> : null}
          {children}
        </ReactFlowProvider>
      </div>
    </FunctionMapProvider>
  )
}
