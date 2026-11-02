import { useContext } from 'react'
import { MousePointerClick } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import C4NodeDetailDrawer from './C4NodeDetailDrawer'
import { FunctionMapContext } from './FunctionMapContext'
import styles from './FunctionMapNodeDetailSidebar.module.css'

/**
 * Function Map–only left sidebar: selected node detail card, or empty prompt.
 * Safe when FunctionMapProvider is absent (no graph yet).
 */
export default function FunctionMapNodeDetailSidebar() {
  const { ts } = useI18n()
  const map = useContext(FunctionMapContext)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const clearSelection = useWorkbenchStore((s) => s.clearSelection)
  const durableGraph = useWorkbenchStore((s) => s.graph)

  if (!map) {
    return (
      <div className={styles.empty} role="status">
        <MousePointerClick size={16} className={styles.emptyIcon} aria-hidden />
        <p className={styles.emptyTitle}>{ts('map.c4Detail.emptyGraph')}</p>
      </div>
    )
  }

  const node =
    (selectedNodeId
      ? map.nodes.find((candidate) => candidate.id === selectedNodeId) ??
        map.graphNodes.find((candidate) => candidate.id === selectedNodeId)
      : null) ?? null

  if (!node) {
    return (
      <div className={styles.empty} role="status">
        <MousePointerClick size={16} className={styles.emptyIcon} aria-hidden />
        <p className={styles.emptyTitle}>{ts('map.c4Detail.emptySelection')}</p>
      </div>
    )
  }

  return (
    <div className={styles.host}>
      <C4NodeDetailDrawer
        layout="sidebar"
        node={node}
        layerNodes={map.nodes}
        layerEdges={map.edges}
        fileIndex={map.fileIndex}
        fileRelations={map.fileRelations}
        durableGraph={durableGraph}
        onClose={clearSelection}
      />
    </div>
  )
}
